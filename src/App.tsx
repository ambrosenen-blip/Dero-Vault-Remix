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
  BackupReminderSettings,
  BackupSession,
  PlatformInfo,
  ReminderStatus,
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
import { RescueView } from './components/RescueView';
import { HelpCentreView } from './components/HelpCentreView';
import { ReminderBanner } from './components/ReminderBanner';
import { UnregisteredDriveModal } from './components/UnregisteredDriveModal';
import { DriveRegistrationModal } from './components/DriveRegistrationModal';
import { ReportModal } from './components/ReportModal';
import { WelcomeModal } from './components/WelcomeModal';
import { SystemTrayMenu } from './components/SystemTrayMenu';
import { CompactTrayNotification, TrayNotificationState } from './components/CompactTrayNotification';
import { DownloadModal } from './components/DownloadModal';
import { Shield, HardDrive, Maximize2, Settings, History, CheckCircle2, Download } from 'lucide-react';
import { DeroGranaryEmblem, DeroWordmark, DeroAppIcon, EnenDigitalLabsLogo } from './components/BrandLogo';

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
    turboBackup: true,
    startAtLogin: true,
    startMinimized: true,
    notifyOnStart: true,
    notifyOnComplete: true,
    verifyBackups: true,
    preserveVersions: true,
    testMode: false,
    logLevel: 'info',
    stabilityConsent: false,
    adoptionConsent: false,
    legalAcceptance: {
      eulaVersion: null,
      eulaAcceptedAt: null,
      privacyNoticeVersion: null,
      privacyNoticeViewedAt: null,
    },
  });
  const [availableSources, setAvailableSources] = useState<SourceFolderOption[]>([]);
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [logFilePath, setLogFilePath] = useState<string>('.dero_vault/logs/dero_vault.log');
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Modals and Drawers
  const [unregisteredModalDrive, setUnregisteredModalDrive] = useState<RemovableDrive | null>(null);
  const [registerModalDrive, setRegisterModalDrive] = useState<RemovableDrive | null>(null);
  const [selectedReportSession, setSelectedReportSession] = useState<BackupSession | null>(null);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);

  // Default to full dashboard view when window is opened
  const [isMinimizedToTray, setIsMinimizedToTray] = useState(false);
  const [trayNotification, setTrayNotification] = useState<TrayNotificationState>(null);
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial Data Load
  const refreshAll = async (retries = 3) => {
    try {
      const [driveData, backupData, historyData, settingsData, sourcesData, logData, platformData, remStatus] =
        await Promise.all([
          ApiClient.getDrives(),
          ApiClient.getCurrentBackup(),
          ApiClient.getHistory(),
          ApiClient.getSettings(),
          ApiClient.getSystemFolders(),
          ApiClient.getLogs(),
          ApiClient.getPlatformInfo().catch(() => null),
          ApiClient.getReminderStatus().catch(() => null),
        ]);

      setActiveDrives(driveData.drives || []);
      setRegisteredDrives(driveData.registered || []);
      setBackupProfiles(driveData.profiles || []);
      if (remStatus) {
        setReminderStatus(remStatus);
      }

      // If any connected drive is unregistered, show compact tray notification (not full modal)
      const unregistered = (driveData.drives || []).find(
        (d: RemovableDrive) => d.isConnected && !d.isRegistered
      );
      if (unregistered && !trayNotification) {
        setTrayNotification({ type: 'unregistered', drive: unregistered });
      }

      if (backupData.session) {
        const activeSession = backupData.session;
        setCurrentSession(activeSession);
        // Reflect in tray notification accurately based on authoritative status
        if (['scanning', 'comparing', 'copying', 'verifying'].includes(activeSession.status)) {
          setTrayNotification({
            type: 'backing_up',
            session: activeSession,
            driveName: activeSession.driveName,
          });
        } else if (['completed', 'completed_with_errors'].includes(activeSession.status)) {
          setTrayNotification((prev) =>
            prev?.type === 'backing_up'
              ? { type: 'complete', session: activeSession, driveName: activeSession.driveName }
              : prev
          );
        } else if (['failed', 'interrupted', 'stopped_insufficient_space'].includes(activeSession.status)) {
          setTrayNotification((prev) =>
            prev?.type === 'backing_up'
              ? {
                  type: 'error',
                  title: activeSession.status === 'interrupted' ? 'Backup Interrupted' : 'Backup Failed',
                  message: activeSession.errors?.[0]?.error || 'Backup could not be completed.',
                  session: activeSession,
                }
              : prev
          );
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
      setSettingsLoaded(true);
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => refreshAll(retries - 1), 600);
      } else {
        console.error('Error fetching initial data:', err);
      }
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    // First-launch welcome experience: show onboarding wizard once to configure backup preferences
    const hasSeenWelcome = localStorage.getItem('dero_vault_welcome_shown');
    if (!hasSeenWelcome) {
      setIsWelcomeOpen(true);
    }
  }, [settingsLoaded]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    if ((window as any).electronAPI) {
      console.log(`[App] [${new Date().toISOString()}] Electron environment active. Preload ping: ${(window as any).electronAPI.ping?.()}`);
    }

    const handleOpenRegistration = (driveData: any) => {
      console.log(`[App] [${new Date().toISOString()}] handleOpenRegistration invoked for:`, driveData ? driveData.driveLetter : 'null');
      setIsMinimizedToTray(false);
      setIsWelcomeOpen(false); // Ensure welcome modal never covers registration modal
      if (driveData) {
        const fullDrive: RemovableDrive = {
          id: driveData.id || driveData.stableHardwareId || `USB-HW-${(driveData.driveLetter || 'E').replace(/[^a-zA-Z]/g, '')}`,
          stableHardwareId: driveData.stableHardwareId || `USB-HW-${(driveData.driveLetter || 'E').replace(/[^a-zA-Z]/g, '')}`,
          volumeSerial: driveData.volumeSerial || '',
          volumeLabel: driveData.volumeLabel || 'Removable Disk',
          friendlyName: driveData.friendlyName || driveData.volumeLabel || 'USB Drive',
          driveLetter: driveData.driveLetter || 'E:',
          mountPath: driveData.mountPath || (driveData.driveLetter ? (driveData.driveLetter.endsWith('\\') ? driveData.driveLetter : `${driveData.driveLetter}\\`) : 'E:\\'),
          totalBytes: driveData.totalBytes || driveData.totalSizeBytes || 0,
          freeBytes: driveData.freeBytes || driveData.freeSpaceBytes || 0,
          fileSystem: driveData.fileSystem || 'FAT32',
          deviceModel: driveData.deviceModel || 'USB Storage',
          isRemovable: true,
          isRegistered: false,
          isConnected: true,
          isSystemDrive: false,
        };

        console.log(`[App] [${new Date().toISOString()}] Activating DriveRegistrationModal for drive: ${fullDrive.driveLetter} (${fullDrive.stableHardwareId})`);
        setUnregisteredModalDrive(null);
        setRegisterModalDrive(fullDrive);
      }
    };

    // Listen for native Electron "app:expand" (e.g. from system tray double-click or Open menu)
    if ((window as any).electronAPI?.onExpand) {
      const cleanupExpand = (window as any).electronAPI.onExpand(() => {
        setIsMinimizedToTray(false);
        refreshAll();
      });
      cleanups.push(cleanupExpand);
    }

    const handleFocus = () => {
      refreshAll();
    };
    window.addEventListener('focus', handleFocus);
    cleanups.push(() => window.removeEventListener('focus', handleFocus));

    // Listen for native Electron "drive:open-registration" (from notification click or tray click)
    if ((window as any).electronAPI?.onOpenRegistration) {
      const cleanupReg = (window as any).electronAPI.onOpenRegistration((drive: any) => {
        handleOpenRegistration(drive);
      });
      cleanups.push(cleanupReg);
    }

    // Check for pending registration drive that arrived before or during mount
    if ((window as any).electronAPI?.getPendingRegistrationDrive) {
      (window as any).electronAPI.getPendingRegistrationDrive().then((pendingDrive: any) => {
        if (pendingDrive) {
          console.log('[App] Consuming initial pendingRegistrationDrive:', pendingDrive);
          handleOpenRegistration(pendingDrive);
        }
      }).catch((err: any) => {
        console.warn('[App] Error querying getPendingRegistrationDrive:', err);
      });
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
          // Priority 3 B:
          // If main application is visible, display in-app notification / modal automatically
          // If main application is hidden or minimised, use system tray notification
          const isWindowVisible = typeof document !== 'undefined' && !document.hidden && !isMinimizedToTray;
          if (isWindowVisible) {
            setUnregisteredModalDrive(drive);
          } else {
            setTrayNotification({ type: 'unregistered', drive });
            if ((window as any).electronAPI?.showNotification) {
              (window as any).electronAPI.showNotification({
                title: 'Dero Vault',
                content: `New removable storage: ${drive.volumeLabel || 'Disk'} (${drive.driveLetter}). Click to configure.`,
              });
            }
          }
        }
      },
      onUnregisteredDetected: (drive) => {
        const isWindowVisible = typeof document !== 'undefined' && !document.hidden && !isMinimizedToTray;
        if (isWindowVisible) {
          setUnregisteredModalDrive(drive);
        } else {
          setTrayNotification({ type: 'unregistered', drive });
        }
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
        if (['completed', 'completed_with_errors'].includes(session.status)) {
          setTrayNotification({
            type: 'complete',
            session,
            driveName: session.driveName,
          });
          ApiClient.getHistory().then((h) => setHistory(h || []));
        } else if (session.status === 'stopped_insufficient_space') {
          const req = session.capacityAssessment?.formattedRequired || 'more space';
          const avail = session.capacityAssessment?.formattedAvailable || 'available space';
          setTrayNotification({
            type: 'error',
            title: 'Destination Capacity Insufficient',
            message: `Backup stopped safely: Required ${req}, available ${avail}. Zero files transferred.`,
            session,
          });
          ApiClient.getHistory().then((h) => setHistory(h || []));
        } else if (['failed', 'interrupted', 'incomplete'].includes(session.status)) {
          setTrayNotification({
            type: 'error',
            title: session.status === 'interrupted' ? 'Backup Interrupted' : 'Backup Failed',
            message: session.errors?.[0]?.error || 'Backup could not be completed.',
            session,
          });
          ApiClient.getHistory().then((h) => setHistory(h || []));
        } else {
          setTrayNotification((prev) =>
            prev?.type === 'backing_up' ? { ...prev, session } : { type: 'backing_up', session, driveName: session.driveName }
          );
        }
      },
      onBackupComplete: (session) => {
        setCurrentSession(session);
        ApiClient.getHistory().then(setHistory);

        if (session.status === 'completed') {
          setTrayNotification({
            type: 'complete',
            session,
            driveName: session.driveName,
          });
          if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
          autoDismissTimerRef.current = setTimeout(() => {
            setTrayNotification((prev) => (prev?.type === 'complete' ? null : prev));
          }, 10000);
        } else if (session.status === 'completed_with_errors') {
          setTrayNotification({
            type: 'complete',
            session,
            driveName: session.driveName,
          });
        } else if (session.status === 'stopped_insufficient_space') {
          const req = session.capacityAssessment?.formattedRequired || 'more space';
          const avail = session.capacityAssessment?.formattedAvailable || 'available space';
          setTrayNotification({
            type: 'error',
            title: 'Destination Capacity Insufficient',
            message: `Backup stopped safely: Required ${req}, available ${avail}. Zero files transferred.`,
            session,
          });
        } else if (session.status === 'interrupted') {
          setTrayNotification({
            type: 'error',
            title: 'Backup Interrupted',
            message: 'External drive was disconnected before backup finished.',
            session,
          });
        } else {
          setTrayNotification({
            type: 'error',
            title: 'Backup Failed',
            message: session.errors?.[0]?.error || 'Backup could not be completed.',
            session,
          });
        }
      },
      onRecoveryDetected: (drive) => {
        setTrayNotification({
          type: 'info',
          title: '🌾 Dero Vault Backup Detected',
          message: `Drive [${drive.driveLetter}] contains a recoverable backup. You can restore your files on this computer.`,
        });
      },
      onSettingsUpdated: (updated) => {
        setSettings(updated);
      },
      onReminderDue: (notif) => {
        setReminderStatus((prev) =>
          prev ? { ...prev, isDue: true, activeReminderNotification: notif } : null
        );
        ApiClient.getReminderStatus().then(setReminderStatus).catch(() => {});
      },
      onReminderStatus: (status) => {
        setReminderStatus(status);
      },
    });

    if (window.location.hash === '#rescue') {
      setCurrentTab('rescue');
    }
    const handleHash = () => {
      if (window.location.hash === '#rescue') {
        setCurrentTab('rescue');
      }
    };
    window.addEventListener('hashchange', handleHash);
    cleanups.push(() => window.removeEventListener('hashchange', handleHash));

    return () => {
      cleanups.forEach((c) => {
        try { c(); } catch {}
      });
      unsubscribe();
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    };

  }, []);

  // Authoritative background reconciliation: Poll active backup session while running
  useEffect(() => {
    const isRunning =
      currentSession !== null &&
      ['scanning', 'comparing', 'copying', 'verifying'].includes(currentSession.status);
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const { session: serverSession, isRunning: stillRunning } = await ApiClient.getCurrentBackup();
        if (serverSession) {
          setCurrentSession(serverSession);
          if (stillRunning) {
            setTrayNotification((prev) =>
              prev?.type === 'backing_up' ? { ...prev, session: serverSession } : prev
            );
          } else if (['completed', 'completed_with_errors'].includes(serverSession.status)) {
            setTrayNotification({
              type: 'complete',
              session: serverSession,
              driveName: serverSession.driveName,
            });
            ApiClient.getHistory().then(setHistory);
          } else if (['failed', 'interrupted', 'stopped_insufficient_space'].includes(serverSession.status)) {
            setTrayNotification({
              type: 'error',
              title: serverSession.status === 'interrupted' ? 'Backup Interrupted' : 'Backup Failed',
              message: serverSession.errors?.[0]?.error || 'The backup could not be completed.',
              session: serverSession,
            });
            ApiClient.getHistory().then(setHistory);
          }
        }
      } catch (err) {
        console.warn('[App] Active backup poll error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSession?.status]);

  // Tab switch synchronization (especially for History tab)
  useEffect(() => {
    if (currentTab === 'history') {
      ApiClient.getHistory().then(setHistory).catch((err) => {
        console.warn('[App] Failed to load history on tab switch:', err);
      });
    }
  }, [currentTab]);

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
      if ((window as any).electronAPI?.clearPendingRegistrationDrive) {
        (window as any).electronAPI.clearPendingRegistrationDrive();
      }
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
      if ((window as any).electronAPI?.clearPendingRegistrationDrive) {
        (window as any).electronAPI.clearPendingRegistrationDrive();
      }
      setRegisterModalDrive(null);
      setUnregisteredModalDrive(null);
      await refreshAll();
      handleStartManualBackup(data.stableHardwareId);
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Registration Failed',
        message: err.message || 'Could not register drive.',
      });
    }
  };

  const handleUpdateRegisteredDrive = async (stableId: string, partial: Partial<RemovableDrive>) => {
    try {
      await ApiClient.updateDrive(stableId, { friendlyName: partial.friendlyName });
      refreshAll();
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Could not update drive.',
      });
    }
  };

  const handleUnregisterDrive = async (stableId: string) => {
    try {
      await ApiClient.unregisterDrive(stableId);
      refreshAll();
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Unregister Failed',
        message: err.message || 'Could not unregister drive.',
      });
    }
  };

  const handleUpdateProfile = async (driveStableId: string, updates: Partial<BackupProfile>) => {
    try {
      await ApiClient.updateDrive(driveStableId, updates);
      refreshAll();
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Profile Update Failed',
        message: err.message || 'Could not update profile.',
      });
    }
  };

  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    try {
      const updated = await ApiClient.updateSettings(updates);
      setSettings(updated);
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Settings Update Failed',
        message: err.message || 'Could not update settings.',
      });
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Clear local backup history? This does not delete any files.')) {
      await ApiClient.clearHistory();
      setHistory([]);
    }
  };

  const handleUpdateReminderSettings = async (updates: Partial<BackupReminderSettings>) => {
    try {
      const updated = await ApiClient.updateReminderSettings(updates);
      setReminderStatus(updated);
    } catch (err: any) {
      setTrayNotification({
        type: 'error',
        title: 'Reminder Settings Failed',
        message: err.message || 'Could not update reminder settings.',
      });
    }
  };

  const handleSnoozeReminder = async (minutes: number) => {
    try {
      const updated = await ApiClient.snoozeReminder(minutes);
      setReminderStatus(updated);
      setTrayNotification({
        type: 'info',
        title: 'Reminder Snoozed',
        message: `Postponed for ${minutes >= 60 ? `${Math.round(minutes / 60)} hour(s)` : `${minutes} minutes`}.`,
      });
    } catch (err: any) {
      console.error('Failed to snooze reminder:', err);
    }
  };

  const handleClearSnooze = async () => {
    try {
      const updated = await ApiClient.clearReminderSnooze();
      setReminderStatus(updated);
    } catch (err: any) {
      console.error('Failed to clear snooze:', err);
    }
  };

  const handleDismissReminder = async () => {
    try {
      const updated = await ApiClient.dismissReminder();
      setReminderStatus(updated);
    } catch (err: any) {
      console.error('Failed to dismiss reminder:', err);
    }
  };

  const handleTriggerTestReminder = async () => {
    try {
      const updated = await ApiClient.triggerTestReminder();
      setReminderStatus(updated);
    } catch (err: any) {
      console.error('Failed to trigger test reminder:', err);
    }
  };

  const isBackingUp =
    currentSession !== null &&
    ['scanning', 'checking_capacity', 'comparing', 'copying', 'verifying'].includes(currentSession.status);

  return (
    <div className="min-h-screen bg-[#0A142E] text-slate-100 flex flex-col font-['Inter',sans-serif] selection:bg-[#F4A62A] selection:text-[#0D1B3D]">
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
        onOpenDownloadModal={() => setIsDownloadOpen(true)}
      />

      {/* Main Application Window (Expanded Secondary View) */}
      {!isMinimizedToTray ? (
        <div className="flex-1 flex flex-col">
          {/* Top Bar Navigation */}
          <Navbar
            currentTab={currentTab}
            onTabChange={setCurrentTab}
            registeredCount={registeredDrives.length}
            onOpenDownloadModal={() => setIsDownloadOpen(true)}
          />

          {/* Tab Views */}
          <main className="flex-1 overflow-y-auto">
            {/* Prominent In-App Reminder Banner (when reminder is due/active) */}
            {reminderStatus?.activeReminderNotification && (
              <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5">
                <ReminderBanner
                  notification={reminderStatus.activeReminderNotification}
                  connectedRegisteredDrive={activeDrives.find((d) => d.isConnected && d.isRegistered) || null}
                  onStartBackup={() => {
                    const regDrive = activeDrives.find((d) => d.isConnected && d.isRegistered);
                    if (regDrive) {
                      handleStartManualBackup(regDrive.stableHardwareId);
                    } else {
                      setCurrentTab('dashboard');
                    }
                  }}
                  onNavigateToDashboard={() => setCurrentTab('dashboard')}
                  onSnooze={handleSnoozeReminder}
                  onDismiss={handleDismissReminder}
                />
              </div>
            )}

            {currentTab === 'dashboard' && (
              <Dashboard
                currentSession={currentSession}
                activeDrives={activeDrives}
                registeredDrives={registeredDrives}
                backupProfiles={backupProfiles}
                history={history}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onStartManualBackup={handleStartManualBackup}
                onCancelBackup={handleCancelBackup}
                onViewReport={(session) => setSelectedReportSession(session)}
                onOpenRegisterModal={(drive) => setRegisterModalDrive(drive)}
                onNavigateTab={(tab) => setCurrentTab(tab)}
                onOpenDownloadModal={() => setIsDownloadOpen(true)}
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
                isBackingUp={isBackingUp}
                currentBackupMode={currentSession?.mode || (settings.turboBackup ? 'turbo' : 'standard')}
                reminderStatus={reminderStatus}
                onUpdateReminderSettings={handleUpdateReminderSettings}
                onSnoozeReminder={handleSnoozeReminder}
                onClearSnooze={handleClearSnooze}
                onTriggerTestReminder={handleTriggerTestReminder}
                onOpenWelcomeModal={() => setIsWelcomeOpen(true)}
              />
            )}

            {currentTab === 'rescue' && (
              <RescueView
                activeDrives={activeDrives}
                onNavigateTab={(tab) => setCurrentTab(tab)}
                onRefreshDrives={refreshAll}
              />
            )}

            {currentTab === 'help' && (
              <HelpCentreView onNavigateTab={(tab) => setCurrentTab(tab)} />
            )}
          </main>
        </div>
      ) : (
        /* DEFAULT EXPERIENCE: Quiet Background Office Assistant with Brand Identity */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 max-w-xl mx-auto relative overflow-hidden">
          {/* Ambient background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#F4A62A]/5 rounded-full blur-3xl pointer-events-none" />

          {/* Official Granary Emblem with Status Dot */}
          <div className="relative group">
            <div className="p-4 rounded-3xl bg-[#0D1B3D] border border-[#1E3466] shadow-2xl shadow-[#0D1B3D]/80">
              <DeroGranaryEmblem size={100} showGlow={true} />
            </div>
            <span
              className={`absolute top-2 right-2 w-3.5 h-3.5 rounded-full border-2 border-[#0D1B3D] ${
                isBackingUp ? 'bg-[#F4A62A] animate-pulse' : 'bg-[#00A884]'
              }`}
            />
          </div>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0D1B3D] border border-[#1E3466] text-xs text-[#00A884] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse" />
              <span>Quiet Digital Granary · Monitoring in System Tray</span>
            </div>

            <div className="flex flex-col items-center">
              <DeroWordmark variant="dark" size="lg" showTagline={true} />
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                <span>A product of</span>
                <EnenDigitalLabsLogo size="sm" showText={true} showTagline={false} />
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto pt-1 font-['Inter',sans-serif]">
              Plug in your registered USB drive at any time. Dero Vault automatically backs up your office files without interrupting your work.
            </p>
          </div>

          {/* Live Status Indicators with Brand Palette */}
          <div className="w-full grid grid-cols-2 gap-3 max-w-md text-xs">
            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-3.5 text-left space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-['Poppins',sans-serif]">
                Protected Storage
              </span>
              <div className="flex items-center gap-2 text-white font-medium">
                <HardDrive className="w-4 h-4 text-[#F4A62A]" />
                <span>
                  {registeredDrives.length} registered drive
                  {registeredDrives.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-3.5 text-left space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-['Poppins',sans-serif]">
                Auto-Backup Mode
              </span>
              <div className="flex items-center gap-2 text-white font-medium">
                <CheckCircle2 className="w-4 h-4 text-[#00A884]" />
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
              className="px-6 py-2.5 text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-xl transition-all shadow-md shadow-[#F4A62A]/20 flex items-center gap-2 font-['Poppins',sans-serif]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Open Dero Vault Dashboard</span>
            </button>

            {typeof window !== 'undefined' && !(window as any).electronAPI?.isElectron && (
              <button
                onClick={() => setIsDownloadOpen(true)}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] hover:border-[#F4A62A] rounded-xl transition-all flex items-center gap-2 font-['Poppins',sans-serif]"
              >
                <Download className="w-3.5 h-3.5 text-[#F4A62A]" />
                <span>Download Desktop App (.exe)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* COMPACT TRAY NOTIFICATION (Smadav-style unobtrusive pop-up) */}
      <CompactTrayNotification
        notification={trayNotification}
        onDismiss={() => setTrayNotification(null)}
        onOpenFullApp={() => {
          setIsMinimizedToTray(false);
          if (trayNotification?.type === 'unregistered' && trayNotification.drive) {
            setRegisterModalDrive(trayNotification.drive);
          }
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
        onOpenRescue={(_drive) => {
          setUnregisteredModalDrive(null);
          setIsMinimizedToTray(false);
          setCurrentTab('rescue');
        }}
        onIgnore={() => {
          if (unregisteredModalDrive && (window as any).electronAPI?.dismissRegistration) {
            (window as any).electronAPI.dismissRegistration(unregisteredModalDrive.stableHardwareId);
          }
          setUnregisteredModalDrive(null);
        }}
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

      {/* Modal 4: First Launch Experience Welcome & Setup Wizard */}
      <WelcomeModal
        isOpen={isWelcomeOpen}
        onGetStarted={() => {
          localStorage.setItem('dero_vault_welcome_shown', 'true');
          setIsWelcomeOpen(false);
        }}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onUpdateReminderSettings={handleUpdateReminderSettings}
      />

      {/* Modal 5: Download Installable Software Modal */}
      <DownloadModal
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />
    </div>
  );
}
