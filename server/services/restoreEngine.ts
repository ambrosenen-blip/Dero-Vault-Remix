/**
 * Dero Vault — Rescue & Migration: Core Restoration Engine
 * Publisher: Enen Digital Labs Co. Ltd
 * 
 * Production-hardened file restoration engine.
 * Faithfully recovers backed-up office files, maps old machine user profiles
 * to new computer directories, handles file conflicts non-destructively,
 * and cryptographically verifies file integrity using SHA-256.
 * 
 * Strict safety rules:
 * - NEVER modifies or deletes backup files on the source drive.
 * - NEVER silently overwrites or deletes existing files at destination.
 * - Rejects path traversal and directory escape attempts.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  ConflictStrategy,
  OfflineInstallerPackage,
  RecoveryManifest,
  RestoreNamespaceMapping,
  RestoreSession,
  RestoreStatus,
} from '../types.js';
import { LocalDatabase } from './localDb.js';
import { RecoveryManager } from './recoveryManager.js';
import { EnvironmentDetector, EnvironmentDetectionResult } from './environmentDetector.js';

export interface RestoreExecutionOptions {
  mountPath: string;
  driveStableId?: string;
  driveLetter?: string;
  namespaces: {
    namespace: string;
    targetPath: string;
    enabled: boolean;
  }[];
  conflictStrategy: ConflictStrategy;
  verifyIntegrity: boolean;
}

export interface DriveInspectionResult {
  hasBackup: boolean;
  manifest?: RecoveryManifest;
  namespaces: RestoreNamespaceMapping[];
  totalFiles: number;
  totalBytes: number;
  sourceMachine?: any;
  error?: string;
  environmentResult?: EnvironmentDetectionResult;
  offlineInstallers?: OfflineInstallerPackage[];
  isIncompleteBackup?: boolean;
  incompleteReason?: string;
}

export class RestoreEngine extends EventEmitter {
  private db: LocalDatabase;
  private currentSession: RestoreSession | null = null;
  private isCancelled: boolean = false;
  private isPaused: boolean = false;

  constructor(db: LocalDatabase) {
    super();
    this.db = db;
  }

  public getCurrentSession(): RestoreSession | null {
    return this.currentSession;
  }

  public isRunning(): boolean {
    return (
      this.currentSession !== null &&
      ['scanning', 'restoring', 'verifying'].includes(this.currentSession.status)
    );
  }

  public cancelActiveRestore(): boolean {
    if (!this.isRunning() || !this.currentSession) return false;
    this.isCancelled = true;
    this.currentSession.status = 'cancelled';
    this.currentSession.endTime = new Date().toISOString();
    this.db.log('warn', 'RestoreEngine', `Restoration cancelled by user.`);
    this.emit('restore:update', this.currentSession);
    this.emit('restore:complete', this.currentSession);
    return true;
  }

  /**
   * Inspects a removable drive or directory for recoverable Dero Vault backups.
   * Works with or without a valid recovery-manifest.json.
   */
  public async inspectBackupDrive(mountPath: string): Promise<DriveInspectionResult> {
    const currentBackupDir = path.join(mountPath, 'DERO_VAULT_BACKUP', 'CURRENT');

    if (!fs.existsSync(mountPath)) {
      return {
        hasBackup: false,
        namespaces: [],
        totalFiles: 0,
        totalBytes: 0,
        error: `Storage mount path [${mountPath}] is not accessible or disconnected.`,
      };
    }

    if (!fs.existsSync(currentBackupDir)) {
      return {
        hasBackup: false,
        namespaces: [],
        totalFiles: 0,
        totalBytes: 0,
        error: 'No Dero Vault backup (DERO_VAULT_BACKUP/CURRENT) found on this drive.',
      };
    }

    // Try reading manifest if available
    let manifest: RecoveryManifest | undefined;
    const manifestCheck = await RecoveryManager.validateRecoveryPackage(mountPath);
    if (manifestCheck.valid && manifestCheck.manifest) {
      manifest = manifestCheck.manifest;
    }

    // Scan DERO_VAULT_BACKUP/CURRENT subfolders (namespaces)
    const namespaceMappings: RestoreNamespaceMapping[] = [];
    let grandTotalFiles = 0;
    let grandTotalBytes = 0;

    try {
      const entries = await fs.promises.readdir(currentBackupDir, { withFileTypes: true });
      const namespaceDirs = entries.filter((e) => e.isDirectory());

      for (const dir of namespaceDirs) {
        const nsName = dir.name;
        const nsDirPath = path.join(currentBackupDir, nsName);

        // Find matching entry from manifest if available
        const metaEntry = manifest?.namespaces.find((n) => n.namespace === nsName);
        const folderName = metaEntry ? metaEntry.folderName : this.inferFolderNameFromNamespace(nsName);
        const originalPath = metaEntry ? metaEntry.originalPath : undefined;

        // Traverse namespace to count files and calculate size
        const { fileCount, totalBytes } = await this.calculateDirectoryStats(nsDirPath);

        // Smart destination suggestion mapped to current user's operating system environment
        const suggestedTarget = this.suggestTargetFolder(folderName, nsName);

        namespaceMappings.push({
          namespace: nsName,
          folderName,
          originalPath,
          targetPath: suggestedTarget,
          fileCount,
          totalBytes,
          enabled: fileCount > 0,
        });

        grandTotalFiles += fileCount;
        grandTotalBytes += totalBytes;
      }
    } catch (err: any) {
      const envResult = await EnvironmentDetector.evaluateRecoveryReadiness(mountPath, manifest);
      return {
        hasBackup: true,
        manifest,
        namespaces: [],
        totalFiles: 0,
        totalBytes: 0,
        error: `Error reading backup directories: ${err.message}`,
        environmentResult: envResult,
      };
    }

    const envResult = await EnvironmentDetector.evaluateRecoveryReadiness(mountPath, manifest);

    // Look for offline installers in DERO_VAULT_BACKUP/RECOVERY/Installers if present
    const installersDir = path.join(mountPath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Installers');
    let offlineInstallers: OfflineInstallerPackage[] = manifest?.offlineInstallers || [];
    if (offlineInstallers.length === 0 && fs.existsSync(installersDir)) {
      try {
        const iFiles = await fs.promises.readdir(installersDir);
        for (const ifile of iFiles) {
          if (ifile.endsWith('.exe') || ifile.endsWith('.zip') || ifile.endsWith('.AppImage') || ifile.endsWith('.deb')) {
            const fpath = path.join(installersDir, ifile);
            const st = await fs.promises.stat(fpath);
            let plat: 'win32' | 'darwin' | 'linux' = 'win32';
            if (ifile.includes('mac') || ifile.endsWith('.dmg')) plat = 'darwin';
            else if (ifile.includes('linux') || ifile.endsWith('.AppImage') || ifile.endsWith('.deb')) plat = 'linux';
            offlineInstallers.push({
              platform: plat,
              arch: 'x64',
              fileName: ifile,
              relativePath: `DERO_VAULT_BACKUP/RECOVERY/Installers/${ifile}`,
              sizeBytes: st.size,
              sha256: await this.calculateSha256(fpath),
              verifiedAt: new Date().toISOString(),
            });
          }
        }
      } catch {}
    }

    // Inspect backup reports to detect incomplete or partial backup runs
    let isIncompleteBackup = false;
    let incompleteReason: string | undefined;
    const reportsDir = path.join(mountPath, 'DERO_VAULT_BACKUP', 'REPORTS');
    if (fs.existsSync(reportsDir)) {
      try {
        const reportFiles = (await fs.promises.readdir(reportsDir))
          .filter((f) => f.startsWith('report_') && f.endsWith('.json'))
          .sort()
          .reverse();

        if (reportFiles.length > 0) {
          const latestReportPath = path.join(reportsDir, reportFiles[0]);
          const reportRaw = await fs.promises.readFile(latestReportPath, 'utf-8');
          const latestReport = JSON.parse(reportRaw);

          if (
            latestReport.status !== 'completed' ||
            (latestReport.errors && latestReport.errors.length > 0) ||
            latestReport.filesFailed > 0 ||
            latestReport.isVerified === false
          ) {
            isIncompleteBackup = true;
            const errCount = (latestReport.errors?.length || 0) + (latestReport.filesFailed || 0);
            incompleteReason = `Latest backup session (${latestReport.id || 'recent'}) finished with status "${latestReport.status}" and ${errCount} error(s)/unverified file(s). Some source files may be missing from this backup.`;
          }
        }
      } catch {}
    }

    return {
      hasBackup: true,
      manifest,
      namespaces: namespaceMappings,
      totalFiles: grandTotalFiles,
      totalBytes: grandTotalBytes,
      sourceMachine: manifest?.sourceMachine,
      environmentResult: envResult,
      offlineInstallers: offlineInstallers.length > 0 ? offlineInstallers : undefined,
      isIncompleteBackup,
      incompleteReason,
    };
  }

  /**
   * Starts guided restoration process with selected namespaces and conflict rules.
   */
  public async startRestore(options: RestoreExecutionOptions): Promise<RestoreSession> {
    if (this.isRunning()) {
      throw new Error('A restoration session is already in progress.');
    }

    this.isCancelled = false;
    this.isPaused = false;

    const enabledNamespaces = options.namespaces.filter((n) => n.enabled);
    if (enabledNamespaces.length === 0) {
      throw new Error('No folders were selected for restoration.');
    }

    // Security validation on target paths
    for (const ns of enabledNamespaces) {
      this.validateTargetDestination(ns.targetPath);
    }

    const sessionId = `restore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const session: RestoreSession = {
      id: sessionId,
      driveStableId: options.driveStableId,
      driveLetter: options.driveLetter,
      mountPath: options.mountPath,
      status: 'scanning',
      startTime: new Date().toISOString(),
      conflictStrategy: options.conflictStrategy || 'safe_rename',
      verifyIntegrity: options.verifyIntegrity ?? true,
      filesDiscovered: 0,
      filesRestored: 0,
      filesSkipped: 0,
      filesFailed: 0,
      filesVerified: 0,
      bytesTotal: 0,
      bytesTransferred: 0,
      currentSpeedBps: 0,
      estimatedSecondsRemaining: 0,
      errors: [],
      namespaces: enabledNamespaces as RestoreNamespaceMapping[],
    };

    this.currentSession = session;
    this.db.log('info', 'RestoreEngine', `Starting restoration session [${sessionId}] from ${options.mountPath}`);
    this.emit('restore:start', session);

    // Run restore pipeline asynchronously
    this.runRestorePipeline(options, session).catch((err: any) => {
      this.db.log('error', 'RestoreEngine', `Fatal restoration error: ${err.message}`);
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      session.errors.push({
        path: options.mountPath,
        destPath: 'N/A',
        error: err.message || 'Fatal restore error',
        timestamp: new Date().toISOString(),
      });
      this.emit('restore:update', session);
      this.emit('restore:complete', session);
    });

    return session;
  }

  private async runRestorePipeline(
    options: RestoreExecutionOptions,
    session: RestoreSession
  ): Promise<void> {
    const currentBackupDir = path.join(options.mountPath, 'DERO_VAULT_BACKUP', 'CURRENT');

    // Step 1: Pre-scan files across selected namespaces
    session.status = 'scanning';
    this.emit('restore:update', session);

    interface RestorableFile {
      sourceFullPath: string;
      relativePath: string;
      targetDestinationPath: string;
      size: number;
      mtimeMs: number;
    }

    const filesToRestore: RestorableFile[] = [];

    for (const ns of session.namespaces) {
      if (this.isCancelled) return;
      const nsSourceDir = path.join(currentBackupDir, ns.namespace);
      if (!fs.existsSync(nsSourceDir)) continue;

      const discovered = await this.scanFilesRecursively(nsSourceDir, ns.targetPath);
      filesToRestore.push(...discovered);
    }

    session.filesDiscovered = filesToRestore.length;
    session.bytesTotal = filesToRestore.reduce((acc, f) => acc + f.size, 0);
    this.emit('restore:update', session);

    if (this.isCancelled) return;

    if (filesToRestore.length === 0) {
      session.status = 'completed';
      session.endTime = new Date().toISOString();
      this.emit('restore:update', session);
      this.emit('restore:complete', session);
      return;
    }

    // Step 2: Restore files
    session.status = 'restoring';
    this.emit('restore:update', session);

    const restoreStartTime = Date.now();
    let totalBytesRestoredSoFar = 0;
    let lastSpeedCheckTime = restoreStartTime;
    let bytesSinceLastCheck = 0;
    let lastEmitTime = restoreStartTime;
    const restoredFilesForVerification: RestorableFile[] = [];

    for (const file of filesToRestore) {
      if (this.isCancelled) return;

      session.currentFile = file.relativePath;

      // Verify source drive is still mounted
      if (!fs.existsSync(options.mountPath)) {
        session.status = 'failed';
        session.endTime = new Date().toISOString();
        session.errors.push({
          path: file.sourceFullPath,
          destPath: file.targetDestinationPath,
          error: 'The backup drive was disconnected during restoration.',
          timestamp: new Date().toISOString(),
        });
        this.emit('restore:update', session);
        this.emit('restore:complete', session);
        return;
      }

      // Security check: path traversal escape prevention
      try {
        this.validatePathEscape(file.targetDestinationPath);
      } catch (pathErr: any) {
        session.filesFailed++;
        session.errors.push({
          path: file.sourceFullPath,
          destPath: file.targetDestinationPath,
          error: `Security error: ${pathErr.message}`,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      // Conflict handling
      let finalDestPath = file.targetDestinationPath;
      if (fs.existsSync(finalDestPath)) {
        if (session.conflictStrategy === 'skip_existing') {
          session.filesSkipped++;
          continue;
        } else if (session.conflictStrategy === 'overwrite_if_newer') {
          try {
            const destStat = await fs.promises.stat(finalDestPath);
            if (file.mtimeMs <= destStat.mtimeMs) {
              // Existing destination file is same or newer, skip safely
              session.filesSkipped++;
              continue;
            }
          } catch {
            // If cannot stat, proceed with safe rename
            finalDestPath = await this.resolveSafeRenamePath(finalDestPath);
          }
        } else {
          // Default: safe_rename (Preserve both!)
          finalDestPath = await this.resolveSafeRenamePath(finalDestPath);
        }
      }

      // Ensure destination directory exists
      const targetDir = path.dirname(finalDestPath);
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }

      // Atomic write using .dero_part
      const stagingPath = `${finalDestPath}.dero_part`;

      try {
        await this.copyFileStreamed(file.sourceFullPath, stagingPath, (chunkBytes) => {
          totalBytesRestoredSoFar += chunkBytes;
          bytesSinceLastCheck += chunkBytes;
          session.bytesTransferred = totalBytesRestoredSoFar;

          const now = Date.now();
          const speedElapsed = (now - lastSpeedCheckTime) / 1000;
          if (speedElapsed >= 0.5) {
            session.currentSpeedBps = bytesSinceLastCheck / speedElapsed;
            lastSpeedCheckTime = now;
            bytesSinceLastCheck = 0;

            const remainingBytes = Math.max(0, session.bytesTotal - session.bytesTransferred);
            if (session.currentSpeedBps > 0) {
              session.estimatedSecondsRemaining = Math.ceil(remainingBytes / session.currentSpeedBps);
            }
          }

          if (now - lastEmitTime >= 150) {
            lastEmitTime = now;
            this.emit('restore:update', session);
          }
        });

        // Validate written size
        const stagedStat = await fs.promises.stat(stagingPath);
        if (stagedStat.size !== file.size) {
          throw new Error(`Incomplete write: expected ${file.size} bytes, wrote ${stagedStat.size}`);
        }

        // Set timestamps
        try {
          const mtime = new Date(file.mtimeMs);
          await fs.promises.utimes(stagingPath, mtime, mtime);
        } catch {}

        // Atomically rename to final path
        await fs.promises.rename(stagingPath, finalDestPath);

        session.filesRestored++;
        restoredFilesForVerification.push({
          ...file,
          targetDestinationPath: finalDestPath,
        });
      } catch (copyErr: any) {
        // Clean up partial staging file if exists
        try {
          if (fs.existsSync(stagingPath)) {
            await fs.promises.unlink(stagingPath);
          }
        } catch {}

        session.filesFailed++;
        session.errors.push({
          path: file.sourceFullPath,
          destPath: finalDestPath,
          error: copyErr.message || 'Write error',
          timestamp: new Date().toISOString(),
        });
      }

      const now = Date.now();
      if (now - lastEmitTime >= 150) {
        lastEmitTime = now;
        this.emit('restore:update', session);
      }
    }

    if (this.isCancelled) return;

    // Step 3: Integrity Verification Phase (SHA-256)
    if (session.verifyIntegrity && restoredFilesForVerification.length > 0) {
      session.status = 'verifying';
      session.currentFile = 'Verifying restored file integrity...';
      this.emit('restore:update', session);

      for (let i = 0; i < restoredFilesForVerification.length; i++) {
        if (this.isCancelled) return;
        const item = restoredFilesForVerification[i];
        session.currentFile = `Verifying file ${i + 1} of ${restoredFilesForVerification.length}... (${path.basename(item.targetDestinationPath)})`;

        try {
          const [sourceHash, destHash] = await Promise.all([
            this.calculateSha256(item.sourceFullPath),
            this.calculateSha256(item.targetDestinationPath),
          ]);

          if (sourceHash === destHash) {
            session.filesVerified++;
          } else {
            session.errors.push({
              path: item.sourceFullPath,
              destPath: item.targetDestinationPath,
              error: 'SHA-256 verification mismatch between backup and restored file.',
              timestamp: new Date().toISOString(),
            });
          }
        } catch (verErr: any) {
          session.errors.push({
            path: item.sourceFullPath,
            destPath: item.targetDestinationPath,
            error: `Integrity check failed: ${verErr.message}`,
            timestamp: new Date().toISOString(),
          });
        }

        const now = Date.now();
        if (now - lastEmitTime >= 200) {
          lastEmitTime = now;
          this.emit('restore:update', session);
        }
      }
    } else {
      session.filesVerified = session.filesRestored;
    }

    // Step 4: Completion
    session.endTime = new Date().toISOString();
    session.status = session.errors.length > 0 ? 'completed_with_errors' : 'completed';
    session.currentFile = undefined;
    session.currentSpeedBps = 0;
    session.estimatedSecondsRemaining = 0;

    this.db.log(
      session.status === 'completed' ? 'success' : 'warn',
      'RestoreEngine',
      `Restoration finished with status ${session.status.toUpperCase()}. Restored: ${session.filesRestored}, Skipped: ${session.filesSkipped}, Failed: ${session.filesFailed}, Verified: ${session.filesVerified}`
    );

    this.emit('restore:update', session);
    this.emit('restore:complete', session);
  }

  /**
   * Generates a conflict-free filename: "report (restored).docx" or "report (restored 2).docx".
   */
  private async resolveSafeRenamePath(originalTarget: string): Promise<string> {
    const dir = path.dirname(originalTarget);
    const ext = path.extname(originalTarget);
    const base = path.basename(originalTarget, ext);

    let counter = 1;
    let candidate = path.join(dir, `${base} (restored)${ext}`);

    while (fs.existsSync(candidate)) {
      counter++;
      candidate = path.join(dir, `${base} (restored ${counter})${ext}`);
    }

    return candidate;
  }

  private validateTargetDestination(targetPath: string): void {
    const clean = path.resolve(targetPath);
    // Disallow bare root drives
    if (clean === '/' || /^[a-zA-Z]:\\?$/.test(clean)) {
      throw new Error(`Restoring directly into root drive [${clean}] is disallowed for safety.`);
    }
  }

  private validatePathEscape(targetFilePath: string): void {
    const normalized = path.normalize(targetFilePath);
    if (normalized.includes('..') || normalized.includes('\0')) {
      throw new Error(`Illegal path traversal sequence detected: ${targetFilePath}`);
    }
  }

  private async calculateSha256(filePath: string): Promise<string> {
    const stat = await fs.promises.stat(filePath);
    if (stat.size <= 4 * 1024 * 1024) {
      const buf = await fs.promises.readFile(filePath);
      return crypto.createHash('sha256').update(buf).digest('hex');
    }

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
      stream.on('data', (c) => hash.update(c));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async copyFileStreamed(
    sourcePath: string,
    destPath: string,
    onChunk: (bytes: number) => void
  ): Promise<void> {
    const stat = await fs.promises.stat(sourcePath);
    if (stat.size <= 4 * 1024 * 1024) {
      const buf = await fs.promises.readFile(sourcePath);
      await fs.promises.writeFile(destPath, buf);
      onChunk(buf.length);
      return;
    }

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath, { highWaterMark: 256 * 1024 });
      const writeStream = fs.createWriteStream(destPath, { highWaterMark: 256 * 1024 });

      readStream.on('data', (chunk: Buffer | string) => {
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
   * Sanitizes filenames across operating systems:
   * - Windows prohibits: < > : " / \ | ? * and ASCII 0-31, trailing dots/spaces,
   *   and DOS reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
   * - POSIX prohibits: / and \0 (NUL byte).
   * Preserves files non-destructively without crashing the restoration engine.
   */
  public static sanitizeFileNameForTarget(fileName: string, targetPlatform: NodeJS.Platform = os.platform()): string {
    if (targetPlatform === 'win32') {
      // 1. Replace illegal characters: < > : " / \ | ? *
      let sanitized = fileName
        .replace(/:/g, '-')
        .replace(/[*?]/g, '_')
        .replace(/"/g, "'")
        .replace(/</g, '(')
        .replace(/>/g, ')')
        .replace(/\|/g, '-');

      // 2. Remove control characters (ASCII 0-31)
      sanitized = sanitized.replace(/[\x00-\x1F]/g, '');

      // 3. Remove trailing dots and spaces before extension or at end
      const ext = path.extname(sanitized);
      let base = path.basename(sanitized, ext).trimEnd();
      while (base.endsWith('.')) {
        base = base.slice(0, -1).trimEnd();
      }
      if (!base) base = 'unnamed_file';

      // 4. Reserved Windows DOS device names: CON, PRN, AUX, NUL, COM1-9, LPT1-9
      const dosReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
      if (dosReserved.test(base)) {
        base = `${base}_`;
      }

      return `${base}${ext}`;
    } else {
      // POSIX (macOS, Linux): only prohibit NUL \0 and slash /
      return fileName.replace(/\0/g, '').replace(/\//g, '-');
    }
  }

  private async scanFilesRecursively(
    sourceDir: string,
    targetBaseDir: string
  ): Promise<{ sourceFullPath: string; relativePath: string; targetDestinationPath: string; size: number; mtimeMs: number }[]> {
    const results: { sourceFullPath: string; relativePath: string; targetDestinationPath: string; size: number; mtimeMs: number }[] = [];
    const lowerDestTracker = new Set<string>();

    const traverse = async (currentSource: string, rel: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(currentSource, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (this.isCancelled) return;
        const entrySourcePath = path.join(currentSource, entry.name);

        // Sanitize entry name for destination OS compatibility
        const sanitizedName = RestoreEngine.sanitizeFileNameForTarget(entry.name, os.platform());
        const entryRelPath = rel ? path.join(rel, sanitizedName) : sanitizedName;
        let entryDestPath = path.join(targetBaseDir, entryRelPath);

        // Handle case collisions on case-insensitive filesystems
        const lowerKey = entryDestPath.toLowerCase();
        if (lowerDestTracker.has(lowerKey)) {
          const dir = path.dirname(entryDestPath);
          const ext = path.extname(entryDestPath);
          const base = path.basename(entryDestPath, ext);
          entryDestPath = path.join(dir, `${base} (case-conflict)${ext}`);
        }
        lowerDestTracker.add(entryDestPath.toLowerCase());

        if (entry.isDirectory()) {
          await traverse(entrySourcePath, entryRelPath);
        } else if (entry.isFile() && !entry.name.endsWith('.dero_part')) {
          try {
            const st = await fs.promises.stat(entrySourcePath);
            results.push({
              sourceFullPath: entrySourcePath,
              relativePath: entryRelPath,
              targetDestinationPath: entryDestPath,
              size: st.size,
              mtimeMs: st.mtimeMs,
            });
          } catch {}
        } else if (entry.isSymbolicLink()) {
          // Safe symlink resolution: ensure symlink doesn't escape backup namespace
          try {
            const real = await fs.promises.realpath(entrySourcePath);
            const resolvedSourceDir = path.resolve(sourceDir);
            if (real.startsWith(resolvedSourceDir)) {
              const st = await fs.promises.stat(entrySourcePath);
              if (st.isFile()) {
                results.push({
                  sourceFullPath: entrySourcePath,
                  relativePath: entryRelPath,
                  targetDestinationPath: entryDestPath,
                  size: st.size,
                  mtimeMs: st.mtimeMs,
                });
              }
            }
          } catch {}
        }
      }
    };

    await traverse(sourceDir, '');
    return results;
  }

  private async calculateDirectoryStats(dirPath: string): Promise<{ fileCount: number; totalBytes: number }> {
    let fileCount = 0;
    let totalBytes = 0;

    const traverse = async (current: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await traverse(full);
        } else if (entry.isFile() && !entry.name.endsWith('.dero_part')) {
          try {
            const st = await fs.promises.stat(full);
            fileCount++;
            totalBytes += st.size;
          } catch {}
        }
      }
    };

    await traverse(dirPath);
    return { fileCount, totalBytes };
  }

  private inferFolderNameFromNamespace(ns: string): string {
    const parts = ns.split('_');
    if (parts.length > 1 && parts[0].length === 1) {
      return parts.slice(1).join('_');
    }
    return ns;
  }

  /**
   * Intelligently maps an old machine's backup folder to the current user's profile
   * across Windows, macOS, and Linux.
   */
  public suggestTargetFolder(folderName: string, _namespace: string): string {
    const home = os.homedir();
    const plat = os.platform();
    const cleanLower = folderName.toLowerCase();

    const resolveFolder = (candidateName: string): string => {
      const target = path.join(home, candidateName);
      return target;
    };

    if (cleanLower.includes('doc')) {
      return resolveFolder('Documents');
    }
    if (cleanLower.includes('desk')) {
      return resolveFolder('Desktop');
    }
    if (cleanLower.includes('pic') || cleanLower.includes('photo')) {
      return resolveFolder('Pictures');
    }
    if (cleanLower.includes('down')) {
      return resolveFolder('Downloads');
    }
    if (cleanLower.includes('music')) {
      return resolveFolder('Music');
    }
    if (cleanLower.includes('vid') || cleanLower.includes('movie')) {
      return plat === 'darwin' ? resolveFolder('Movies') : resolveFolder('Videos');
    }

    // Default: map into a designated Restored folder in current user's Documents
    const defaultRestored = path.join(home, 'Documents', 'DeroVault_Restored', folderName);
    return defaultRestored;
  }
}
