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
  hasRecoveryPackage?: boolean;
  recoveryStatus?: RecoveryPackageStatus;
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
  | 'checking_capacity'
  | 'comparing'
  | 'copying'
  | 'verifying'
  | 'completed'
  | 'completed_with_errors'
  | 'incomplete'
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
  capacityAssessment?: any;
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
  stabilityConsent: boolean; // Opt-in stability reporting (defaults to false)
  adoptionConsent: boolean; // Opt-in adoption analytics (defaults to false)
  legalAcceptance: LegalAcceptance;
}

export interface LegalAcceptance {
  eulaVersion: string | null;
  eulaAcceptedAt: string | null;
  privacyNoticeVersion: string | null;
  privacyNoticeViewedAt: string | null;
}

export type ServiceConfigState = 'UNCONFIGURED' | 'INVALID_CONFIGURATION' | 'READY';

export interface UpdateManifest {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  sha256: string;
  minimumOsVersion?: string;
}

export interface UpdateManagerStatus {
  state: ServiceConfigState;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  lastCheckedAt: string | null;
  statusMessage: string;
  channel: 'stable' | 'beta';
  downloadUrl?: string;
  releaseNotes?: string;
  sha256?: string;
  isChecking: boolean;
  endpointUrl: string | null;
}

export interface StabilityReporterStatus {
  state: ServiceConfigState;
  telemetryConsent: boolean;
  queueLength: number;
  maxQueueLength: number;
  lastReportedAt: string | null;
  totalReported: number;
  statusMessage: string;
  endpointUrl: string | null;
}

export interface AdoptionMonitorStatus {
  state: ServiceConfigState;
  telemetryConsent: boolean;
  installationId: string;
  lastHeartbeatAt: string | null;
  totalHeartbeatsSent: number;
  statusMessage: string;
  endpointUrl: string | null;
}

export interface AllServicesStatus {
  updateManager: UpdateManagerStatus;
  stabilityReporter: StabilityReporterStatus;
  adoptionMonitor: AdoptionMonitorStatus;
  stabilityConsent: boolean;
  adoptionConsent: boolean;
  legalAcceptance: LegalAcceptance;
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

export interface OfflineInstallerPackage {
  platform: 'win32' | 'darwin' | 'linux';
  arch: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  verifiedAt: string;
}

export interface CompatibilityCheck {
  id: 'os_detected' | 'app_compatible' | 'format_compatible' | 'backup_accessible';
  title: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
  nextAction?: string;
}

export interface EnvironmentDetectionResult {
  hostEnvironment: {
    platform: 'win32' | 'darwin' | 'linux' | 'other';
    platformName: 'Windows' | 'macOS' | 'Linux' | 'Other';
    friendlyOsName: string;
    osRelease: string;
    kernelVersion: string;
    arch: string;
    friendlyArch: string;
    hostname: string;
    username: string;
    homeDir: string;
  };
  checks: CompatibilityCheck[];
  allChecksPassed: boolean;
  readyToProceed: boolean;
  plainLanguageSummary: string;
}

export interface RecoveryManifest {
  formatVersion: string;
  product: string;
  publisher: string;
  packageVersion: string;
  createdAt: string;
  updatedAt: string;
  driveStableId: string;
  driveFriendlyName: string;
  sourceMachine: {
    platform: string;
    hostname?: string;
    username?: string;
    arch?: string;
    osRelease?: string;
  };
  backupStructure: {
    rootFolder: string;
    currentFolder: string;
    versionsFolder: string;
    reportsFolder: string;
    recoveryFolder: string;
    installersFolder?: string;
  };
  nativeLaunchers?: {
    windows: { file: string; arch: string[]; description: string };
    macos: { file: string; arch: string[]; description: string };
    linux: { file: string; arch: string[]; description: string };
  };
  offlineInstallers?: OfflineInstallerPackage[];
  compatibility?: {
    minWindows: string;
    minMacOs: string;
    minLinux: string;
    supportedArchitectures: string[];
  };
  namespaces: {
    namespace: string;
    originalPath: string;
    folderName: string;
    category?: string;
  }[];
  officialDownloadUrl: string;
}

export interface RecoveryPackageStatus {
  isProvisioned: boolean;
  provisionedAt?: string;
  manifestPath?: string;
  launcherPath?: string;
  version?: string;
  error?: string;
}

export type ConflictStrategy = 'safe_rename' | 'skip_existing' | 'overwrite_if_newer';

export interface RestoreNamespaceMapping {
  namespace: string;
  folderName: string;
  originalPath?: string;
  targetPath: string;
  fileCount: number;
  totalBytes: number;
  enabled: boolean;
}

export type RestoreStatus =
  | 'idle'
  | 'scanning'
  | 'restoring'
  | 'verifying'
  | 'completed'
  | 'completed_with_errors'
  | 'cancelled'
  | 'failed';

export interface RestoreSession {
  id: string;
  driveStableId?: string;
  driveLetter?: string;
  mountPath: string;
  status: RestoreStatus;
  startTime: string;
  endTime?: string;
  conflictStrategy: ConflictStrategy;
  verifyIntegrity: boolean;
  filesDiscovered: number;
  filesRestored: number;
  filesSkipped: number;
  filesFailed: number;
  filesVerified: number;
  bytesTotal: number;
  bytesTransferred: number;
  currentFile?: string;
  currentSpeedBps: number;
  estimatedSecondsRemaining: number;
  errors: { path: string; destPath: string; error: string; timestamp: string }[];
  namespaces: RestoreNamespaceMapping[];
}

export interface DriveInspectionResult {
  hasBackup: boolean;
  manifest?: RecoveryManifest;
  namespaces: RestoreNamespaceMapping[];
  totalFiles: number;
  totalBytes: number;
  sourceMachine?: any;
  error?: string;
  environmentResult?: EnvironmentDetectionResult;
  offlineInstallers?: OfflineInstallerPackage[];
  isIncompleteBackup?: boolean;
  incompleteReason?: string;
}

