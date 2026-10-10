/**
 * Dero Vault — Backup Verification
 * Confirms integrity of backed-up files on the destination drive.
 */

import fs from 'fs';
import crypto from 'crypto';
import { PlannedFileCopy } from './fileComparison.js';

export interface VerificationResult {
  isVerified: boolean;
  totalVerified: number;
  failures: {
    sourcePath: string;
    destPath: string;
    reason: string;
  }[];
  checksumVerifiedCount: number;
}

export class BackupVerification {
  /**
   * Calculates SHA-256 checksum for a file.
   */
  public static async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Verifies copied files against source files.
   */
  public static async verifyBatch(
    copiedFiles: PlannedFileCopy[],
    verifyChecksums: boolean = true,
    onProgress?: (verifiedCount: number, total: number) => void
  ): Promise<VerificationResult> {
    const failures: { sourcePath: string; destPath: string; reason: string }[] = [];
    let checksumVerifiedCount = 0;
    let checkedCount = 0;

    for (const item of copiedFiles) {
      const source = item.source.fullPath;
      const dest = item.destinationPath;

      // 1. Existence check
      if (!fs.existsSync(dest)) {
        failures.push({
          sourcePath: source,
          destPath: dest,
          reason: 'Destination file does not exist after copy',
        });
        continue;
      }

      // 2. Size check
      try {
        const destStat = await fs.promises.stat(dest);
        if (destStat.size !== item.size) {
          failures.push({
            sourcePath: source,
            destPath: dest,
            reason: `Size mismatch: expected ${item.size} bytes, got ${destStat.size} bytes`,
          });
          continue;
        }

        // 3. Optional Checksum check (for files under 50MB to remain snappy)
        if (verifyChecksums && item.size < 50 * 1024 * 1024) {
          try {
            const [sourceHash, destHash] = await Promise.all([
              this.calculateChecksum(source),
              this.calculateChecksum(dest),
            ]);

            if (sourceHash !== destHash) {
              failures.push({
                sourcePath: source,
                destPath: dest,
                reason: 'SHA-256 checksum mismatch',
              });
              continue;
            }
            checksumVerifiedCount++;
          } catch (hashErr: any) {
            failures.push({
              sourcePath: source,
              destPath: dest,
              reason: `Failed computing verification checksum: ${hashErr.message}`,
            });
            continue;
          }
        }
      } catch (err: any) {
        failures.push({
          sourcePath: source,
          destPath: dest,
          reason: `Verification error: ${err.message}`,
        });
      }

      checkedCount++;
      if (onProgress && (checkedCount % 20 === 0 || checkedCount === copiedFiles.length)) {
        onProgress(checkedCount, copiedFiles.length);
      }
    }

    return {
      isVerified: failures.length === 0,
      totalVerified: copiedFiles.length - failures.length,
      failures,
      checksumVerifiedCount,
    };
  }
}
