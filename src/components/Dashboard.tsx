/**
 * Dero Vault — Single-Screen Operational Dashboard
 * Compact, zero-scroll desktop control centre.
 * Everything important fits immediately on one screen at standard desktop resolutions (1200x800 & 960x640).
 */

import React from 'react';
import {
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  FileText,
  Folder,
  ArrowRight,
  ShieldAlert,
  History,
  Settings as SettingsIcon,
  FolderSync,
  XCircle,
  ExternalLink,
  Zap,
  Shield,
} from 'lucide-react';
import { AppSettings, BackupProfile, BackupSession, RemovableDrive } from '../types';
import { DeroGranaryEmblem, DeroWordmark, EnenDigitalLabsLogo } from './BrandLogo';

interface DashboardProps {
  currentSession: BackupSession | null;
  activeDrives: RemovableDrive[];
  registeredDrives: RemovableDrive[];
  backupProfiles?: BackupProfile[];
  history?: BackupSession[];
  settings?: AppSettings;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
  onStartManualBackup: (stableHardwareId?: string) => void;
  onCancelBackup: () => void;
  onViewReport: (session: BackupSession) => void;
  onOpenRegisterModal: (drive: RemovableDrive) => void;
  onNavigateTab?: (tab: 'dashboard' | 'drives' | 'profiles' | 'history' | 'settings') => void;
  onOpenDownloadModal?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentSession,
  activeDrives,
  registeredDrives,
  backupProfiles = [],
  history = [],
  settings,
  onUpdateSettings,
  onStartManualBackup,
  onCancelBackup,
  onViewReport,
  onOpenRegisterModal,
  onNavigateTab,
}) => {
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

  const formatEta = (seconds: number) => {
    if (!seconds || seconds <= 0) return 'Calculating...';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const isBackingUp = Boolean(
    currentSession &&
      ['scanning', 'comparing', 'copying', 'verifying'].includes(currentSession.status)
  );

  // Connected registered and unregistered drives
  const connectedRegistered = activeDrives.filter((d) => d.isConnected && d.isRegistered);
  const connectedUnregistered = activeDrives.filter((d) => d.isConnected && !d.isRegistered);
  const primaryDrive = connectedRegistered[0] || connectedUnregistered[0] || null;

  // Active profile for connected registered drive
  const activeProfile = primaryDrive
    ? backupProfiles.find((p) => p.driveStableId === primaryDrive.stableHardwareId)
    : null;

  // Determine latest completed/recent session (from currentSession or history[0])
  const latestSession: BackupSession | null =
    currentSession && ['completed', 'completed_with_errors', 'failed', 'interrupted', 'stopped_insufficient_space'].includes(currentSession.status)
      ? currentSession
      : history && history.length > 0
      ? history[0]
      : null;

  // Compute live progress percentage
  let progressPercent = 0;
  if (currentSession) {
    if (currentSession.status === 'completed' || currentSession.status === 'completed_with_errors') {
      progressPercent = 100;
    } else if (currentSession.bytesTotal > 0) {
      progressPercent = Math.min(99.9, (currentSession.bytesTransferred / currentSession.bytesTotal) * 100);
    } else if (currentSession.status === 'copying') {
      const planned = (currentSession.newFilesCount + currentSession.modifiedFilesCount) || currentSession.filesScanned || 0;
      progressPercent = planned > 0 ? Math.min(99.9, (currentSession.filesCopied / planned) * 100) : 5;
    } else if (currentSession.status === 'verifying') {
      progressPercent = 99.5;
    } else if (currentSession.status === 'scanning' || currentSession.status === 'comparing') {
      progressPercent = 0;
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3">
      {/* 1. COMPACT BRAND & LIVE SYSTEM STATE HEADER */}
      <header className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <DeroGranaryEmblem size={36} className="shrink-0" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-['Poppins',sans-serif] font-black text-white text-base tracking-tight leading-none">
                DERO
              </span>
              <span className="text-[10px] font-bold text-[#F4A62A] tracking-[0.25em] leading-none">
                VAULT
              </span>
              <sup className="text-[#F4A62A] text-[9px] font-bold leading-none -ml-1">™</sup>
              <span className="text-slate-600 font-mono text-xs" aria-hidden="true">|</span>
              <span className="text-xs text-slate-300 font-medium">Your digital granary.</span>
              <span className="text-slate-600 font-mono text-xs hidden md:inline" aria-hidden="true">·</span>
              <span className="text-[11px] text-slate-400 font-['Inter',sans-serif] hidden md:inline">
                Plug in. Back up. Get on with your work.
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
              <span>A product of</span>
              <EnenDigitalLabsLogo size="sm" showText={true} showTagline={false} />
            </div>
          </div>
        </div>

        {/* Live System State & Turbo Badges */}
        <div className="flex items-center gap-2">
          {/* Turbo Mode Indicator Badge */}
          {isBackingUp && currentSession ? (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                currentSession.mode === 'turbo'
                  ? 'bg-[#F4A62A]/15 text-[#F4A62A] border-[#F4A62A]/40'
                  : 'bg-[#162852] text-slate-300 border-[#1E3466]'
              }`}
            >
              {currentSession.mode === 'turbo' ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-[#F4A62A] fill-current animate-pulse" />
                  <span className="font-bold uppercase tracking-wider text-[10px]">TURBO BACKUP ACTIVE</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-slate-300" />
                  <span className="font-semibold text-[10px]">Standard Backup Mode</span>
                </>
              )}
            </div>
          ) : settings ? (
            <button
              onClick={() => onUpdateSettings && onUpdateSettings({ turboBackup: !settings.turboBackup })}
              title="Click to toggle between Turbo Backup and Standard Backup"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                settings.turboBackup
                  ? 'bg-[#F4A62A]/15 hover:bg-[#F4A62A]/25 text-[#F4A62A] border-[#F4A62A]/40'
                  : 'bg-[#162852] hover:bg-[#1E3466] text-slate-300 border-[#1E3466]'
              }`}
            >
              {settings.turboBackup ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-[#F4A62A]" />
                  <span className="font-bold text-[10px]">Turbo Mode: ON</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-[10px] text-slate-400">Turbo Mode: OFF</span>
                </>
              )}
            </button>
          ) : null}

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#081126] border border-[#1E3466] text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackingUp
                  ? 'bg-[#F4A62A] animate-pulse'
                  : connectedRegistered.length > 0
                  ? 'bg-[#00A884]'
                  : 'bg-slate-400'
              }`}
            />
            <span className="font-medium text-slate-200 text-[11px]">
              {isBackingUp
                ? `${currentSession?.mode === 'turbo' ? 'Turbo' : 'Standard'} backup · ${currentSession?.driveName || ''} (${progressPercent.toFixed(0)}%)`
                : connectedRegistered.length > 0
                ? `${connectedRegistered[0].friendlyName || connectedRegistered[0].volumeLabel} (${connectedRegistered[0].driveLetter}) · Protected`
                : connectedUnregistered.length > 0
                ? `New USB (${connectedUnregistered[0].driveLetter}) · Ready to configure`
                : 'Monitoring USB · Connect drive to back up'}
            </span>
          </div>

          {/* Quick tab shortcuts */}
          {onNavigateTab && (
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-[#1E3466]">
              <button
                onClick={() => onNavigateTab('history')}
                title="View Backup History"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
              >
                <History className="w-4 h-4 text-slate-300" />
              </button>
              <button
                onClick={() => onNavigateTab('settings')}
                title="Open Settings"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
              >
                <SettingsIcon className="w-4 h-4 text-slate-300" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. PRIMARY OPERATIONAL 2-COLUMN GRID (Zero Vertical Overflow) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT COLUMN: ACTIVE WORKFLOW OR CURRENT HARDWARE TARGET (7 Cols) */}
        <section className="lg:col-span-7 space-y-3">
          {/* STATE A: ACTIVE BACKUP IN PROGRESS */}
          {isBackingUp && currentSession ? (
            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#1E3466]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F4A62A] animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#F4A62A] font-['Poppins',sans-serif]">
                    {currentSession.mode === 'turbo' ? 'Backing up in Turbo Mode' : 'Backing up in Standard Mode'}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      currentSession.mode === 'turbo'
                        ? 'bg-[#F4A62A]/20 text-[#F4A62A] border-[#F4A62A]/50'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {currentSession.mode === 'turbo' ? 'TURBO BACKUP ACTIVE' : 'Standard Backup Mode'}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-semibold text-white truncate max-w-[160px]">
                    {currentSession.driveName} ({currentSession.driveLetter})
                  </span>
                </div>
                <button
                  onClick={onCancelBackup}
                  className="px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded-lg transition-colors"
                >
                  Cancel Backup
                </button>
              </div>

              {/* Progress metrics */}
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                      {progressPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs text-slate-300 font-medium">
                      {currentSession.status === 'scanning'
                        ? `Scanning source folders (${currentSession.mode === 'turbo' ? 'Turbo' : 'Standard'} Mode)...`
                        : currentSession.status === 'comparing'
                        ? `Comparing with granary (${currentSession.mode === 'turbo' ? 'Turbo' : 'Standard'} Mode)...`
                        : currentSession.status === 'verifying'
                        ? `Verifying written integrity (${currentSession.mode === 'turbo' ? 'Turbo' : 'Standard'} Mode)...`
                        : `Copying files (${currentSession.mode === 'turbo' ? 'Turbo Mode · Bounded Parallel' : 'Standard Mode · Conservative Sequential'})...`}
                    </span>
                  </div>
                  <div className="text-right text-[11px] text-slate-300 font-mono tabular-nums">
                    <span>
                      {currentSession.filesCopied.toLocaleString()} /{' '}
                      {(currentSession.newFilesCount + currentSession.modifiedFilesCount || currentSession.filesScanned || Math.max(1, currentSession.filesCopied)).toLocaleString()} files
                    </span>
                    <span className="mx-1.5">·</span>
                    <span>
                      {formatBytes(currentSession.bytesTransferred)} / {formatBytes(currentSession.bytesTotal)}
                    </span>
                  </div>
                </div>

                {/* Golden Amber Progress Bar */}
                <div className="w-full h-2.5 bg-[#081126] rounded-full overflow-hidden p-0.5 border border-[#1E3466]">
                  <div
                    className="h-full bg-gradient-to-r from-[#F4A62A] to-[#FBBF24] rounded-full transition-all duration-300 ease-out"
                    style={{
                      width:
                        currentSession.status === 'scanning' || currentSession.status === 'comparing'
                          ? '12%'
                          : currentSession.status === 'verifying'
                          ? '98%'
                          : `${Math.max(3, progressPercent)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Live current file */}
              <div className="bg-[#081126] border border-[#1E3466] rounded-lg px-3 py-1.5 text-[11px] flex items-center justify-between gap-2">
                <span className="text-slate-400 font-medium shrink-0">Current:</span>
                <span className="text-slate-200 font-mono truncate select-all">
                  {currentSession.currentFile || 'Traversing source files...'}
                </span>
              </div>

              {/* Compact Metrics Row */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 bg-[#132247] border border-[#1E3466] rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Speed</div>
                  <div className="text-xs font-bold text-[#F4A62A] font-mono tabular-nums">
                    {formatSpeed(currentSession.currentSpeedBps)}
                  </div>
                </div>
                <div className="p-2 bg-[#132247] border border-[#1E3466] rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Time Left</div>
                  <div className="text-xs font-bold text-white font-mono tabular-nums">
                    {formatEta(currentSession.estimatedSecondsRemaining)}
                  </div>
                </div>
                <div className="p-2 bg-[#132247] border border-[#1E3466] rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Skipped / Failed</div>
                  <div className="text-xs font-bold text-slate-300 font-mono tabular-nums">
                    {currentSession.filesSkipped.toLocaleString()} / {currentSession.filesFailed.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ) : connectedRegistered.length > 0 ? (
            /* STATE B: REGISTERED DRIVE CONNECTED & READY (Operational Target) */
            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between pb-2.5 border-b border-[#1E3466]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#162852] border border-[#1E3466] text-[#F4A62A]">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold font-['Poppins',sans-serif] text-white">
                        {connectedRegistered[0].friendlyName || connectedRegistered[0].volumeLabel}
                      </h3>
                      <span className="text-xs font-semibold text-[#F4A62A]">
                        [{connectedRegistered[0].driveLetter}]
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {connectedRegistered[0].deviceModel} · {connectedRegistered[0].fileSystem || 'FAT32'}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#00A884] font-semibold px-2.5 py-0.5 rounded-full bg-[#00A884]/15 border border-[#00A884]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00A884]" />
                  Protected Storage
                </span>
              </div>

              {/* Storage Space Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300 font-mono tabular-nums">
                  <span className="text-[11px]">Granary Storage</span>
                  <span className="text-[11px]">
                    {formatBytes(connectedRegistered[0].freeBytes)} free of {formatBytes(connectedRegistered[0].totalBytes)}
                  </span>
                </div>
                <div className="w-full h-2 bg-[#081126] rounded-full overflow-hidden border border-[#1E3466]/60">
                  <div
                    className="h-full bg-gradient-to-r from-[#00A884] to-[#F4A62A] rounded-full"
                    style={{
                      width: `${Math.max(5, Math.min(100, ((connectedRegistered[0].totalBytes - connectedRegistered[0].freeBytes) / (connectedRegistered[0].totalBytes || 1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Configured Source Folders Summary */}
              <div className="p-2.5 bg-[#081126] border border-[#1E3466] rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-[#F4A62A]" />
                    <span>Protected Source Folders:</span>
                  </span>
                  {onNavigateTab && (
                    <button
                      onClick={() => onNavigateTab('profiles')}
                      className="text-[#F4A62A] hover:underline text-[10px] font-semibold"
                    >
                      Change...
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-slate-200 font-mono truncate">
                  {activeProfile?.sourceFolders?.length
                    ? activeProfile.sourceFolders.join(' · ')
                    : 'Documents & Desktop (Default Office Protection)'}
                </div>
              </div>

              {/* Primary Action Button */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {connectedRegistered[0].lastBackupAt
                    ? `Last backup: ${new Date(connectedRegistered[0].lastBackupAt).toLocaleDateString()}`
                    : 'Ready for initial backup'}
                </span>

                <button
                  disabled={isBackingUp}
                  onClick={() => onStartManualBackup(connectedRegistered[0].stableHardwareId)}
                  className="px-5 py-2 font-bold text-xs text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all shadow-md shadow-[#F4A62A]/20 flex items-center gap-2 font-['Poppins',sans-serif]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Back Up Now</span>
                </button>
              </div>
            </div>
          ) : connectedUnregistered.length > 0 ? (
            /* STATE C: UNREGISTERED USB DRIVE CONNECTED */
            <div className="bg-[#0D1B3D] border border-[#F4A62A]/40 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between pb-2.5 border-b border-[#1E3466]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#F4A62A]/15 border border-[#F4A62A]/30 text-[#F4A62A]">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-['Poppins',sans-serif] text-white">
                      New Storage Drive Detected ({connectedUnregistered[0].driveLetter})
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      {connectedUnregistered[0].volumeLabel || 'Removable Disk'} · {formatBytes(connectedUnregistered[0].freeBytes)} available
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-semibold text-[#F4A62A] bg-[#F4A62A]/10 border border-[#F4A62A]/20 px-2 py-0.5 rounded-full">
                  Unregistered
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-['Inter',sans-serif]">
                This storage device is not yet configured for automatic backups. Set up folder protection to start keeping your office files safe.
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => onOpenRegisterModal(connectedUnregistered[0])}
                  className="px-5 py-2 text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-lg transition-colors flex items-center gap-1.5 shadow-sm font-['Poppins',sans-serif]"
                >
                  <span>Configure Drive</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* STATE D: NO REMOVABLE DRIVE CONNECTED (Quiet Monitoring) */
            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-5 text-center space-y-3 relative overflow-hidden">
              <div className="flex justify-center">
                <DeroGranaryEmblem size={56} className="drop-shadow" />
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold font-['Poppins',sans-serif] text-white">
                  Waiting for External Drive or USB
                </h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto font-['Inter',sans-serif]">
                  Plug in your external drive or USB stick at any time. Dero Vault will recognize it and back up your office files without interrupting your work.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#081126] border border-[#1E3466] text-[11px] text-[#00A884]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse" />
                <span>Monitoring USB ports · Safe offline architecture</span>
              </div>
            </div>
          )}

          {/* Quick Storage Overview & One-Directional Guarantee */}
          <div className="p-3 bg-[#0A1530] border border-[#1E3466] rounded-xl flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#00A884] shrink-0" />
              <span className="text-[11px]">
                <strong className="text-white">One-directional guarantee:</strong> Source files are never modified, moved, or deleted.
              </span>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('drives')}
                className="text-[11px] text-[#F4A62A] hover:underline font-semibold shrink-0 ml-2"
              >
                {registeredDrives.length} Registered {registeredDrives.length === 1 ? 'Drive' : 'Drives'} →
              </button>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: RECENT BACKUP RESULT & VERIFICATION STATUS (5 Cols) */}
        <section className="lg:col-span-5 space-y-3">
          {latestSession ? (
            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E3466]">
                <div className="flex items-center gap-2">
                  {latestSession.status === 'completed' ? (
                    <div className="p-1 rounded bg-[#00A884]/15 border border-[#00A884]/30 text-[#00A884]">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : latestSession.status === 'completed_with_errors' ? (
                    <div className="p-1 rounded bg-[#F4A62A]/15 border border-[#F4A62A]/30 text-[#F4A62A]">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="p-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white">
                      {latestSession.status === 'completed'
                        ? 'LATEST BACKUP VERIFIED ✓'
                        : latestSession.status === 'completed_with_errors'
                        ? 'BACKUP HAD WARNINGS'
                        : latestSession.status === 'interrupted'
                        ? 'BACKUP INTERRUPTED'
                        : 'BACKUP RESULT'}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {latestSession.endTime ? new Date(latestSession.endTime).toLocaleString() : 'Recently completed'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onViewReport(latestSession)}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] rounded-lg transition-colors flex items-center gap-1"
                >
                  <FileText className="w-3 h-3 text-[#F4A62A]" />
                  <span>Report</span>
                </button>
              </div>

              {/* Compact result grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-[#081126] border border-[#1E3466] rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Files Copied</span>
                  <span className="text-sm font-bold text-white font-mono tabular-nums">
                    {latestSession.filesCopied.toLocaleString()}
                  </span>
                </div>
                <div className="p-2 bg-[#081126] border border-[#1E3466] rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Transferred</span>
                  <span className="text-sm font-bold text-[#00A884] font-mono tabular-nums">
                    {formatBytes(latestSession.bytesTransferred)}
                  </span>
                </div>
              </div>

              {/* Verification & Destination details */}
              <div className="p-2.5 bg-[#081126] border border-[#1E3466] rounded-lg text-[11px] text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Destination:</span>
                  <span className="font-medium text-white truncate max-w-[170px]">
                    {latestSession.driveName} ({latestSession.driveLetter})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pipeline Mode:</span>
                  <span className={`font-semibold ${latestSession.mode === 'turbo' ? 'text-[#F4A62A]' : 'text-slate-300'}`}>
                    {latestSession.mode === 'turbo' ? 'Turbo Mode (Bounded Parallel)' : 'Standard Mode (Sequential)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Integrity:</span>
                  <span className={latestSession.isVerified ? 'text-[#00A884] font-semibold' : 'text-[#F4A62A] font-semibold'}>
                    {latestSession.isVerified ? 'SHA-256 Verified ✓' : 'Partial / Skipped'}
                  </span>
                </div>
              </div>

              {/* Footer action */}
              <div className="flex items-center justify-between pt-1 text-xs">
                {onNavigateTab ? (
                  <button
                    onClick={() => onNavigateTab('history')}
                    className="text-[11px] text-[#F4A62A] hover:underline font-semibold"
                  >
                    View All History ({history.length}) →
                  </button>
                ) : <span />}

                {primaryDrive && primaryDrive.isRegistered && !isBackingUp && (
                  <button
                    onClick={() => onStartManualBackup(primaryDrive.stableHardwareId)}
                    className="px-3 py-1 text-[11px] font-semibold text-slate-200 bg-[#162852] hover:bg-[#1E3466] border border-[#1E3466] rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <RotateCw className="w-3 h-3 text-[#F4A62A]" />
                    <span>Run Again</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-4 shadow-sm text-center space-y-2">
              <div className="p-2 rounded-full bg-[#162852] text-[#F4A62A] w-9 h-9 mx-auto flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white">
                No Backups Performed Yet
              </h4>
              <p className="text-[11px] text-slate-300 leading-relaxed font-['Inter',sans-serif]">
                Once a registered drive is plugged in, Dero Vault will safely create an initial digital reserve and display verification reports here.
              </p>
            </div>
          )}

          {/* Granary Settings & Status Card */}
          <div className="p-3 bg-[#0D1B3D] border border-[#1E3466] rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-white uppercase tracking-wider font-['Poppins',sans-serif]">
                Granary Controls
              </span>
              <span className="text-[10px] text-[#00A884] font-medium">Local-First</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded bg-[#081126] border border-[#1E3466] text-slate-300">
                <span className="text-[10px] text-slate-400 block">Auto-Backup</span>
                <span className="font-semibold text-white">Active on Plug-in</span>
              </div>
              <div className="p-2 rounded bg-[#081126] border border-[#1E3466] text-slate-300">
                <span className="text-[10px] text-slate-400 block">Atomic Writes</span>
                <span className="font-semibold text-[#00A884]">Crash-Resilient</span>
              </div>
            </div>

            {onNavigateTab && (
              <div className="flex items-center justify-between pt-1 border-t border-[#1E3466]">
                <button
                  onClick={() => onNavigateTab('profiles')}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <FolderSync className="w-3 h-3 text-[#F4A62A]" />
                  <span>Folder Profiles</span>
                </button>
                <button
                  onClick={() => onNavigateTab('settings')}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <SettingsIcon className="w-3 h-3 text-slate-400" />
                  <span>All Settings</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
