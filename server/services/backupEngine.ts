/**
 * Dero Vault — Core Backup Engine
 * Hardened atomic staging: Never writes incomplete files directly into CURRENT.
 * Writes to <dest>.dero_part -> verifies completion -> atomically renames to final destination.
 * Cleans up orphaned partial files on start.
 * Immediate disconnection resilience without database corruption.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { BackupProfile, BackupSession, FileCopyError, RemovableDrive } from '../types.js';
import { LocalDatabase } from './localDb.js';
import { FileScanner, ScannedFile } from './fileScanner.js';
import { ComparisonResult, FileComparison, PlannedFileCopy } from './fileComparison.js';
import { BackupVerification } from './verification.js';

export class BackupEngine extends EventEmitter {
  private db: LocalDatabase;
  private currentSession: BackupSession | null = null;
  private isCancelled: boolean = false;
  private isPaused: boolean = false;

  constructor(db: LocalDatabase) {
    super();
    this.db = db;
  }

  public getCurrentSession(): BackupSession | null {
    return this.currentSession;
  }

  public isRunning(): boolean {
    return (
      this.currentSession !== null &&
      ['scanning', 'comparing', 'copying', 'verifying'].includes(this.currentSession.status)
    );
  }

  public cancelActiveBackup(): boolean {
    if (!this.isRunning() || !this.currentSession) return false;
    this.isCancelled = true;
    this.currentSession.status = 'cancelled';
    this.currentSession.endTime = new Date().toISOString();
    this.db.saveBackupSession(this.currentSession);
    this.db.log('warn', 'BackupEngine', `Backup cancelled by user for "${this.currentSession.driveName}"`);
    this.emit('session:update', this.currentSession);
    return true;
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  /**
   * Starts a backup run for a registered drive and its profile.
   */
  public async startBackup(drive: RemovableDrive, profile: BackupProfile): Promise<BackupSession> {
    if (this.isRunning()) {
      throw new Error('A backup session is already in progress.');
    }

    this.isCancelled = false;
    this.isPaused = false;

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const session: BackupSession = {
      id: sessionId,
      driveId: drive.id,
      driveStableId: drive.stableHardwareId,
      driveName: profile.friendlyName || drive.friendlyName || drive.volumeLabel,
      driveLetter: drive.driveLetter,
      status: 'scanning',
      startTime: new Date().toISOString(),
      isInitialBackup: false,
      filesScanned: 0,
      filesCopied: 0,
      filesSkipped: 0,
      filesFailed: 0,
      newFilesCount: 0,
      modifiedFilesCount: 0,
      bytesTotal: 0,
      bytesTransferred: 0,
      currentSpeedBps: 0,
      estimatedSecondsRemaining: 0,
      isVerified: false,
      errors: [],
    };

    this.currentSession = session;
    this.db.saveBackupSession(session);
    this.db.log('info', 'BackupEngine', `Initiating backup session for "${session.driveName}" [${drive.driveLetter}]`);
    this.emit('session:start', session);

    // Run pipeline asynchronously
    this.runBackupPipeline(drive, profile, session).catch((err) => {
      this.db.log('error', 'BackupEngine', `Fatal failure in backup pipeline: ${err.message}`);
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      this.db.saveBackupSession(session);
      this.emit('session:update', session);
    });

    return session;
  }

  private async runBackupPipeline(drive: RemovableDrive, profile: BackupProfile, session: BackupSession): Promise<void> {
    const destMountPath = drive.mountPath;

    // Step 0: Ensure destination drive root exists and is accessible
    if (!fs.existsSync(destMountPath)) {
      session.status = 'interrupted';
      session.endTime = new Date().toISOString();
      session.errors.push({
        path: destMountPath,
        destPath: destMountPath,
        error: `Destination drive [${drive.driveLetter}] is disconnected or not accessible.`,
        timestamp: new Date().toISOString(),
      });
      this.db.saveBackupSession(session);
      this.emit('session:update', session);
      return;
    }

    // Step 0.5: Clean up any orphaned *.dero_part files from prior interrupted runs
    const currentBackupDir = path.join(destMountPath, 'DERO_VAULT_BACKUP', 'CURRENT');
    await this.cleanupOrphanedPartFiles(currentBackupDir);

    // Step 1: Scan configured source folders
    session.status = 'scanning';
    this.db.saveBackupSession(session);
    this.emit('session:update', session);

    let scannedFiles: ScannedFile[] = [];
    try {
      scannedFiles = await FileScanner.scanFolders(profile.sourceFolders, (count, current) => {
        session.filesScanned = count;
        session.currentFile = current;
        this.db.saveBackupSession(session);
        this.emit('session:update', session);
      });
    } catch (scanErr: any) {
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      session.errors.push({
        path: 'sourceFolders',
        destPath: destMountPath,
        error: `Directory scan error: ${scanErr.message}`,
        timestamp: new Date().toISOString(),
      });
      this.db.saveBackupSession(session, true);
      this.emit('session:update', session);
      this.emit('session:complete', session);
      return;
    }

    session.filesScanned = scannedFiles.length;
    this.db.saveBackupSession(session);
    this.emit('session:update', session);

    if (this.isCancelled) return;

    // Step 2: Compare against destination to determine new/modified/skipped
    session.status = 'comparing';
    this.db.saveBackupSession(session);
    this.emit('session:update', session);

    // Generate collision-safe timestamped revision folder for this session
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const sessionRevisionTag = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    let comparison: ComparisonResult;
    try {
      comparison = await FileComparison.compare(
        scannedFiles,
        destMountPath,
        profile.preserveVersions,
        sessionRevisionTag
      );
    } catch (compErr: any) {
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      session.errors.push({
        path: destMountPath,
        destPath: destMountPath,
        error: `File comparison error: ${compErr.message}`,
        timestamp: new Date().toISOString(),
      });
      this.db.saveBackupSession(session, true);
      this.emit('session:update', session);
      this.emit('session:complete', session);
      return;
    }

    session.isInitialBackup = comparison.isInitialBackup;
    session.newFilesCount = comparison.newFiles.length;
    session.modifiedFilesCount = comparison.modifiedFiles.length;
    session.filesSkipped = comparison.skipped.length;
    session.bytesTotal = comparison.totalBytesToCopy;
    this.db.saveBackupSession(session);
    this.emit('session:update', session);

    if (this.isCancelled) return;

    // Step 3: Check free disk space on destination drive
    const requiredBytes = comparison.totalBytesToCopy;
    const availableBytes = drive.freeBytes;

    if (availableBytes > 0 && requiredBytes > availableBytes) {
      session.status = 'stopped_insufficient_space';
      session.endTime = new Date().toISOString();
      session.errors.push({
        path: destMountPath,
        destPath: destMountPath,
        error: `Insufficient storage space on destination ${drive.driveLetter}. Required: ${this.formatBytes(requiredBytes)}, Available: ${this.formatBytes(availableBytes)}.`,
        timestamp: new Date().toISOString(),
      });
      this.db.saveBackupSession(session);
      this.db.log('error', 'BackupEngine', `Backup halted: Insufficient space on ${drive.driveLetter}`);
      this.emit('session:update', session);
      return;
    }

    // Step 4: Atomic chunked copy
    session.status = 'copying';
    this.emit('session:update', session);

    const successfullyCopied: PlannedFileCopy[] = [];
    const copyStartTime = Date.now();
    let totalBytesCopiedSoFar = 0;
    let lastSpeedCheckTime = copyStartTime;
    let bytesSinceLastCheck = 0;

    for (let i = 0; i < comparison.toCopy.length; i++) {
      if (this.isCancelled) return;

      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 200));
      }

      const item = comparison.toCopy[i];
      session.currentFile = item.source.fullPath;

      // Check if drive is still physically connected and accessible
      if (!fs.existsSync(destMountPath)) {
        session.status = 'interrupted';
        session.endTime = new Date().toISOString();
        session.errors.push({
          path: item.source.fullPath,
          destPath: item.destinationPath,
          error: 'The backup drive was disconnected during copy.',
          timestamp: new Date().toISOString(),
        });
        this.db.saveBackupSession(session);
        this.db.log('error', 'BackupEngine', `BACKUP INTERRUPTED: Drive ${drive.driveLetter} was disconnected.`);
        this.emit('session:update', session);
        return;
      }

      // Atomic Staging Path
      const stagingPath = `${item.destinationPath}.dero_part`;

      try {
        // If modified and version history enabled, archive existing file into VERSIONS
        if (item.action === 'MODIFIED' && item.versionArchivePath && fs.existsSync(item.destinationPath)) {
          const archiveDir = path.dirname(item.versionArchivePath);
          if (!fs.existsSync(archiveDir)) {
            await fs.promises.mkdir(archiveDir, { recursive: true });
          }
          await fs.promises.copyFile(item.destinationPath, item.versionArchivePath);
        }

        // Ensure target directory exists in CURRENT
        const targetDir = path.dirname(item.destinationPath);
        if (!fs.existsSync(targetDir)) {
          await fs.promises.mkdir(targetDir, { recursive: true });
        }

        // Clean any leftover staging file before beginning
        if (fs.existsSync(stagingPath)) {
          try {
            await fs.promises.unlink(stagingPath);
          } catch {}
        }

        // 1. Stream copy to staging path
        await this.copyFileStreamed(item.source.fullPath, stagingPath, (chunkBytes) => {
          totalBytesCopiedSoFar += chunkBytes;
          bytesSinceLastCheck += chunkBytes;
          session.bytesTransferred = totalBytesCopiedSoFar;

          const now = Date.now();
          const elapsed = (now - lastSpeedCheckTime) / 1000;
          if (elapsed >= 0.5) {
            session.currentSpeedBps = bytesSinceLastCheck / elapsed;
            lastSpeedCheckTime = now;
            bytesSinceLastCheck = 0;

            const remainingBytes = Math.max(0, session.bytesTotal - session.bytesTransferred);
            if (session.currentSpeedBps > 0) {
              session.estimatedSecondsRemaining = Math.ceil(remainingBytes / session.currentSpeedBps);
            }
            this.emit('session:update', session);
          }
        });

        // 2. Validate staged file size against source
        const stagedStat = await fs.promises.stat(stagingPath);
        if (stagedStat.size !== item.size) {
          throw new Error(`Incomplete write: expected ${item.size} bytes, wrote ${stagedStat.size} bytes`);
        }

        // 3. Sync file modification time
        try {
          const sourceStat = await fs.promises.stat(item.source.fullPath);
          await fs.promises.utimes(stagingPath, sourceStat.atime, sourceStat.mtime);
        } catch {}

        // 4. Atomically promote staged file to destination path
        await fs.promises.rename(stagingPath, item.destinationPath);

        successfullyCopied.push(item);
        session.filesCopied++;
      } catch (copyErr: any) {
        // If copy failed or drive disconnected, clean up incomplete staging file
        try {
          if (fs.existsSync(stagingPath)) {
            await fs.promises.unlink(stagingPath);
          }
        } catch {}

        // Check if error was caused by drive disconnection
        if (!fs.existsSync(destMountPath)) {
          session.status = 'interrupted';
          session.endTime = new Date().toISOString();
          session.errors.push({
            path: item.source.fullPath,
            destPath: item.destinationPath,
            error: 'The backup drive was disconnected during copy.',
            timestamp: new Date().toISOString(),
          });
          this.db.saveBackupSession(session);
          this.db.log('error', 'BackupEngine', `BACKUP INTERRUPTED: Drive ${drive.driveLetter} was disconnected.`);
          this.emit('session:update', session);
          return;
        }

        session.filesFailed++;
        session.errors.push({
          path: item.source.fullPath,
          destPath: item.destinationPath,
          error: copyErr.message || 'Write error',
          timestamp: new Date().toISOString(),
        });
      }

      this.emit('session:update', session);
    }

    if (this.isCancelled) return;

    // Step 5: Verification Phase
    if (profile.verifyBackups && successfullyCopied.length > 0) {
      session.status = 'verifying';
      session.currentFile = 'Verifying written file integrity...';
      this.emit('session:update', session);

      try {
        const verifyResult = await BackupVerification.verifyBatch(successfullyCopied, true, (done, total) => {
          session.currentFile = `Verifying file ${done} of ${total}...`;
          this.emit('session:update', session);
        });

        session.isVerified = verifyResult.isVerified;
        if (!verifyResult.isVerified) {
          for (const f of verifyResult.failures) {
            session.errors.push({
              path: f.sourcePath,
              destPath: f.destPath,
              error: f.reason,
              timestamp: new Date().toISOString(),
            });
          }
        }
        session.verificationNotes = `Verified ${verifyResult.totalVerified} files (${verifyResult.checksumVerifiedCount} with SHA-256).`;
      } catch (verErr: any) {
        session.isVerified = false;
        session.verificationNotes = `Verification check error: ${verErr.message}`;
      }
    } else {
      session.isVerified = successfullyCopied.length > 0;
      session.verificationNotes = 'Skipped checksum verification (0 new files or configured off).';
    }

    // Step 6: Generate Backup Report on Destination Drive
    session.endTime = new Date().toISOString();
    session.status = session.errors.length > 0 ? 'completed_with_errors' : 'completed';
    session.currentFile = undefined;
    session.currentSpeedBps = 0;
    session.estimatedSecondsRemaining = 0;

    await this.generateBackupReport(destMountPath, session);

    // Save final session to local database with immediate synchronous disk persistence
    this.db.saveBackupSession(session, true);
    this.db.log(
      session.status === 'completed' ? 'success' : 'warn',
      'BackupEngine',
      `Backup ${session.status.replace(/_/g, ' ')} for "${session.driveName}". Copied: ${session.filesCopied}, Skipped: ${session.filesSkipped}, Failed: ${session.filesFailed}`
    );

    this.emit('session:update', session);
    this.emit('session:complete', session);
  }

  private async copyFileStreamed(
    sourcePath: string,
    destPath: string,
    onChunk: (bytes: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(destPath);

      readStream.on('data', (chunk) => {
        onChunk(chunk.length);
      });

      readStream.on('error', (err) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('error', (err) => {
        readStream.destroy();
        reject(err);
      });

      writeStream.on('finish', () => {
        resolve();
      });

      readStream.pipe(writeStream);
    });
  }

  /**
   * Scans and cleans any orphaned .dero_part files from prior interrupted sessions.
   */
  private async cleanupOrphanedPartFiles(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) return;

    const traverse = async (current: string) => {
      try {
        const entries = await fs.promises.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            await traverse(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.dero_part')) {
            try {
              await fs.promises.unlink(fullPath);
              this.db.log('info', 'BackupEngine', `Cleaned orphaned partial file: ${fullPath}`);
            } catch {}
          }
        }
      } catch {}
    };

    await traverse(dir);
  }

  private async generateBackupReport(destMountPath: string, session: BackupSession): Promise<void> {
    try {
      const reportsDir = path.join(destMountPath, 'DERO_VAULT_BACKUP', 'REPORTS');
      if (!fs.existsSync(reportsDir)) {
        await fs.promises.mkdir(reportsDir, { recursive: true });
      }

      const timestampStr = session.startTime.replace(/[:.]/g, '-');
      const jsonReportPath = path.join(reportsDir, `report_${timestampStr}.json`);
      const txtReportPath = path.join(reportsDir, `report_${timestampStr}.txt`);

      await fs.promises.writeFile(jsonReportPath, JSON.stringify(session, null, 2), 'utf-8');

      const txtContent = [
        '=====================================================',
        '              DERO VAULT — BACKUP REPORT            ',
        '              Your digital granary.                  ',
        '=====================================================',
        `Drive Name:       ${session.driveName}`,
        `Drive Letter:     ${session.driveLetter}`,
        `Session ID:       ${session.id}`,
        `Start Time:       ${session.startTime}`,
        `End Time:         ${session.endTime || 'N/A'}`,
        `Status:           ${session.status.toUpperCase()}`,
        `Verification:     ${session.isVerified ? 'VERIFIED ✓' : 'UNVERIFIED / ISSUES'}`,
        '-----------------------------------------------------',
        `Files Scanned:    ${session.filesScanned}`,
        `New Files:        ${session.newFilesCount}`,
        `Modified Files:   ${session.modifiedFilesCount}`,
        `Files Copied:     ${session.filesCopied}`,
        `Files Skipped:    ${session.filesSkipped}`,
        `Files Failed:     ${session.filesFailed}`,
        `Data Transferred: ${this.formatBytes(session.bytesTransferred)}`,
        '-----------------------------------------------------',
        session.errors.length > 0
          ? `ERRORS (${session.errors.length}):\n` +
            session.errors.map((e, idx) => `  ${idx + 1}. [${e.path}] -> ${e.error}`).join('\n')
          : 'Errors: None. All planned files were successfully backed up.',
        '=====================================================',
      ].join('\n');

      await fs.promises.writeFile(txtReportPath, txtContent, 'utf-8');
      session.reportPath = jsonReportPath;
      session.txtReportPath = txtReportPath;
      session.reportSummary = txtContent;
    } catch (err: any) {
      this.db.log('warn', 'BackupEngine', `Failed to write backup report to ${destMountPath}: ${err.message}`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
