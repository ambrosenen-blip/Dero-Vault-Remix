/**
 * Dero Vault — Cross-Platform Abstraction Types
 * Defines platform interfaces and normalized drive structures.
 */

export type SupportedPlatform = 'win32' | 'darwin' | 'linux';

export interface PlatformDriveInfo {
  stableHardwareId: string;
  volumeSerial: string;
  volumeLabel: string;
  mountPath: string;
  driveIdentifier: string; // e.g. "E:" on Windows, "/Volumes/Backup" on macOS, "/media/user/USB" on Linux
  totalBytes: number;
  freeBytes: number;
  fileSystem: string;
  deviceModel: string;
  physicalSerial?: string;
  pnpDeviceId?: string;
  busType?: string;
  isRemovable: boolean;
  partial?: boolean;
  reason?: string;
}

export interface PlatformFolderOption {
  name: string;
  path: string;
  fileCount: number;
}

export interface PlatformInfo {
  platform: SupportedPlatform;
  platformName: string; // "Windows", "macOS", "Linux"
  osRelease: string;
  osArch: string;
  hardwareDetectionValidated: boolean;
  supportStatusMessage: string;
}

export interface IPlatformAdapter {
  readonly platform: SupportedPlatform;
  readonly platformName: string;
  
  // Storage & paths
  getDefaultDataDirectory(): string;
  
  // External drive detection
  detectExternalDrives(hintDriveLetter?: string): Promise<PlatformDriveInfo[]>;
  
  // Folder browsing & system locations
  browseForFolder(): Promise<string | null>;
  getDefaultSourceFolders(): PlatformFolderOption[];
  
  // Support status
  isHardwareDetectionValidated(): boolean;
  getSupportStatusMessage(): string;
}
