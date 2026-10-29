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
import crypto from 'crypto';
import { BackupProfile, BackupSession, FileCopyError, RemovableDrive } from '../types.js';
import { LocalDatabase } from './localDb.js';
import { FileScanner, ScannedFile, ScanError } from './fileScanner.js';
import { ComparisonResult, FileComparison, PlannedFileCopy } from './fileComparison.js';
import { BackupVerification } from './verification.js';
import { CapacitySafetyService } from './capacitySafety.js';
import { RecoveryManager } from './recoveryManager.js';

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
      ['scanning', 'checking_capacity', 'comparing', 'copying', 'verifying'].includes(this.currentSession.status)
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
  public async startBackup(
    drive: RemovableDrive,
    profile: BackupProfile,
    options?: { turboBackup?: boolean }
  ): Promise<BackupSession> {
    if (this.isRunning()) {
      throw new Error('A backup session is already in progress.');
    }

    this.isCancelled = false;
    this.isPaused = false;

    const settings = this.db.getSettings();
    const useTurbo = options?.turboBackup !== undefined ? Boolean(options.turboBackup) : Boolean(settings.turboBackup ?? true);
    const sessionMode: 'turbo' | 'standard' = useTurbo ? 'turbo' : 'standard';

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const session: BackupSession = {
      id: sessionId,
      driveId: drive.id,
      driveStableId: drive.stableHardwareId,
      driveName: profile.friendlyName || drive.friendlyName || drive.volumeLabel,
      driveLetter: drive.driveLetter,
      mode: sessionMode,
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
    this.db.log(
      'info',
      'BackupEngine',
      `Initiating backup session for "${session.driveName}" [${drive.driveLetter}] in ${sessionMode.toUpperCase()} mode`
    );
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
    let scanErrors: ScanError[] = [];
    try {
      let lastScanEmit = 0;
      const scanResult = await FileScanner.scanFolders(profile.sourceFolders, (count, current) => {
        session.filesScanned = count;
        session.currentFile = current;
        const now = Date.now();
        if (now - lastScanEmit >= 150) {
          lastScanEmit = now;
          this.emit('session:update', session);
        }
      });

      scannedFiles = scanResult.files;
      scanErrors = scanResult.errors || [];
      session.filesScanned = scannedFiles.length;

      if (scanErrors.length > 0) {
        for (const sErr of scanErrors) {
          session.errors.push({
            path: sErr.path,
            destPath: destMountPath,
            error: sErr.error,
            timestamp: new Date().toISOString(),
          });
          session.filesFailed++;
        }
        this.db.log('warn', 'BackupEngine', `File scanner encountered ${scanErrors.length} scan error(s) during enumeration.`);
      }
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

    // Step 3: Comprehensive Preflight Capacity Assessment
    session.status = 'checking_capacity';
    this.db.saveBackupSession(session);
    this.emit('session:update', session);

    const isTurbo = session.mode === 'turbo';
    const missingRecoveryBytes = await RecoveryManager.getMissingPayloadBytes(destMountPath);
    const preflight = await CapacitySafetyService.assessPreflight({
      toCopy: comparison.toCopy,
      scannedFiles,
      scanErrors,
      destMountPath,
      drive,
      isTurbo,
      preserveVersions: profile.preserveVersions,
      includeRecoveryPackageBytes: missingRecoveryBytes,
    });

    session.capacityAssessment = preflight;

    if (!preflight.canProceed) {
      session.status = 'stopped_insufficient_space';
      session.endTime = new Date().toISOString();
      session.currentFile = undefined;
      session.currentSpeedBps = 0;
      session.estimatedSecondsRemaining = 0;
      session.errors.push({
        path: destMountPath,
        destPath: destMountPath,
        error: preflight.message || 'Capacity safety check failed: destination cannot safely accommodate backup.',
        timestamp: new Date().toISOString(),
      });
      await this.generateBackupReport(destMountPath, session);
      this.db.saveBackupSession(session, true);
      this.db.log('error', 'BackupEngine', `Backup halted [${preflight.reason}]: ${preflight.message}`);
      this.emit('session:update', session);
      this.emit('session:complete', session);
      return;
    }

    // Step 3.5: Fast-path for incremental backup with zero changes
    if (comparison.toCopy.length === 0) {
      session.endTime = new Date().toISOString();
      session.status = session.errors.length > 0 ? 'completed_with_errors' : 'completed';
      session.currentFile = undefined;
      session.currentSpeedBps = 0;
      session.estimatedSecondsRemaining = 0;
      session.isVerified = session.errors.length === 0;
      session.verificationNotes = session.errors.length > 0
        ? `Incremental check finished (${comparison.skipped.length} unchanged files), but ${session.errors.length} enumeration error(s) occurred.`
        : `Up to date: ${comparison.skipped.length} file(s) scanned and confirmed unchanged.`;

      await this.generateBackupReport(destMountPath, session);
      this.db.saveBackupSession(session, true);
      this.db.log(
        session.status === 'completed' ? 'success' : 'warn',
        'BackupEngine',
        `Backup ${session.status} for "${session.driveName}". 0 new/modified files, ${comparison.skipped.length} unchanged files skipped.`
      );
      this.emit('session:update', session);
      this.emit('session:complete', session);
      return;
    }

    // Step 4: Turbo atomic chunked copy with bounded parallel concurrency
    session.status = 'copying';
    this.emit('session:update', session);

    const successfullyCopied: PlannedFileCopy[] = [];
    const precomputedHashes = new Map<string, string>();
    const copyStartTime = Date.now();
    let totalBytesCopiedSoFar = 0;
    let lastSpeedCheckTime = copyStartTime;
    let bytesSinceLastCheck = 0;
    let lastEmitTime = copyStartTime;

    // Cache of verified directories to eliminate redundant mkdir syscalls
    const ensuredDirs = new Set<string>();
    const ensureDirCached = async (targetDir: string) => {
      if (ensuredDirs.has(targetDir)) return;
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }
      ensuredDirs.add(targetDir);
    };

    // Concurrency pipeline selection:
    // Safe for removable USB media controllers:
    // If Turbo mode: bounded adaptive parallel workers (up to 4 for small/mixed files, 2 for large files)
    // If Standard mode: strictly conservative single sequential worker (concurrency = 1)
    const hasLargeFiles = comparison.toCopy.some((item) => item.size > 30 * 1024 * 1024);
    const concurrency = isTurbo
      ? (hasLargeFiles ? 2 : Math.min(4, Math.max(1, comparison.toCopy.length)))
      : 1;

    let nextItemIndex = 0;
    let copyInterrupted = false;

    const copyWorker = async () => {
      while (nextItemIndex < comparison.toCopy.length) {
        if (this.isCancelled || copyInterrupted) return;

        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 200));
        }

        const item = comparison.toCopy[nextItemIndex++];
        if (!item) break;

        session.currentFile = item.source.fullPath;

        // Check if drive is still physically connected and accessible
        if (!fs.existsSync(destMountPath)) {
          copyInterrupted = true;
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
            await ensureDirCached(archiveDir);
            await fs.promises.copyFile(item.destinationPath, item.versionArchivePath);
          }

          // Ensure target directory exists in CURRENT
          const targetDir = path.dirname(item.destinationPath);
          await ensureDirCached(targetDir);

          const progressCallback = (chunkBytes: number) => {
            totalBytesCopiedSoFar += chunkBytes;
            bytesSinceLastCheck += chunkBytes;
            session.bytesTransferred = totalBytesCopiedSoFar;

            const now = Date.now();
            const speedElapsed = (now - lastSpeedCheckTime) / 1000;
            if (speedElapsed >= 0.4) {
              session.currentSpeedBps = bytesSinceLastCheck / speedElapsed;
              lastSpeedCheckTime = now;
              bytesSinceLastCheck = 0;

              const remainingBytes = Math.max(0, session.bytesTotal - session.bytesTransferred);
              if (session.currentSpeedBps > 0) {
                session.estimatedSecondsRemaining = Math.ceil(remainingBytes / session.currentSpeedBps);
              }
            }

            // Throttle UI event emissions to max once every 120ms to prevent event loop starvation
            if (now - lastEmitTime >= 120) {
              lastEmitTime = now;
              this.emit('session:update', session);
            }
          };

          // Execute file copy using selected pipeline mode (Turbo vs Standard)
          const { sha256Hex } = isTurbo
            ? await this.copyFileStreamedTurbo(
                item.source.fullPath,
                stagingPath,
                progressCallback,
                profile.verifyBackups
              )
            : await this.copyFileStreamedStandard(
                item.source.fullPath,
                stagingPath,
                progressCallback,
                profile.verifyBackups
              );

          if (sha256Hex) {
            precomputedHashes.set(item.source.fullPath, sha256Hex);
          }

          // 2. Validate staged file size against source
          const stagedStat = await fs.promises.stat(stagingPath);
          if (stagedStat.size !== item.size) {
            throw new Error(`Incomplete write: expected ${item.size} bytes, wrote ${stagedStat.size} bytes`);
          }

          // 3. Sync file modification time using scanned mtimeMs without redundant source stat
          try {
            const mtime = new Date(item.source.mtimeMs || Date.now());
            await fs.promises.utimes(stagingPath, mtime, mtime);
          } catch {}

          // 4. Atomically promote staged file to destination path
          await fs.promises.rename(stagingPath, item.destinationPath);

          // 5. Post-promotion confirmation: Verify destination actually exists and size matches
          const postStat = await fs.promises.stat(item.destinationPath);
          if (postStat.size !== item.size) {
            throw new Error(
              `Promotion verification failed: destination file size ${postStat.size} does not match expected ${item.size}`
            );
          }

          successfullyCopied.push(item);
          session.filesCopied = successfullyCopied.length;
        } catch (copyErr: any) {
          // If copy failed or drive disconnected, clean up incomplete staging file
          try {
            if (fs.existsSync(stagingPath)) {
              await fs.promises.unlink(stagingPath);
            }
          } catch {}

          // Check if error was caused by drive disconnection
          if (!fs.existsSync(destMountPath)) {
            copyInterrupted = true;
            session.status = 'interrupted';
            session.isVerified = false;
            session.endTime = new Date().toISOString();
            session.errors.push({
              path: item.source.fullPath,
              destPath: item.destinationPath,
              error: 'The backup drive was disconnected during copy.',
              timestamp: new Date().toISOString(),
            });
            this.db.saveBackupSession(session, true);
            this.db.log('error', 'BackupEngine', `BACKUP INTERRUPTED: Drive ${drive.driveLetter} was disconnected.`);
            this.emit('session:update', session);
            return;
          }

          // Check if error was caused by destination running out of disk space (ENOSPC)
          if (CapacitySafetyService.isDiskFullError(copyErr)) {
            copyInterrupted = true;
            session.status = 'stopped_insufficient_space';
            session.isVerified = false;
            session.endTime = new Date().toISOString();
            session.errors.push({
              path: item.source.fullPath,
              destPath: item.destinationPath,
              error: `Destination drive ran out of space during copy (ENOSPC): ${copyErr.message}`,
              timestamp: new Date().toISOString(),
            });
            this.db.saveBackupSession(session, true);
            this.db.log('error', 'BackupEngine', `BACKUP STOPPED: Destination ${drive.driveLetter} ran out of space during copy.`);
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

        const now = Date.now();
        if (now - lastEmitTime >= 120) {
          lastEmitTime = now;
          this.emit('session:update', session);
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(copyWorker());
    }
    await Promise.all(workers);

    if (this.isCancelled) return;

    if (copyInterrupted) {
      session.endTime = new Date().toISOString();
      session.isVerified = false;
      session.currentFile = undefined;
      session.currentSpeedBps = 0;
      session.estimatedSecondsRemaining = 0;
      if (fs.existsSync(destMountPath)) {
        await this.generateBackupReport(destMountPath, session);
      }
      this.db.saveBackupSession(session, true);
      this.emit('session:update', session);
      this.emit('session:complete', session);
      return;
    }

    // Step 5: Verification Phase
    if (profile.verifyBackups && successfullyCopied.length > 0) {
      session.status = 'verifying';
      session.currentFile = 'Verifying written file integrity...';
      this.emit('session:update', session);

      try {
        const verifyResult = await BackupVerification.verifyBatch(
          successfullyCopied,
          true,
          (done, total) => {
            session.currentFile = `Verifying file ${done} of ${total}...`;
            this.emit('session:update', session);
          },
          precomputedHashes
        );

        if (!verifyResult.isVerified) {
          for (const f of verifyResult.failures) {
            session.errors.push({
              path: f.sourcePath,
              destPath: f.destPath,
              error: f.reason,
              timestamp: new Date().toISOString(),
            });
            session.filesFailed++;
          }
        }
        // Authoritative invariant: filesCopied strictly reflects ONLY files that passed verification
        session.filesCopied = verifyResult.totalVerified;
        session.isVerified = verifyResult.isVerified && session.errors.length === 0;
        session.verificationNotes = `Verified ${verifyResult.totalVerified} files (${verifyResult.checksumVerifiedCount} with SHA-256).`;
      } catch (verErr: any) {
        session.isVerified = false;
        session.filesCopied = 0;
        session.verificationNotes = `Verification check error: ${verErr.message}`;
      }
    } else {
      session.isVerified = successfullyCopied.length > 0 && session.errors.length === 0;
      session.filesCopied = successfullyCopied.length;
      session.verificationNotes = 'Skipped checksum verification (0 new files or configured off).';
    }

    // Step 6: Generate Full Reconciliation Report & Determine Session Status
    session.endTime = new Date().toISOString();

    const failedWrites = session.errors.filter(
      (e) => !e.error.includes('checksum') && !e.error.includes('exist after copy')
    );
    const missingDestinations = session.errors.filter((e) => e.error.includes('exist after copy'));
    const checksumMismatches = session.errors.filter((e) => e.error.includes('checksum'));

    const reconciliation = {
      sessionId: session.id,
      driveName: session.driveName,
      driveLetter: session.driveLetter,
      timestamp: session.endTime,
      totalEligible: scannedFiles.length,
      successfullyCopiedAndVerified: session.filesCopied,
      unchangedFilesPreserved: comparison.skipped.length,
      skippedFiles: comparison.skipped.map((s) => ({
        path: s.fullPath,
        reason: 'Unchanged content verified on destination',
      })),
      failedWrites,
      missingDestinations,
      checksumMismatches,
      scanErrors: scanErrors.map((e) => ({ path: e.path, error: e.error })),
      isFullyReconciled:
        session.errors.length === 0 &&
        session.filesCopied + comparison.skipped.length === scannedFiles.length,
    };
    session.reconciliation = reconciliation;

    const hasUnresolvedIssues =
      session.errors.length > 0 ||
      session.filesFailed > 0 ||
      !session.isVerified ||
      !reconciliation.isFullyReconciled;

    if (hasUnresolvedIssues) {
      session.isVerified = false;
      session.status = session.filesCopied === 0 ? 'failed' : 'incomplete';
    } else {
      session.status = 'completed';
      session.isVerified = true;
    }
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

  private async copyFileStreamedTurbo(
    sourcePath: string,
    destPath: string,
    onChunk: (bytes: number) => void,
    calculateHash: boolean = true
  ): Promise<{ sha256Hex: string }> {
    try {
      const stat = await fs.promises.stat(sourcePath);
      // For office-sized files (<= 4 MB), direct bounded buffer read/write with fsync guarantees media persistence
      if (stat.size <= 4 * 1024 * 1024) {
        const buf = await fs.promises.readFile(sourcePath);
        const sha256Hex = calculateHash ? crypto.createHash('sha256').update(buf).digest('hex') : '';
        const handle = await fs.promises.open(destPath, 'w');
        try {
          await handle.writeFile(buf);
          await handle.sync();
        } finally {
          await handle.close();
        }
        onChunk(buf.length);
        return { sha256Hex };
      }
    } catch {}

    return new Promise((resolve, reject) => {
      let settled = false;
      const hash = calculateHash ? crypto.createHash('sha256') : null;
      const readStream = fs.createReadStream(sourcePath, { highWaterMark: 512 * 1024 });
      const writeStream = fs.createWriteStream(destPath, { highWaterMark: 512 * 1024 });

      readStream.on('data', (chunk: Buffer | string) => {
        if (hash) hash.update(chunk);
        onChunk(chunk.length);
      });

      const handleErr = (err: any) => {
        if (settled) return;
        settled = true;
        readStream.destroy();
        writeStream.destroy();
        reject(err);
      };

      readStream.on('error', handleErr);
      writeStream.on('error', handleErr);

      // Must wait for 'close' (not just 'finish') to ensure Windows releases the underlying file descriptor
      writeStream.on('close', async () => {
        if (settled) return;
        settled = true;
        try {
          // Explicit flush to non-volatile USB media
          try {
            const handle = await fs.promises.open(destPath, 'r+');
            await handle.sync();
            await handle.close();
          } catch {}
          resolve({ sha256Hex: hash ? hash.digest('hex') : '' });
        } catch (syncErr) {
          reject(syncErr);
        }
      });

      readStream.pipe(writeStream);
    });
  }

  /**
   * Standard conservative copy pipeline: strictly sequential, 64KB buffers, direct streaming,
   * full SHA-256 calculation for destination verification with media flush.
   */
  private async copyFileStreamedStandard(
    sourcePath: string,
    destPath: string,
    onChunk: (bytes: number) => void,
    calculateHash: boolean = true
  ): Promise<{ sha256Hex: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const hash = calculateHash ? crypto.createHash('sha256') : null;
      const readStream = fs.createReadStream(sourcePath, { highWaterMark: 64 * 1024 });
      const writeStream = fs.createWriteStream(destPath, { highWaterMark: 64 * 1024 });

      readStream.on('data', (chunk: Buffer | string) => {
        if (hash) hash.update(chunk);
        onChunk(chunk.length);
      });

      const handleErr = (err: any) => {
        if (settled) return;
        settled = true;
        readStream.destroy();
        writeStream.destroy();
        reject(err);
      };

      readStream.on('error', handleErr);
      writeStream.on('error', handleErr);

      writeStream.on('close', async () => {
        if (settled) return;
        settled = true;
        try {
          try {
            const handle = await fs.promises.open(destPath, 'r+');
            await handle.sync();
            await handle.close();
          } catch {}
          resolve({ sha256Hex: hash ? hash.digest('hex') : '' });
        } catch (syncErr) {
          reject(syncErr);
        }
      });

      readStream.pipe(writeStream);
    });
  }

  private async copyFileStreamed(
    sourcePath: string,
    destPath: string,
    onChunk: (bytes: number) => void
  ): Promise<void> {
    await this.copyFileStreamedStandard(sourcePath, destPath, onChunk, false);
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
        `Pipeline Mode:    ${session.mode === 'turbo' ? 'TURBO BACKUP (Optimized Bounded Concurrency)' : 'STANDARD BACKUP (Conservative Sequential)'}`,
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
        '              RECONCILIATION AUDIT                   ',
        '-----------------------------------------------------',
        `Total Eligible Source Files:   ${session.reconciliation?.totalEligible ?? session.filesScanned}`,
        `Successfully Verified Files:   ${session.filesCopied}`,
        `Unchanged Files Preserved:     ${session.filesSkipped}`,
        `Failed Copy Writes:            ${session.reconciliation?.failedWrites?.length ?? 0}`,
        `Missing Destination Files:     ${session.reconciliation?.missingDestinations?.length ?? 0}`,
        `SHA-256 Checksum Mismatches:   ${session.reconciliation?.checksumMismatches?.length ?? 0}`,
        `Scan / Enumeration Errors:     ${session.reconciliation?.scanErrors?.length ?? 0}`,
        `Full Reconciliation Status:    ${session.reconciliation?.isFullyReconciled ? 'RECONCILED 100% ✓' : 'INTEGRITY DISCREPANCY DETECTED ⚠'}`,
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
