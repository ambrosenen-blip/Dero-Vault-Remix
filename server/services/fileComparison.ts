/**
 * Dero Vault — File Comparison Engine
 * Determines which files are new, modified, or unchanged.
 * Collision-free path resolution and timestamped versioning.
 */

import fs from 'fs';
import path from 'path';
import { ScannedFile } from './fileScanner.js';

export interface PlannedFileCopy {
  source: ScannedFile;
  destinationPath: string;
  versionArchivePath?: string; // Where previous version will be preserved if modified
  action: 'NEW' | 'MODIFIED';
  size: number;
}

export interface ComparisonResult {
  isInitialBackup: boolean;
  toCopy: PlannedFileCopy[];
  skipped: ScannedFile[];
  newFiles: PlannedFileCopy[];
  modifiedFiles: PlannedFileCopy[];
  totalBytesToCopy: number;
}

export class FileComparison {
  /**
   * Normalizes a source directory path, base folder name, and stable namespace.
   * Handles drive roots (e.g. 'D:', 'D:\', 'D:/', '/') collision-free as 'D_Root'.
   */
  public static normalizeSourceFolder(folderPath: string): { normalizedPath: string; folderName: string; namespace: string } {
    let normalized = folderPath.trim();
    // Normalize Windows drive letter: e.g. "D:" or "D:/" -> "D:\"
    const winDriveMatch = normalized.match(/^([a-zA-Z]):[\\/]?$/);
    if (winDriveMatch) {
      const driveLetter = winDriveMatch[1].toUpperCase();
      normalized = `${driveLetter}:\\`;
      return {
        normalizedPath: normalized,
        folderName: 'Root',
        namespace: `${driveLetter}_Root`,
      };
    }

    // Windows drive with subpath: e.g. "D:\OMAA_CLIENTS_WORK"
    const winDrivePathMatch = normalized.match(/^([a-zA-Z]):[\\/](.*)$/);
    if (winDrivePathMatch) {
      const driveLetter = winDrivePathMatch[1].toUpperCase();
      const winBasename = path.win32.basename(normalized);
      const folderName = winBasename || 'Root';
      const cleanName = folderName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
      const namespace = `${driveLetter}_${cleanName || 'Root'}`;
      return {
        normalizedPath: normalized,
        folderName,
        namespace,
      };
    }

    // POSIX root "/"
    if (normalized === '/' || normalized === '') {
      return {
        normalizedPath: '/',
        folderName: 'Root',
        namespace: 'Root',
      };
    }

    // Standard folder
    const folderName = path.basename(normalized) || 'Root';
    const driveMatch = normalized.match(/^([a-zA-Z]):/);
    const drivePrefix = driveMatch ? `${driveMatch[1].toUpperCase()}_` : '';
    const cleanName = folderName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
    return {
      normalizedPath: normalized,
      folderName,
      namespace: `${drivePrefix}${cleanName || 'Root'}`,
    };
  }

  /**
   * Generates a safe, collision-free subfolder identifier for a source directory.
   * e.g., 'C:\Users\User\Documents' -> 'C_Documents', 'D:\' -> 'D_Root'
   */
  public static getSourceNamespace(sourceBaseFolder: string, sourceFolderName?: string): string {
    const info = this.normalizeSourceFolder(sourceBaseFolder);
    if (sourceFolderName && sourceFolderName !== 'Root' && sourceFolderName !== path.basename(sourceBaseFolder)) {
      const driveMatch = sourceBaseFolder.match(/^([a-zA-Z]):/);
      const drivePrefix = driveMatch ? `${driveMatch[1].toUpperCase()}_` : '';
      const cleanName = sourceFolderName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
      return `${drivePrefix}${cleanName}`;
    }
    return info.namespace;
  }

  /**
   * Resolves a destination file path collision-free across multiple source folders.
   * Normalizes path separators cross-platform and disambiguates collisions with stable namespace hashing.
   */
  public static resolveDestinationPath(
    currentBackupDir: string,
    source: ScannedFile,
    assignedDestinations: Map<string, string>
  ): string {
    const sourceNamespace = this.getSourceNamespace(source.sourceBaseFolder, source.sourceFolderName);
    const cleanRelative = source.relativePath.replace(/^([\\/]|(\.\.[\\/]))+/, '');
    // Normalize path separators cross-platform (handling Windows backslashes even in POSIX runtimes)
    const normalizedRelative = cleanRelative.split(/[\\/]+/).filter(Boolean).join(path.sep);
    let destFilePath = path.join(currentBackupDir, sourceNamespace, normalizedRelative);
    const lowerKey = destFilePath.toLowerCase();

    const existing = assignedDestinations.get(lowerKey);
    if (!existing || existing.toLowerCase() === source.fullPath.toLowerCase()) {
      assignedDestinations.set(lowerKey, source.fullPath);
      return destFilePath;
    }

    // Collision detected: Multiple distinct source files mapped to the same destination path.
    // Disambiguate using a stable hash of the source base folder.
    const driveMatch = source.sourceBaseFolder.match(/^([a-zA-Z]):/);
    const drivePrefix = driveMatch ? `${driveMatch[1].toUpperCase()}_` : '';
    const cleanBase = path.basename(source.sourceBaseFolder).replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim() || 'Src';
    const disambiguatedNamespace = `${drivePrefix}${cleanBase}`;
    let candidate = path.join(currentBackupDir, disambiguatedNamespace, normalizedRelative);

    if (assignedDestinations.has(candidate.toLowerCase()) && assignedDestinations.get(candidate.toLowerCase()) !== source.fullPath) {
      // Secondary fallback with path hash
      const hash = source.sourceBaseFolder.split('').reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0) | 0, 0);
      const hexHash = Math.abs(hash).toString(16).substring(0, 4);
      candidate = path.join(currentBackupDir, `${sourceNamespace}_${hexHash}`, normalizedRelative);
    }

    assignedDestinations.set(candidate.toLowerCase(), source.fullPath);
    return candidate;
  }

  /**
   * Compares scanned source files with the destination backup directory.
   */
  public static async compare(
    scannedFiles: ScannedFile[],
    destRoot: string,
    preserveVersions: boolean = true,
    sessionTimestamp?: string
  ): Promise<ComparisonResult> {
    const currentBackupDir = path.join(destRoot, 'DERO_VAULT_BACKUP', 'CURRENT');
    const versionsBaseDir = path.join(destRoot, 'DERO_VAULT_BACKUP', 'VERSIONS');
    
    // Format timestamped revision folder: e.g. 2026-10-05_130457
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const revisionFolder = sessionTimestamp || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // Check if initial backup
    const isInitialBackup = !fs.existsSync(currentBackupDir);

    const toCopy: PlannedFileCopy[] = [];
    const skipped: ScannedFile[] = [];
    const newFiles: PlannedFileCopy[] = [];
    const modifiedFiles: PlannedFileCopy[] = [];
    let totalBytesToCopy = 0;
    const assignedDestinations = new Map<string, string>();

    // Fast-path: If initial backup, all scanned files are definitively NEW
    if (isInitialBackup) {
      for (const source of scannedFiles) {
        const destFilePath = this.resolveDestinationPath(currentBackupDir, source, assignedDestinations);
        const item: PlannedFileCopy = {
          source,
          destinationPath: destFilePath,
          action: 'NEW',
          size: source.size,
        };
        toCopy.push(item);
        newFiles.push(item);
        totalBytesToCopy += source.size;
      }
      return {
        isInitialBackup,
        toCopy,
        skipped,
        newFiles,
        modifiedFiles,
        totalBytesToCopy,
      };
    }

    // Incremental comparison with adaptive bounded parallel stat workers
    const concurrency = scannedFiles.length < 50 ? 2 : Math.min(8, Math.max(4, Math.floor(scannedFiles.length / 10)));
    let nextIndex = 0;
    const lock = {
      pushNew: (item: PlannedFileCopy) => {
        toCopy.push(item);
        newFiles.push(item);
        totalBytesToCopy += item.size;
      },
      pushMod: (item: PlannedFileCopy) => {
        toCopy.push(item);
        modifiedFiles.push(item);
        totalBytesToCopy += item.size;
      },
      pushSkip: (source: ScannedFile) => {
        skipped.push(source);
      },
    };

    const worker = async () => {
      while (nextIndex < scannedFiles.length) {
        const source = scannedFiles[nextIndex++];
        if (!source) break;
        const destFilePath = this.resolveDestinationPath(currentBackupDir, source, assignedDestinations);
        const cleanRelative = source.relativePath.replace(/^([\\/]|(\.\.[\\/]))+/, '');
        const normalizedRelative = cleanRelative.split(/[\\/]+/).filter(Boolean).join(path.sep);

        try {
          const destStat = await fs.promises.stat(destFilePath);
          const sizeMatches = destStat.size === source.size;
          // Account for filesystem timestamp precision differences (FAT32 has 2s resolution)
          const timeDiff = Math.abs(destStat.mtimeMs - source.mtimeMs);
          const timeMatches = timeDiff < 2000;

          if (sizeMatches && timeMatches) {
            lock.pushSkip(source);
          } else {
            const sourceNamespace = this.getSourceNamespace(source.sourceBaseFolder, source.sourceFolderName);
            const versionArchivePath = preserveVersions
              ? path.join(versionsBaseDir, revisionFolder, sourceNamespace, normalizedRelative)
              : undefined;

            lock.pushMod({
              source,
              destinationPath: destFilePath,
              versionArchivePath,
              action: 'MODIFIED',
              size: source.size,
            });
          }
        } catch {
          // File does not exist on destination -> Treat as NEW
          lock.pushNew({
            source,
            destinationPath: destFilePath,
            action: 'NEW',
            size: source.size,
          });
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);


    return {
      isInitialBackup,
      toCopy,
      skipped,
      newFiles,
      modifiedFiles,
      totalBytesToCopy,
    };
  }
}
