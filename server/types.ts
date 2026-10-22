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
  
  // Mode
  mode?: 'turbo' | 'standard';

  // Verification
  isVerified: boolean;
  verificationNotes?: string;
  
  // Detailed errors
  errors: FileCopyError[];
  reportPath?: string;
  txtReportPath?: string;
  reportSummary?: string;
}

export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export interface BackupReminderSettings {
  enabled: boolean;
  frequency: ReminderFrequency;
  weeklyDays: number[]; // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  monthlyDay: number; // 1 to 31
  time: string; // 'HH:mm', 24-hour local time, e.g. '17:00'
  snoozeUntil: string | null; // ISO timestamp
  lastNotifiedOccurrenceId: string | null;
  lastDismissedOccurrenceId: string | null;
}

export interface ReminderNotificationData {
  id: string;
  occurrenceId: string;
  message: string;
  lastVerifiedBackupAt: string | null;
  scheduledTime: string;
  triggeredAt: string;
}

export interface ReminderStatus {
  settings: BackupReminderSettings;
  nextReminderAt: string | null; // ISO timestamp of next scheduled notification
  lastVerifiedBackupAt: string | null; // ISO timestamp of most recent successful verified backup
  isSuppressed: boolean;
  suppressionReason?: string;
  isDue: boolean;
  activeReminderNotification: ReminderNotificationData | null;
}

export interface StartupStatus {
  enabled: boolean; // User preference (defaults to true)
  isRegisteredInOS: boolean; // Actual OS registration
  isPackaged: boolean;
  executablePath: string;
  openAtLogin: boolean;
  openAsHidden: boolean;
  statusMessage: string;
}

export interface AppSettings {
  autoBackup: boolean; // Master auto-backup switch
  startOnConnect: boolean; // Start backup automatically when registered drive is connected
  turboBackup: boolean; // Turbo backup engine with bounded parallel copying
  startAtLogin: boolean; // Launch Dero Vault automatically at Windows login
  startMinimized: boolean; // Start quietly in Windows System Tray without popping up a window
  notifyOnStart: boolean; // Show notification when backup begins
  notifyOnComplete: boolean; // Show notification when backup completes
  verifyBackups: boolean; // Verify file integrity after copy
  preserveVersions: boolean; // Keep older versions in VERSIONS folder
  testMode: boolean; // Enable testing lab & virtual drives
  logLevel: 'info' | 'debug';
  reminders?: BackupReminderSettings;
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

