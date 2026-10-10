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
import { RemovableDrive } from './server/types.js';
import { PlatformService } from './server/platform/index.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createDeroVaultServer(customPort?: number) {
  const app = express();
  const server = http.createServer(app);
  const port = customPort || process.env.PORT || 3000;

  app.use(express.json());

  // Initialize Core Services
  const db = new LocalDatabase();
  const driveDetector = new DriveDetector(db);
  const backupEngine = new BackupEngine(db);

  // SSE (Server-Sent Events) clients
  const sseClients = new Set<Response>();

  const broadcastEvent = (eventType: string, data: any) => {
    console.log(`[IPC-Bridge] [${new Date().toISOString()}] Forwarding event to ${sseClients.size} SSE client(s): ${eventType}`);
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  };

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
      const drives = await driveDetector.checkDrives(driveLetter);
      const registered = db.getRegisteredDrives();
      console.log(`[Backend] [${new Date().toISOString()}] Rescan completed in ${Date.now() - startT}ms. Total detected: ${drives.length} drive(s).`);
      res.json({ success: true, count: drives.length, drives, registered });
    } catch (err: any) {
      console.log(`[Backend] [${new Date().toISOString()}] Rescan failed after ${Date.now() - startT}ms: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/profiles', (_req: Request, res: Response) => {
    const profiles = db.getAllBackupProfiles();
    res.json({ profiles });
  });

  // Register a drive
  app.post('/api/drives/register', (req: Request, res: Response) => {
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

    broadcastEvent('drive:registered', { drive: updatedDrive, profile });
    res.json({ success: true, drive: updatedDrive, profile });
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
      const session = await backupEngine.startBackup(drive, profile);
      res.json({ success: true, session });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/backup/cancel', (_req: Request, res: Response) => {
    const success = backupEngine.cancelActiveBackup();
    res.json({ success });
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
    broadcastEvent('settings:updated', updated);
    res.json(updated);
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
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
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
      const distPath = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  }

  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => {
      console.log(`[Dero Vault] Server running on port ${port} — Your digital granary.`);
      resolve(server);
    });
  });
}

// Start server if executed directly
if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  createDeroVaultServer().catch((err) => {
    console.error('[Dero Vault] Fatal server error:', err);
    process.exit(1);
  });
}
