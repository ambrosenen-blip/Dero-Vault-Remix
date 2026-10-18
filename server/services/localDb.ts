/**
 * Dero Vault — Local Database
 * Lightweight, crash-resilient local persistence.
 * Zero cloud. Zero remote dependencies. All data is kept strictly on local disk.
 */

import fs from 'fs';
import path from 'path';
import { AppLogEntry, AppSettings, BackupProfile, BackupSession, RemovableDrive } from '../types.js';
import { PlatformService } from '../platform/index.js';

interface DatabaseSchema {
  version: number;
  settings: AppSettings;
  registeredDrives: Record<string, RemovableDrive>; // Keyed by stableHardwareId
  backupProfiles: Record<string, BackupProfile>; // Keyed by driveStableId
  backupHistory: BackupSession[];
  logs: AppLogEntry[];
}

const DEFAULT_SETTINGS: AppSettings = {
  autoBackup: true,
  startOnConnect: true,
  notifyOnStart: true,
  notifyOnComplete: true,
  verifyBackups: true,
  preserveVersions: true,
  testMode: false,
  logLevel: 'info',
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
  }

  private loadDatabase(): DatabaseSchema {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          version: parsed.version || 1,
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          registeredDrives: parsed.registeredDrives || {},
          backupProfiles: parsed.backupProfiles || {},
          backupHistory: parsed.backupHistory || [],
          logs: parsed.logs || [],
        };
      } catch (err) {
        console.error('[Dero Vault DB] Corrupt or unreadable database, initializing backup and fresh store:', err);
      }
    }

    const initial: DatabaseSchema = {
      version: 1,
      settings: DEFAULT_SETTINGS,
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
    this.schedulePersist();
    this.log('info', 'Settings', 'Updated application settings');
    return this.getSettings();
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
