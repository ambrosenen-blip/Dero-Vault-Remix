/**
 * Dero Vault — Full-Stack Server
 * Production-hardened server hosting REST & SSE streams.
 * Native Windows folder dialog integration, real drive monitoring.
 * Zero mock-data auto-seeding.
 */

import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { LocalDatabase } from './server/services/localDb.js';
import { DriveDetector } from './server/services/driveDetector.js';
import { BackupEngine } from './server/services/backupEngine.js';
import { ReminderScheduler } from './server/services/reminderScheduler.js';
import { UpdateManager } from './server/services/updateManager.js';
import { StabilityReporter } from './server/services/stabilityReporter.js';
import { GlobalAdoptionMonitor } from './server/services/adoptionMonitor.js';
import { RemovableDrive, AllServicesStatus, RecoveryPackageStatus } from './server/types.js';
import { PlatformService } from './server/platform/index.js';
import { RecoveryManager } from './server/services/recoveryManager.js';
import { RestoreEngine } from './server/services/restoreEngine.js';
import { EnvironmentDetector } from './server/services/environmentDetector.js';

const execAsync = promisify(exec);
const getModuleDir = () => {
  try {
    if (typeof (globalThis as any).__dirname !== 'undefined' && (globalThis as any).__dirname) {
      return (globalThis as any).__dirname;
    }
    if (typeof import.meta !== 'undefined' && (import.meta as any).url) {
      return path.dirname(fileURLToPath((import.meta as any).url));
    }
  } catch {}
  return process.cwd();
};
const __dirname = getModuleDir();

export interface DeroVaultServerOptions {
  onEvent?: (eventType: string, data: any) => void;
}

export async function createDeroVaultServer(customPort?: number, options?: DeroVaultServerOptions) {
  const app = express();
  const server = http.createServer(app);
  const port = customPort || process.env.PORT || 3000;

  app.use(express.json());

  // Universal CORS support for local Electron file:// and http:// origins
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Rescan-Source');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Initialize Core Services
  const db = new LocalDatabase();
  const driveDetector = new DriveDetector(db);
  const backupEngine = new BackupEngine(db);
  const updateManager = new UpdateManager('1.0.0');
  const stabilityReporter = new StabilityReporter(db);
  const adoptionMonitor = new GlobalAdoptionMonitor(db);
  const restoreEngine = new RestoreEngine(db);

  // SSE (Server-Sent Events) clients
  const sseClients = new Set<Response>();

  const broadcastEvent = (eventType: string, data: any) => {
    console.log(`[IPC-Bridge] [${new Date().toISOString()}] Forwarding event to ${sseClients.size} SSE client(s): ${eventType}`);
    // 1. Direct in-process notification for embedded Electron main process
    try {
      if (options?.onEvent) {
        options.onEvent(eventType, data);
      }
    } catch (err: any) {
      console.error(`[IPC-Bridge] [${new Date().toISOString()}] Error in onEvent listener: ${err.message}`);
    }

    // 2. HTTP Server-Sent Events stream for network/browser clients
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
        if (typeof (client as any).flush === 'function') {
          (client as any).flush();
        }
      } catch {
        sseClients.delete(client);
      }
    }
  };

  // Dedicated persistent reminder scheduler (never reset on client navigation/re-renders)
  const reminderScheduler = new ReminderScheduler(db, backupEngine, {
    broadcast: broadcastEvent,
  });
  reminderScheduler.start();

  // Heartbeat to keep SSE clients alive across OS/firewall boundaries
  const heartbeatInterval = setInterval(() => {
    const pingPayload = `: ping\n\n`;
    for (const client of sseClients) {
      try {
        client.write(pingPayload);
      } catch {
        sseClients.delete(client);
      }
    }
  }, 15000);

  // Wire Engine & Detector events
  driveDetector.on('drive:connected', async (drive: RemovableDrive) => {
    broadcastEvent('drive:connected', drive);

    // Auto-backup workflow if drive is registered & settings permit
    const settings = db.getSettings();
    if (drive.isRegistered && settings.autoBackup && settings.startOnConnect && !backupEngine.isRunning()) {
      const profile = db.getBackupProfile(drive.stableHardwareId);
      if (profile && profile.autoBackupEnabled) {
        db.log('info', 'AutoBackup', `Auto-backup automatically initiated for registered drive "${profile.friendlyName}" [${drive.driveLetter}]`);
        try {
          // 2000ms delay for physical drive mounting stabilization and OS file handles
          setTimeout(async () => {
            if (!backupEngine.isRunning() && drive.isConnected) {
              await backupEngine.startBackup(drive, profile);
            }
          }, 2000);
        } catch (err: any) {
          db.log('error', 'AutoBackup', `Auto-backup start failed: ${err.message}`);
        }
      }
    }
  });

  driveDetector.on('drive:unregistered_detected', (drive: RemovableDrive) => {
    broadcastEvent('drive:unregistered_detected', drive);
  });

  driveDetector.on('drive:ignored', (data: any) => {
    broadcastEvent('drive:ignored', data);
  });

  driveDetector.on('drive:disconnected', (drive: RemovableDrive) => {
    broadcastEvent('drive:disconnected', drive);

    const active = backupEngine.getCurrentSession();
    if (active && active.driveStableId === drive.stableHardwareId && backupEngine.isRunning()) {
      backupEngine.cancelActiveBackup();
    }
  });

  driveDetector.on('drive:updated', (drive: RemovableDrive) => {
    broadcastEvent('drive:updated', drive);
  });

  backupEngine.on('session:start', (session) => {
    broadcastEvent('backup:start', session);
  });

  backupEngine.on('session:update', (session) => {
    broadcastEvent('backup:update', session);
  });

  backupEngine.on('session:complete', (session) => {
    broadcastEvent('backup:complete', session);
  });

  driveDetector.on('drive:recovery_detected', (drive: RemovableDrive) => {
    broadcastEvent('drive:recovery_detected', drive);
  });

  restoreEngine.on('restore:start', (session) => {
    broadcastEvent('restore:start', session);
  });

  restoreEngine.on('restore:update', (session) => {
    broadcastEvent('restore:update', session);
  });

  restoreEngine.on('restore:complete', (session) => {
    broadcastEvent('restore:complete', session);
  });

  // Start drive monitoring in background
  driveDetector.startMonitoring(2000);

  // --- API Routes ---

  // SSE Stream
  app.get('/api/events', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`event: handshake\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    // Immediate authoritative catch-up: Push current backup session state if one exists
    const currentSession = backupEngine.getCurrentSession();
    if (currentSession) {
      res.write(`event: backup:catchup\ndata: ${JSON.stringify(currentSession)}\n\n`);
    }

    // Immediate authoritative catch-up: Push current restore session state if one exists
    const currentRestore = restoreEngine.getCurrentSession();
    if (currentRestore) {
      res.write(`event: restore:catchup\ndata: ${JSON.stringify(currentRestore)}\n\n`);
    }

    // Push current authoritative reminder status on client connect
    const reminderStatus = reminderScheduler.getStatus();
    res.write(`event: reminder:status\ndata: ${JSON.stringify(reminderStatus)}\n\n`);

    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    _req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 1. Storage Devices & Profiles
  app.get('/api/drives', async (_req: Request, res: Response) => {
    const drives = await driveDetector.checkDrives();
    const registered = db.getRegisteredDrives();
    const profiles = db.getAllBackupProfiles();
    res.json({ drives, registered, profiles });
  });

  // Explicit hardware rescan trigger (used by native OS hooks e.g. WM_DEVICECHANGE)
  app.post('/api/drives/rescan', async (req: Request, res: Response) => {
    const source = req.body?.source || req.headers['x-rescan-source'] || 'native-ipc';
    const driveLetter = req.body?.driveLetter || (typeof req.query.driveLetter === 'string' ? req.query.driveLetter : undefined);
    console.log(`[Backend] [${new Date().toISOString()}] /api/drives/rescan received for drive ${driveLetter || 'unspecified'} (source: ${source})`);
    const startT = Date.now();
    try {
      // 20-second bounded timeout guarantee for the whole rescan operation
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Rescan overall timeout exceeded (20s)')), 20000)
      );

      const drives = await Promise.race([
        driveDetector.checkDrives(driveLetter),
        timeoutPromise,
      ]);

      const registered = db.getRegisteredDrives();
      console.log(`[Backend] [${new Date().toISOString()}] Rescan completed in ${Date.now() - startT}ms. Total detected: ${drives.length} drive(s).`);
      res.json({ success: true, count: drives.length, drives, registered });
    } catch (err: any) {
      console.log(`[Backend] [${new Date().toISOString()}] Rescan failed after ${Date.now() - startT}ms: ${err.message}`);
      res.status(500).json({ error: err.message, success: false, count: 0 });
    }
  });

  // Explicit hardware removal notification (used by WM_DEVICECHANGE 0x8004)
  app.post('/api/drives/removal', (req: Request, res: Response) => {
    const driveLetter = req.body?.driveLetter || req.query.driveLetter;
    console.log(`[Backend] [${new Date().toISOString()}] /api/drives/removal received for drive letter: ${driveLetter || 'unspecified'}`);
    const removedDrives = driveDetector.handleDeviceRemoval(driveLetter);
    res.json({ success: true, count: removedDrives.length, removedDrives });
  });

  // Diagnostic endpoint to independently test physical drive detection boundaries
  app.get('/api/diag/inspect-drive', async (req: Request, res: Response) => {
    const rawLetter = (req.query.letter as string) || 'E';
    const cleanLetter = rawLetter.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const rootPath = `${cleanLetter}:\\`;
    const logs: string[] = [];
    const log = (msg: string) => {
      console.log(`[Diagnostic] ${msg}`);
      logs.push(`[${new Date().toISOString()}] ${msg}`);
    };

    log(`Beginning independent diagnostic for drive ${cleanLetter}: (${rootPath})`);

    // 1. Filesystem existence and accessibility
    let fsExists = false;
    let fsAccessible = false;
    let fsError: string | null = null;
    try {
      fsExists = fs.existsSync(rootPath);
      log(`Step 1 (Filesystem existsSync): ${fsExists}`);
      if (fsExists) {
        fs.accessSync(rootPath, fs.constants.R_OK);
        fsAccessible = true;
        log(`Step 1 (Filesystem accessSync R_OK): true`);
      }
    } catch (e: any) {
      fsError = e.message;
      log(`Step 1 (Filesystem error): ${e.message}`);
    }

    // 2. Direct fast-path call
    const adapter = driveDetector.getPlatformAdapter();
    let fastPathResult: any = null;
    let fastPathElapsed = 0;
    let fastPathError: string | null = null;
    if (typeof (adapter as any).detectRemovableDriveFast === 'function') {
      const startF = Date.now();
      try {
        fastPathResult = await (adapter as any).detectRemovableDriveFast(cleanLetter);
        fastPathElapsed = Date.now() - startF;
        log(`Step 2 (Fast-Path execution): elapsed=${fastPathElapsed}ms, result=${fastPathResult ? JSON.stringify(fastPathResult) : 'null'}`);
      } catch (fErr: any) {
        fastPathElapsed = Date.now() - startF;
        fastPathError = fErr.message;
        log(`Step 2 (Fast-Path error): ${fErr.message} in ${fastPathElapsed}ms`);
      }
    } else {
      log(`Step 2 (Fast-Path): detectRemovableDriveFast not supported on adapter`);
    }

    // 3. Direct multi-tier adapter call
    let multiTierResult: any = null;
    let multiTierElapsed = 0;
    let multiTierError: string | null = null;
    try {
      const startM = Date.now();
      multiTierResult = await adapter.detectExternalDrives(cleanLetter);
      multiTierElapsed = Date.now() - startM;
      log(`Step 3 (Multi-Tier execution): elapsed=${multiTierElapsed}ms, count=${multiTierResult ? multiTierResult.length : 0}`);
    } catch (mErr: any) {
      multiTierError = mErr.message;
      log(`Step 3 (Multi-Tier error): ${mErr.message}`);
    }

    // 4. Stable identity and registration status
    const driveInfo = fastPathResult || (multiTierResult && multiTierResult[0]);
    let classification = 'NONE_DETECTED';
    let persistentIdentity: string | null = null;
    if (driveInfo) {
      persistentIdentity = driveInfo.stableHardwareId;
      const registered = db.getRegisteredDriveByStableId(driveInfo.stableHardwareId);
      classification = registered ? 'REGISTERED' : 'UNREGISTERED';
      log(`Step 4 (Identity & Classification): identity=${persistentIdentity}, classification=${classification}`);
    } else {
      const sysLetter = (process.env.SystemDrive || 'C:').replace(/[^a-zA-Z]/g, '').toUpperCase();
      if (cleanLetter === sysLetter) {
        classification = 'IGNORED (System Drive)';
      }
      log(`Step 4 (Identity & Classification): classification=${classification}`);
    }

    res.json({
      timestamp: new Date().toISOString(),
      testedDrive: `${cleanLetter}:`,
      rootPath,
      filesystem: {
        exists: fsExists,
        accessible: fsAccessible,
        error: fsError,
      },
      fastPath: {
        executed: typeof (adapter as any).detectRemovableDriveFast === 'function',
        elapsedMs: fastPathElapsed,
        result: fastPathResult,
        error: fastPathError,
      },
      multiTier: {
        elapsedMs: multiTierElapsed,
        drives: multiTierResult,
        error: multiTierError,
      },
      classification: {
        persistentIdentity,
        classification,
      },
      logs,
    });
  });

  app.get('/api/profiles', (_req: Request, res: Response) => {
    const profiles = db.getAllBackupProfiles();
    res.json({ profiles });
  });

  // Register a drive with automatic recovery launcher provisioning
  app.post('/api/drives/register', async (req: Request, res: Response) => {
    const { stableHardwareId, friendlyName, sourceFolders, autoBackupEnabled, verifyBackups, preserveVersions } = req.body;
    const drive = driveDetector.getDriveByStableId(stableHardwareId);

    if (!drive) {
      return res.status(404).json({ error: 'Storage device not found or currently disconnected.' });
    }

    if (!sourceFolders || sourceFolders.length === 0) {
      return res.status(400).json({ error: 'At least one source folder must be selected.' });
    }

    const { drive: updatedDrive, profile } = db.registerDrive(drive, {
      friendlyName: friendlyName || drive.volumeLabel || 'Backup Drive',
      sourceFolders,
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: autoBackupEnabled ?? true,
      verifyBackups: verifyBackups ?? true,
      preserveVersions: preserveVersions ?? true,
      driveStableId: drive.stableHardwareId,
    });

    drive.isRegistered = true;
    drive.friendlyName = updatedDrive.friendlyName;
    drive.registeredAt = updatedDrive.registeredAt;
    drive.backupProfileId = profile.id;

    // Provision Drive-Resident Recovery Package & Launcher
    let recoveryStatus: RecoveryPackageStatus = { isProvisioned: false, error: 'Not attempted' };
    try {
      recoveryStatus = await RecoveryManager.provisionRecoveryPackage(drive, profile);
      if (recoveryStatus.isProvisioned) {
        drive.hasRecoveryPackage = true;
        drive.recoveryStatus = recoveryStatus;
        updatedDrive.hasRecoveryPackage = true;
        updatedDrive.recoveryStatus = recoveryStatus;
        db.updateRegisteredDrive(drive.stableHardwareId, {
          hasRecoveryPackage: true,
          recoveryStatus,
        });
        db.log(
          'success',
          'RecoveryManager',
          `Provisioned Rescue Launcher on drive "${updatedDrive.friendlyName}" [${drive.driveLetter}]`
        );
      } else {
        db.log(
          'warn',
          'RecoveryManager',
          `Recovery launcher provisioning warning on drive "${updatedDrive.friendlyName}": ${recoveryStatus.error}`
        );
      }
    } catch (recErr: any) {
      db.log('error', 'RecoveryManager', `Recovery launcher provisioning failed: ${recErr.message}`);
    }

    broadcastEvent('drive:registered', { drive: updatedDrive, profile, recoveryStatus });
    res.json({ success: true, drive: updatedDrive, profile, recoveryStatus });
  });

  // Update a registered drive
  app.put('/api/drives/:stableId', (req: Request, res: Response) => {
    const { stableId } = req.params;
    const { friendlyName, sourceFolders, autoBackupEnabled, verifyBackups, preserveVersions } = req.body;

    const updatedDrive = db.updateRegisteredDrive(stableId, { friendlyName });
    const updatedProfile = db.updateBackupProfile(stableId, {
      friendlyName,
      sourceFolders,
      autoBackupEnabled,
      verifyBackups,
      preserveVersions,
    });

    const memDrive = driveDetector.getDriveByStableId(stableId);
    if (memDrive && friendlyName) {
      memDrive.friendlyName = friendlyName;
    }

    broadcastEvent('drive:updated', { drive: updatedDrive, profile: updatedProfile });
    res.json({ success: true, drive: updatedDrive, profile: updatedProfile });
  });

  // Unregister a drive
  app.delete('/api/drives/:stableId', (req: Request, res: Response) => {
    const { stableId } = req.params;
    const success = db.unregisterDrive(stableId);

    const memDrive = driveDetector.getDriveByStableId(stableId);
    if (memDrive) {
      memDrive.isRegistered = false;
      memDrive.friendlyName = undefined;
      memDrive.backupProfileId = undefined;
    }

    broadcastEvent('drive:unregistered', { stableId });
    res.json({ success });
  });

  // 2. Backup Controls
  app.get('/api/backup/current', (_req: Request, res: Response) => {
    const session = backupEngine.getCurrentSession();
    res.json({ session, isRunning: backupEngine.isRunning() });
  });

  app.post('/api/backup/start', async (req: Request, res: Response) => {
    const { stableHardwareId } = req.body;
    let drive: RemovableDrive | undefined;

    if (stableHardwareId) {
      drive = driveDetector.getDriveByStableId(stableHardwareId);
    } else {
      const all = driveDetector.getActiveDrives();
      drive = all.find((d) => d.isConnected && d.isRegistered);
    }

    if (!drive) {
      return res.status(400).json({ error: 'No connected registered drive found.' });
    }

    const profile = db.getBackupProfile(drive.stableHardwareId);
    if (!profile) {
      return res.status(400).json({ error: 'No backup profile found for this drive. Please register it first.' });
    }

    try {
      const session = await backupEngine.startBackup(drive, profile, {
        turboBackup: req.body?.turboBackup,
      });
      res.json({ success: true, session });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/backup/cancel', (_req: Request, res: Response) => {
    const success = backupEngine.cancelActiveBackup();
    res.json({ success });
  });

  // --- Recovery & Migration (Rescue Engine) APIs ---
  app.get('/api/recovery/environment', async (req: Request, res: Response) => {
    try {
      const mountPath = req.query.mountPath as string | undefined;
      const result = await EnvironmentDetector.evaluateRecoveryReadiness(mountPath);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message, success: false });
    }
  });

  app.post('/api/recovery/inspect', async (req: Request, res: Response) => {
    try {
      const { mountPath, stableHardwareId } = req.body;
      let targetPath = mountPath;

      if (!targetPath && stableHardwareId) {
        const d = driveDetector.getDriveByStableId(stableHardwareId);
        if (d) targetPath = d.mountPath;
      }

      if (!targetPath) {
        const all = driveDetector.getActiveDrives();
        const cand = all.find((d) => d.isConnected && d.hasRecoveryPackage) || all.find((d) => d.isConnected && !d.isSystemDrive);
        if (cand) targetPath = cand.mountPath;
      }

      if (!targetPath) {
        return res.status(400).json({ error: 'No mount path or connected drive specified for recovery inspection.' });
      }

      const result = await restoreEngine.inspectBackupDrive(targetPath);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message, success: false });
    }
  });

  app.post('/api/recovery/restore/start', async (req: Request, res: Response) => {
    try {
      const { mountPath, driveStableId, driveLetter, namespaces, conflictStrategy, verifyIntegrity } = req.body;

      let resolvedMountPath = mountPath;
      if (!resolvedMountPath && driveStableId) {
        const d = driveDetector.getDriveByStableId(driveStableId);
        if (d) resolvedMountPath = d.mountPath;
      }

      if (!resolvedMountPath) {
        return res.status(400).json({ error: 'Destination mount path is required.' });
      }

      const session = await restoreEngine.startRestore({
        mountPath: resolvedMountPath,
        driveStableId,
        driveLetter,
        namespaces,
        conflictStrategy: conflictStrategy || 'safe_rename',
        verifyIntegrity: verifyIntegrity ?? true,
      });

      res.json({ success: true, session });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/recovery/restore/current', (_req: Request, res: Response) => {
    res.json({
      session: restoreEngine.getCurrentSession(),
      isRunning: restoreEngine.isRunning(),
    });
  });

  app.post('/api/recovery/restore/cancel', (_req: Request, res: Response) => {
    const success = restoreEngine.cancelActiveRestore();
    res.json({ success });
  });

  app.post('/api/recovery/provision', async (req: Request, res: Response) => {
    const { stableHardwareId } = req.body;
    const drive = driveDetector.getDriveByStableId(stableHardwareId);
    if (!drive) {
      return res.status(404).json({ error: 'Storage device not found or currently disconnected.' });
    }

    const profile = db.getBackupProfile(stableHardwareId);
    if (!profile) {
      return res.status(404).json({ error: 'No backup profile found for this drive.' });
    }

    const status = await RecoveryManager.provisionRecoveryPackage(drive, profile);
    if (status.isProvisioned) {
      drive.hasRecoveryPackage = true;
      drive.recoveryStatus = status;
      db.updateRegisteredDrive(stableHardwareId, {
        hasRecoveryPackage: true,
        recoveryStatus: status,
      });
      db.log('success', 'RecoveryManager', `Re-provisioned recovery package on ${drive.driveLetter}`);
    }

    res.json({ success: status.isProvisioned, status });
  });

  // Register a migrated backup drive on the replacement computer
  app.post('/api/recovery/register-migrated', async (req: Request, res: Response) => {
    const { stableHardwareId, friendlyName, sourceFolders, autoBackupEnabled, verifyBackups, preserveVersions } = req.body;
    const drive = driveDetector.getDriveByStableId(stableHardwareId);

    if (!drive) {
      return res.status(404).json({ error: 'Storage device not found or currently disconnected.' });
    }

    if (!sourceFolders || sourceFolders.length === 0) {
      return res.status(400).json({ error: 'At least one source folder must be selected for future backup protection.' });
    }

    // Safety checks: ensure source and destination are not reversed
    for (const sf of sourceFolders) {
      const cleanSf = path.resolve(sf).toLowerCase();
      const cleanDest = path.resolve(drive.mountPath).toLowerCase();
      if (cleanSf.startsWith(cleanDest)) {
        return res.status(400).json({
          error: 'Invalid configuration: Source folder cannot be located on the backup destination drive.',
        });
      }
    }

    const { drive: updatedDrive, profile } = db.registerDrive(drive, {
      friendlyName: friendlyName || drive.volumeLabel || 'Migrated Backup Drive',
      sourceFolders,
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: autoBackupEnabled ?? true,
      verifyBackups: verifyBackups ?? true,
      preserveVersions: preserveVersions ?? true,
      driveStableId: drive.stableHardwareId,
    });

    drive.isRegistered = true;
    drive.friendlyName = updatedDrive.friendlyName;
    drive.registeredAt = updatedDrive.registeredAt;
    drive.backupProfileId = profile.id;

    // Refresh recovery package with current machine details
    let recStatus: RecoveryPackageStatus = { isProvisioned: false, error: 'Not attempted' };
    try {
      recStatus = await RecoveryManager.provisionRecoveryPackage(drive, profile);
      if (recStatus.isProvisioned) {
        drive.hasRecoveryPackage = true;
        drive.recoveryStatus = recStatus;
        updatedDrive.hasRecoveryPackage = true;
        updatedDrive.recoveryStatus = recStatus;
        db.updateRegisteredDrive(drive.stableHardwareId, {
          hasRecoveryPackage: true,
          recoveryStatus: recStatus,
        });
      }
    } catch {}

    db.log(
      'success',
      'DriveRegistry',
      `Migrated drive "${updatedDrive.friendlyName}" successfully registered on replacement computer. Existing backup data preserved.`
    );

    broadcastEvent('drive:registered', { drive: updatedDrive, profile, recoveryStatus: recStatus });
    res.json({ success: true, drive: updatedDrive, profile, recoveryStatus: recStatus });
  });

  // 3. Backup History
  app.get('/api/history', (_req: Request, res: Response) => {
    const history = db.getBackupHistory(100);
    res.json({ history });
  });

  app.get('/api/history/:id', (req: Request, res: Response) => {
    const session = db.getBackupSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  });

  app.delete('/api/history', (_req: Request, res: Response) => {
    db.clearHistory();
    res.json({ success: true });
  });

  // 4. Settings
  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json(db.getSettings());
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    const updated = db.updateSettings(req.body);
    if (req.body?.reminders) {
      reminderScheduler.updateSettings(req.body.reminders);
    }
    broadcastEvent('settings:updated', updated);
    if (req.body?.startAtLogin !== undefined) {
      broadcastEvent('startup:updated', { startAtLogin: updated.startAtLogin });
    }
    res.json(updated);
  });

  // 4b. Windows Startup Configuration API
  app.get('/api/system/startup', (_req: Request, res: Response) => {
    const settings = db.getSettings();
    res.json({
      enabled: settings.startAtLogin ?? true,
      startMinimized: settings.startMinimized ?? true,
    });
  });

  app.post('/api/system/startup', (req: Request, res: Response) => {
    const { enabled } = req.body;
    const isEnabled = enabled !== undefined ? Boolean(enabled) : true;
    db.setStartupPreference(isEnabled);
    const updated = db.updateSettings({ startAtLogin: isEnabled });
    broadcastEvent('settings:updated', updated);
    broadcastEvent('startup:updated', { startAtLogin: isEnabled });
    res.json({ success: true, enabled: isEnabled, settings: updated });
  });

  // 4b. Backup Reminders API
  app.get('/api/reminders/status', (_req: Request, res: Response) => {
    res.json(reminderScheduler.getStatus());
  });

  app.put('/api/reminders/settings', (req: Request, res: Response) => {
    const updatedStatus = reminderScheduler.updateSettings(req.body);
    res.json(updatedStatus);
  });

  app.post('/api/reminders/snooze', (req: Request, res: Response) => {
    const minutes = typeof req.body?.minutes === 'number' ? req.body.minutes : 60;
    const updatedStatus = reminderScheduler.snooze(minutes);
    res.json(updatedStatus);
  });

  app.post('/api/reminders/clear-snooze', (_req: Request, res: Response) => {
    const updatedStatus = reminderScheduler.clearSnooze();
    res.json(updatedStatus);
  });

  app.post('/api/reminders/dismiss', (_req: Request, res: Response) => {
    const updatedStatus = reminderScheduler.dismiss();
    res.json(updatedStatus);
  });

  app.post('/api/reminders/test', (_req: Request, res: Response) => {
    const updatedStatus = reminderScheduler.triggerTestReminder();
    res.json(updatedStatus);
  });

  // 4c. UpdateManager, StabilityReporter & GlobalAdoptionMonitor APIs (Strictly Fail-Closed)
  app.get('/api/system/services-status', (_req: Request, res: Response) => {
    const settings = db.getSettings();
    const status: AllServicesStatus = {
      updateManager: updateManager.getStatus(),
      stabilityReporter: stabilityReporter.getStatus(),
      adoptionMonitor: adoptionMonitor.getStatus(),
      stabilityConsent: settings.stabilityConsent,
      adoptionConsent: settings.adoptionConsent,
      legalAcceptance: settings.legalAcceptance,
    };
    res.json(status);
  });

  app.post('/api/updates/check', async (req: Request, res: Response) => {
    const force = Boolean(req.body?.force);
    const result = await updateManager.checkForUpdates(force);
    broadcastEvent('updates:status', updateManager.getStatus());
    res.json(result);
  });

  app.post('/api/stability/flush', async (_req: Request, res: Response) => {
    const result = await stabilityReporter.flush();
    broadcastEvent('stability:status', stabilityReporter.getStatus());
    res.json(result);
  });

  app.post('/api/adoption/heartbeat', async (_req: Request, res: Response) => {
    const result = await adoptionMonitor.sendHeartbeat();
    broadcastEvent('adoption:status', adoptionMonitor.getStatus());
    res.json(result);
  });

  app.post('/api/settings/stability-consent', (req: Request, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    db.setStabilityConsent(enabled);
    const updated = db.updateSettings({ stabilityConsent: enabled });
    broadcastEvent('settings:updated', updated);
    res.json({
      success: true,
      stabilityConsent: enabled,
      stabilityReporter: stabilityReporter.getStatus(),
    });
  });

  app.post('/api/settings/adoption-consent', (req: Request, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    db.setAdoptionConsent(enabled);
    const updated = db.updateSettings({ adoptionConsent: enabled });
    broadcastEvent('settings:updated', updated);
    res.json({
      success: true,
      adoptionConsent: enabled,
      adoptionMonitor: adoptionMonitor.getStatus(),
    });
  });

  app.post('/api/settings/legal-acceptance', (req: Request, res: Response) => {
    const { type, version } = req.body;
    if (type !== 'eula' && type !== 'privacy') {
      return res.status(400).json({ error: 'Invalid document type' });
    }
    if (!version) {
      return res.status(400).json({ error: 'Version is required' });
    }
    db.recordLegalAcceptance(type, version);
    res.json({ success: true, legalAcceptance: db.getSettings().legalAcceptance });
  });

  // 5. Logs & Artifacts
  app.get('/api/logs', (_req: Request, res: Response) => {
    const logs = db.getLogs(200);
    const logFilePath = db.getLogFilePath();
    res.json({ logs, logFilePath });
  });

  // Release artifact path resolver (handles tsx server.ts vs dist-server/server.mjs vs cwd)
  const resolveReleaseFile = (...fileNames: string[]): string | null => {
    const baseDirs = [
      path.resolve(__dirname, 'release'),
      path.resolve(__dirname, '..', 'release'),
      path.resolve(process.cwd(), 'release'),
      path.resolve('/app/applet/release'),
    ];
    for (const dir of baseDirs) {
      for (const name of fileNames) {
        const full = path.join(dir, name);
        if (fs.existsSync(full)) {
          try {
            const st = fs.statSync(full);
            if (st.size > 0) return full;
          } catch {}
        }
      }
    }
    return null;
  };

  // Windows Desktop Artifact Downloads
  app.get('/api/download/windows-app', (_req: Request, res: Response) => {
    const zipPath = resolveReleaseFile(
      'Dero Vault-1.0.0-win.zip',
      'DeroVault-v1.0.0-Windows-x64.zip',
      'DeroVault-1.0.0-win.zip'
    );
    if (zipPath) {
      const stats = fs.statSync(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', 'attachment; filename="DeroVault-v1.0.0-Windows-x64.zip"');
      const stream = fs.createReadStream(zipPath);
      return stream.pipe(res);
    }
    res.status(404).json({ error: 'Release ZIP artifact not found.' });
  });

  app.get('/api/download/installer', (_req: Request, res: Response) => {
    const setupPath = resolveReleaseFile('DeroVault-Setup.exe');
    if (setupPath) {
      const stats = fs.statSync(setupPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', 'attachment; filename="DeroVault-Setup.exe"');
      const stream = fs.createReadStream(setupPath);
      return stream.pipe(res);
    }
    // Fallback to zip package
    const zipPath = resolveReleaseFile(
      'Dero Vault-1.0.0-win.zip',
      'DeroVault-v1.0.0-Windows-x64.zip'
    );
    if (zipPath) {
      const stats = fs.statSync(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', 'attachment; filename="DeroVault-v1.0.0-Windows-x64.zip"');
      const stream = fs.createReadStream(zipPath);
      return stream.pipe(res);
    }
    res.status(404).json({ error: 'Installer artifact not found.' });
  });

  app.get('/api/build/info', (_req: Request, res: Response) => {
    const zipPath = resolveReleaseFile('Dero Vault-1.0.0-win.zip', 'DeroVault-v1.0.0-Windows-x64.zip');
    const exePath = resolveReleaseFile(path.join('win-unpacked', 'Dero Vault.exe'));
    const setupPath = resolveReleaseFile('DeroVault-Setup.exe');

    res.json({
      hasZip: Boolean(zipPath),
      zipSize: zipPath ? fs.statSync(zipPath).size : 0,
      hasExe: Boolean(exePath),
      exeSize: exePath ? fs.statSync(exePath).size : 0,
      hasSetup: Boolean(setupPath),
      setupSize: setupPath ? fs.statSync(setupPath).size : 0,
    });
  });

  // 6. Platform Information, Standard Folders & Native Picker
  app.get('/api/platform/info', (_req: Request, res: Response) => {
    res.json(PlatformService.getPlatformInfo());
  });

  app.get('/api/system/folders', (_req: Request, res: Response) => {
    const folders = PlatformService.getDefaultSourceFolders();
    res.json({ folders });
  });

  // Cross-platform native folder picker
  app.post('/api/folders/browse', async (_req: Request, res: Response) => {
    try {
      const selected = await PlatformService.browseForFolder();
      if (selected && fs.existsSync(selected)) {
        return res.json({ selectedPath: selected });
      }
      return res.json({ selectedPath: null });
    } catch (err: any) {
      return res.status(500).json({ error: `Folder dialog error: ${err.message}` });
    }
  });

  // Validate custom path
  app.post('/api/folders/validate', (req: Request, res: Response) => {
    const { folderPath } = req.body;
    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ error: 'Folder path is required.' });
    }

    const clean = folderPath.trim();
    if (!fs.existsSync(clean)) {
      return res.json({ valid: false, error: 'Path does not exist on disk.' });
    }

    try {
      const stats = fs.statSync(clean);
      if (!stats.isDirectory()) {
        return res.json({ valid: false, error: 'Specified path is a file, not a directory.' });
      }

      const files = fs.readdirSync(clean);
      res.json({
        valid: true,
        path: clean,
        name: path.basename(clean) || clean,
        fileCount: files.length,
      });
    } catch (err: any) {
      res.json({ valid: false, error: err.message });
    }
  });

  // --- Serve Static Frontend in Production / Vite Middleware in Dev ---
  const resourcesPath = (process as any).resourcesPath;
  const distCandidates = [
    path.resolve(__dirname, 'dist'),
    path.resolve(__dirname, '..', 'dist'),
    path.resolve(process.cwd(), 'dist'),
    ...(resourcesPath ? [
      path.join(resourcesPath, 'app.asar', 'dist'),
      path.join(resourcesPath, 'app', 'dist'),
      path.join(resourcesPath, 'dist'),
    ] : []),
  ];
  let distPath: string | null = null;
  for (const cand of distCandidates) {
    if (fs.existsSync(cand) && fs.existsSync(path.join(cand, 'index.html'))) {
      distPath = cand;
      break;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    if (distPath) {
      console.log(`[Backend] Serving static React frontend from: ${distPath}`);
      app.use(express.static(distPath));
      app.get('*', (_req, res, next) => {
        if (_req.path.startsWith('/api/')) return next();
        res.sendFile(path.join(distPath!, 'index.html'));
      });
    } else {
      console.warn(`[Backend] Production warning: dist/ directory not found in candidates: ${distCandidates.join(', ')}`);
    }
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      if (distPath) {
        console.log(`[Backend] Dev fallback: serving static frontend from: ${distPath}`);
        app.use(express.static(distPath));
        app.get('*', (_req, res, next) => {
          if (_req.path.startsWith('/api/')) return next();
          res.sendFile(path.join(distPath!, 'index.html'));
        });
      }
    }
  }

  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => {
      console.log(`[Backend] [${new Date().toISOString()}] Server running on port ${port} — Your digital granary.`);
      resolve(server);
    });
  });
}

// Start server if executed directly (supports server.ts, server.js, and bundled server.mjs)
const scriptName = process.argv[1] || '';
const isDirectRun =
  scriptName.endsWith('server.ts') ||
  scriptName.endsWith('server.js') ||
  scriptName.endsWith('server.mjs') ||
  scriptName.endsWith('server.cjs') ||
  process.env.START_SERVER_IMMEDIATELY === 'true';

if (isDirectRun) {
  createDeroVaultServer().catch((err) => {
    console.error('[Backend] Fatal server startup error:', err);
    process.exit(1);
  });
}
