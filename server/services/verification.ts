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
   * Calculates SHA-256 checksum for a file using high-throughput streaming buffer.
   */
  public static async calculateChecksum(filePath: string, bufferSize: number = 256 * 1024): Promise<string> {
    try {
      const stat = await fs.promises.stat(filePath);
      // For office-sized files (<= 4 MB), single-chunk read avoids multi-tick stream overhead while staying memory-bounded
      if (stat.size <= 4 * 1024 * 1024) {
        const buf = await fs.promises.readFile(filePath);
        return crypto.createHash('sha256').update(buf).digest('hex');
      }
    } catch {}

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Verifies copied files against source files with bounded concurrency
   * and support for precomputed on-the-fly source hashes.
   */
  public static async verifyBatch(
    copiedFiles: PlannedFileCopy[],
    verifyChecksums: boolean = true,
    onProgress?: (verifiedCount: number, total: number) => void,
    precomputedHashes?: Map<string, string>
  ): Promise<VerificationResult> {
    const failures: { sourcePath: string; destPath: string; reason: string }[] = [];
    let checksumVerifiedCount = 0;
    let checkedCount = 0;

    // Bounded parallel verification pool (up to 16 parallel checks)
    const concurrency = Math.min(16, Math.max(2, copiedFiles.length));
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < copiedFiles.length) {
        const item = copiedFiles[nextIndex++];
        const source = item.source.fullPath;
        const dest = item.destinationPath;

        // 1 & 2. Existence and Size check in single stat syscall
        try {
          const destStat = await fs.promises.stat(dest);
          if (destStat.size !== item.size) {
            failures.push({
              sourcePath: source,
              destPath: dest,
              reason: `Size mismatch: expected ${item.size} bytes, got ${destStat.size} bytes`,
            });
            checkedCount++;
            continue;
          }

          // 3. Cryptographic Checksum check (for files under 100MB to remain snappy)
          if (verifyChecksums && item.size < 100 * 1024 * 1024) {
            try {
              let sourceHash = precomputedHashes?.get(source);
              if (!sourceHash) {
                sourceHash = await this.calculateChecksum(source);
              }
              const destHash = await this.calculateChecksum(dest);

              if (sourceHash !== destHash) {
                failures.push({
                  sourcePath: source,
                  destPath: dest,
                  reason: 'SHA-256 checksum mismatch',
                });
                checkedCount++;
                continue;
              }
              checksumVerifiedCount++;
            } catch (hashErr: any) {
              failures.push({
                sourcePath: source,
                destPath: dest,
                reason: `Failed computing verification checksum: ${hashErr.message}`,
              });
              checkedCount++;
              continue;
            }
          }
        } catch (err: any) {
          failures.push({
            sourcePath: source,
            destPath: dest,
            reason: err.code === 'ENOENT' ? 'Destination file does not exist after copy' : `Verification error: ${err.message}`,
          });
          checkedCount++;
          continue;
        }

        checkedCount++;
        if (onProgress && (checkedCount % 10 === 0 || checkedCount === copiedFiles.length)) {
          onProgress(checkedCount, copiedFiles.length);
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    return {
      isVerified: failures.length === 0,
      totalVerified: copiedFiles.length - failures.length,
      failures,
      checksumVerifiedCount,
    };
  }
}

