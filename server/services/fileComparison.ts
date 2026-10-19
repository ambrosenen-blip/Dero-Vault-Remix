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
   * Generates a safe, collision-free subfolder identifier for a source directory.
   * e.g., 'C:\Users\User\Documents' -> 'C_Documents'
   */
  public static getSourceNamespace(sourceBaseFolder: string, sourceFolderName: string): string {
    const driveMatch = sourceBaseFolder.match(/^([a-zA-Z]):/);
    const drivePrefix = driveMatch ? `${driveMatch[1].toUpperCase()}_` : '';
    const cleanName = sourceFolderName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
    return `${drivePrefix}${cleanName}`;
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

    // Fast-path: If initial backup, all scanned files are definitively NEW
    if (isInitialBackup) {
      for (const source of scannedFiles) {
        const sourceNamespace = this.getSourceNamespace(source.sourceBaseFolder, source.sourceFolderName);
        const destFilePath = path.join(currentBackupDir, sourceNamespace, source.relativePath);
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
        const sourceNamespace = this.getSourceNamespace(source.sourceBaseFolder, source.sourceFolderName);
        const destFilePath = path.join(currentBackupDir, sourceNamespace, source.relativePath);

        try {
          const destStat = await fs.promises.stat(destFilePath);
          const sizeMatches = destStat.size === source.size;
          // Account for filesystem timestamp precision differences (FAT32 has 2s resolution)
          const timeDiff = Math.abs(destStat.mtimeMs - source.mtimeMs);
          const timeMatches = timeDiff < 2000;

          if (sizeMatches && timeMatches) {
            lock.pushSkip(source);
          } else {
            const versionArchivePath = preserveVersions
              ? path.join(versionsBaseDir, revisionFolder, sourceNamespace, source.relativePath)
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
