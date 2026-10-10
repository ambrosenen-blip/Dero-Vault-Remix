/**
 * Dero Vault — Main Desktop Application
 * Your digital granary.
 * Windows 10 & 11 automatic local-first backup.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from './services/api';
import {
  AppLogEntry,
  AppSettings,
  BackupProfile,
  BackupSession,
  PlatformInfo,
  RemovableDrive,
  SourceFolderOption,
} from './types';
import { WindowHeader } from './components/WindowHeader';
import { Navbar, NavTab } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { RegisteredDrivesView } from './components/RegisteredDrivesView';
import { BackupProfilesView } from './components/BackupProfilesView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { UnregisteredDriveModal } from './components/UnregisteredDriveModal';
import { DriveRegistrationModal } from './components/DriveRegistrationModal';
import { ReportModal } from './components/ReportModal';
import { WelcomeModal } from './components/WelcomeModal';
import { SystemTrayMenu } from './components/SystemTrayMenu';
import { CompactTrayNotification, TrayNotificationState } from './components/CompactTrayNotification';
import { Shield, HardDrive, Maximize2, Settings, History, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [activeDrives, setActiveDrives] = useState<RemovableDrive[]>([]);
  const [registeredDrives, setRegisteredDrives] = useState<RemovableDrive[]>([]);
  const [backupProfiles, setBackupProfiles] = useState<BackupProfile[]>([]);
  const [currentSession, setCurrentSession] = useState<BackupSession | null>(null);
  const [history, setHistory] = useState<BackupSession[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    autoBackup: true,
    startOnConnect: true,
    notifyOnStart: true,
    notifyOnComplete: true,
    verifyBackups: true,
    preserveVersions: true,
    testMode: false,
    logLevel: 'info',
  });
  const [availableSources, setAvailableSources] = useState<SourceFolderOption[]>([]);
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [logFilePath, setLogFilePath] = useState<string>('.dero_vault/logs/dero_vault.log');
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);

  // Modals and Drawers
  const [unregisteredModalDrive, setUnregisteredModalDrive] = useState<RemovableDrive | null>(null);
  const [registerModalDrive, setRegisterModalDrive] = useState<RemovableDrive | null>(null);
  const [selectedReportSession, setSelectedReportSession] = useState<BackupSession | null>(null);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);

  // TRAY-FIRST UX: Default to compact/tray mode
  const [isMinimizedToTray, setIsMinimizedToTray] = useState(true);
  const [trayNotification, setTrayNotification] = useState<TrayNotificationState>(null);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial Data Load
  const refreshAll = async (retries = 3) => {
    try {
      const [driveData, backupData, historyData, settingsData, sourcesData, logData, platformData] =
        await Promise.all([
          ApiClient.getDrives(),
          ApiClient.getCurrentBackup(),
          ApiClient.getHistory(),
          ApiClient.getSettings(),
          ApiClient.getSystemFolders(),
          ApiClient.getLogs(),
          ApiClient.getPlatformInfo().catch(() => null),
        ]);

      setActiveDrives(driveData.drives || []);
      setRegisteredDrives(driveData.registered || []);
      setBackupProfiles(driveData.profiles || []);

      // If any connected drive is unregistered, show compact tray notification (not full modal)
      const unregistered = (driveData.drives || []).find(
        (d: RemovableDrive) => d.isConnected && !d.isRegistered
      );
      if (unregistered && !trayNotification) {
        setTrayNotification({ type: 'unregistered', drive: unregistered });
      }

      if (backupData.session) {
        setCurrentSession(backupData.session);
        // If backup is active on startup, reflect it in tray
        if (['scanning', 'comparing', 'copying', 'verifying'].includes(backupData.session.status)) {
          setTrayNotification({
            type: 'backing_up',
            session: backupData.session,
            driveName: backupData.session.driveName,
          });
        }
      }
      setHistory(historyData || []);
      setSettings(settingsData);
      if (platformData) {
        setPlatformInfo(platformData);
      }
      setAvailableSources(
        (sourcesData.folders || []).map((f) => ({
          name: f.name,
          path: f.path,
          fileCount: f.fileCount,
          sizeBytes: 0,
        }))
      );
      setLogs(logData.logs || []);
      setLogFilePath(logData.logFilePath || '.dero_vault/logs/dero_vault.log');
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => refreshAll(retries - 1), 600);
      } else {
        console.error('Error fetching initial data:', err);
      }
    }
  };

  useEffect(() => {
    // Check first-launch experience
    const hasSeenWelcome = localStorage.getItem('dero_vault_welcome_shown');
    if (!hasSeenWelcome) {
      setIsWelcomeOpen(true);
    }

    refreshAll();

    // Listen for native Electron "app:expand" (e.g. from system tray double-click or Open menu)
    if ((window as any).electronAPI?.onExpand) {
      const cleanup = (window as any).electronAPI.onExpand(() => {
        setIsMinimizedToTray(false);
      });
      return cleanup;
    }

    // Subscribe to SSE Real-Time events from server
    const unsubscribe = ApiClient.subscribeToEvents({
      onConnected: (drive) => {
        setActiveDrives((prev) => {
          const map = new Map(prev.map((d) => [d.stableHardwareId, d]));
          map.set(drive.stableHardwareId, drive);
          return Array.from(map.values());
        });

        if (drive.isRegistered) {
          // Compact tray notification for registered drive
          setTrayNotification({ type: 'registered_connect', drive });
          if ((window as any).electronAPI?.showNotification) {
            (window as any).electronAPI.showNotification({
              title: 'Dero Vault',
              content: `Registered drive "${drive.friendlyName || drive.volumeLabel}" connected. Automatic backup starting.`,
            });
          }
        } else {
          // Compact tray notification for unregistered drive (NO full window forced open)
          setTrayNotification({ type: 'unregistered', drive });
          if ((window as any).electronAPI?.showNotification) {
            (window as any).electronAPI.showNotification({
              title: 'Dero Vault',
              content: `New removable drive detected: ${drive.volumeLabel || 'Disk'} (${drive.driveLetter}).`,
            });
          }
        }
      },
      onUnregisteredDetected: (drive) => {
        // Tray-first: show compact tray notification with inline registration
        setTrayNotification({ type: 'unregistered', drive });
      },
      onDisconnected: (drive) => {
        setActiveDrives((prev) =>
          prev.map((d) =>
            d.stableHardwareId === drive.stableHardwareId ? { ...d, isConnected: false } : d
          )
        );

        // If an active session was running on this drive, show compact tray notification
        if (currentSession && currentSession.driveStableId === drive.stableHardwareId && isBackingUp) {
          setTrayNotification({
            type: 'error',
            title: 'Backup Interrupted',
            message: `Drive "${drive.friendlyName || drive.volumeLabel || drive.driveLetter}" was disconnected before backup finished.`,
            session: currentSession,
          });
        } else {
          setTrayNotification((prev) =>
            prev?.type === 'unregistered' && prev.drive.stableHardwareId === drive.stableHardwareId
              ? null
              : prev
          );
        }
      },
      onDriveRegistered: () => {
        refreshAll();
      },
      onDriveUnregistered: () => {
        refreshAll();
      },
      onBackupStart: (session) => {
        setCurrentSession(session);
        // TRAY-FIRST: Do NOT open full app or force dashboard switch.
        // Display compact live progress in tray notification.
        setTrayNotification({
          type: 'backing_up',
          session,
          driveName: session.driveName,
        });
      },
      onBackupUpdate: (session) => {
        setCurrentSession(session);
        setTrayNotification((prev) =>
          prev?.type === 'backing_up' ? { ...prev, session } : prev
        );
      },
      onBackupComplete: (session) => {
        setCurrentSession(session);
        // TRAY-FIRST: Show "✓ Today's work is safely backed up."
        setTrayNotification({
          type: 'complete',
          session,
          driveName: session.driveName,
        });

        if ((window as any).electronAPI?.showNotification) {
          (window as any).electronAPI.showNotification({
            title: 'Dero Vault',
            content: "✓ Today's work is safely backed up.",
          });
        }

        ApiClient.getHistory().then(setHistory);

        // Auto-dismiss the completed toast after 10 seconds
        if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = setTimeout(() => {
          setTrayNotification((prev) => (prev?.type === 'complete' ? null : prev));
        }, 10000);
      },
      onSettingsUpdated: (updated) => {
        setSettings(updated);
      },
    });

    return () => {
      unsubscribe();
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    };
  }, []);

  const handleStartManualBackup = async (stableHardwareId?: string) => {
    try {
      const res = await ApiClient.startBackup(stableHardwareId);
      if (res.session) {
        setCurrentSession(res.session);
        setTrayNotification({
          type: 'backing_up',
          session: res.session,
          driveName: res.session.driveName,
        });
      }
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Could Not Start Backup',
        message: err.message,
      });
    }
  };

  const handleCancelBackup = async () => {
    await ApiClient.cancelBackup();
    setTrayNotification(null);
  };

  // Quick Registration performed directly from compact tray interface
  const handleQuickRegister = async (data: {
    stableHardwareId: string;
    friendlyName: string;
    sourceFolders: string[];
    autoBackupEnabled: boolean;
    verifyBackups: boolean;
    preserveVersions: boolean;
  }) => {
    try {
      await ApiClient.registerDrive(data);
      setTrayNotification(null);
      await refreshAll();
      // Start backup immediately upon registration
      await handleStartManualBackup(data.stableHardwareId);
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Registration Error',
        message: err.message || 'Could not register drive.',
      });
    }
  };

  const handleRegisterComplete = async (data: {
    stableHardwareId: string;
    friendlyName: string;
    sourceFolders: string[];
    autoBackupEnabled: boolean;
    verifyBackups: boolean;
    preserveVersions: boolean;
  }) => {
    try {
      await ApiClient.registerDrive(data);
      setRegisterModalDrive(null);
      setUnregisteredModalDrive(null);
      await refreshAll();
      handleStartManualBackup(data.stableHardwareId);
    } catch (err: any) {
      alert(`Failed to register drive: ${err.message}`);
    }
  };

  const handleUpdateRegisteredDrive = async (stableId: string, partial: Partial<RemovableDrive>) => {
    try {
      await ApiClient.updateDrive(stableId, { friendlyName: partial.friendlyName });
      refreshAll();
    } catch (err: any) {
      alert(`Failed to update drive: ${err.message}`);
    }
  };

  const handleUnregisterDrive = async (stableId: string) => {
    if (
      confirm(
        'Are you sure you want to unregister this drive? Existing backup files on the drive will be kept safe.'
      )
    ) {
      try {
        await ApiClient.unregisterDrive(stableId);
        refreshAll();
      } catch (err: any) {
        alert(`Failed to unregister drive: ${err.message}`);
      }
    }
  };

  const handleUpdateProfile = async (driveStableId: string, updates: Partial<BackupProfile>) => {
    try {
      await ApiClient.updateDrive(driveStableId, updates);
      refreshAll();
    } catch (err: any) {
      alert(`Failed to update profile: ${err.message}`);
    }
  };

  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    try {
      const updated = await ApiClient.updateSettings(updates);
      setSettings(updated);
    } catch (err: any) {
      alert(`Failed to update settings: ${err.message}`);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Clear local backup history? This does not delete any files.')) {
      await ApiClient.clearHistory();
      setHistory([]);
    }
  };

  const isBackingUp =
    currentSession !== null &&
    ['scanning', 'comparing', 'copying', 'verifying'].includes(currentSession.status);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-600/30 selection:text-emerald-200">
      {/* Windows 11 Title Bar */}
      <WindowHeader
        onMinimizeToTray={() => {
          setIsMinimizedToTray(true);
          if ((window as any).electronAPI?.minimizeToTray) {
            (window as any).electronAPI.minimizeToTray();
          }
        }}
        isAutoBackupActive={settings.autoBackup}
        activeDrivesCount={activeDrives.filter((d) => d.isConnected).length}
        isBackingUp={isBackingUp}
      />

      {/* Main Application Window (Expanded Secondary View) */}
      {!isMinimizedToTray ? (
        <div className="flex-1 flex flex-col">
          {/* Top Bar Navigation */}
          <Navbar
            currentTab={currentTab}
            onTabChange={setCurrentTab}
            registeredCount={registeredDrives.length}
          />

          {/* Tab Views */}
          <main className="flex-1 overflow-y-auto">
            {currentTab === 'dashboard' && (
              <Dashboard
                currentSession={currentSession}
                activeDrives={activeDrives}
                registeredDrives={registeredDrives}
                onStartManualBackup={handleStartManualBackup}
                onCancelBackup={handleCancelBackup}
                onViewReport={(session) => setSelectedReportSession(session)}
                onOpenRegisterModal={(drive) => setRegisterModalDrive(drive)}
              />
            )}

            {currentTab === 'drives' && (
              <RegisteredDrivesView
                registeredDrives={registeredDrives}
                activeDrives={activeDrives}
                backupProfiles={backupProfiles}
                onStartBackup={handleStartManualBackup}
                onUpdateDrive={handleUpdateRegisteredDrive}
                onUnregister={handleUnregisterDrive}
                onViewHistory={() => setCurrentTab('history')}
              />
            )}

            {currentTab === 'profiles' && (
              <BackupProfilesView
                backupProfiles={backupProfiles}
                registeredDrives={registeredDrives}
                onUpdateProfile={handleUpdateProfile}
              />
            )}

            {currentTab === 'history' && (
              <HistoryView
                history={history}
                onViewReport={(session) => setSelectedReportSession(session)}
                onClearHistory={handleClearHistory}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                logs={logs}
                logFilePath={logFilePath}
                onRefreshLogs={async () => {
                  const res = await ApiClient.getLogs();
                  setLogs(res.logs);
                }}
                platformInfo={platformInfo}
              />
            )}
          </main>
        </div>
      ) : (
        /* DEFAULT EXPERIENCE: Quiet Background Office Assistant */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 max-w-xl mx-auto">
          {/* Subtle Granary Emblem */}
          <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800/90 text-emerald-400 flex items-center justify-center shadow-xl relative">
            <Shield className="w-10 h-10" />
            <span
              className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                isBackingUp ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Quiet Office Assistant · Running in System Tray</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Dero Vault is Protecting Your Work
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              Plug in your registered USB drive at any time. Dero Vault automatically backs up your office files without interrupting your work.
            </p>
          </div>

          {/* Live Status Indicators */}
          <div className="w-full grid grid-cols-2 gap-3 max-w-md text-xs">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-left space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Protected Storage
              </span>
              <div className="flex items-center gap-2 text-slate-200 font-medium">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <span>
                  {registeredDrives.length} registered drive
                  {registeredDrives.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-left space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Auto-Backup Mode
              </span>
              <div className="flex items-center gap-2 text-slate-200 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {settings.autoBackup ? 'Active on Connect' : 'Paused'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setIsMinimizedToTray(false);
                if ((window as any).electronAPI?.expandWindow) {
                  (window as any).electronAPI.expandWindow();
                }
              }}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-750 border border-slate-700/80 rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Dero Vault Dashboard</span>
            </button>
          </div>
        </div>
      )}

      {/* COMPACT TRAY NOTIFICATION (Smadav-style unobtrusive pop-up) */}
      <CompactTrayNotification
        notification={trayNotification}
        onDismiss={() => setTrayNotification(null)}
        onOpenFullApp={() => {
          setIsMinimizedToTray(false);
          if ((window as any).electronAPI?.expandWindow) {
            (window as any).electronAPI.expandWindow();
          }
        }}
        onQuickRegister={handleQuickRegister}
        onCancelBackup={handleCancelBackup}
        availableSources={availableSources}
        isFullAppOpen={!isMinimizedToTray}
      />

      {/* Persistent System Tray Widget in Bottom-Right */}
      <SystemTrayMenu
        isMinimized={isMinimizedToTray}
        onRestore={() => {
          setIsMinimizedToTray(false);
          if ((window as any).electronAPI?.expandWindow) {
            (window as any).electronAPI.expandWindow();
          }
        }}
        isAutoBackupActive={settings.autoBackup}
        onToggleAutoBackup={() => handleUpdateSettings({ autoBackup: !settings.autoBackup })}
        onOpenSettings={() => {
          setIsMinimizedToTray(false);
          setCurrentTab('settings');
        }}
        isBackingUp={isBackingUp}
        activeDriveName={currentSession?.driveName}
      />

      {/* Modal 1: Unregistered Removable Drive Detected (Fallback for full app) */}
      <UnregisteredDriveModal
        drive={unregisteredModalDrive}
        onRegister={(drive) => {
          setUnregisteredModalDrive(null);
          setRegisterModalDrive(drive);
        }}
        onIgnore={() => setUnregisteredModalDrive(null)}
      />

      {/* Modal 2: Drive Registration & Protection Setup */}
      <DriveRegistrationModal
        drive={registerModalDrive}
        onClose={() => setRegisterModalDrive(null)}
        onComplete={handleRegisterComplete}
      />

      {/* Modal 3: Inspection Report Modal */}
      <ReportModal
        session={selectedReportSession}
        onClose={() => setSelectedReportSession(null)}
      />

      {/* Modal 4: First Launch Experience Welcome */}
      <WelcomeModal
        isOpen={isWelcomeOpen}
        onGetStarted={() => {
          localStorage.setItem('dero_vault_welcome_shown', 'true');
          setIsWelcomeOpen(false);
        }}
      />
    </div>
  );
}
