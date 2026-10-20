/**
 * Dero Vault — Frontend Types
 */

export interface RemovableDrive {
  id: string;
  stableHardwareId: string;
  volumeSerial: string;
  volumeLabel: string;
  friendlyName?: string;
  driveLetter: string;
  mountPath: string;
  totalBytes: number;
  freeBytes: number;
  fileSystem: string;
  deviceModel: string;
  physicalSerial?: string;
  pnpDeviceId?: string;
  busType?: string;
  platform?: 'win32' | 'darwin' | 'linux';
  isRemovable: boolean;
  isRegistered: boolean;
  isConnected: boolean;
  isSystemDrive: boolean;
  registeredAt?: string;
  lastConnectedAt?: string;
  lastBackupAt?: string;
  backupProfileId?: string;
}

export interface BackupProfile {
  id: string;
  driveStableId: string;
  friendlyName: string;
  sourceFolders: string[];
  destinationFolder: string;
  autoBackupEnabled: boolean;
  verifyBackups: boolean;
  preserveVersions: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BackupStatus =
  | 'idle'
  | 'scanning'
  | 'comparing'
  | 'copying'
  | 'verifying'
  | 'completed'
  | 'completed_with_errors'
  | 'interrupted'
  | 'failed'
  | 'stopped_insufficient_space'
  | 'cancelled';

export interface FileCopyError {
  path: string;
  destPath: string;
  error: string;
  timestamp: string;
}

export interface BackupSession {
  id: string;
  driveId: string;
  driveStableId: string;
  driveName: string;
  driveLetter: string;
  status: BackupStatus;
  startTime: string;
  endTime?: string;
  isInitialBackup: boolean;
  
  filesScanned: number;
  filesCopied: number;
  filesSkipped: number;
  filesFailed: number;
  newFilesCount: number;
  modifiedFilesCount: number;
  
  bytesTotal: number;
  bytesTransferred: number;
  
  currentFile?: string;
  currentSpeedBps: number;
  estimatedSecondsRemaining: number;
  
  // Mode
  mode?: 'turbo' | 'standard';

  isVerified: boolean;
  verificationNotes?: string;
  
  errors: FileCopyError[];
  reportPath?: string;
  txtReportPath?: string;
  reportSummary?: string;
}

export interface AppSettings {
  autoBackup: boolean;
  startOnConnect: boolean;
  turboBackup: boolean;
  notifyOnStart: boolean;
  notifyOnComplete: boolean;
  verifyBackups: boolean;
  preserveVersions: boolean;
  testMode: boolean;
  logLevel: 'info' | 'debug';
}

export interface AppLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  module: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SourceFolderOption {
  name: string;
  path: string;
  fileCount: number;
  sizeBytes: number;
}

export interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux';
  platformName: string;
  osRelease: string;
  osArch: string;
  hardwareDetectionValidated: boolean;
  supportStatusMessage: string;
}

