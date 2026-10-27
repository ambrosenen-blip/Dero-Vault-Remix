/**
 * Dero Vault — Destination Capacity Safety Service
 * 
 * Enforces preflight storage requirements before copying, monitors live destination
 * capacity during execution, and provides fail-closed protection against out-of-space crashes.
 */

import fs from 'fs';
import path from 'path';
import { PlannedFileCopy } from './fileComparison.js';
import { ScannedFile, ScanError } from './fileScanner.js';
import { RemovableDrive } from '../types.js';

export interface VolumeSpaceInfo {
  availableBytes: number;
  totalBytes: number;
  freeBytes: number;
  isReliable: boolean;
  error?: string;
}

export interface CapacityPreflightAssessment {
  canProceed: boolean;
  reason?: 'INSUFFICIENT_SPACE' | 'FILESYSTEM_LIMIT_FAT32' | 'QUERY_FAILED' | 'SCAN_FAILED';
  title?: string;
  message?: string;
  formattedRequired: string;
  formattedAvailable: string;
  formattedAdditionalNeeded: string;
  actualDataBytes: number;
  versionArchiveAllowanceBytes: number;
  stagingAllowanceBytes: number;
  safetyMarginBytes: number;
  recoveryPackageBytes: number;
  metadataAllowanceBytes: number;
  totalRequiredBytes: number;
  availableBytes: number;
  additionalNeededBytes: number;
  fat32Violations?: { path: string; size: number; formattedSize: string }[];
}

export class CapacitySafetyService {
  public static readonly FAT32_MAX_FILE_BYTES = 4294967295; // 4 GB - 1 byte
  public static readonly MIN_SAFETY_MARGIN_BYTES = 100 * 1024 * 1024; // 100 MB minimum buffer
  public static readonly MAX_SAFETY_MARGIN_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB max buffer
  public static readonly SAFETY_MARGIN_RATIO = 0.05; // 5% of destination volume capacity
  public static readonly METADATA_ALLOWANCE_BYTES = 10 * 1024 * 1024; // 10 MB for DB, reports, journals
  public static readonly DEFAULT_RECOVERY_PACKAGE_BYTES = 150 * 1024 * 1024; // ~150 MB for offline installers

  /**
   * Queries real-time available and total space on the destination volume.
   * Utilizes Node.js fs.statfs / uv_fs_statfs which queries GetDiskFreeSpaceExW on Windows
   * and statfs on POSIX, providing the exact unprivileged available bytes (bavail * bsize).
   */
  public static async queryVolumeSpace(mountPath: string): Promise<VolumeSpaceInfo> {
    try {
      if (!fs.existsSync(mountPath)) {
        return {
          availableBytes: 0,
          totalBytes: 0,
          freeBytes: 0,
          isReliable: false,
          error: `Destination volume path does not exist: ${mountPath}`,
        };
      }

      const stat = await fs.promises.statfs(mountPath);
      const bsize = BigInt(stat.bsize || 4096);
      const bavail = BigInt(stat.bavail || 0);
      const bfree = BigInt(stat.bfree || 0);
      const blocks = BigInt(stat.blocks || 0);

      const available = Number(bavail * bsize);
      const free = Number(bfree * bsize);
      const total = Number(blocks * bsize);

      if (total <= 0 || isNaN(available) || available < 0) {
        return {
          availableBytes: 0,
          totalBytes: 0,
          freeBytes: 0,
          isReliable: false,
          error: `Invalid volume metric returned for ${mountPath}`,
        };
      }

      return {
        availableBytes: available,
        totalBytes: total,
        freeBytes: free,
        isReliable: true,
      };
    } catch (err: any) {
      return {
        availableBytes: 0,
        totalBytes: 0,
        freeBytes: 0,
        isReliable: false,
        error: `Failed to query disk space on ${mountPath}: ${err.message}`,
      };
    }
  }

  /**
   * Formats byte count into human-readable unit string.
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Conducts strict preflight capacity assessment before starting the copy phase.
   */
  public static async assessPreflight(input: {
    toCopy: PlannedFileCopy[];
    scannedFiles: ScannedFile[];
    scanErrors: ScanError[];
    destMountPath: string;
    drive: RemovableDrive;
    isTurbo: boolean;
    preserveVersions: boolean;
    includeRecoveryPackageBytes?: number;
  }): Promise<CapacityPreflightAssessment> {
    const {
      toCopy,
      scannedFiles,
      scanErrors,
      destMountPath,
      drive,
      isTurbo,
      preserveVersions,
      includeRecoveryPackageBytes = 0,
    } = input;

    // 1. Check for enumeration failures: if scan had fatal errors, cannot assume assignment is complete
    if (scanErrors.length > 0 && scannedFiles.length === 0) {
      return {
        canProceed: false,
        reason: 'SCAN_FAILED',
        title: 'Source Enumeration Failed',
        message: `Unable to scan protected source directories: ${scanErrors[0]?.error || 'Unknown enumeration error'}. No backup started.`,
        formattedRequired: '0 B',
        formattedAvailable: '0 B',
        formattedAdditionalNeeded: '0 B',
        actualDataBytes: 0,
        versionArchiveAllowanceBytes: 0,
        stagingAllowanceBytes: 0,
        safetyMarginBytes: 0,
        recoveryPackageBytes: 0,
        metadataAllowanceBytes: 0,
        totalRequiredBytes: 0,
        availableBytes: 0,
        additionalNeededBytes: 0,
      };
    }

    // 2. Query destination volume real-time space
    const spaceInfo = await this.queryVolumeSpace(destMountPath);
    if (!spaceInfo.isReliable) {
      // Fail closed: Never assume destination is adequate if space query fails
      return {
        canProceed: false,
        reason: 'QUERY_FAILED',
        title: 'Capacity Verification Failed',
        message: `Unable to verify available space on destination drive [${drive.driveLetter}]: ${spaceInfo.error || 'Disk metric query returned invalid results'}. Backup halted safely before copying.`,
        formattedRequired: 'Unknown',
        formattedAvailable: 'Unknown',
        formattedAdditionalNeeded: 'Unknown',
        actualDataBytes: 0,
        versionArchiveAllowanceBytes: 0,
        stagingAllowanceBytes: 0,
        safetyMarginBytes: 0,
        recoveryPackageBytes: 0,
        metadataAllowanceBytes: 0,
        totalRequiredBytes: 0,
        availableBytes: 0,
        additionalNeededBytes: 0,
      };
    }

    const availableBytes = (drive.freeBytes !== undefined && drive.freeBytes > 0)
      ? Math.min(spaceInfo.availableBytes, drive.freeBytes)
      : spaceInfo.availableBytes;
    const totalVolumeBytes = (drive.totalBytes !== undefined && drive.totalBytes > 0)
      ? drive.totalBytes
      : (spaceInfo.totalBytes || availableBytes);

    // 3. FAT32 single-file constraints check
    const isFat32 = (drive.fileSystem || '').toUpperCase() === 'FAT32';
    if (isFat32) {
      const fat32Violations = toCopy
        .filter((item) => item.size > this.FAT32_MAX_FILE_BYTES)
        .map((item) => ({
          path: item.source.relativePath,
          size: item.size,
          formattedSize: this.formatBytes(item.size),
        }));

      if (fat32Violations.length > 0) {
        const topFile = fat32Violations[0];
        return {
          canProceed: false,
          reason: 'FILESYSTEM_LIMIT_FAT32',
          title: 'FAT32 File Size Limit Exceeded',
          message: `The file "${topFile.path}" (${topFile.formattedSize}) exceeds the 4 GB single-file limit of the FAT32 file system on destination ${drive.driveLetter}. Reformat the drive with NTFS or exFAT to back up this file safely.`,
          formattedRequired: this.formatBytes(topFile.size),
          formattedAvailable: this.formatBytes(availableBytes),
          formattedAdditionalNeeded: '0 B',
          actualDataBytes: 0,
          versionArchiveAllowanceBytes: 0,
          stagingAllowanceBytes: 0,
          safetyMarginBytes: 0,
          recoveryPackageBytes: 0,
          metadataAllowanceBytes: 0,
          totalRequiredBytes: 0,
          availableBytes,
          additionalNeededBytes: 0,
          fat32Violations,
        };
      }
    }

    // 4. Calculate actual required bytes
    // Actual new/modified data bytes
    const actualDataBytes = toCopy.reduce((acc, f) => acc + f.size, 0);

    // Version archiving temporary storage for modified files
    let versionArchiveAllowanceBytes = 0;
    if (preserveVersions) {
      // Modified files are archived to VERSIONS/<session>/ before being overwritten
      versionArchiveAllowanceBytes = toCopy
        .filter((f) => f.action === 'MODIFIED')
        .reduce((acc, f) => acc + f.size, 0);
    }

    // Staging buffer: Staging files (*.dero_part) exist concurrently before atomic promotion
    // In Turbo mode (up to 16 workers), bounded to sum of top 16 file sizes or single largest file
    const sortedSizes = toCopy.map((f) => f.size).sort((a, b) => b - a);
    const workerCount = isTurbo ? Math.min(16, toCopy.length) : 1;
    const stagingAllowanceBytes = sortedSizes.slice(0, Math.max(1, workerCount)).reduce((a, b) => a + b, 0);

    // Safety margin:
    // Flash media (USB sticks, SD cards) and NTFS/FAT32 volume tables experience severe write stall
    // and wear-leveling failure if filled to 100%. Maintaining 5% (min 100MB, max 2GB) prevents corruption.
    const safetyMarginBytes = Math.max(
      this.MIN_SAFETY_MARGIN_BYTES,
      Math.min(this.MAX_SAFETY_MARGIN_BYTES, Math.round(totalVolumeBytes * this.SAFETY_MARGIN_RATIO))
    );

    const metadataAllowanceBytes = this.METADATA_ALLOWANCE_BYTES;
    const recoveryPackageBytes = includeRecoveryPackageBytes;

    const totalRequiredBytes =
      actualDataBytes +
      versionArchiveAllowanceBytes +
      stagingAllowanceBytes +
      safetyMarginBytes +
      metadataAllowanceBytes +
      recoveryPackageBytes;

    const additionalNeededBytes = Math.max(0, totalRequiredBytes - availableBytes);
    const canProceed = availableBytes >= totalRequiredBytes;

    const formattedRequired = this.formatBytes(totalRequiredBytes);
    const formattedAvailable = this.formatBytes(availableBytes);
    const formattedAdditionalNeeded = this.formatBytes(additionalNeededBytes);

    if (!canProceed) {
      // Exactly matches user warning mandate
      const userWarningMessage = [
        'Insufficient Storage Capacity',
        'The selected backup drive does not have enough available space to complete this backup safely.',
        'Please reduce the content selected for backup or connect a larger storage device. No backup has been started.',
        `Required space: ${formattedRequired}`,
        `Available space: ${formattedAvailable}`,
        `Additional space needed, including the safety allowance: ${formattedAdditionalNeeded}`,
        'Choose a different drive or revise your backup assignment to continue.',
      ].join('\n');

      return {
        canProceed: false,
        reason: 'INSUFFICIENT_SPACE',
        title: 'Insufficient Storage Capacity',
        message: userWarningMessage,
        formattedRequired,
        formattedAvailable,
        formattedAdditionalNeeded,
        actualDataBytes,
        versionArchiveAllowanceBytes,
        stagingAllowanceBytes,
        safetyMarginBytes,
        recoveryPackageBytes,
        metadataAllowanceBytes,
        totalRequiredBytes,
        availableBytes,
        additionalNeededBytes,
      };
    }

    return {
      canProceed: true,
      formattedRequired,
      formattedAvailable,
      formattedAdditionalNeeded: '0 B',
      actualDataBytes,
      versionArchiveAllowanceBytes,
      stagingAllowanceBytes,
      safetyMarginBytes,
      recoveryPackageBytes,
      metadataAllowanceBytes,
      totalRequiredBytes,
      availableBytes,
      additionalNeededBytes: 0,
    };
  }

  /**
   * Determines if a copy error indicates an out-of-disk-space (ENOSPC) failure.
   */
  public static isDiskFullError(err: any): boolean {
    if (!err) return false;
    const code = err.code || '';
    const msg = (err.message || '').toLowerCase();
    return (
      code === 'ENOSPC' ||
      code === 'ERR_FS_DISK_FULL' ||
      msg.includes('no space left on device') ||
      msg.includes('not enough space') ||
      msg.includes('disk full') ||
      msg.includes('there is not enough space on the disk')
    );
  }
}
