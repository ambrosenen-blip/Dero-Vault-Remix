/**
 * Dero Vault — Linux Platform Adapter
 * Architectural implementation for Linux desktop environments (Ubuntu, Debian, Fedora, Arch).
 * STATUS: SUPPORTED ARCHITECTURALLY — NOT YET PHYSICALLY VALIDATED
 * Zero mock devices. Queries real removable block devices via lsblk / proc mounts.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { IPlatformAdapter, PlatformDriveInfo, PlatformFolderOption, SupportedPlatform } from './types.js';

const execAsync = promisify(exec);

export class LinuxPlatformAdapter implements IPlatformAdapter {
  public readonly platform: SupportedPlatform = 'linux';
  public readonly platformName = 'Linux';

  public isHardwareDetectionValidated(): boolean {
    return false; // Per Section 11: Requires physical Linux desktop hardware testing
  }

  public getSupportStatusMessage(): string {
    return 'SUPPORTED ARCHITECTURALLY — NOT YET PHYSICALLY VALIDATED';
  }

  public getDefaultDataDirectory(): string {
    const isProd = process.env.NODE_ENV === 'production';
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const prodPath = path.join(configHome, 'dero-vault');

    if (isProd || (!fs.existsSync(path.resolve(process.cwd(), '.dero_vault')) && fs.existsSync(configHome))) {
      return prodPath;
    }
    return path.resolve(process.cwd(), '.dero_vault');
  }

  /**
   * Real Linux external drive detection:
   * Queries lsblk for hotplug/removable block devices with active mount points,
   * inspects /media and /run/media. Excludes root (/) and system pseudo-filesystems.
   */
  public async detectExternalDrives(): Promise<PlatformDriveInfo[]> {
    const drives: PlatformDriveInfo[] = [];

    // Method 1: lsblk JSON query for block devices
    try {
      const { stdout } = await execAsync('lsblk -J -b -o NAME,MOUNTPOINT,SIZE,FSAVAIL,FSTYPE,LABEL,UUID,MODEL,HOTPLUG,RM,TRAN');
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout);
        const blockdevices = parsed.blockdevices || [];

        const collectRemovable = (devList: any[]) => {
          for (const dev of devList) {
            const isRemovable = Boolean(dev.rm) || Boolean(dev.hotplug) || dev.tran === 'usb';
            const mount = dev.mountpoint;

            // Only track mounted devices that are NOT the root filesystem or boot partitions
            if (mount && mount !== '/' && !mount.startsWith('/boot') && !mount.startsWith('/var') && isRemovable) {
              const uuid = (dev.uuid || '').trim();
              const label = (dev.label || '').trim() || path.basename(mount);
              const stableId = uuid ? `LINUX-UUID-${uuid}` : `LINUX-DEV-${dev.name}`;

              drives.push({
                stableHardwareId: stableId,
                volumeSerial: uuid || dev.name,
                volumeLabel: label,
                mountPath: mount,
                driveIdentifier: mount,
                totalBytes: Number(dev.size || 0),
                freeBytes: Number(dev.fsavail || 0),
                fileSystem: dev.fstype || 'ext4',
                deviceModel: dev.model || 'Removable USB Storage',
                busType: dev.tran ? dev.tran.toUpperCase() : 'USB',
                isRemovable: true,
              });
            }

            if (dev.children && Array.isArray(dev.children)) {
              collectRemovable(dev.children);
            }
          }
        };

        collectRemovable(blockdevices);
        if (drives.length > 0) return drives;
      }
    } catch {
      // lsblk not installed or non-privileged
    }

    // Method 2: Scan standard Linux removable mount paths (/media and /run/media)
    const scanDirs = [
      path.join('/media', os.userInfo().username || ''),
      path.join('/run/media', os.userInfo().username || ''),
    ];

    for (const base of scanDirs) {
      if (!fs.existsSync(base)) continue;
      try {
        const entries = fs.readdirSync(base);
        for (const entry of entries) {
          const mountPath = path.join(base, entry);
          try {
            const st = fs.statSync(mountPath);
            if (!st.isDirectory()) continue;

            let totalBytes = 0;
            let freeBytes = 0;
            try {
              const { stdout } = await execAsync(`df -B1 "${mountPath}" | tail -n 1`);
              const parts = stdout.trim().split(/\s+/);
              if (parts.length >= 4) {
                totalBytes = Number(parts[1]);
                freeBytes = Number(parts[3]);
              }
            } catch {}

            drives.push({
              stableHardwareId: `LINUX-MOUNT-${entry.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
              volumeSerial: entry,
              volumeLabel: entry,
              mountPath,
              driveIdentifier: mountPath,
              totalBytes,
              freeBytes,
              fileSystem: 'Auto',
              deviceModel: 'Removable Storage Disk',
              isRemovable: true,
            });
          } catch {}
        }
      } catch {}
    }

    return drives;
  }

  public async browseForFolder(): Promise<string | null> {
    // Try zenity (GNOME / standard Linux dialog)
    try {
      const { stdout } = await execAsync('zenity --file-selection --directory --title="Select Source Folder to Protect in Dero Vault"');
      const chosen = stdout ? stdout.trim() : '';
      if (chosen && fs.existsSync(chosen)) return chosen;
    } catch {}

    // Try kdialog (KDE Plasma dialog)
    try {
      const { stdout } = await execAsync('kdialog --getexistingdirectory "$HOME" --title "Select Source Folder to Protect in Dero Vault"');
      const chosen = stdout ? stdout.trim() : '';
      if (chosen && fs.existsSync(chosen)) return chosen;
    } catch {}

    return null;
  }

  public getDefaultSourceFolders(): PlatformFolderOption[] {
    const home = os.homedir();
    const candidateFolders = [
      { name: 'Documents', path: path.join(home, 'Documents') },
      { name: 'Desktop', path: path.join(home, 'Desktop') },
      { name: 'Pictures', path: path.join(home, 'Pictures') },
      { name: 'Music', path: path.join(home, 'Music') },
      { name: 'Videos', path: path.join(home, 'Videos') },
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
