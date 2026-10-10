/**
 * Dero Vault — Platform Abstraction Factory & Service
 * Intelligently selects the OS adapter at runtime.
 */

import os from 'os';
import { IPlatformAdapter, PlatformDriveInfo, PlatformFolderOption, PlatformInfo, SupportedPlatform } from './types.js';
import { WindowsPlatformAdapter } from './WindowsPlatformAdapter.js';
import { MacPlatformAdapter } from './MacPlatformAdapter.js';
import { LinuxPlatformAdapter } from './LinuxPlatformAdapter.js';

export * from './types.js';
export { WindowsPlatformAdapter } from './WindowsPlatformAdapter.js';
export { MacPlatformAdapter } from './MacPlatformAdapter.js';
export { LinuxPlatformAdapter } from './LinuxPlatformAdapter.js';

let cachedAdapter: IPlatformAdapter | null = null;

export function getPlatformAdapter(): IPlatformAdapter {
  if (cachedAdapter) return cachedAdapter;

  const currentPlatform = os.platform();
  if (currentPlatform === 'win32') {
    cachedAdapter = new WindowsPlatformAdapter();
  } else if (currentPlatform === 'darwin') {
    cachedAdapter = new MacPlatformAdapter();
  } else {
    // Linux and other POSIX
    cachedAdapter = new LinuxPlatformAdapter();
  }

  return cachedAdapter;
}

export class PlatformService {
  public static getAdapter(): IPlatformAdapter {
    return getPlatformAdapter();
  }

  public static getPlatformInfo(): PlatformInfo {
    const adapter = getPlatformAdapter();
    return {
      platform: adapter.platform,
      platformName: adapter.platformName,
      osRelease: os.release(),
      osArch: os.arch(),
      hardwareDetectionValidated: adapter.isHardwareDetectionValidated(),
      supportStatusMessage: adapter.getSupportStatusMessage(),
    };
  }

  public static getDefaultDataDirectory(): string {
    return getPlatformAdapter().getDefaultDataDirectory();
  }

  public static async detectExternalDrives(): Promise<PlatformDriveInfo[]> {
    return getPlatformAdapter().detectExternalDrives();
  }

  public static async browseForFolder(): Promise<string | null> {
    return getPlatformAdapter().browseForFolder();
  }

  public static getDefaultSourceFolders(): PlatformFolderOption[] {
    return getPlatformAdapter().getDefaultSourceFolders();
  }
}
