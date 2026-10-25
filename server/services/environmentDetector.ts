/**
 * Dero Vault — Environment & Compatibility Detector
 * Publisher: Enen Digital Labs Co. Ltd
 * 
 * Accurately detects:
 * 1. Host Operating System and Friendly Version (Windows 10/11, macOS Sonoma/Sequoia, Ubuntu, Debian, etc.)
 * 2. Processor Architecture (x64, arm64)
 * 3. 4-Check Recovery Compatibility Pipeline:
 *    - Check 1: Operating system detected
 *    - Check 2: Recovery application compatible
 *    - Check 3: Backup format compatible
 *    - Check 4: Backup accessible and recovery ready
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { RecoveryManifest } from '../types.js';
import { RecoveryManager } from './recoveryManager.js';

export interface CompatibilityCheck {
  id: 'os_detected' | 'app_compatible' | 'format_compatible' | 'backup_accessible';
  title: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
  nextAction?: string;
}

export interface EnvironmentDetectionResult {
  hostEnvironment: {
    platform: NodeJS.Platform;
    platformName: 'Windows' | 'macOS' | 'Linux' | 'Other';
    friendlyOsName: string;
    osRelease: string;
    kernelVersion: string;
    arch: string;
    friendlyArch: string;
    hostname: string;
    username: string;
    homeDir: string;
  };
  checks: CompatibilityCheck[];
  allChecksPassed: boolean;
  readyToProceed: boolean;
  plainLanguageSummary: string;
}

export class EnvironmentDetector {
  /**
   * Identifies the current operating system with plain-language release name.
   */
  public static getFriendlyOsName(): string {
    const platform = os.platform();
    const release = os.release();

    if (platform === 'win32') {
      const parts = release.split('.').map((p) => parseInt(p, 10));
      const major = parts[0] || 0;
      const build = parts[2] || 0;

      if (major >= 10) {
        if (build >= 22000) {
          return `Windows 11 (Build ${build})`;
        }
        return `Windows 10 (Build ${build})`;
      } else if (major === 6) {
        if (parts[1] === 3) return 'Windows 8.1';
        if (parts[1] === 2) return 'Windows 8';
        if (parts[1] === 1) return 'Windows 7';
      }
      return `Windows (${release})`;
    }

    if (platform === 'darwin') {
      const major = parseInt(release.split('.')[0] || '0', 10);
      // Darwin 24 = macOS 15 Sequoia, Darwin 23 = macOS 14 Sonoma, Darwin 22 = macOS 13 Ventura, Darwin 21 = macOS 12 Monterey
      let macName = 'macOS';
      if (major >= 24) macName = 'macOS 15 Sequoia';
      else if (major === 23) macName = 'macOS 14 Sonoma';
      else if (major === 22) macName = 'macOS 13 Ventura';
      else if (major === 21) macName = 'macOS 12 Monterey';
      else if (major === 20) macName = 'macOS 11 Big Sur';

      return `${macName} (Kernel Darwin ${release})`;
    }

    if (platform === 'linux') {
      try {
        if (fs.existsSync('/etc/os-release')) {
          const content = fs.readFileSync('/etc/os-release', 'utf-8');
          const prettyMatch = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
          if (prettyMatch && prettyMatch[1]) {
            return `${prettyMatch[1]} (Linux ${release})`;
          }
        }
      } catch {}

      return `Linux (${release})`;
    }

    return `${os.type()} ${release}`;
  }

  public static getFriendlyArch(): string {
    const arch = os.arch();
    if (arch === 'x64') return '64-bit (x86_64 / Intel / AMD)';
    if (arch === 'arm64') return '64-bit ARM (Apple Silicon / ARM64)';
    if (arch === 'ia32') return '32-bit (x86)';
    return arch;
  }

  /**
   * Runs the 4 distinct compatibility checks required by the Master Brief.
   */
  public static async evaluateRecoveryReadiness(
    backupMountPath?: string,
    providedManifest?: RecoveryManifest
  ): Promise<EnvironmentDetectionResult> {
    const platform = os.platform();
    const friendlyOsName = this.getFriendlyOsName();
    const friendlyArch = this.getFriendlyArch();

    let platformName: 'Windows' | 'macOS' | 'Linux' | 'Other' = 'Other';
    if (platform === 'win32') platformName = 'Windows';
    else if (platform === 'darwin') platformName = 'macOS';
    else if (platform === 'linux') platformName = 'Linux';

    const checks: CompatibilityCheck[] = [];

    // Check 1: Operating System Detected
    checks.push({
      id: 'os_detected',
      title: 'Operating system detected',
      status: 'passed',
      message: `This computer runs ${friendlyOsName}.`,
      details: `Architecture: ${friendlyArch} • Hostname: ${os.hostname()}`,
    });

    // Check 2: Recovery Application Compatible
    const isSupportedPlatform = ['win32', 'darwin', 'linux'].includes(platform);
    const isSupportedArch = ['x64', 'arm64'].includes(os.arch());

    if (isSupportedPlatform && isSupportedArch) {
      checks.push({
        id: 'app_compatible',
        title: 'Recovery application compatible',
        status: 'passed',
        message: 'The Dero Vault Rescue application is fully compatible with this computer.',
        details: `Native runtime running in ${platformName} mode with full local filesystem access.`,
      });
    } else {
      checks.push({
        id: 'app_compatible',
        title: 'Recovery application compatible',
        status: 'warning',
        message: `Platform ${platform} / ${os.arch()} may require emulation or manual file restoration.`,
        nextAction: 'Ensure 64-bit Windows, macOS or Linux is running.',
      });
    }

    // Check 3: Backup Format Compatible
    let manifest = providedManifest;
    let formatCompatible = true;
    let formatDetails = 'No backup drive mounted yet.';

    if (backupMountPath && fs.existsSync(backupMountPath)) {
      const manifestPath = path.join(backupMountPath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'recovery-manifest.json');
      const hasManifestFile = fs.existsSync(manifestPath);
      const currentBackupPath = path.join(backupMountPath, 'DERO_VAULT_BACKUP', 'CURRENT');
      const hasCurrent = fs.existsSync(currentBackupPath);

      if (hasManifestFile || manifest) {
        const val = manifest ? { valid: true, manifest } : await RecoveryManager.validateRecoveryPackage(backupMountPath);
        if (val.valid && val.manifest) {
          manifest = val.manifest;
          checks.push({
            id: 'format_compatible',
            title: 'Backup format compatible',
            status: 'passed',
            message: `Dero Vault backup format v${manifest.formatVersion} verified.`,
            details: `Created on ${manifest.sourceMachine?.hostname || 'original computer'} (${manifest.sourceMachine?.platform} / ${manifest.sourceMachine?.arch}).`,
          });
        } else {
          checks.push({
            id: 'format_compatible',
            title: 'Backup format compatible',
            status: 'failed',
            message: val.error || 'Invalid or unsupported backup format.',
            details: 'Supported format versions: 1.0.0, 1.1.0.',
            nextAction: 'Please update Dero Vault to the latest release to read this format.',
          });
        }
      } else if (hasCurrent) {
        // Raw backup exists without manifest
        checks.push({
          id: 'format_compatible',
          title: 'Backup format compatible',
          status: 'passed',
          message: 'Dero Vault standard directory backup found (CURRENT).',
          details: 'Backup structure verified via raw folder inspection.',
        });
      } else {
        checks.push({
          id: 'format_compatible',
          title: 'Backup format compatible',
          status: 'warning',
          message: 'No Dero Vault backup folder found at the specified location.',
          nextAction: 'Ensure your Dero Vault backup drive is plugged in.',
        });
      }
    } else {
      checks.push({
        id: 'format_compatible',
        title: 'Backup format compatible',
        status: 'warning',
        message: 'Awaiting backup drive connection to verify format.',
        nextAction: 'Plug in your Dero Vault removable drive.',
      });
    }

    // Check 4: Backup Accessible & Recovery Ready
    if (backupMountPath && fs.existsSync(backupMountPath)) {
      try {
        const currentBackupPath = path.join(backupMountPath, 'DERO_VAULT_BACKUP', 'CURRENT');
        if (fs.existsSync(currentBackupPath)) {
          // Check read permission
          const testRead = await fs.promises.readdir(currentBackupPath);
          checks.push({
            id: 'backup_accessible',
            title: 'Backup accessible and recovery ready',
            status: 'passed',
            message: 'Your Dero Vault backup is readable and ready to restore.',
            details: `Found ${testRead.length} protected namespace folder(s). Source drive will remain strictly read-only.`,
          });
        } else {
          checks.push({
            id: 'backup_accessible',
            title: 'Backup accessible and recovery ready',
            status: 'warning',
            message: 'Drive is mounted, but DERO_VAULT_BACKUP/CURRENT folder was not found.',
            nextAction: 'Verify that this drive contains a completed Dero Vault backup.',
          });
        }
      } catch (accessErr: any) {
        checks.push({
          id: 'backup_accessible',
          title: 'Backup accessible and recovery ready',
          status: 'failed',
          message: `Storage drive cannot be read: ${accessErr.message}`,
          nextAction: 'Check USB connection and drive permissions.',
        });
      }
    } else {
      checks.push({
        id: 'backup_accessible',
        title: 'Backup accessible and recovery ready',
        status: 'warning',
        message: 'Awaiting backup drive connection.',
        nextAction: 'Plug in your USB or external drive.',
      });
    }

    const allPassed = checks.every((c) => c.status === 'passed');
    const hasFailures = checks.some((c) => c.status === 'failed');
    const readyToProceed = allPassed && !hasFailures;

    let summary = '';
    if (readyToProceed) {
      summary = `We've identified your computer.\nThis computer runs ${friendlyOsName}.\nYour Dero Vault backup is ready to inspect.`;
    } else if (hasFailures) {
      const failedCheck = checks.find((c) => c.status === 'failed');
      summary = `Compatibility issue detected: ${failedCheck?.message || 'Unable to proceed.'}`;
    } else {
      summary = `Computer identified: ${friendlyOsName}. Please plug in your Dero Vault backup drive to proceed.`;
    }

    return {
      hostEnvironment: {
        platform,
        platformName,
        friendlyOsName,
        osRelease: os.release(),
        kernelVersion: os.release(),
        arch: os.arch(),
        friendlyArch,
        hostname: os.hostname(),
        username: os.userInfo().username,
        homeDir: os.homedir(),
      },
      checks,
      allChecksPassed: allPassed,
      readyToProceed,
      plainLanguageSummary: summary,
    };
  }
}
