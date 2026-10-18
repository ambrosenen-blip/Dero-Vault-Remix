/**
 * Dero Vault — File Scanner
 * Efficiently traverses source directories, collecting file metadata
 * with real-time scan progress reporting.
 */

import fs from 'fs';
import path from 'path';

export interface ScannedFile {
  fullPath: string;
  sourceBaseFolder: string;
  sourceFolderName: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
}

export class FileScanner {
  /**
   * Scans an array of folder paths, invoking onProgress periodically.
   */
  public static async scanFolders(
    folders: string[],
    onProgress?: (scannedCount: number, currentFolder: string) => void
  ): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    let scannedCount = 0;

    for (const folder of folders) {
      if (!fs.existsSync(folder)) {
        continue;
      }

      const folderName = path.basename(folder) || 'Root';
      await this.scanRecursive(folder, folder, folderName, results, (count) => {
        scannedCount += count;
        if (onProgress && (scannedCount <= 10 || scannedCount % 10 === 0)) {
          onProgress(scannedCount, folder);
        }
      });
    }

    if (onProgress) {
      onProgress(results.length, 'Completed scanning');
    }

    return results;
  }

  private static async scanRecursive(
    currentDir: string,
    baseDir: string,
    baseFolderName: string,
    results: ScannedFile[],
    onBatch: (count: number) => void
  ): Promise<void> {
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden system temp lock files like ~$document.docx or .DS_Store
        if (entry.name.startsWith('~$') || entry.name === 'Thumbs.db' || entry.name === '.DS_Store') {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          await this.scanRecursive(fullPath, baseDir, baseFolderName, results, onBatch);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          try {
            const stats = await fs.promises.stat(fullPath);
            const relativePath = path.relative(baseDir, fullPath);

            results.push({
              fullPath,
              sourceBaseFolder: baseDir,
              sourceFolderName: baseFolderName,
              relativePath,
              size: stats.size,
              mtimeMs: stats.mtimeMs,
            });

            onBatch(1);
          } catch (statErr) {
            // Permission or locked file error, continue gracefully
          }
        }
      }
    } catch (readDirErr) {
      // Inaccessible folder, continue safely without crashing
    }
  }
}
