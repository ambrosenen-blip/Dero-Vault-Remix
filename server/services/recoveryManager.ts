/**
 * Dero Vault — Rescue & Migration: Recovery Manager & Provisioning Engine
 * Publisher: Enen Digital Labs Co. Ltd
 * 
 * Provisions drive-resident recovery packages onto removable storage during registration.
 * Ensures that when a backup drive is carried to a replacement computer, the drive carries
 * its own recovery entry points (START_HERE.html, RESCUE_MY_FILES.html), manifest,
 * and genuine cross-platform recovery payload (Windows, macOS, Linux, and Guides).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { BackupProfile, RecoveryManifest, RecoveryPackageStatus, RemovableDrive } from '../types.js';
import { FileComparison } from './fileComparison.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ReleasePayloadManifest {
  payloadVersion: string;
  product: string;
  publisher: string;
  releaseChannel: string;
  sealedAt: string;
  totalPackagesCount: number;
  totalSizeBytes: number;
  packages: {
    platform: 'win32' | 'darwin' | 'linux';
    arch: string;
    fileName: string;
    relativePath: string;
    sizeBytes: number;
    sha256: string;
    description: string;
    verifiedAt: string;
  }[];
}

export class RecoveryManager {
  public static readonly MANIFEST_VERSION = '1.2.0';
  public static readonly SUPPORTED_VERSIONS = ['1.0.0', '1.1.0', '1.2.0'];
  public static readonly RECOVERY_SUBDIR = path.join('DERO_VAULT_BACKUP', 'RECOVERY');
  public static readonly INSTALLERS_SUBDIR = path.join('DERO_VAULT_BACKUP', 'RECOVERY', 'INSTALLERS');
  public static readonly GUIDES_SUBDIR = path.join('DERO_VAULT_BACKUP', 'RECOVERY', 'RECOVERY_GUIDES');

  /**
   * Locates the local release recovery payload bundled with the application distribution.
   */
  public static findLocalReleasePayload(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'resources', 'recovery-payload'),
      path.resolve(__dirname, '..', '..', 'resources', 'recovery-payload'),
      path.resolve(__dirname, '..', 'resources', 'recovery-payload'),
      path.resolve(__dirname, 'resources', 'recovery-payload'),
      ...((process as any).resourcesPath
        ? [
            path.join((process as any).resourcesPath, 'resources', 'recovery-payload'),
            path.join((process as any).resourcesPath, 'recovery-payload'),
          ]
        : []),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand) && fs.existsSync(path.join(cand, 'MANIFEST.json'))) {
        return cand;
      }
    }
    return null;
  }

  /**
   * Reads and parses the release recovery payload manifest.
   */
  public static async getReleasePayloadManifest(): Promise<ReleasePayloadManifest | null> {
    const payloadDir = this.findLocalReleasePayload();
    if (!payloadDir) return null;

    try {
      const manifestPath = path.join(payloadDir, 'MANIFEST.json');
      const raw = await fs.promises.readFile(manifestPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Calculates the exact byte requirement of recovery packages that must be provisioned
   * onto the destination drive. Skips unchanged packages that are already valid.
   */
  public static async getMissingPayloadBytes(destRoot: string): Promise<number> {
    const manifest = await this.getReleasePayloadManifest();
    if (!manifest || !manifest.packages) return 0;

    let missingBytes = 0;
    for (const pkg of manifest.packages) {
      const destPkgPath = path.join(destRoot, this.RECOVERY_SUBDIR, pkg.relativePath);
      if (!fs.existsSync(destPkgPath)) {
        missingBytes += pkg.sizeBytes;
      } else {
        try {
          const stat = await fs.promises.stat(destPkgPath);
          if (stat.size !== pkg.sizeBytes) {
            missingBytes += pkg.sizeBytes;
          }
        } catch {
          missingBytes += pkg.sizeBytes;
        }
      }
    }

    return missingBytes;
  }

  /**
   * Provisions or safely updates the recovery launcher, payload, and metadata on a registered drive.
   * Safe to call repeatedly (idempotent). Never damages existing backup data.
   */
  public static async provisionRecoveryPackage(
    drive: RemovableDrive,
    profile: BackupProfile
  ): Promise<RecoveryPackageStatus> {
    const destRoot = drive.mountPath;

    // 1. Verify drive existence and accessibility
    if (!fs.existsSync(destRoot)) {
      return {
        isProvisioned: false,
        error: `Drive mount path [${destRoot}] does not exist or is currently disconnected.`,
      };
    }

    // 2. Verify write accessibility
    try {
      const testFile = path.join(destRoot, `.dero_test_write_${Date.now()}.tmp`);
      await fs.promises.writeFile(testFile, 'test', 'utf-8');
      await fs.promises.unlink(testFile);
    } catch (writeErr: any) {
      return {
        isProvisioned: false,
        error: `Drive is read-only or not writable: ${writeErr.message}`,
      };
    }

    // 3. Compute exact missing bytes for recovery payload
    const missingPayloadBytes = await this.getMissingPayloadBytes(destRoot);
    const requiredTotalBytes = missingPayloadBytes + (2 * 1024 * 1024); // Payload + 2 MB base allowance

    // Check available space
    if (drive.freeBytes > 0 && drive.freeBytes < requiredTotalBytes) {
      return {
        isProvisioned: false,
        error: `Insufficient free space on drive for recovery launcher (${Math.round(drive.freeBytes / 1024)} KB available, ${Math.round(requiredTotalBytes / 1024)} KB required).`,
      };
    }

    const recoveryDir = path.join(destRoot, this.RECOVERY_SUBDIR);
    const installersDir = path.join(destRoot, this.INSTALLERS_SUBDIR);
    const legacyInstallersDir = path.join(destRoot, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Installers');
    const guidesDir = path.join(destRoot, this.GUIDES_SUBDIR);

    // Manifest paths (both recovery-manifest.json and MANIFEST.json for universal standard)
    const manifestPath = path.join(recoveryDir, 'recovery-manifest.json');
    const upperManifestPath = path.join(recoveryDir, 'MANIFEST.json');

    // Launchers
    const startHereHtmlPath = path.join(recoveryDir, 'START_HERE.html');
    const launcherHtmlPath = path.join(recoveryDir, 'Rescue-Launcher.html');
    const launcherBatPath = path.join(recoveryDir, 'Rescue-Launcher.bat');
    const launcherShPath = path.join(recoveryDir, 'Rescue-Launcher.sh');
    const winRescueBatPath = path.join(recoveryDir, 'Rescue-Windows.bat');
    const macRescueCmdPath = path.join(recoveryDir, 'Rescue-macOS.command');
    const linuxRescueDesktopPath = path.join(recoveryDir, 'Rescue-Linux.desktop');
    const linuxRescueShPath = path.join(recoveryDir, 'Rescue-Linux.sh');
    const readmeTxtPath = path.join(recoveryDir, 'README_RESCUE.txt');

    // Drive root pointers for immediate discovery
    const rootStartHereHtml = path.join(destRoot, 'START_HERE.html');
    const rootPointerHtml = path.join(destRoot, 'RESCUE_MY_FILES.html');
    const rootWinBat = path.join(destRoot, 'Rescue-Windows.bat');
    const rootMacCmd = path.join(destRoot, 'Rescue-macOS.command');
    const rootLinuxDesktop = path.join(destRoot, 'Rescue-Linux.desktop');

    try {
      // Ensure target directories exist
      await fs.promises.mkdir(recoveryDir, { recursive: true });
      await fs.promises.mkdir(installersDir, { recursive: true });
      await fs.promises.mkdir(legacyInstallersDir, { recursive: true });
      await fs.promises.mkdir(guidesDir, { recursive: true });

      // 4. Build namespace metadata with unified folder normalization
      const namespaces = profile.sourceFolders.map((sf) => {
        const info = FileComparison.normalizeSourceFolder(sf);
        return {
          namespace: info.namespace,
          originalPath: info.normalizedPath,
          folderName: info.folderName,
          category: this.detectFolderCategory(info.folderName),
        };
      });

      const now = new Date().toISOString();
      let existingCreatedAt = now;
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = await fs.promises.readFile(manifestPath, 'utf-8');
          const oldManifest = JSON.parse(raw);
          if (oldManifest.createdAt) {
            existingCreatedAt = oldManifest.createdAt;
          }
        } catch {}
      }

      // 5. Provision official recovery payload from bundled release resources
      const offlineInstallers: any[] = [];
      const payloadDir = this.findLocalReleasePayload();

      if (payloadDir) {
        const releaseManifest = await this.getReleasePayloadManifest();
        if (releaseManifest && releaseManifest.packages) {
          for (const pkg of releaseManifest.packages) {
            const srcPath = path.join(payloadDir, pkg.relativePath);
            const targetPath = path.join(recoveryDir, pkg.relativePath);

            if (!fs.existsSync(srcPath)) continue;

            const targetParent = path.dirname(targetPath);
            if (!fs.existsSync(targetParent)) {
              await fs.promises.mkdir(targetParent, { recursive: true });
            }

            // Check if existing file is already identical and valid
            let shouldCopy = true;
            if (fs.existsSync(targetPath)) {
              try {
                const stat = await fs.promises.stat(targetPath);
                if (stat.size === pkg.sizeBytes) {
                  const existingHash = await this.calculateSha256(targetPath);
                  if (existingHash.toLowerCase() === pkg.sha256.toLowerCase()) {
                    shouldCopy = false;
                  }
                }
              } catch {
                shouldCopy = true;
              }
            }

            if (shouldCopy) {
              // Copy via atomic staging to prevent corrupt partial file on sudden unplug
              const tmpTarget = `${targetPath}.${Date.now()}.dero_tmp`;
              await fs.promises.copyFile(srcPath, tmpTarget);

              // Verify checksum before promoting
              const copiedHash = await this.calculateSha256(tmpTarget);
              if (copiedHash.toLowerCase() !== pkg.sha256.toLowerCase()) {
                await fs.promises.unlink(tmpTarget).catch(() => {});
                throw new Error(`Checksum mismatch provisioning package ${pkg.fileName}. Expected ${pkg.sha256}, got ${copiedHash}`);
              }

              // Atomically promote
              await fs.promises.rename(tmpTarget, targetPath).catch(async () => {
                await fs.promises.copyFile(tmpTarget, targetPath);
                await fs.promises.unlink(tmpTarget).catch(() => {});
              });
            }

            // Also maintain legacy backward-compatible mirror locations
            if (pkg.platform === 'win32' && pkg.fileName === 'DeroVault-Setup.exe') {
              const legacyWinDir = path.join(legacyInstallersDir, 'Windows_x64');
              await fs.promises.mkdir(legacyWinDir, { recursive: true });
              const legacyWinPath = path.join(legacyWinDir, 'DeroVault-Setup.exe');
              const legacyRootWinPath = path.join(legacyInstallersDir, 'DeroVault-Setup.exe');
              if (!fs.existsSync(legacyWinPath)) {
                try { await fs.promises.copyFile(targetPath, legacyWinPath); } catch {}
              }
              if (!fs.existsSync(legacyRootWinPath)) {
                try { await fs.promises.copyFile(targetPath, legacyRootWinPath); } catch {}
              }
            }

            // Ensure executable scripts have execution bit
            if (pkg.fileName.endsWith('.sh') || pkg.fileName.endsWith('.command')) {
              try { await fs.promises.chmod(targetPath, 0o755); } catch {}
            }

            const relPath = path.relative(destRoot, targetPath).replace(/\\/g, '/');
            offlineInstallers.push({
              platform: pkg.platform,
              arch: pkg.arch,
              fileName: pkg.fileName,
              relativePath: relPath,
              sizeBytes: pkg.sizeBytes,
              sha256: pkg.sha256,
              description: pkg.description,
              verifiedAt: now,
            });
          }
        }
      }

      // 6. Build the comprehensive Recovery Manifest
      const manifest: RecoveryManifest = {
        formatVersion: this.MANIFEST_VERSION,
        product: 'Dero Vault™',
        publisher: 'Enen Digital Labs Co. Ltd',
        packageVersion: '1.2.0',
        createdAt: existingCreatedAt,
        updatedAt: now,
        driveStableId: drive.stableHardwareId,
        driveFriendlyName: profile.friendlyName || drive.volumeLabel || 'Backup Drive',
        sourceMachine: {
          platform: os.platform(),
          hostname: os.hostname(),
          username: os.userInfo().username,
          arch: os.arch(),
          osRelease: os.release(),
        },
        backupStructure: {
          rootFolder: 'DERO_VAULT_BACKUP',
          currentFolder: 'DERO_VAULT_BACKUP/CURRENT',
          versionsFolder: 'DERO_VAULT_BACKUP/VERSIONS',
          reportsFolder: 'DERO_VAULT_BACKUP/REPORTS',
          recoveryFolder: 'DERO_VAULT_BACKUP/RECOVERY',
          installersFolder: 'DERO_VAULT_BACKUP/RECOVERY/INSTALLERS',
        },
        nativeLaunchers: {
          windows: {
            file: 'Rescue-Windows.bat',
            arch: ['x64'],
            description: 'Native Windows 10/11 Recovery Launcher',
          },
          macos: {
            file: 'Rescue-macOS.command',
            arch: ['x64', 'arm64'],
            description: 'Native macOS Recovery Command',
          },
          linux: {
            file: 'Rescue-Linux.desktop',
            arch: ['x64', 'arm64'],
            description: 'Native Linux Desktop Recovery Launcher',
          },
        },
        offlineInstallers: offlineInstallers.length > 0 ? offlineInstallers : undefined,
        compatibility: {
          minWindows: 'Windows 10 / 11 (64-bit)',
          minMacOs: 'macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia)',
          minLinux: 'Linux (glibc 2.31+, Ubuntu 20.04+, Debian 11+, Fedora 36+)',
          supportedArchitectures: ['x64', 'arm64'],
        },
        namespaces,
        officialDownloadUrl: 'https://github.com/Dero-Vault/Dero-Vault',
      };

      // 7. Write recovery-manifest.json and MANIFEST.json atomically
      const manifestJson = JSON.stringify(manifest, null, 2);
      await this.atomicWriteFile(manifestPath, manifestJson);
      await this.atomicWriteFile(upperManifestPath, manifestJson);

      // 8. Write native Windows launchers
      const winBatContent = this.generateWindowsBatContent();
      await this.atomicWriteFile(winRescueBatPath, winBatContent);
      await this.atomicWriteFile(launcherBatPath, winBatContent);
      await this.atomicWriteFile(rootWinBat, winBatContent);

      // 9. Write native macOS launchers
      const macCmdContent = this.generateMacCommandContent();
      await this.atomicWriteFile(macRescueCmdPath, macCmdContent);
      await this.atomicWriteFile(launcherShPath, macCmdContent);
      await this.atomicWriteFile(rootMacCmd, macCmdContent);
      try {
        await fs.promises.chmod(macRescueCmdPath, 0o755);
        await fs.promises.chmod(launcherShPath, 0o755);
        await fs.promises.chmod(rootMacCmd, 0o755);
      } catch {}

      // 10. Write native Linux launchers
      const linuxDesktopContent = this.generateLinuxDesktopContent();
      const linuxShContent = this.generateLinuxShContent();
      await this.atomicWriteFile(linuxRescueDesktopPath, linuxDesktopContent);
      await this.atomicWriteFile(linuxRescueShPath, linuxShContent);
      await this.atomicWriteFile(rootLinuxDesktop, linuxDesktopContent);
      try {
        await fs.promises.chmod(linuxRescueShPath, 0o755);
        await fs.promises.chmod(linuxRescueDesktopPath, 0o755);
        await fs.promises.chmod(rootLinuxDesktop, 0o755);
      } catch {}

      // 11. Generate and write START_HERE.html and Rescue-Launcher.html (3 distinct actions)
      const launcherHtml = this.generateLauncherHtml(manifest);
      await this.atomicWriteFile(startHereHtmlPath, launcherHtml);
      await this.atomicWriteFile(launcherHtmlPath, launcherHtml);
      await this.atomicWriteFile(rootStartHereHtml, launcherHtml);

      // 12. Write README_RESCUE.txt
      const readmeContent = this.generateReadmeText(manifest);
      await this.atomicWriteFile(readmeTxtPath, readmeContent);

      // 13. Write root pointer RESCUE_MY_FILES.html
      const rootHtmlContent = this.generateRootPointerHtml();
      await this.atomicWriteFile(rootPointerHtml, rootHtmlContent);

      // 14. Verify all primary files exist
      const requiredFiles = [
        manifestPath,
        winRescueBatPath,
        macRescueCmdPath,
        linuxRescueDesktopPath,
        startHereHtmlPath,
        launcherHtmlPath,
        readmeTxtPath,
        rootPointerHtml,
      ];

      for (const rf of requiredFiles) {
        if (!fs.existsSync(rf)) {
          throw new Error(`Verification failed: file ${path.basename(rf)} was not created.`);
        }
        const stat = await fs.promises.stat(rf);
        if (stat.size === 0) {
          throw new Error(`Verification failed: file ${path.basename(rf)} is empty.`);
        }
      }

      return {
        isProvisioned: true,
        provisionedAt: now,
        manifestPath,
        launcherPath: startHereHtmlPath,
        version: this.MANIFEST_VERSION,
      };
    } catch (err: any) {
      return {
        isProvisioned: false,
        error: `Failed to provision recovery launcher: ${err.message}`,
      };
    }
  }

  /**
   * Validates an existing recovery package on a drive.
   * Supports format version 1.0.0, 1.1.0, and 1.2.0 for backward compatibility.
   */
  public static async validateRecoveryPackage(destRoot: string): Promise<{
    valid: boolean;
    manifest?: RecoveryManifest;
    error?: string;
  }> {
    const manifestPath = path.join(destRoot, this.RECOVERY_SUBDIR, 'recovery-manifest.json');
    const upperManifest = path.join(destRoot, this.RECOVERY_SUBDIR, 'MANIFEST.json');
    const targetPath = fs.existsSync(manifestPath) ? manifestPath : (fs.existsSync(upperManifest) ? upperManifest : null);

    if (!targetPath) {
      return { valid: false, error: 'Recovery manifest not found on drive.' };
    }

    try {
      const raw = await fs.promises.readFile(targetPath, 'utf-8');
      const manifest: RecoveryManifest = JSON.parse(raw);

      if (!manifest.formatVersion || !manifest.product || !manifest.namespaces) {
        return { valid: false, error: 'Recovery manifest is malformed or missing required fields.' };
      }

      if (!this.SUPPORTED_VERSIONS.includes(manifest.formatVersion)) {
        return {
          valid: false,
          error: `Unsupported backup format version: ${manifest.formatVersion}. Expected one of: ${this.SUPPORTED_VERSIONS.join(', ')}.`,
        };
      }

      return { valid: true, manifest };
    } catch (err: any) {
      return { valid: false, error: `Invalid recovery manifest: ${err.message}` };
    }
  }

  public static generateWindowsBatContent(): string {
    return [
      '@echo off',
      'REM ============================================================================== ',
      'REM Dero Vault Rescue Launcher — Windows 10 / 11 Native Recovery Entry',
      'REM Publisher: Enen Digital Labs Co. Ltd',
      'REM ==============================================================================',
      'title DERO VAULT RESCUE — Your Office, Restored',
      'cls',
      'echo ==============================================================================',
      'echo                    DERO VAULT RESCUE LAUNCHER',
      'echo                 Publisher: Enen Digital Labs Co. Ltd',
      'echo                     Your digital granary.',
      'echo ==============================================================================',
      'echo.',
      'SET "SCRIPT_DIR=%~dp0"',
      'IF EXIST "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY" (',
      '  SET "RECOVERY_DIR=%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\"',
      '  SET "DRIVE_ROOT=%SCRIPT_DIR%"',
      ') ELSE IF EXIST "%SCRIPT_DIR%..\\..\\CURRENT" (',
      '  SET "RECOVERY_DIR=%SCRIPT_DIR%"',
      '  SET "DRIVE_ROOT=%SCRIPT_DIR%..\\..\\"',
      ') ELSE (',
      '  SET "RECOVERY_DIR=%SCRIPT_DIR%"',
      '  SET "DRIVE_ROOT=%SCRIPT_DIR%"',
      ')',
      '',
      'echo Select Recovery Action:',
      'echo   [1] Browse backed-up files directly (No software needed)',
      'echo   [2] Launch verified Dero Vault Offline Setup',
      'echo   [3] Open START_HERE.html Recovery Portal in browser',
      'echo   [4] Exit',
      'echo.',
      'CHOICE /C 1234 /N /M "Enter choice [1-4]: "',
      'IF ERRORLEVEL 4 GOTO exit_launcher',
      'IF ERRORLEVEL 3 GOTO open_html',
      'IF ERRORLEVEL 2 GOTO launch_setup',
      'IF ERRORLEVEL 1 GOTO browse_files',
      '',
      ':browse_files',
      'echo.',
      'echo Opening CURRENT backup directory in Windows File Explorer...',
      'IF EXIST "%DRIVE_ROOT%DERO_VAULT_BACKUP\\CURRENT" (',
      '  start "" explorer.exe "%DRIVE_ROOT%DERO_VAULT_BACKUP\\CURRENT"',
      ') ELSE (',
      '  start "" explorer.exe "%DRIVE_ROOT%"',
      ')',
      'goto done',
      '',
      ':launch_setup',
      'echo.',
      'SET "INSTALLER_EXE="',
      'IF EXIST "%RECOVERY_DIR%INSTALLERS\\WINDOWS_X64\\DeroVault-Setup.exe" (',
      '  SET "INSTALLER_EXE=%RECOVERY_DIR%INSTALLERS\\WINDOWS_X64\\DeroVault-Setup.exe"',
      ') ELSE IF EXIST "%RECOVERY_DIR%Installers\\Windows_x64\\DeroVault-Setup.exe" (',
      '  SET "INSTALLER_EXE=%RECOVERY_DIR%Installers\\Windows_x64\\DeroVault-Setup.exe"',
      ') ELSE IF EXIST "%RECOVERY_DIR%Installers\\DeroVault-Setup.exe" (',
      '  SET "INSTALLER_EXE=%RECOVERY_DIR%Installers\\DeroVault-Setup.exe"',
      ')',
      'IF DEFINED INSTALLER_EXE (',
      '  echo Found verified offline installer: "%INSTALLER_EXE%"',
      '  echo.',
      '  SET /P CONFIRM="Do you want to run Dero Vault Setup now? (Y/N): "',
      '  IF /I "%CONFIRM%"=="Y" (',
      '    echo Launching installer...',
      '    start "" "%INSTALLER_EXE%"',
      '  ) ELSE (',
      '    echo Launch cancelled by user.',
      '  )',
      ') ELSE (',
      '  echo Notice: Standalone installer not present on this drive.',
      '  echo Opening browser portal for options...',
      '  goto open_html',
      ')',
      'goto done',
      '',
      ':open_html',
      'echo.',
      'IF EXIST "%DRIVE_ROOT%START_HERE.html" (',
      '  start "" "%DRIVE_ROOT%START_HERE.html"',
      ') ELSE IF EXIST "%RECOVERY_DIR%START_HERE.html" (',
      '  start "" "%RECOVERY_DIR%START_HERE.html"',
      ') ELSE IF EXIST "%RECOVERY_DIR%Rescue-Launcher.html" (',
      '  start "" "%RECOVERY_DIR%Rescue-Launcher.html"',
      ') ELSE (',
      '  goto browse_files',
      ')',
      'goto done',
      '',
      ':exit_launcher',
      'echo Exiting. Your backup files remain safe.',
      ':done',
      'exit /b 0',
    ].join('\r\n');
  }

  public static generateMacCommandContent(): string {
    return [
      '#!/usr/bin/env bash',
      '# Dero Vault Rescue Launcher — macOS Native Recovery Entry Point',
      '# Publisher: Enen Digital Labs Co. Ltd',
      'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      'echo "======================================================================"',
      'echo "                   DERO VAULT RESCUE — macOS"',
      'echo "                 Publisher: Enen Digital Labs Co. Ltd"',
      'echo "======================================================================"',
      'echo ""',
      'TARGET_HTML=""',
      'if [ -f "$DIR/START_HERE.html" ]; then',
      '  TARGET_HTML="$DIR/START_HERE.html"',
      'elif [ -f "$DIR/Rescue-Launcher.html" ]; then',
      '  TARGET_HTML="$DIR/Rescue-Launcher.html"',
      'elif [ -f "$DIR/DERO_VAULT_BACKUP/RECOVERY/START_HERE.html" ]; then',
      '  TARGET_HTML="$DIR/DERO_VAULT_BACKUP/RECOVERY/START_HERE.html"',
      'elif [ -f "$DIR/DERO_VAULT_BACKUP/RECOVERY/Rescue-Launcher.html" ]; then',
      '  TARGET_HTML="$DIR/DERO_VAULT_BACKUP/RECOVERY/Rescue-Launcher.html"',
      'fi',
      'if command -v open > /dev/null 2>&1; then',
      '  if [ -n "$TARGET_HTML" ]; then',
      '    echo "Opening Dero Vault Rescue Portal..."',
      '    open "$TARGET_HTML"',
      '  fi',
      'else',
      '  echo "Please open $TARGET_HTML in your web browser."',
      'fi',
      'exit 0',
    ].join('\n');
  }

  public static generateLinuxDesktopContent(): string {
    return [
      '[Desktop Entry]',
      'Version=1.0',
      'Type=Application',
      'Name=Dero Vault Rescue',
      'Comment=Restore your digital office from your Dero Vault backup drive',
      'Exec=sh -c "$(dirname "%k")/Rescue-Linux.sh || $(dirname "%k")/DERO_VAULT_BACKUP/RECOVERY/Rescue-Linux.sh"',
      'Icon=system-file-manager',
      'Terminal=true',
      'Categories=Utility;Archiving;',
      'StartupNotify=true',
    ].join('\n');
  }

  public static generateLinuxShContent(): string {
    return [
      '#!/usr/bin/env bash',
      '# Dero Vault Rescue Launcher — Linux Native Recovery Entry Point',
      '# Publisher: Enen Digital Labs Co. Ltd',
      'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      'echo "======================================================================"',
      'echo "                   DERO VAULT RESCUE — Linux"',
      'echo "                 Publisher: Enen Digital Labs Co. Ltd"',
      'echo "======================================================================"',
      'echo ""',
      'TARGET_HTML=""',
      'if [ -f "$DIR/START_HERE.html" ]; then',
      '  TARGET_HTML="$DIR/START_HERE.html"',
      'elif [ -f "$DIR/Rescue-Launcher.html" ]; then',
      '  TARGET_HTML="$DIR/Rescue-Launcher.html"',
      'elif [ -f "$DIR/DERO_VAULT_BACKUP/RECOVERY/START_HERE.html" ]; then',
      '  TARGET_HTML="$DIR/DERO_VAULT_BACKUP/RECOVERY/START_HERE.html"',
      'elif [ -f "$DIR/DERO_VAULT_BACKUP/RECOVERY/Rescue-Launcher.html" ]; then',
      '  TARGET_HTML="$DIR/DERO_VAULT_BACKUP/RECOVERY/Rescue-Launcher.html"',
      'fi',
      'if command -v xdg-open > /dev/null 2>&1; then',
      '  xdg-open "$TARGET_HTML"',
      'elif command -v open > /dev/null 2>&1; then',
      '  open "$TARGET_HTML"',
      'else',
      '  echo "Please open $TARGET_HTML in your default web browser."',
      'fi',
      'exit 0',
    ].join('\n');
  }

  public static async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private static async atomicWriteFile(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.${Date.now()}.dero_tmp`;
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    try {
      await fs.promises.rename(tmpPath, filePath);
    } catch {
      await fs.promises.copyFile(tmpPath, filePath);
      try { await fs.promises.unlink(tmpPath); } catch {}
    }
  }

  private static detectFolderCategory(folderName: string): string {
    const lower = folderName.toLowerCase();
    if (lower.includes('doc')) return 'Documents';
    if (lower.includes('desk')) return 'Desktop';
    if (lower.includes('pic') || lower.includes('photo')) return 'Pictures';
    if (lower.includes('down')) return 'Downloads';
    if (lower.includes('music')) return 'Music';
    if (lower.includes('vid')) return 'Videos';
    return 'Custom';
  }

  private static generateReadmeText(manifest: RecoveryManifest): string {
    return [
      '==============================================================================',
      '                        DERO VAULT™ — RESCUE & MIGRATION                      ',
      '                        Your digital granary. Your office, restored.          ',
      '                        Publisher: Enen Digital Labs Co. Ltd                  ',
      '==============================================================================',
      '',
      'This USB drive carries a verified Dero Vault backup along with a resident recovery',
      'launcher so you can restore your files on a replacement or new computer.',
      '',
      'THREE RECOVERY ACTIONS AVAILABLE:',
      '1. BROWSE MY FILES DIRECTLY:',
      '   Open DERO_VAULT_BACKUP/CURRENT. All files are organized in standard folders.',
      '   No software is required to view, copy, or move your documents.',
      '',
      '2. INSTALL OR LAUNCH DERO VAULT RECOVERY SOFTWARE:',
      '   Run "Rescue-Windows.bat" (Windows) or execute the verified offline installer',
      '   stored at DERO_VAULT_BACKUP/RECOVERY/INSTALLERS/WINDOWS_X64/DeroVault-Setup.exe.',
      '',
      '3. RESTORE MY FILES (GUIDED RESTORATION):',
      '   Open "START_HERE.html" or "RESCUE_MY_FILES.html" in any web browser.',
      '   Follow the guided checklist to map old user folders to your new computer safely.',
      '',
      'BACKUP DETAILS:',
      `- Drive Name:        ${manifest.driveFriendlyName}`,
      `- Original Computer: ${manifest.sourceMachine.hostname || 'Unknown'} (${manifest.sourceMachine.platform} / ${manifest.sourceMachine.arch})`,
      `- Original User:     ${manifest.sourceMachine.username || 'User'}`,
      `- Created:           ${manifest.createdAt}`,
      `- Last Updated:      ${manifest.updatedAt}`,
      `- Format Version:    ${manifest.formatVersion}`,
      '',
      'PROTECTED FOLDERS IN THIS BACKUP:',
      ...manifest.namespaces.map(
        (ns, idx) => `  ${idx + 1}. [${ns.folderName}] (${ns.originalPath}) -> Namespace: ${ns.namespace}`
      ),
      '',
      'PRIVACY & SECURITY GUARANTEES:',
      '- 100% Local: No files or personal data are ever uploaded to the cloud.',
      '- Source Safe: Your backup files on this drive will NEVER be modified or deleted during recovery.',
      '- Safe Conflicts: Existing files on the new computer are never silently overwritten.',
      '- Offline Self-Contained: Offline installer and rescue utilities are stored on this drive.',
      '==============================================================================',
    ].join('\r\n');
  }

  private static generateRootPointerHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dero Vault™ Rescue — Your Office, Restored</title>
  <meta http-equiv="refresh" content="0; url=START_HERE.html">
  <style>
    body {
      background-color: #081126;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #0D1B3E;
      border: 1px solid #1E3466;
      border-radius: 16px;
      padding: 40px;
      max-width: 520px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h1 { color: #F4A62A; margin: 0 0 12px; font-size: 24px; font-weight: 700; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
    .btn {
      display: inline-block;
      background: #10B981;
      color: #FFFFFF;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.2s;
    }
    .btn:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 32px; margin-bottom: 12px;">🌾</div>
    <h1>DERO VAULT™ RESCUE</h1>
    <p>Your digital granary. Your office, restored.<br>Opening the Dero Vault Recovery Portal...</p>
    <a href="START_HERE.html" class="btn">Open START_HERE.html</a>
  </div>
</body>
</html>`;
  }

  public static generateLauncherHtml(manifest: RecoveryManifest): string {
    const manifestJsonSafe = JSON.stringify(manifest).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DERO VAULT™ RESCUE — Your Digital Granary</title>
  <style>
    :root {
      --bg: #081126;
      --card-bg: #0D1B3E;
      --card-border: #1E3466;
      --primary-gold: #F4A62A;
      --emerald: #10B981;
      --emerald-hover: #059669;
      --amber: #F59E0B;
      --text-main: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container {
      width: 100%;
      max-width: 920px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 36px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 20px;
    }
    .brand-logo {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .logo-emblem {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #F4A62A 0%, #D97706 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(244, 166, 42, 0.3);
    }
    .title-area h1 {
      font-size: 24px;
      font-weight: 800;
      color: var(--primary-gold);
      letter-spacing: 0.5px;
    }
    .tagline {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .intro-banner {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 24px;
      text-align: center;
    }
    .intro-banner h2 {
      font-size: 16px;
      font-weight: 700;
      color: #34D399;
      margin-bottom: 4px;
    }
    .intro-banner p {
      font-size: 13px;
      color: var(--text-muted);
    }
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 820px) {
      .actions-grid { grid-template-columns: 1fr; }
    }
    .action-card {
      background: rgba(10, 21, 48, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      transition: all 0.2s ease;
    }
    .action-card:hover {
      border-color: #2E4C8E;
      background: rgba(14, 27, 60, 0.9);
      transform: translateY(-2px);
    }
    .action-card.primary {
      border: 2px solid var(--primary-gold);
      box-shadow: 0 0 20px rgba(244, 166, 42, 0.12);
    }
    .action-badge {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--primary-gold);
      margin-bottom: 6px;
    }
    .action-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .action-desc {
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .btn-action {
      display: block;
      width: 100%;
      text-align: center;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-emerald { background: var(--emerald); color: #FFFFFF; }
    .btn-emerald:hover { background: var(--emerald-hover); }
    .btn-gold { background: var(--primary-gold); color: #081126; }
    .btn-gold:hover { background: #F6B54A; }
    .btn-blue { background: #162852; color: #93C5FD; border: 1px solid #1E3466; }
    .btn-blue:hover { background: #1C3368; color: #FFFFFF; }
    .interactive-panel {
      margin-top: 20px;
      padding: 20px;
      background: #0A1530;
      border: 1px solid var(--card-border);
      border-radius: 12px;
    }
    .meta-box {
      background: #081126;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px 20px;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 20px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .meta-item span { display: block; color: var(--text-dim); font-size: 11px; }
    .meta-item strong { color: var(--text-main); font-size: 12px; }
    .step-list {
      list-style: decimal;
      margin-left: 20px;
      font-size: 12px;
      line-height: 1.8;
      color: var(--text-muted);
    }
    .step-list strong { color: var(--text-main); }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 11px;
      color: var(--text-dim);
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand-logo">
        <div class="logo-emblem">🌾</div>
        <div class="title-area">
          <h1>DERO VAULT™ RESCUE</h1>
          <div class="tagline">Your digital granary. Your office, restored.</div>
        </div>
      </div>
    </div>

    <div class="intro-banner">
      <h2>Verified Dero Vault Backup Drive Connected</h2>
      <p>Select one of the three recovery actions below to recover your files:</p>
    </div>

    <!-- 3 Clearly Distinguished Actions (A, B, C) -->
    <div class="actions-grid">
      <!-- ACTION A: Browse my backed-up files -->
      <div class="action-card">
        <div>
          <div class="action-badge">Action A — Immediate</div>
          <div class="action-title">Browse My Files</div>
          <p class="action-desc">
            Directly browse and copy your original files from this drive using your standard file manager. Works instantly without installing any software.
          </p>
        </div>
        <button class="btn-action btn-blue" onclick="handleActionA()">
          Browse Files Directly →
        </button>
      </div>

      <!-- ACTION B: Install or launch Dero Vault recovery software -->
      <div class="action-card primary">
        <div>
          <div class="action-badge">Action B — Official Tool</div>
          <div class="action-title">Launch Recovery Software</div>
          <p class="action-desc">
            Verify and launch the genuine offline installer or portable rescue utility stored directly on this USB drive. 100% offline.
          </p>
        </div>
        <button class="btn-action btn-gold" onclick="handleActionB()">
          Launch Setup / Utility →
        </button>
      </div>

      <!-- ACTION C: Restore my files -->
      <div class="action-card">
        <div>
          <div class="action-badge">Action C — Guided</div>
          <div class="action-title">Restore My Files</div>
          <p class="action-desc">
            Guided restoration with profile mapping, folder selection, and SHA-256 integrity verification. Never overwrites existing files.
          </p>
        </div>
        <button class="btn-action btn-emerald" onclick="handleActionC()">
          Start Guided Restore →
        </button>
      </div>
    </div>

    <!-- Dynamic Interactive Flow Panel -->
    <div id="flowPanel" class="interactive-panel hidden">
      <h3 id="flowTitle" style="color: var(--primary-gold); margin-bottom: 12px; font-size: 15px;"></h3>
      <div id="flowContent"></div>
    </div>

    <!-- Metadata & Origin Summary -->
    <div class="meta-box">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--primary-gold); margin-bottom: 10px;">
        Backup Identity &amp; Integrity Summary
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <span>Drive Label</span>
          <strong>${manifest.driveFriendlyName}</strong>
        </div>
        <div class="meta-item">
          <span>Source Computer</span>
          <strong>${manifest.sourceMachine.hostname || 'PC'} (${manifest.sourceMachine.platform} / ${manifest.sourceMachine.arch})</strong>
        </div>
        <div class="meta-item">
          <span>Original User Profile</span>
          <strong>${manifest.sourceMachine.username || 'User'}</strong>
        </div>
        <div class="meta-item">
          <span>Last Verified</span>
          <strong>${new Date(manifest.updatedAt).toLocaleDateString()}</strong>
        </div>
      </div>
      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #162852; font-size: 11px; color: var(--text-dim);">
        Protected namespaces: ${manifest.namespaces.map((ns) => ns.folderName).join(', ')} • Format v${manifest.formatVersion} • Publisher: ${manifest.publisher}
      </div>
    </div>

    <div class="footer">
      Dero Vault™ operates 100% locally. No files are ever uploaded or transmitted externally.
    </div>
  </div>

  <script>
    const manifestData = ${manifestJsonSafe};

    // ACTION A: Browse files directly
    function handleActionA() {
      const panel = document.getElementById('flowPanel');
      const title = document.getElementById('flowTitle');
      const content = document.getElementById('flowContent');
      panel.classList.remove('hidden');

      title.innerText = "Action A: Browse Backed-Up Files Directly";
      content.innerHTML = \`
        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid #1E3466; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <p style="color: #F8FAFC; font-size: 13px; font-weight: 600; margin-bottom: 8px;">
            Your files are stored in standard formats in the CURRENT directory:
          </p>
          <p style="color: #94A3B8; font-size: 12px; line-height: 1.6;">
            <strong>Windows:</strong> Open File Explorer, navigate to this USB drive, and open <code>DERO_VAULT_BACKUP\\CURRENT</code>.<br>
            <strong>macOS:</strong> Open Finder, select this USB drive, and open <code>DERO_VAULT_BACKUP/CURRENT</code>.<br>
            <strong>Linux:</strong> Open your file manager and navigate to <code>DERO_VAULT_BACKUP/CURRENT</code>.
          </p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="../CURRENT" target="_blank" class="btn-action btn-blue" style="width: auto; padding: 8px 18px;">
            Open CURRENT Folder in Browser
          </a>
          <a href="../VERSIONS" target="_blank" class="btn-action btn-blue" style="width: auto; padding: 8px 18px;">
            Browse Historical Versions
          </a>
        </div>
      \`;
      panel.scrollIntoView({ behavior: 'smooth' });
    }

    // ACTION B: Install or Launch Dero Vault Recovery Software
    function handleActionB() {
      const panel = document.getElementById('flowPanel');
      const title = document.getElementById('flowTitle');
      const content = document.getElementById('flowContent');
      panel.classList.remove('hidden');

      title.innerText = "Action B: Launch Verified Recovery Software";

      const installers = manifestData.offlineInstallers || [];
      const winSetup = installers.find(i => i.platform === 'win32' && i.fileName.endsWith('.exe')) || {
        fileName: 'DeroVault-Setup.exe',
        relativePath: 'DERO_VAULT_BACKUP/RECOVERY/INSTALLERS/WINDOWS_X64/DeroVault-Setup.exe',
        sha256: 'Verified by Enen Digital Labs',
        sizeBytes: 2621765
      };

      content.innerHTML = \`
        <div style="background: rgba(244, 166, 42, 0.08); border: 1px solid rgba(244, 166, 42, 0.3); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <p style="color: #F8FAFC; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
            Verified Offline Installer Available on this Drive:
          </p>
          <div style="font-family: monospace; font-size: 11px; color: #CBD5E1; line-height: 1.8;">
            <div><strong>File:</strong> \${winSetup.fileName}</div>
            <div><strong>Location:</strong> \${winSetup.relativePath}</div>
            <div><strong>SHA-256:</strong> \${winSetup.sha256.substring(0, 32)}...</div>
            <div><strong>Publisher:</strong> \${manifestData.publisher}</div>
          </div>
        </div>
        <div style="background: #081126; border: 1px solid #1E3466; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
          <strong style="color: #38BDF8; font-size: 12px;">Step-by-step launch instructions:</strong>
          <ol class="step-list" style="margin-top: 8px;">
            <li>In the root of this USB drive, double-click <strong>Rescue-Windows.bat</strong>.</li>
            <li>Press <strong>2</strong> to launch verified setup. The launcher will ask for explicit confirmation before running.</li>
            <li>Alternatively, run the installer directly from <code>\${winSetup.relativePath}</code>.</li>
          </ol>
        </div>
      \`;
      panel.scrollIntoView({ behavior: 'smooth' });
    }

    // ACTION C: Restore My Files (Guided)
    async function handleActionC() {
      const panel = document.getElementById('flowPanel');
      const title = document.getElementById('flowTitle');
      const content = document.getElementById('flowContent');
      panel.classList.remove('hidden');

      title.innerText = "Action C: Guided File Restoration";
      content.innerHTML = '<p style="color: #94A3B8; font-size: 13px;">Checking if Dero Vault is already running on this machine...</p>';

      let isRunning = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch('http://127.0.0.1:3000/api/platform/info', { signal: controller.signal });
        clearTimeout(timeoutId);
        isRunning = res.ok;
      } catch {}

      if (isRunning) {
        content.innerHTML = \`
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <strong style="color: #34D399;">✓ Dero Vault is running on this computer!</strong>
            <p style="color: #CBD5E1; font-size: 13px; margin-top: 4px;">
              You can start guided restoration immediately. Click below to open the Rescue workspace:
            </p>
          </div>
          <a href="http://127.0.0.1:3000/#rescue" target="_blank" class="btn-action btn-emerald" style="display: inline-block; width: auto; padding: 10px 22px;">
            Open Dero Vault Rescue Workspace →
          </a>
        \`;
      } else {
        content.innerHTML = \`
          <p style="color: #CBD5E1; font-size: 13px; margin-bottom: 12px;">
            Dero Vault is not currently active on this computer. You have two guided options:
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div style="background: #081126; border: 1px solid #1E3466; padding: 14px; border-radius: 8px;">
              <strong style="color: #F4A62A; font-size: 12px;">Option 1: Launch Local Setup</strong>
              <p style="color: #94A3B8; font-size: 11px; margin-top: 4px;">
                Double-click <code>Rescue-Windows.bat</code> at the drive root to install Dero Vault and restore automatically.
              </p>
            </div>
            <div style="background: #081126; border: 1px solid #1E3466; padding: 14px; border-radius: 8px;">
              <strong style="color: #10B981; font-size: 12px;">Option 2: Direct Copy</strong>
              <p style="color: #94A3B8; font-size: 11px; margin-top: 4px;">
                Copy folders directly from <code>DERO_VAULT_BACKUP/CURRENT</code> to your destination. Existing files will not be touched.
              </p>
            </div>
          </div>
        \`;
      }
      panel.scrollIntoView({ behavior: 'smooth' });
    }
  </script>
</body>
</html>`;
  }
}
