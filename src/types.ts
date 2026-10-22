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
  autoBackup: boolean;
  startOnConnect: boolean;
  turboBackup: boolean;
  startAtLogin: boolean; // Launch Dero Vault automatically at Windows login
  startMinimized: boolean; // Start quietly in Windows System Tray without popping up a window
  notifyOnStart: boolean;
  notifyOnComplete: boolean;
  verifyBackups: boolean;
  preserveVersions: boolean;
  testMode: boolean;
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

