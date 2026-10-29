/**
 * Dero Vault — Local Database
 * Lightweight, crash-resilient local persistence.
 * Zero cloud. Zero remote dependencies. All data is kept strictly on local disk.
 */

import fs from 'fs';
import path from 'path';
import { AppLogEntry, AppSettings, BackupProfile, BackupReminderSettings, BackupSession, RemovableDrive } from '../types.js';
import { PlatformService } from '../platform/index.js';

interface DatabaseSchema {
  version: number;
  settings: AppSettings;
  registeredDrives: Record<string, RemovableDrive>; // Keyed by stableHardwareId
  backupProfiles: Record<string, BackupProfile>; // Keyed by driveStableId
  backupHistory: BackupSession[];
  logs: AppLogEntry[];
}

export const DEFAULT_REMINDER_SETTINGS: BackupReminderSettings = {
  enabled: true,
  frequency: 'weekly',
  weeklyDays: [5], // Friday by default
  monthlyDay: 1, // 1st of month by default
  time: '17:00', // 5:00 PM local time
  snoozeUntil: null,
  lastNotifiedOccurrenceId: null,
  lastDismissedOccurrenceId: null,
};

const DEFAULT_SETTINGS: AppSettings = {
  autoBackup: true,
  startOnConnect: true,
  turboBackup: true,
  startAtLogin: true, // Default to true: "Make the safe action the lazy action"
  startMinimized: true, // Run quietly in system tray without popping up window
  notifyOnStart: true,
  notifyOnComplete: true,
  verifyBackups: true,
  preserveVersions: true,
  testMode: false,
  logLevel: 'info',
  reminders: DEFAULT_REMINDER_SETTINGS,
  stabilityConsent: false, // Strict opt-in only
  adoptionConsent: false, // Strict opt-in only
  legalAcceptance: {
    eulaVersion: null,
    eulaAcceptedAt: null,
    privacyNoticeVersion: null,
    privacyNoticeViewedAt: null,
  },
};

export class LocalDatabase {
  private dataDir: string;
  private dbFilePath: string;
  private logFilePath: string;
  private data: DatabaseSchema;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(customBaseDir?: string) {
    const baseDir = customBaseDir || PlatformService.getDefaultDataDirectory();
    this.dataDir = path.join(baseDir, 'data');
    const logsDir = path.join(baseDir, 'logs');

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.dbFilePath = path.join(this.dataDir, 'vault.db.json');
    this.logFilePath = path.join(logsDir, 'dero_vault.log');

    this.data = this.loadDatabase();
    this.auditRegistrationsAndProfiles();
  }

  private checkInstallerConsent(settings: AppSettings): boolean {
    const candidatePaths = [
      path.join(this.dataDir, 'installer-consent.json'),
      path.join(path.dirname(this.dataDir), 'installer-consent.json'),
      path.join(process.cwd(), 'installer-consent.json'),
      ...(process.env.APPDATA ? [
        path.join(process.env.APPDATA, 'DeroVault', 'data', 'installer-consent.json'),
        path.join(process.env.APPDATA, 'DeroVault', 'installer-consent.json'),
      ] : []),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.eulaAccepted || parsed.source === 'nsis-installer')) {
            let modified = false;
            if (!settings.legalAcceptance.eulaAcceptedAt) {
              settings.legalAcceptance.eulaVersion = parsed.eulaVersion || '1.0.0';
              settings.legalAcceptance.eulaAcceptedAt = parsed.eulaAcceptedAt || new Date().toISOString();
              modified = true;
            }
            if (!settings.legalAcceptance.privacyNoticeViewedAt) {
              settings.legalAcceptance.privacyNoticeVersion = parsed.privacyNoticeVersion || '1.0.0';
              settings.legalAcceptance.privacyNoticeViewedAt = parsed.privacyNoticeAcknowledgedAt || new Date().toISOString();
              modified = true;
            }
            if (parsed.stabilityConsent !== undefined) {
              settings.stabilityConsent = Boolean(parsed.stabilityConsent);
              modified = true;
            }
            if (parsed.adoptionConsent !== undefined) {
              settings.adoptionConsent = Boolean(parsed.adoptionConsent);
              modified = true;
            }
            console.log(`[Dero Vault DB] Ingested installer consent from ${p}: EULA=${settings.legalAcceptance.eulaVersion}, stability=${settings.stabilityConsent}, adoption=${settings.adoptionConsent}`);
            return modified;
          }
        } catch (err) {
          console.warn(`[Dero Vault DB] Error reading installer consent file ${p}:`, err);
        }
      }
    }
    return false;
  }

  private loadDatabase(): DatabaseSchema {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const loadedSettings: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings || {}),
          // Explicit migration: default missing startAtLogin to true, but respect explicit user preference
          startAtLogin: parsed.settings?.startAtLogin !== undefined ? Boolean(parsed.settings.startAtLogin) : true,
          startMinimized: parsed.settings?.startMinimized !== undefined ? Boolean(parsed.settings.startMinimized) : true,
          // Migration: legacy telemetryConsent splits into stability and adoption
          stabilityConsent: parsed.settings?.stabilityConsent !== undefined 
            ? Boolean(parsed.settings.stabilityConsent) 
            : (parsed.settings?.telemetryConsent !== undefined ? Boolean(parsed.settings.telemetryConsent) : false),
          adoptionConsent: parsed.settings?.adoptionConsent !== undefined 
            ? Boolean(parsed.settings.adoptionConsent) 
            : (parsed.settings?.telemetryConsent !== undefined ? Boolean(parsed.settings.telemetryConsent) : false),
          legalAcceptance: {
            ...DEFAULT_SETTINGS.legalAcceptance,
            ...(parsed.settings?.legalAcceptance || {}),
          },
          reminders: {
            ...DEFAULT_REMINDER_SETTINGS,
            ...(parsed.settings?.reminders || {}),
          },
        };

        const consentIngested = this.checkInstallerConsent(loadedSettings);

        const schema: DatabaseSchema = {
          version: parsed.version || 1,
          settings: loadedSettings,
          registeredDrives: parsed.registeredDrives || {},
          backupProfiles: parsed.backupProfiles || {},
          backupHistory: parsed.backupHistory || [],
          logs: parsed.logs || [],
        };

        if (consentIngested) {
          this.persistSync(schema);
        }

        return schema;
      } catch (err) {
        console.error('[Dero Vault DB] Corrupt or unreadable database, initializing backup and fresh store:', err);
      }
    }

    const initialSettings: AppSettings = { ...DEFAULT_SETTINGS };
    this.checkInstallerConsent(initialSettings);

    const initial: DatabaseSchema = {
      version: 1,
      settings: initialSettings,
      registeredDrives: {},
      backupProfiles: {},
      backupHistory: [],
      logs: [],
    };
    this.persistSync(initial);
    return initial;
  }

  private persistSync(schema: DatabaseSchema): void {
    try {
      const tempPath = `${this.dbFilePath}.${Date.now()}.tmp`;
      const json = JSON.stringify(schema, null, 2);
      fs.writeFileSync(tempPath, json, 'utf-8');
      try {
        fs.renameSync(tempPath, this.dbFilePath);
      } catch (renameErr) {
        // Fallback for Windows if destination file exists or renameSync throws EPERM/EEXIST
        try {
          fs.copyFileSync(tempPath, this.dbFilePath);
          fs.unlinkSync(tempPath);
        } catch {
          // If fallback also fails, retry direct write to dbFilePath
          fs.writeFileSync(this.dbFilePath, json, 'utf-8');
          try { fs.unlinkSync(tempPath); } catch {}
        }
      }
    } catch (err) {
      console.error('[Dero Vault DB] Failed to persist database:', err);
    }
  }

  private schedulePersist(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.persistSync(this.data);
    }, 150);
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    if (partial.reminders) {
      this.data.settings.reminders = {
        ...DEFAULT_REMINDER_SETTINGS,
        ...(this.data.settings.reminders || {}),
        ...partial.reminders,
      };
    }
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.persistSync(this.data);
    this.log('info', 'Settings', 'Updated application settings');
    return this.getSettings();
  }

  public getReminderSettings(): BackupReminderSettings {
    return { ...DEFAULT_REMINDER_SETTINGS, ...(this.data.settings.reminders || {}) };
  }

  public updateReminderSettings(partial: Partial<BackupReminderSettings>): BackupReminderSettings {
    const current = this.getReminderSettings();
    const updated: BackupReminderSettings = { ...current, ...partial };
    this.data.settings.reminders = updated;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.persistSync(this.data);
    this.log('info', 'Reminders', `Updated backup reminder settings (enabled: ${updated.enabled}, freq: ${updated.frequency}, time: ${updated.time})`);
    return updated;
  }

  public getStartupPreference(): boolean {
    return this.data.settings.startAtLogin ?? true;
  }

  public setStartupPreference(enabled: boolean): boolean {
    this.data.settings.startAtLogin = Boolean(enabled);
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.persistSync(this.data);
    this.log(
      'info',
      'Startup',
      `Automatic Windows startup preference set to ${enabled ? 'ENABLED' : 'DISABLED'}`
    );
    return this.data.settings.startAtLogin;
  }

  public getStabilityConsent(): boolean {
    return this.data.settings.stabilityConsent ?? false;
  }

  public setStabilityConsent(enabled: boolean): boolean {
    this.data.settings.stabilityConsent = Boolean(enabled);
    this.persistSync(this.data);
    this.log('info', 'Telemetry', `Stability reporting consent set to ${enabled ? 'ENABLED' : 'DISABLED'}`);
    return this.data.settings.stabilityConsent;
  }

  public getAdoptionConsent(): boolean {
    return this.data.settings.adoptionConsent ?? false;
  }

  public setAdoptionConsent(enabled: boolean): boolean {
    this.data.settings.adoptionConsent = Boolean(enabled);
    this.persistSync(this.data);
    this.log('info', 'Telemetry', `Adoption analytics consent set to ${enabled ? 'ENABLED' : 'DISABLED'}`);
    return this.data.settings.adoptionConsent;
  }

  public recordLegalAcceptance(type: 'eula' | 'privacy', version: string): void {
    const now = new Date().toISOString();
    if (type === 'eula') {
      this.data.settings.legalAcceptance.eulaVersion = version;
      this.data.settings.legalAcceptance.eulaAcceptedAt = now;
    } else {
      this.data.settings.legalAcceptance.privacyNoticeVersion = version;
      this.data.settings.legalAcceptance.privacyNoticeViewedAt = now;
    }
    this.persistSync(this.data);
    this.log('info', 'Legal', `Accepted ${type.toUpperCase()} version ${version}`);
  }

  // --- Registered Drives ---
  public getRegisteredDrives(): RemovableDrive[] {
    return Object.values(this.data.registeredDrives);
  }

  public getRegisteredDriveByStableId(stableHardwareId: string): RemovableDrive | undefined {
    return this.data.registeredDrives[stableHardwareId];
  }

  public registerDrive(drive: RemovableDrive, profile: Omit<BackupProfile, 'id' | 'createdAt' | 'updatedAt'>): { drive: RemovableDrive; profile: BackupProfile } {
    const updatedDrive: RemovableDrive = {
      ...drive,
      isRegistered: true,
      registeredAt: new Date().toISOString(),
    };

    const newProfile: BackupProfile = {
      id: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      driveStableId: drive.stableHardwareId,
      friendlyName: profile.friendlyName || drive.friendlyName || drive.volumeLabel || 'Backup Drive',
      sourceFolders: profile.sourceFolders,
      destinationFolder: profile.destinationFolder || 'DERO_VAULT_BACKUP',
      autoBackupEnabled: profile.autoBackupEnabled ?? true,
      verifyBackups: profile.verifyBackups ?? true,
      preserveVersions: profile.preserveVersions ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.data.registeredDrives[drive.stableHardwareId] = updatedDrive;
    this.data.backupProfiles[drive.stableHardwareId] = newProfile;
    this.schedulePersist();

    this.log('success', 'DriveRegistry', `Registered drive "${newProfile.friendlyName}" (${drive.stableHardwareId})`);
    return { drive: updatedDrive, profile: newProfile };
  }

  public updateRegisteredDrive(stableHardwareId: string, updates: Partial<RemovableDrive>): RemovableDrive | null {
    const existing = this.data.registeredDrives[stableHardwareId];
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.data.registeredDrives[stableHardwareId] = updated;

    if (updates.friendlyName && this.data.backupProfiles[stableHardwareId]) {
      this.data.backupProfiles[stableHardwareId].friendlyName = updates.friendlyName;
      this.data.backupProfiles[stableHardwareId].updatedAt = new Date().toISOString();
    }

    this.schedulePersist();
    this.log('info', 'DriveRegistry', `Updated drive information for ${stableHardwareId}`);
    return updated;
  }

  public unregisterDrive(stableHardwareId: string): boolean {
    if (!this.data.registeredDrives[stableHardwareId]) return false;

    const friendlyName = this.data.registeredDrives[stableHardwareId].friendlyName || 'Unknown Drive';
    delete this.data.registeredDrives[stableHardwareId];
    delete this.data.backupProfiles[stableHardwareId];
    this.schedulePersist();

    this.log('warn', 'DriveRegistry', `Unregistered drive "${friendlyName}" (${stableHardwareId}). Local backup files preserved.`);
    return true;
  }

  // --- Backup Profiles ---
  public getBackupProfile(driveStableId: string): BackupProfile | undefined {
    return this.data.backupProfiles[driveStableId];
  }

  public getAllBackupProfiles(): BackupProfile[] {
    return Object.values(this.data.backupProfiles);
  }

  public updateBackupProfile(driveStableId: string, updates: Partial<BackupProfile>): BackupProfile | null {
    const existing = this.data.backupProfiles[driveStableId];
    if (!existing) return null;

    const updated: BackupProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.data.backupProfiles[driveStableId] = updated;
    this.schedulePersist();
    this.log('info', 'BackupProfile', `Updated profile for drive ${driveStableId}`);
    return updated;
  }

  /**
   * C5: Audits existing registered drives and backup profiles for identity integrity.
   * Ensures every registered drive has an isolated profile and repairs missing associations
   * without deleting user data.
   */
  public auditRegistrationsAndProfiles(): { valid: boolean; issues: string[]; repaired: number } {
    const issues: string[] = [];
    let repaired = 0;

    for (const [stableId, drive] of Object.entries(this.data.registeredDrives)) {
      if (!this.data.backupProfiles[stableId]) {
        issues.push(`Registered drive "${drive.friendlyName || drive.volumeLabel}" (${stableId}) lacked associated profile. Reconstructed isolated profile.`);
        this.data.backupProfiles[stableId] = {
          id: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          driveStableId: stableId,
          friendlyName: drive.friendlyName || drive.volumeLabel || 'Backup Drive',
          sourceFolders: [path.join(process.env.USERPROFILE || process.env.HOME || '/home', 'Documents')],
          destinationFolder: 'DERO_VAULT_BACKUP',
          autoBackupEnabled: true,
          verifyBackups: true,
          preserveVersions: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        repaired++;
      }
    }

    if (repaired > 0) {
      this.schedulePersist();
      this.log('warn', 'DatabaseAudit', `Audited database registrations: repaired ${repaired} missing profile link(s).`);
    }

    return { valid: issues.length === 0, issues, repaired };
  }

  // --- History & Sessions ---
  public saveBackupSession(session: BackupSession, immediate = false): void {
    if (!Array.isArray(this.data.backupHistory)) {
      this.data.backupHistory = [];
    }

    // Defensive clone to avoid state corruption across async pipeline phases
    const sessionSnapshot: BackupSession = { ...session };

    // Check if session already exists, if so update it
    const index = this.data.backupHistory.findIndex(s => s.id === session.id);
    if (index >= 0) {
      this.data.backupHistory[index] = sessionSnapshot;
    } else {
      this.data.backupHistory.unshift(sessionSnapshot);
      // Keep last 500 sessions locally
      if (this.data.backupHistory.length > 500) {
        this.data.backupHistory = this.data.backupHistory.slice(0, 500);
      }
    }

    // Update drive's last backup time if completed
    if (session.status === 'completed' || session.status === 'completed_with_errors') {
      const drive = this.data.registeredDrives[session.driveStableId];
      if (drive) {
        drive.lastBackupAt = session.endTime || new Date().toISOString();
      }
    }

    const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted', 'stopped_insufficient_space'].includes(session.status);
    if (immediate || isTerminal) {
      if (this.writeTimer) {
        clearTimeout(this.writeTimer);
        this.writeTimer = null;
      }
      this.persistSync(this.data);
    } else {
      this.schedulePersist();
    }
  }

  public getBackupHistory(limit: number = 50): BackupSession[] {
    return this.data.backupHistory.slice(0, limit);
  }

  public getBackupSession(id: string): BackupSession | undefined {
    return this.data.backupHistory.find(s => s.id === id);
  }

  /**
   * Source of truth for completed, verified backups.
   * Requirement 3: Only completed sessions with verified integrity and valid completion timestamp count.
   */
  public getLastSuccessfulVerifiedBackup(): BackupSession | undefined {
    if (!Array.isArray(this.data.backupHistory)) return undefined;
    return this.data.backupHistory.find(s => s.status === 'completed' && s.isVerified === true && Boolean(s.endTime));
  }

  public clearHistory(): void {
    this.data.backupHistory = [];
    this.schedulePersist();
    this.log('info', 'History', 'Cleared local backup history');
  }

  // --- Logging ---
  public log(level: 'info' | 'warn' | 'error' | 'success', module: string, message: string, details?: Record<string, unknown>): AppLogEntry {
    const entry: AppLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      details,
    };

    this.data.logs.unshift(entry);
    if (this.data.logs.length > 1000) {
      this.data.logs = this.data.logs.slice(0, 1000);
    }

    // Append to file on disk
    try {
      const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${details ? ' ' + JSON.stringify(details) : ''}\n`;
      fs.appendFileSync(this.logFilePath, line, 'utf-8');
    } catch {
      // Ignore disk log failure
    }

    this.schedulePersist();
    return entry;
  }

  public getLogs(limit: number = 100): AppLogEntry[] {
    return this.data.logs.slice(0, limit);
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }

  public getDataDirPath(): string {
    return this.dataDir;
  }
}
