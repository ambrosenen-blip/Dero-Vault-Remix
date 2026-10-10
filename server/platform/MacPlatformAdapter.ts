/**
 * Dero Vault — macOS Platform Adapter
 * Architectural implementation for Apple macOS (darwin).
 * STATUS: SUPPORTED ARCHITECTURALLY — NOT YET PHYSICALLY VALIDATED
 * Zero mock devices. Uses real /Volumes inspections and osascript dialogs.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { IPlatformAdapter, PlatformDriveInfo, PlatformFolderOption, SupportedPlatform } from './types.js';

const execAsync = promisify(exec);

export class MacPlatformAdapter implements IPlatformAdapter {
  public readonly platform: SupportedPlatform = 'darwin';
  public readonly platformName = 'macOS';

  public isHardwareDetectionValidated(): boolean {
    return false; // Per Section 11: Requires physical Mac hardware testing
  }

  public getSupportStatusMessage(): string {
    return 'SUPPORTED ARCHITECTURALLY — NOT YET PHYSICALLY VALIDATED';
  }

  public getDefaultDataDirectory(): string {
    const isProd = process.env.NODE_ENV === 'production';
    const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
    const prodPath = path.join(appSupport, 'DeroVault');

    if (isProd || (!fs.existsSync(path.resolve(process.cwd(), '.dero_vault')) && fs.existsSync(appSupport))) {
      return prodPath;
    }
    return path.resolve(process.cwd(), '.dero_vault');
  }

  /**
   * Real macOS external drive detection:
   * Inspects `/Volumes` mount directory, queries diskutil for volume details,
   * excludes root/system partition. Zero mock data.
   */
  public async detectExternalDrives(): Promise<PlatformDriveInfo[]> {
    const volumesDir = '/Volumes';
    if (!fs.existsSync(volumesDir)) {
      return [];
    }

    const drives: PlatformDriveInfo[] = [];

    try {
      const volumeNames = fs.readdirSync(volumesDir);
      for (const volName of volumeNames) {
        const mountPath = path.join(volumesDir, volName);

        // Exclude system root symlinks or reserved mounts
        if (volName === 'Macintosh HD' || volName.startsWith('.')) {
          continue;
        }

        try {
          const stats = fs.statSync(mountPath);
          if (!stats.isDirectory()) continue;

          // Attempt diskutil info query for volume UUID & hardware model
          let volUuid = '';
          let model = 'External Mac Volume';
          let fsType = 'APFS';
          let totalBytes = 0;
          let freeBytes = 0;

          try {
            const { stdout } = await execAsync(`diskutil info -plist "${mountPath}"`);
            const uuidMatch = stdout.match(/<key>VolumeUUID<\/key>\s*<string>([^<]+)<\/string>/i);
            if (uuidMatch) volUuid = uuidMatch[1].trim();

            const modelMatch = stdout.match(/<key>DeviceModel<\/key>\s*<string>([^<]+)<\/string>/i);
            if (modelMatch) model = modelMatch[1].trim();

            const fsMatch = stdout.match(/<key>FilesystemName<\/key>\s*<string>([^<]+)<\/string>/i);
            if (fsMatch) fsType = fsMatch[1].trim();

            const sizeMatch = stdout.match(/<key>TotalSize<\/key>\s*<integer>(\d+)<\/integer>/i);
            if (sizeMatch) totalBytes = Number(sizeMatch[1]);

            const freeMatch = stdout.match(/<key>FreeSpace<\/key>\s*<integer>(\d+)<\/integer>/i);
            if (freeMatch) freeBytes = Number(freeMatch[1]);
          } catch {
            // diskutil fallback via statfs/df if plist query is unavailable
            try {
              const { stdout } = await execAsync(`df -k "${mountPath}" | tail -n 1`);
              const parts = stdout.trim().split(/\s+/);
              if (parts.length >= 4) {
                totalBytes = Number(parts[1]) * 1024;
                freeBytes = Number(parts[3]) * 1024;
              }
            } catch {}
          }

          const stableId = volUuid ? `MAC-VOL-${volUuid}` : `MAC-PATH-${volName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

          drives.push({
            stableHardwareId: stableId,
            volumeSerial: volUuid || volName,
            volumeLabel: volName,
            mountPath,
            driveIdentifier: `/Volumes/${volName}`,
            totalBytes,
            freeBytes,
            fileSystem: fsType,
            deviceModel: model,
            isRemovable: true,
          });
        } catch {
          // Unreadable volume or permission denied
          continue;
        }
      }
    } catch {
      return [];
    }

    return drives;
  }

  public async browseForFolder(): Promise<string | null> {
    try {
      const script = `osascript -e 'POSIX path of (choose folder with prompt "Select Source Folder to Protect in Dero Vault")'`;
      const { stdout } = await execAsync(script);
      const chosen = stdout ? stdout.trim() : '';
      if (chosen && fs.existsSync(chosen)) {
        return chosen;
      }
      return null;
    } catch {
      return null;
    }
  }

  public getDefaultSourceFolders(): PlatformFolderOption[] {
    const home = os.homedir();
    const candidateFolders = [
      { name: 'Documents', path: path.join(home, 'Documents') },
      { name: 'Desktop', path: path.join(home, 'Desktop') },
      { name: 'Pictures', path: path.join(home, 'Pictures') },
      { name: 'Music', path: path.join(home, 'Music') },
      { name: 'Movies', path: path.join(home, 'Movies') },
    ];

    return candidateFolders
      .filter((f) => fs.existsSync(f.path))
      .map((f) => {
        let count = 0;
        try {
          count = fs.readdirSync(f.path).length;
        } catch {}
        return {
          name: f.name,
          path: f.path,
          fileCount: count,
        };
      });
  }
}
