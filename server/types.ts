/**
 * Dero Vault — Type Definitions
 * Your digital granary.
 */

export interface RemovableDrive {
  id: string; // Stable internal ID
  stableHardwareId: string; // Hardware/volume serial (e.g., USB-STOR-001BFC0B8765 / 8A23-F41C)
  volumeSerial: string; // Volume serial number
  volumeLabel: string; // e.g. Volume label or name
  friendlyName?: string; // User-assigned friendly drive name
  driveLetter: string; // Current volume drive letter or mount point
  mountPath: string; // Real filesystem path on disk
  totalBytes: number; // Total capacity in bytes
  freeBytes: number; // Available space in bytes
  fileSystem: string; // NTFS, exFAT, FAT32, APFS, ext4
  deviceModel: string; // Hardware device model string
  physicalSerial?: string; // Physical hardware disk serial number
  pnpDeviceId?: string; // Windows Plug and Play hardware device ID
  busType?: string; // USB, SCSI, etc.
  platform?: 'win32' | 'darwin' | 'linux'; // Operating system origin
  isRemovable: boolean;
  isRegistered: boolean;
  isConnected: boolean;
  isSystemDrive: boolean; // Must never be treated as backup destination
  registeredAt?: string;
  lastConnectedAt?: string;
  lastBackupAt?: string;
  backupProfileId?: string;
  partial?: boolean;
  reason?: string;
}

export interface BackupProfile {
  id: string;
  driveStableId: string; // Link to drive's stable hardware identity
  friendlyName: string;
  sourceFolders: string[]; // Absolute paths of protected source directories
  destinationFolder: string; // Relative to drive root, e.g. "DERO_VAULT_BACKUP"
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
  
  // File metrics
  filesScanned: number;
  filesCopied: number;
  filesSkipped: number;
  filesFailed: number;
  newFilesCount: number;
  modifiedFilesCount: number;
  
  // Byte metrics
  bytesTotal: number;
  bytesTransferred: number;
  
  // Real-time speed and ETA
  currentFile?: string;
  currentSpeedBps: number;
  estimatedSecondsRemaining: number;
  
  // Verification
  isVerified: boolean;
  verificationNotes?: string;
  
  // Detailed errors
  errors: FileCopyError[];
  reportPath?: string;
  txtReportPath?: string;
  reportSummary?: string;
}

export interface AppSettings {
  autoBackup: boolean; // Master auto-backup switch
  startOnConnect: boolean; // Start backup automatically when registered drive is connected
  notifyOnStart: boolean; // Show notification when backup begins
  notifyOnComplete: boolean; // Show notification when backup completes
  verifyBackups: boolean; // Verify file integrity after copy
  preserveVersions: boolean; // Keep older versions in VERSIONS folder
  testMode: boolean; // Enable testing lab & virtual drives
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

export interface SystemTrayState {
  isMinimizedToTray: boolean;
  isPaused: boolean;
  statusText: string;
}
