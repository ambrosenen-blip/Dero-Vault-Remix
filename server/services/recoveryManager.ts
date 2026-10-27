/**
 * Dero Vault — Rescue & Migration: Recovery Manager & Provisioning Engine
 * Publisher: Enen Digital Labs Co. Ltd
 * 
 * Provisions drive-resident recovery packages onto removable storage during registration.
 * Ensures that when a backup drive is carried to a replacement computer, the drive carries
 * its own recovery entry point, manifest, and cross-platform launcher alongside the backup.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BackupProfile, RecoveryManifest, RecoveryPackageStatus, RemovableDrive } from '../types.js';
import { FileComparison } from './fileComparison.js';

export class RecoveryManager {
  public static readonly MANIFEST_VERSION = '1.1.0';
  public static readonly SUPPORTED_VERSIONS = ['1.0.0', '1.1.0'];
  public static readonly RECOVERY_SUBDIR = path.join('DERO_VAULT_BACKUP', 'RECOVERY');
  public static readonly INSTALLERS_SUBDIR = path.join('DERO_VAULT_BACKUP', 'RECOVERY', 'Installers');

  /**
   * Provisions or safely updates the recovery launcher and metadata on a registered drive.
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

    // 3. Verify minimum available space (requires at least 2 MB for base recovery package)
    if (drive.freeBytes > 0 && drive.freeBytes < 2 * 1024 * 1024) {
      return {
        isProvisioned: false,
        error: `Insufficient free space on drive for recovery launcher (${Math.round(drive.freeBytes / 1024)} KB available, 2 MB required).`,
      };
    }

    const recoveryDir = path.join(destRoot, this.RECOVERY_SUBDIR);
    const installersDir = path.join(destRoot, this.INSTALLERS_SUBDIR);
    const manifestPath = path.join(recoveryDir, 'recovery-manifest.json');
    const launcherHtmlPath = path.join(recoveryDir, 'Rescue-Launcher.html');
    const launcherBatPath = path.join(recoveryDir, 'Rescue-Launcher.bat');
    const launcherShPath = path.join(recoveryDir, 'Rescue-Launcher.sh');
    const winRescueBatPath = path.join(recoveryDir, 'Rescue-Windows.bat');
    const macRescueCmdPath = path.join(recoveryDir, 'Rescue-macOS.command');
    const linuxRescueDesktopPath = path.join(recoveryDir, 'Rescue-Linux.desktop');
    const linuxRescueShPath = path.join(recoveryDir, 'Rescue-Linux.sh');
    const readmeTxtPath = path.join(recoveryDir, 'README_RESCUE.txt');

    // Drive root pointers for immediate discovery
    const rootPointerHtml = path.join(destRoot, 'RESCUE_MY_FILES.html');
    const rootWinBat = path.join(destRoot, 'Rescue-Windows.bat');
    const rootMacCmd = path.join(destRoot, 'Rescue-macOS.command');
    const rootLinuxDesktop = path.join(destRoot, 'Rescue-Linux.desktop');

    try {
      // Ensure DERO_VAULT_BACKUP/RECOVERY directory exists
      if (!fs.existsSync(recoveryDir)) {
        await fs.promises.mkdir(recoveryDir, { recursive: true });
      }

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

      // Check for offline installers in workspace release/ folder if space permits
      const offlineInstallers: any[] = [];
      const hasRoomForInstaller = drive.freeBytes === 0 || drive.freeBytes > 120 * 1024 * 1024;

      if (hasRoomForInstaller) {
        try {
          const workspaceRoot = process.cwd();
          const releaseDir = path.join(workspaceRoot, 'release');
          const winX64Dir = path.join(installersDir, 'Windows_x64');

          if (fs.existsSync(releaseDir)) {
            if (!fs.existsSync(installersDir)) {
              await fs.promises.mkdir(installersDir, { recursive: true });
            }
            if (!fs.existsSync(winX64Dir)) {
              await fs.promises.mkdir(winX64Dir, { recursive: true });
            }

            const candidateFiles = await fs.promises.readdir(releaseDir);
            for (const cFile of candidateFiles) {
              if (cFile.endsWith('.exe') || cFile.endsWith('.zip') || cFile.endsWith('.AppImage') || cFile.endsWith('.deb')) {
                const srcPath = path.join(releaseDir, cFile);
                const stat = await fs.promises.stat(srcPath);
                if (stat.isDirectory()) continue;

                let plat: 'win32' | 'darwin' | 'linux' = 'win32';
                if (cFile.includes('mac') || cFile.endsWith('.dmg')) plat = 'darwin';
                else if (cFile.includes('linux') || cFile.endsWith('.AppImage') || cFile.endsWith('.deb')) plat = 'linux';

                // Target paths: standard Installers root and Windows_x64 subdirectory for Windows
                const targetPath = (plat === 'win32') 
                  ? path.join(winX64Dir, cFile === 'Dero Vault-1.0.0-win.zip' ? 'DeroVault-Windows-x64.zip' : (cFile.endsWith('.exe') ? 'DeroVault-Setup.exe' : cFile))
                  : path.join(installersDir, cFile);

                let shouldCopy = true;
                if (fs.existsSync(targetPath)) {
                  const existingStat = await fs.promises.stat(targetPath);
                  if (existingStat.size === stat.size) shouldCopy = false;
                }

                if (shouldCopy) {
                  await fs.promises.copyFile(srcPath, targetPath);
                  // Also maintain legacy symlink / mirror at installersDir root if win32
                  if (plat === 'win32' && !fs.existsSync(path.join(installersDir, 'DeroVault-Setup.exe'))) {
                    try {
                      await fs.promises.copyFile(srcPath, path.join(installersDir, 'DeroVault-Setup.exe'));
                    } catch {}
                  }
                }

                const hash = await this.calculateSha256(targetPath);
                const relPath = path.relative(destRoot, targetPath).replace(/\\/g, '/');

                offlineInstallers.push({
                  platform: plat,
                  arch: 'x64',
                  fileName: path.basename(targetPath),
                  relativePath: relPath,
                  sizeBytes: stat.size,
                  sha256: hash,
                  verifiedAt: now,
                });
              }
            }
          }
        } catch (instErr: any) {
          console.warn(`[RecoveryManager] Offline installer scan notice: ${instErr.message}`);
        }
      }

      const manifest: RecoveryManifest = {
        formatVersion: this.MANIFEST_VERSION,
        product: 'Dero Vault™',
        publisher: 'Enen Digital Labs Co. Ltd',
        packageVersion: '1.1.0',
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
          installersFolder: 'DERO_VAULT_BACKUP/RECOVERY/Installers',
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

      // 5. Write recovery-manifest.json atomically
      await this.atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2));

      // 6. Write native Windows launchers
      const winBatContent = this.generateWindowsBatContent();
      await this.atomicWriteFile(winRescueBatPath, winBatContent);
      await this.atomicWriteFile(launcherBatPath, winBatContent);
      await this.atomicWriteFile(rootWinBat, winBatContent);

      // 7. Write native macOS launchers (.command and shell script)
      const macCmdContent = this.generateMacCommandContent();
      await this.atomicWriteFile(macRescueCmdPath, macCmdContent);
      await this.atomicWriteFile(launcherShPath, macCmdContent);
      await this.atomicWriteFile(rootMacCmd, macCmdContent);
      try {
        await fs.promises.chmod(macRescueCmdPath, 0o755);
        await fs.promises.chmod(launcherShPath, 0o755);
        await fs.promises.chmod(rootMacCmd, 0o755);
      } catch {}

      // 8. Write native Linux launchers (.desktop and .sh)
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

      // 9. Generate and write self-contained Rescue-Launcher.html (fallback)
      const launcherHtml = this.generateLauncherHtml(manifest);
      await this.atomicWriteFile(launcherHtmlPath, launcherHtml);

      // 10. Write README_RESCUE.txt
      const readmeContent = this.generateReadmeText(manifest);
      await this.atomicWriteFile(readmeTxtPath, readmeContent);

      // 11. Write root pointer RESCUE_MY_FILES.html for direct discovery at the root of the USB drive
      const rootHtmlContent = this.generateRootPointerHtml();
      await this.atomicWriteFile(rootPointerHtml, rootHtmlContent);

      // 12. Verify all primary files exist
      const requiredFiles = [
        manifestPath,
        winRescueBatPath,
        macRescueCmdPath,
        linuxRescueDesktopPath,
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
        launcherPath: launcherHtmlPath,
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
   * Supports format version 1.0.0 and 1.1.0 for backward compatibility.
   */
  public static async validateRecoveryPackage(destRoot: string): Promise<{
    valid: boolean;
    manifest?: RecoveryManifest;
    error?: string;
  }> {
    const manifestPath = path.join(destRoot, this.RECOVERY_SUBDIR, 'recovery-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, error: 'Recovery manifest not found on drive.' };
    }

    try {
      const raw = await fs.promises.readFile(manifestPath, 'utf-8');
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

  private static generateWindowsBatContent(): string {
    return [
      '@echo off',
      'REM Dero Vault Rescue Launcher — Windows 10 / 11 Native Recovery Entry',
      'REM Publisher: Enen Digital Labs Co. Ltd',
      'title DERO VAULT RESCUE — Your Office, Restored',
      'echo ======================================================================',
      'echo                    DERO VAULT RESCUE LAUNCHER',
      'echo                  Publisher: Enen Digital Labs Co. Ltd',
      'echo ======================================================================',
      'echo.',
      'SET SCRIPT_DIR=%~dp0',
      'IF EXIST "%SCRIPT_DIR%Installers\\Windows_x64\\DeroVault-Setup.exe" (',
      '  echo Found offline Dero Vault installer on this backup drive.',
      '  echo Launching Dero Vault Setup...',
      '  start "" "%SCRIPT_DIR%Installers\\Windows_x64\\DeroVault-Setup.exe"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\Installers\\Windows_x64\\DeroVault-Setup.exe" (',
      '  echo Found offline Dero Vault installer on this backup drive.',
      '  echo Launching Dero Vault Setup...',
      '  start "" "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\Installers\\Windows_x64\\DeroVault-Setup.exe"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%Installers\\DeroVault-Setup.exe" (',
      '  echo Found offline Dero Vault installer on this backup drive.',
      '  echo Launching Dero Vault Setup...',
      '  start "" "%SCRIPT_DIR%Installers\\DeroVault-Setup.exe"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\Installers\\DeroVault-Setup.exe" (',
      '  echo Found offline Dero Vault installer on this backup drive.',
      '  echo Launching Dero Vault Setup...',
      '  start "" "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\Installers\\DeroVault-Setup.exe"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%..\\..\\Installers\\Windows_x64\\DeroVault-Setup.exe" (',
      '  echo Found offline Dero Vault installer on this backup drive.',
      '  echo Launching Dero Vault Setup...',
      '  start "" "%SCRIPT_DIR%..\\..\\Installers\\Windows_x64\\DeroVault-Setup.exe"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%..\\..\\Installers\\DeroVault-Setup.exe" (',
      '  echo Found offline Dero Vault installer on this backup drive.',
      '  echo Launching Dero Vault Setup...',
      '  start "" "%SCRIPT_DIR%..\\..\\Installers\\DeroVault-Setup.exe"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%Rescue-Launcher.html" (',
      '  echo Opening Dero Vault Rescue Portal in your default browser...',
      '  start "" "%SCRIPT_DIR%Rescue-Launcher.html"',
      '  goto done',
      ')',
      'IF EXIST "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\Rescue-Launcher.html" (',
      '  echo Opening Dero Vault Rescue Portal in your default browser...',
      '  start "" "%SCRIPT_DIR%DERO_VAULT_BACKUP\\RECOVERY\\Rescue-Launcher.html"',
      '  goto done',
      ')',
      'echo Please open Rescue-Launcher.html or install Dero Vault to recover your files.',
      ':done',
      'exit /b 0',
    ].join('\r\n');
  }

  private static generateMacCommandContent(): string {
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
      'if [ -f "$DIR/Rescue-Launcher.html" ]; then',
      '  TARGET_HTML="$DIR/Rescue-Launcher.html"',
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

  private static generateLinuxDesktopContent(): string {
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

  private static generateLinuxShContent(): string {
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
      'if [ -f "$DIR/Rescue-Launcher.html" ]; then',
      '  TARGET_HTML="$DIR/Rescue-Launcher.html"',
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

  private static async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Helper to write files atomically via staging file to prevent half-written files on sudden disconnect.
   */
  private static async atomicWriteFile(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.${Date.now()}.dero_tmp`;
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    try {
      await fs.promises.rename(tmpPath, filePath);
    } catch {
      // Windows file replacement fallback
      await fs.promises.copyFile(tmpPath, filePath);
      try {
        await fs.promises.unlink(tmpPath);
      } catch {}
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
      'HOW TO BEGIN RECOVERY:',
      '1. Open "RESCUE_MY_FILES.html" in the root of this USB drive, OR',
      '   open "Rescue-Launcher.html" inside the DERO_VAULT_BACKUP/RECOVERY folder.',
      '2. If you are on Windows, you may also double-click "Rescue-Launcher.bat".',
      '3. Choose either Option A (Automatic Rescue) or Option B (Manual Rescue).',
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
      '- Direct File Access: All backed-up files can also be browsed and copied directly from DERO_VAULT_BACKUP/CURRENT.',
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
  <meta http-equiv="refresh" content="0; url=DERO_VAULT_BACKUP/RECOVERY/Rescue-Launcher.html">
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
    <p>Your digital granary. Your office, restored.<br>Redirecting you to the recovery launcher on this backup drive...</p>
    <a href="DERO_VAULT_BACKUP/RECOVERY/Rescue-Launcher.html" class="btn">Open Rescue Launcher</a>
  </div>
</body>
</html>`;
  }

  private static generateLauncherHtml(manifest: RecoveryManifest): string {
    const manifestJsonSafe = JSON.stringify(manifest).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DERO VAULT™ RESCUE — Your Office, Restored</title>
  <style>
    :root {
      --bg: #081126;
      --card-bg: #0D1B3E;
      --card-border: #1E3466;
      --primary-gold: #F4A62A;
      --emerald: #10B981;
      --emerald-hover: #059669;
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
      max-width: 840px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 24px;
    }
    .brand-logo {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .logo-emblem {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #F4A62A 0%, #D97706 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 12px rgba(244, 166, 42, 0.3);
    }
    .title-area h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: var(--primary-gold);
    }
    .tagline {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .intro-banner {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 28px;
      text-align: center;
    }
    .intro-banner h2 {
      font-size: 17px;
      font-weight: 700;
      color: #34D399;
      margin-bottom: 4px;
    }
    .intro-banner p {
      font-size: 13px;
      color: var(--text-muted);
    }
    .options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 32px;
    }
    @media (max-width: 700px) {
      .options-grid { grid-template-columns: 1fr; }
      .container { padding: 24px; }
    }
    .option-card {
      background: rgba(10, 21, 48, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      transition: all 0.2s ease;
    }
    .option-card:hover {
      border-color: #2E4C8E;
      background: rgba(14, 27, 60, 0.9);
      transform: translateY(-2px);
    }
    .option-card.recommended {
      border: 2px solid var(--primary-gold);
      box-shadow: 0 0 24px rgba(244, 166, 42, 0.15);
    }
    .badge-recommended {
      position: absolute;
      top: -11px;
      right: 18px;
      background: var(--primary-gold);
      color: #081126;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 10px;
      border-radius: 100px;
    }
    .option-header {
      margin-bottom: 16px;
    }
    .option-tag {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-dim);
      margin-bottom: 6px;
    }
    .option-card.recommended .option-tag {
      color: var(--primary-gold);
    }
    .option-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .option-desc {
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-muted);
    }
    .option-actions {
      margin-top: 20px;
    }
    .btn-action {
      display: block;
      width: 100%;
      text-align: center;
      padding: 13px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--emerald);
      color: #FFFFFF;
    }
    .btn-primary:hover {
      background: var(--emerald-hover);
    }
    .btn-secondary {
      background: #162852;
      color: #93C5FD;
      border: 1px solid #1E3466;
    }
    .btn-secondary:hover {
      background: #1C3368;
      color: #FFFFFF;
    }
    .meta-box {
      background: #081126;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px 20px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .meta-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--primary-gold);
      margin-bottom: 10px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .meta-item span {
      display: block;
      color: var(--text-dim);
      font-size: 11px;
    }
    .meta-item strong {
      color: var(--text-main);
      font-size: 12px;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 11px;
      color: var(--text-dim);
    }
    .hidden { display: none !important; }
    .interactive-panel {
      margin-top: 24px;
      padding: 20px;
      background: #0A1530;
      border: 1px solid var(--card-border);
      border-radius: 12px;
    }
    .step-list {
      list-style: decimal;
      margin-left: 20px;
      font-size: 13px;
      line-height: 1.8;
      color: var(--text-muted);
    }
    .step-list strong { color: var(--text-main); }
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
      <h2>We found a Dero Vault backup drive.</h2>
      <p>How would you like to recover your files?</p>
    </div>

    <div class="options-grid">
      <!-- Option A: Automatic Rescue (Recommended) -->
      <div class="option-card recommended">
        <div class="badge-recommended">Recommended</div>
        <div class="option-header">
          <div class="option-tag">Option A — Guided Workflow</div>
          <div class="option-title">Automatic Rescue</div>
          <p class="option-desc">
            Let Dero Vault guide you through installation, identify your backup, restore your selected folders and help you resume automatic protection.
          </p>
        </div>
        <div class="option-actions">
          <button id="btnAutoRescue" class="btn-action btn-primary" onclick="handleAutoRescue()">
            Install Dero Vault and restore my office automatically
          </button>
        </div>
      </div>

      <!-- Option B: Manual Rescue -->
      <div class="option-card">
        <div class="option-header">
          <div class="option-tag">Option B — Self-Paced</div>
          <div class="option-title">Manual Rescue</div>
          <p class="option-desc">
            Install Dero Vault at your own pace. Once installation is complete, open its recovery feature to choose what to restore and where.
          </p>
        </div>
        <div class="option-actions">
          <button id="btnManualRescue" class="btn-action btn-secondary" onclick="handleManualRescue()">
            I will install Dero Vault myself and restore my office
          </button>
        </div>
      </div>
    </div>

    <!-- Dynamic Flow Panel -->
    <div id="flowPanel" class="interactive-panel hidden">
      <h3 id="flowTitle" style="color: var(--primary-gold); margin-bottom: 12px; font-size: 16px;"></h3>
      <div id="flowContent"></div>
    </div>

    <!-- Metadata & Integrity Summary -->
    <div class="meta-box">
      <div class="meta-header">Backup Identity & Origin</div>
      <div class="meta-grid">
        <div class="meta-item">
          <span>Drive Name</span>
          <strong id="metaDriveName">${manifest.driveFriendlyName}</strong>
        </div>
        <div class="meta-item">
          <span>Original Machine</span>
          <strong id="metaHost">${manifest.sourceMachine.hostname || 'PC'} (${manifest.sourceMachine.platform} / ${manifest.sourceMachine.arch})</strong>
        </div>
        <div class="meta-item">
          <span>Original User Profile</span>
          <strong id="metaUser">${manifest.sourceMachine.username || 'User'}</strong>
        </div>
        <div class="meta-item">
          <span>Backup Updated</span>
          <strong id="metaDate">${new Date(manifest.updatedAt).toLocaleDateString()}</strong>
        </div>
      </div>
      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #162852; font-size: 11px; color: var(--text-dim);">
        Protected folders in backup: ${manifest.namespaces.map((ns) => ns.folderName).join(', ')} • Publisher: ${manifest.publisher} • Format v${manifest.formatVersion}
      </div>
    </div>

    <div class="footer">
      Dero Vault™ operates 100% locally. Your files and backups are never transmitted to external servers.
    </div>
  </div>

  <script>
    const manifestData = ${manifestJsonSafe};

    // Detect operating system from browser navigator
    function detectClientPlatform() {
      const ua = navigator.userAgent || '';
      const plat = navigator.platform || '';
      if (/Win/i.test(plat) || /Windows/i.test(ua)) return 'win32';
      if (/Mac/i.test(plat) || /Macintosh/i.test(ua)) return 'darwin';
      if (/Linux/i.test(plat) || /Linux/i.test(ua)) return 'linux';
      return 'win32';
    }

    const clientPlatform = detectClientPlatform();

    // Check if Dero Vault is already running on this machine (http://127.0.0.1:3000)
    async function checkLocalDeroVaultRunning() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch('http://127.0.0.1:3000/api/platform/info', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const info = await res.json();
          return { isRunning: true, info };
        }
      } catch {}
      return { isRunning: false };
    }

    async function handleAutoRescue() {
      const panel = document.getElementById('flowPanel');
      const title = document.getElementById('flowTitle');
      const content = document.getElementById('flowContent');
      panel.classList.remove('hidden');

      title.innerText = "Automatic Rescue — Guided File Restoration";
      content.innerHTML = '<p style="color: #94A3B8; font-size: 13px;">Checking for an installed copy of Dero Vault on this computer...</p>';

      const check = await checkLocalDeroVaultRunning();

      if (check.isRunning) {
        content.innerHTML = \`
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <strong style="color: #34D399;">✓ Dero Vault is running on this computer!</strong>
            <p style="color: #94A3B8; font-size: 13px; margin-top: 4px;">
              You can start guided restoration immediately. Click the button below to switch to the Rescue &amp; Migration workspace in Dero Vault.
            </p>
          </div>
          <a href="http://127.0.0.1:3000/#rescue" target="_blank" class="btn-action btn-primary" style="display: inline-block; width: auto; padding: 10px 24px;">
            Open Dero Vault Rescue Workspace →
          </a>
        \`;
      } else {
        const installers = manifestData.offlineInstallers || [];
        const winInstaller = installers.find((i: any) => i.platform === 'win32') || {
          fileName: 'DeroVault-Setup.exe',
          relativePath: 'DERO_VAULT_BACKUP/RECOVERY/Installers/Windows_x64/DeroVault-Setup.exe',
        };

        content.innerHTML = \`
          <p style="color: #CBD5E1; font-size: 13px; margin-bottom: 14px;">
            Dero Vault is not currently active on this computer. You can restore your files completely offline without internet:
          </p>
          <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(244, 166, 42, 0.3); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <strong style="color: #F4A62A;">Offline Rescue Available:</strong>
            <p style="color: #CBD5E1; font-size: 13px; margin-top: 6px;">
              An offline installer is stored directly on this drive at:
              <br><code style="background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8;">\${winInstaller.relativePath}</code>
            </p>
            \${winInstaller.sha256 ? \`<p style="color: #94a3b8; font-size: 11px; margin-top: 4px;">SHA-256: <code>\${winInstaller.sha256.substring(0, 32)}...</code></p>\` : ''}
          </div>
          <ol class="step-list">
            <li><strong>Launch Offline Setup:</strong> In the root of this USB drive, double-click <strong>Rescue-Windows.bat</strong> (or run the installer from the path above).</li>
            <li><strong>Complete Setup:</strong> Launch the application. Dero Vault will recognize this drive and present the Rescue &amp; Migration workspace.</li>
            <li><strong>Select What to Restore:</strong> Choose target destination folders on your new computer and begin recovery.</li>
            <li><strong>Zero Software Option:</strong> You can also copy your files immediately without installing Dero Vault by browsing <code>DERO_VAULT_BACKUP/CURRENT</code>.</li>
          </ol>
        \`;
      }

      panel.scrollIntoView({ behavior: 'smooth' });
    }

    function handleManualRescue() {
      const panel = document.getElementById('flowPanel');
      const title = document.getElementById('flowTitle');
      const content = document.getElementById('flowContent');
      panel.classList.remove('hidden');

      title.innerText = "Manual Rescue & Direct File Access";

      content.innerHTML = \`
        <p style="color: #CBD5E1; font-size: 13px; margin-bottom: 14px;">
          You can restore your files immediately using any standard file manager:
        </p>
        <ol class="step-list">
          <li><strong>Direct File Access:</strong> Browse to <code>DERO_VAULT_BACKUP/CURRENT</code> on this USB drive. All your protected files are stored in their original folder hierarchy.</li>
          <li><strong>Copy to New Computer:</strong> Select the folders you need and copy them directly to your destination folders (e.g. Documents, Desktop).</li>
          <li><strong>Version History:</strong> If you need older file revisions, previous versions are preserved in <code>DERO_VAULT_BACKUP/VERSIONS</code>.</li>
          <li><strong>Offline Installer:</strong> If you prefer guided restoration, double-click <code>Rescue-Windows.bat</code> to launch the offline installer.</li>
        </ol>
      \`;

      panel.scrollIntoView({ behavior: 'smooth' });
    }
  </script>
</body>
</html>`;
  }
}
