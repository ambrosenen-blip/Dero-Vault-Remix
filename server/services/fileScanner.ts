/**
 * Dero Vault — File Scanner
 * Efficiently traverses source directories and drive roots, collecting file metadata
 * with real-time scan progress reporting, junction/symlink awareness,
 * cycle detection, and robust error tracking.
 */

import fs from 'fs';
import path from 'path';
import { FileComparison } from './fileComparison.js';

export interface ScannedFile {
  fullPath: string;
  sourceBaseFolder: string;
  sourceFolderName: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
}

export interface ScanError {
  path: string;
  error: string;
  code?: string;
}

export interface ScanResult {
  files: ScannedFile[];
  errors: ScanError[];
}

const SYSTEM_VOLUME_EXCLUSIONS = new Set([
  '$RECYCLE.BIN',
  'System Volume Information',
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'DumpStack.log.tmp',
  '.Spotlight-V100',
  '.Trashes',
  'lost+found',
]);

export class FileScanner {
  /**
   * Scans an array of folder paths or drive roots, invoking onProgress periodically.
   * Returns discovered files and any isolated scan errors.
   */
  public static async scanFolders(
    folders: string[],
    onProgress?: (scannedCount: number, currentFolder: string) => void
  ): Promise<ScanResult> {
    const results: ScannedFile[] = [];
    const errors: ScanError[] = [];
    let scannedCount = 0;

    for (const folder of folders) {
      const normalized = FileComparison.normalizeSourceFolder(folder);
      const targetFolder = normalized.normalizedPath;

      if (!fs.existsSync(targetFolder)) {
        errors.push({
          path: targetFolder,
          error: `Source folder or drive does not exist or is disconnected: ${folder}`,
          code: 'ENOENT',
        });
        continue;
      }

      const folderName = normalized.folderName;
      const visitedDirs = new Set<string>();

      try {
        const canonical = await fs.promises.realpath(targetFolder);
        visitedDirs.add(canonical);
      } catch {
        visitedDirs.add(targetFolder);
      }

      await this.scanRecursive(targetFolder, targetFolder, folderName, results, errors, visitedDirs, (count) => {
        scannedCount += count;
        if (onProgress && (scannedCount <= 10 || scannedCount % 10 === 0)) {
          onProgress(scannedCount, targetFolder);
        }
      });
    }

    if (onProgress) {
      onProgress(results.length, 'Completed scanning');
    }

    return {
      files: results,
      errors,
    };
  }

  private static async scanRecursive(
    currentDir: string,
    baseDir: string,
    baseFolderName: string,
    results: ScannedFile[],
    errors: ScanError[],
    visitedDirs: Set<string>,
    onBatch: (count: number) => void
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (readDirErr: any) {
      const baseName = path.basename(currentDir);
      if (!SYSTEM_VOLUME_EXCLUSIONS.has(baseName)) {
        errors.push({
          path: currentDir,
          error: `Directory inaccessible: ${readDirErr.message}`,
          code: readDirErr.code,
        });
      }
      return;
    }

    for (const entry of entries) {
      // Skip Windows OS system volume root metadata
      if (SYSTEM_VOLUME_EXCLUSIONS.has(entry.name)) {
        continue;
      }

      // Skip temporary lock files and OS thumbnail/desktop artifacts
      if (entry.name.startsWith('~$') || entry.name === 'Thumbs.db' || entry.name === '.DS_Store') {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      try {
        let isDir = entry.isDirectory();
        let isFile = entry.isFile();

        // Handle NTFS Directory Junctions and Symbolic Links properly
        if (entry.isSymbolicLink()) {
          try {
            const targetStat = await fs.promises.stat(fullPath);
            if (targetStat.isDirectory()) {
              isDir = true;
              isFile = false;
            } else if (targetStat.isFile()) {
              isDir = false;
              isFile = true;
            }
          } catch (linkErr: any) {
            errors.push({
              path: fullPath,
              error: `Broken or unreadable symbolic link/junction: ${linkErr.message}`,
              code: linkErr.code,
            });
            continue;
          }
        }

        if (isDir) {
          // Guard against directory junction / symlink recursion cycles
          try {
            const real = await fs.promises.realpath(fullPath);
            if (visitedDirs.has(real)) {
              continue; // Cycle detected, safely skip
            }
            visitedDirs.add(real);
          } catch {
            if (visitedDirs.has(fullPath)) {
              continue;
            }
            visitedDirs.add(fullPath);
          }

          // Recurse into directory
          await this.scanRecursive(fullPath, baseDir, baseFolderName, results, errors, visitedDirs, onBatch);
        } else if (isFile) {
          try {
            const stats = await fs.promises.stat(fullPath);
            let relativePath: string;
            if (baseDir.includes('\\') || fullPath.includes('\\')) {
              relativePath = path.win32.relative(baseDir, fullPath);
            } else {
              relativePath = path.relative(baseDir, fullPath);
            }

            results.push({
              fullPath,
              sourceBaseFolder: baseDir,
              sourceFolderName: baseFolderName,
              relativePath,
              size: stats.size,
              mtimeMs: stats.mtimeMs,
            });

            onBatch(1);
          } catch (statErr: any) {
            errors.push({
              path: fullPath,
              error: `Failed to stat file: ${statErr.message}`,
              code: statErr.code,
            });
          }
        }
      } catch (entryErr: any) {
        errors.push({
          path: fullPath,
          error: `Error processing file entry: ${entryErr.message}`,
          code: entryErr.code,
        });
      }
    }
  }
}
