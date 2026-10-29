/**
 * Dero Vault — Compact System Tray Operational Interface
 * Requirement 3 & 5: State-aware compact workflow operating independently of main window visibility.
 * Supports all 7 required tray states (A through G) with real-time authoritative backend progress.
 */

import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  FileText,
  X,
  Maximize2,
  Folder,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Pause,
} from 'lucide-react';
import { ApiClient } from '../services/api';
import { BackupProfile, BackupSession, RemovableDrive } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';

export const TrayPopoverApp: React.FC = () => {
  const [activeDrives, setActiveDrives] = useState<RemovableDrive[]>([]);
  const [registeredDrives, setRegisteredDrives] = useState<RemovableDrive[]>([]);
  const [currentSession, setCurrentSession] = useState<BackupSession | null>(null);
  const [history, setHistory] = useState<BackupSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Format helpers
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 KB/s';
    if (bytesPerSec < 1024 * 1024) {
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const refreshState = async () => {
    try {
      const [driveData, backupData, historyData] = await Promise.all([
        ApiClient.getDrives(),
        ApiClient.getCurrentBackup(),
        ApiClient.getHistory(),
      ]);
      setActiveDrives(driveData.drives || []);
      setRegisteredDrives(driveData.registered || []);
      if (backupData.session) {
        setCurrentSession(backupData.session);
      }
      setHistory(historyData || []);
    } catch (err) {
      console.warn('[TrayPopover] Refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshState();

    // Subscribe to SSE / IPC events
    const unsubscribe = ApiClient.subscribeToEvents({
      onConnected: () => refreshState(),
      onDisconnected: () => refreshState(),
      onUnregisteredDetected: () => refreshState(),
      onDriveRegistered: () => refreshState(),
      onBackupStart: (session) => setCurrentSession(session),
      onBackupUpdate: (session) => setCurrentSession(session),
      onBackupComplete: (session) => {
        setCurrentSession(session);
        ApiClient.getHistory().then(setHistory);
      },
    });

    // Authoritative background reconciliation loop: 1000ms polling while active
    const interval = setInterval(async () => {
      try {
        const { session } = await ApiClient.getCurrentBackup();
        if (session) {
          setCurrentSession(session);
          if (['completed', 'completed_with_errors'].includes(session.status)) {
            ApiClient.getHistory().then(setHistory);
          }
        }
      } catch {}
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const connectedRegistered = activeDrives.filter((d) => d.isConnected && d.isRegistered);
  const connectedUnregistered = activeDrives.filter((d) => d.isConnected && !d.isRegistered);

  const isBackingUp = Boolean(
    currentSession &&
      ['scanning', 'checking_capacity', 'comparing', 'copying', 'verifying'].includes(currentSession.status)
  );

  // Latest completed or finished session
  const latestFinishedSession: BackupSession | null =
    currentSession && ['completed', 'completed_with_errors', 'failed', 'interrupted', 'stopped_insufficient_space'].includes(currentSession.status)
      ? currentSession
      : history && history.length > 0
      ? history[0]
      : null;

  // Actions
  const handleOpenFullApp = () => {
    if ((window as any).electronAPI?.expandWindow) {
      (window as any).electronAPI.expandWindow();
    }
    if ((window as any).electronAPI?.closeTrayPopover) {
      (window as any).electronAPI.closeTrayPopover();
    }
  };

  const handleConfigureDrive = (drive: RemovableDrive) => {
    if ((window as any).electronAPI?.expandWindow) {
      (window as any).electronAPI.expandWindow();
    }
    // Forward drive registration target
    if ((window as any).electronAPI?.onOpenRegistration) {
      window.dispatchEvent(new CustomEvent('dero:open-registration', { detail: drive }));
    }
    if ((window as any).electronAPI?.closeTrayPopover) {
      (window as any).electronAPI.closeTrayPopover();
    }
  };

  const handleStartBackup = async (stableId?: string) => {
    try {
      const res = await ApiClient.startBackup(stableId);
      if (res.session) {
        setCurrentSession(res.session);
      }
    } catch (err: any) {
      console.error('[TrayPopover] Start backup failed:', err);
    }
  };

  const handleCancelBackup = async () => {
    try {
      await ApiClient.cancelBackup();
      refreshState();
    } catch (err) {
      console.error('[TrayPopover] Cancel backup failed:', err);
    }
  };

  // Progress metrics calculation
  const totalPlanned =
    currentSession && (currentSession.newFilesCount + currentSession.modifiedFilesCount) > 0
      ? currentSession.newFilesCount + currentSession.modifiedFilesCount
      : currentSession && currentSession.filesScanned > 0
      ? currentSession.filesScanned
      : 0;

  const progressPercent = currentSession
    ? currentSession.bytesTotal > 0
      ? Math.round((currentSession.bytesTransferred / currentSession.bytesTotal) * 100)
      : totalPlanned > 0
      ? Math.round((currentSession.filesCopied / totalPlanned) * 100)
      : 0
    : 0;

  return (
    <div className="w-[380px] min-h-[460px] max-h-[480px] bg-[#0A142E] text-slate-100 flex flex-col justify-between font-['Inter',sans-serif] select-none border border-[#1E3466] rounded-2xl shadow-2xl overflow-hidden p-4">
      {/* 1. COMPACT TRAY HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1E3466]">
        <div className="flex items-center gap-2.5">
          <DeroGranaryEmblem size={26} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-['Poppins',sans-serif] font-black text-xs text-white tracking-tight">
                DERO VAULT
              </h3>
              <span className="text-[9px] font-bold text-[#F4A62A] tracking-[0.2em]">
                — TRAY —
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Your digital granary</p>
          </div>
        </div>

        <button
          onClick={() => {
            if ((window as any).electronAPI?.closeTrayPopover) {
              (window as any).electronAPI.closeTrayPopover();
            }
          }}
          className="p-1 text-slate-400 hover:text-white hover:bg-[#162852] rounded transition-colors"
          title="Close Popover"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. DYNAMIC WORKFLOW BODY (States A through G) */}
      <div className="flex-1 py-3 space-y-3 overflow-y-auto">
        {/* STATE D: BACKUP CURRENTLY RUNNING */}
        {isBackingUp && currentSession ? (
          <div className="space-y-3 bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#F4A62A]">
                <span className="w-2 h-2 rounded-full bg-[#F4A62A] animate-pulse" />
                <span>
                  {currentSession.status === 'scanning'
                    ? 'Scanning folders…'
                    : currentSession.status === 'checking_capacity'
                    ? 'Checking drive capacity…'
                    : currentSession.status === 'comparing'
                    ? 'Comparing files…'
                    : currentSession.status === 'verifying'
                    ? 'Verifying integrity…'
                    : 'Backing up office files…'}
                </span>
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {progressPercent}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-[#081126] overflow-hidden border border-[#1E3466]">
              <div
                className="h-full bg-gradient-to-r from-[#F4A62A] to-[#FBBF24] transition-all duration-300"
                style={{
                  width:
                    currentSession.status === 'scanning' || currentSession.status === 'comparing'
                      ? '12%'
                      : currentSession.status === 'verifying'
                      ? '98%'
                      : `${Math.min(100, Math.max(3, progressPercent))}%`,
                }}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-300 font-mono">
              <span>
                {currentSession.status === 'scanning'
                  ? `${currentSession.filesScanned} files scanned`
                  : `${currentSession.filesCopied} / ${Math.max(currentSession.filesCopied, totalPlanned)} files`}
              </span>
              <span>
                {formatBytes(currentSession.bytesTransferred)} / {formatBytes(currentSession.bytesTotal)}
              </span>
            </div>

            <div className="text-[10px] text-slate-400 font-mono truncate bg-[#081126] px-2 py-1 rounded border border-[#1E3466]/40">
              {currentSession.currentFile || 'Reading directory structure...'}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-400">
                Speed: {formatSpeed(currentSession.currentSpeedBps)}
              </span>
              <button
                onClick={handleCancelBackup}
                className="px-2.5 py-1 text-[10px] font-medium text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : latestFinishedSession && latestFinishedSession.status === 'interrupted' ? (
          /* STATE G: DRIVE DISCONNECTED DURING BACKUP */
          <div className="bg-[#0D1B3D] border border-rose-900/60 rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-rose-400 font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Backup Interrupted</span>
            </div>
            <p className="text-[11px] text-slate-300">
              The external drive was unplugged before copying was complete. Dero Vault preserved existing files cleanly. Reconnect drive to resume.
            </p>
          </div>
        ) : latestFinishedSession && ['failed', 'stopped_insufficient_space'].includes(latestFinishedSession.status) ? (
          /* STATE F: BACKUP FAILED */
          <div className="bg-[#0D1B3D] border border-rose-900/60 rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-rose-400 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {latestFinishedSession.status === 'stopped_insufficient_space'
                  ? 'Insufficient Free Storage'
                  : 'Backup Failed'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {latestFinishedSession.errors?.[0]?.error || 'Storage error occurred during operation.'}
            </p>
            {connectedRegistered.length > 0 && (
              <button
                onClick={() => handleStartBackup(connectedRegistered[0].stableHardwareId)}
                className="w-full py-1.5 px-3 bg-[#162852] hover:bg-[#1E3466] text-[#F4A62A] rounded font-semibold text-[11px] transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3 h-3" />
                <span>Retry Backup</span>
              </button>
            )}
          </div>
        ) : latestFinishedSession && ['incomplete', 'completed_with_errors'].includes(latestFinishedSession.status) && !connectedUnregistered.length ? (
          /* STATE E-1: BACKUP INCOMPLETE / WARNINGS */
          <div className="bg-[#0D1B3D] border border-amber-500/40 rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Backup Incomplete (Integrity Warnings)</span>
            </div>
            <p className="text-[11px] text-slate-300">
              {latestFinishedSession.errors?.length || latestFinishedSession.filesFailed || 1} file(s) failed or could not be verified. Some expected files may be missing.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#081126] p-2 rounded border border-[#1E3466]">
              <div>
                <span className="text-slate-400 block text-[10px]">Verified Files</span>
                <span className="font-bold text-amber-300 font-mono">{latestFinishedSession.filesCopied} files</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Failed / Unverified</span>
                <span className="font-bold text-rose-400 font-mono">{latestFinishedSession.filesFailed} files</span>
              </div>
            </div>
            <div className="pt-1">
              <button
                onClick={handleOpenFullApp}
                className="w-full py-1.5 px-3 bg-[#162852] hover:bg-[#1E3466] text-[#F4A62A] rounded font-semibold text-[11px] transition-colors"
              >
                Review Report in Dero Vault
              </button>
            </div>
          </div>
        ) : latestFinishedSession && latestFinishedSession.status === 'completed' && latestFinishedSession.isVerified && !connectedUnregistered.length ? (
          /* STATE E-2: TRULY VERIFIED BACKUP COMPLETED */
          <div className="bg-[#0D1B3D] border border-[#00A884]/40 rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-[#00A884] font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>✓ Today&apos;s work is safely backed up</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#081126] p-2 rounded border border-[#1E3466]">
              <div>
                <span className="text-slate-400 block text-[10px]">Files Copied</span>
                <span className="font-bold text-white font-mono">{latestFinishedSession.filesCopied} files</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Transferred</span>
                <span className="font-bold text-[#00A884] font-mono">{formatBytes(latestFinishedSession.bytesTransferred)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
              <span>SHA-256 Verified ✓</span>
              <span>{latestFinishedSession.driveName} ({latestFinishedSession.driveLetter})</span>
            </div>
          </div>
        ) : connectedUnregistered.length > 0 ? (
          /* STATE B: UNREGISTERED DRIVE CONNECTED */
          <div className="bg-[#0D1B3D] border border-[#F4A62A]/40 rounded-xl p-3.5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#F4A62A]" />
                <div>
                  <h4 className="text-xs font-bold text-white">New USB Storage ({connectedUnregistered[0].driveLetter})</h4>
                  <p className="text-[10px] text-slate-400">{connectedUnregistered[0].volumeLabel || 'Removable Disk'}</p>
                </div>
              </div>
              <span className="text-[9px] font-bold text-[#F4A62A] bg-[#F4A62A]/10 border border-[#F4A62A]/30 px-2 py-0.5 rounded-full">
                Unregistered
              </span>
            </div>

            <p className="text-[11px] text-slate-300">
              Set up folder protection for this drive to begin automatic offline backups.
            </p>

            <button
              onClick={() => handleConfigureDrive(connectedUnregistered[0])}
              className="w-full py-2 bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm font-['Poppins',sans-serif]"
            >
              <span>Configure Drive</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : connectedRegistered.length > 0 ? (
          /* STATE C: REGISTERED DRIVE CONNECTED AND IDLE */
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-3.5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#F4A62A]" />
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {connectedRegistered[0].friendlyName || connectedRegistered[0].volumeLabel}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Drive [{connectedRegistered[0].driveLetter}] · {formatBytes(connectedRegistered[0].freeBytes)} free
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-bold text-[#00A884] bg-[#00A884]/10 border border-[#00A884]/30 px-2 py-0.5 rounded-full">
                Protected
              </span>
            </div>

            <div className="text-[11px] text-slate-300">
              {connectedRegistered[0].lastBackupAt
                ? `Last backup: ${new Date(connectedRegistered[0].lastBackupAt).toLocaleDateString()}`
                : 'Digital granary ready for backup'}
            </div>

            <button
              onClick={() => handleStartBackup(connectedRegistered[0].stableHardwareId)}
              className="w-full py-2 bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm font-['Poppins',sans-serif]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Back Up Now</span>
            </button>
          </div>
        ) : (
          /* STATE A: NO REMOVABLE DRIVE CONNECTED */
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-4 text-center space-y-2">
            <div className="w-8 h-8 rounded-full bg-[#162852] text-slate-400 flex items-center justify-center mx-auto">
              <HardDrive className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-white">No Backup Drive Connected</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Plug in an external drive or USB stick at any time. Dero Vault will recognize it and back up automatically.
            </p>
            <div className="pt-1 flex items-center justify-center gap-1.5 text-[10px] text-[#00A884]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse" />
              <span>Monitoring USB ports</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. MANDATORY PROMINENT EXPAND / OPEN DERO VAULT BUTTON */}
      <div className="pt-2 border-t border-[#1E3466]">
        <button
          onClick={handleOpenFullApp}
          className="w-full py-2.5 px-4 bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] hover:border-[#F4A62A] text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 font-['Poppins',sans-serif] shadow-sm"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#F4A62A]" />
          <span>Open Dero Vault</span>
        </button>
      </div>
    </div>
  );
};
