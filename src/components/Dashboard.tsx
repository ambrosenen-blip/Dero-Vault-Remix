/**
 * Dero Vault — Central Dashboard
 * Displays real-time backup progress, live file statistics,
 * backup completion summaries, interruption alerts, and drive readiness.
 */

import React from 'react';
import {
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCw,
  FileText,
  Clock,
  Layers,
  Zap,
  Folder,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { BackupSession, RemovableDrive } from '../types';

interface DashboardProps {
  currentSession: BackupSession | null;
  activeDrives: RemovableDrive[];
  registeredDrives: RemovableDrive[];
  onStartManualBackup: (stableHardwareId?: string) => void;
  onCancelBackup: () => void;
  onViewReport: (session: BackupSession) => void;
  onOpenRegisterModal: (drive: RemovableDrive) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentSession,
  activeDrives,
  registeredDrives,
  onStartManualBackup,
  onCancelBackup,
  onViewReport,
  onOpenRegisterModal,
}) => {
  // Format helpers
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  // Connected registered drives
  const connectedRegistered = activeDrives.filter((d) => d.isConnected && d.isRegistered);
  const connectedUnregistered = activeDrives.filter((d) => d.isConnected && !d.isRegistered);

  // Compute progress percentage
  let progressPercent = 0;
  if (currentSession) {
    if (currentSession.status === 'completed' || currentSession.status === 'completed_with_errors') {
      progressPercent = 100;
    } else if (currentSession.bytesTotal > 0) {
      progressPercent = Math.min(99.9, (currentSession.bytesTransferred / currentSession.bytesTotal) * 100);
    } else if (currentSession.status === 'copying' && currentSession.filesScanned > 0) {
      progressPercent = Math.min(99.9, (currentSession.filesCopied / Math.max(1, currentSession.filesScanned)) * 100);
    } else if (currentSession.status === 'verifying') {
      progressPercent = 99.5;
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* 1. BACKUP IN PROGRESS STATE (Prompt Section 19) */}
      {isBackingUp && currentSession && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Backup In Progress
              </span>
              <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                {currentSession.driveName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span>Drive {currentSession.driveLetter}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {currentSession.status === 'scanning'
                    ? 'Scanning source folders...'
                    : currentSession.status === 'comparing'
                    ? 'Comparing against digital granary...'
                    : currentSession.status === 'verifying'
                    ? 'Verifying file integrity...'
                    : currentSession.isInitialBackup
                    ? 'Creating initial digital reserve'
                    : 'Incremental backup'}
                </span>
              </div>
            </div>

            <button
              onClick={onCancelBackup}
              className="px-3.5 py-1.5 text-xs font-medium text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded-lg transition-colors self-start sm:self-auto"
            >
              Cancel Backup
            </button>
          </div>

          {/* Percentage & Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-extrabold text-slate-100 font-mono tabular-nums tracking-tight">
                {progressPercent.toFixed(1)}%
              </span>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="font-mono tabular-nums">
                  {currentSession.filesCopied.toLocaleString()} /{' '}
                  {(currentSession.newFilesCount + currentSession.modifiedFilesCount || currentSession.filesScanned || 1).toLocaleString()} files
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatBytes(currentSession.bytesTransferred)} / {formatBytes(currentSession.bytesTotal)}
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(2, progressPercent)}%` }}
              />
            </div>
          </div>

          {/* Current File Path */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg px-4 py-3 text-xs">
            <div className="text-slate-500 font-medium mb-1">Current file:</div>
            <div className="text-slate-300 font-mono truncate select-all">
              {currentSession.currentFile || 'Traversing directories...'}
            </div>
          </div>

          {/* Live Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-850 border border-slate-800 rounded-lg space-y-1">
              <div className="text-slate-400">Transfer Speed</div>
              <div className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {formatSpeed(currentSession.currentSpeedBps)}
              </div>
            </div>

            <div className="p-3 bg-slate-850 border border-slate-800 rounded-lg space-y-1">
              <div className="text-slate-400">Estimated Time Left</div>
              <div className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {formatEta(currentSession.estimatedSecondsRemaining)}
              </div>
            </div>

            <div className="p-3 bg-slate-850 border border-slate-800 rounded-lg space-y-1">
              <div className="text-slate-400">Files Scanned / Skipped</div>
              <div className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {currentSession.filesScanned.toLocaleString()} / {currentSession.filesSkipped.toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-slate-850 border border-slate-800 rounded-lg space-y-1">
              <div className="text-slate-400">Failed / Errors</div>
              <div className={`text-base font-semibold font-mono tabular-nums ${currentSession.filesFailed > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                {currentSession.filesFailed.toLocaleString()}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. RECENT COMPLETION REPORT (Prompt Section 21 & 22) */}
      {!isBackingUp && currentSession && ['completed', 'completed_with_errors'].includes(currentSession.status) && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-start gap-3">
              {currentSession.status === 'completed' ? (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  {currentSession.status === 'completed'
                    ? 'BACKUP COMPLETE ✓'
                    : 'BACKUP COMPLETED WITH ERRORS'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Drive: <strong className="text-slate-200">{currentSession.driveName}</strong> [{currentSession.driveLetter}]
                  {currentSession.errors.length > 0 && ` · ${currentSession.errors.length} file(s) could not be copied.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewReport(currentSession)}
                className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>View Backup Report</span>
              </button>
              <button
                onClick={() => onStartManualBackup(currentSession.driveStableId)}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Run Again</span>
              </button>
            </div>
          </div>

          {/* Detailed Summary Table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-850/70 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block mb-1">Files scanned</span>
              <span className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {currentSession.filesScanned.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-850/70 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block mb-1">New / Modified</span>
              <span className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {currentSession.newFilesCount.toLocaleString()} / {currentSession.modifiedFilesCount.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-850/70 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block mb-1">Skipped (Unchanged)</span>
              <span className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {currentSession.filesSkipped.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-850/70 border border-slate-800 rounded-lg">
              <span className="text-slate-400 block mb-1">Data transferred</span>
              <span className="text-base font-semibold text-slate-200 font-mono tabular-nums">
                {formatBytes(currentSession.bytesTransferred)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                Verification:{' '}
                <strong className={currentSession.isVerified ? 'text-emerald-400' : 'text-amber-400'}>
                  {currentSession.isVerified ? 'Successful ✓' : 'Partial / Skipped'}
                </strong>
                {currentSession.verificationNotes && ` · ${currentSession.verificationNotes}`}
              </span>
            </div>
            <div>
              Completed: {currentSession.endTime ? new Date(currentSession.endTime).toLocaleString() : 'Just now'}
            </div>
          </div>
        </section>
      )}

      {/* 3. INTERRUPTED OR STOPPED STATE (Prompt Section 23 & 24) */}
      {!isBackingUp && currentSession && ['interrupted', 'stopped_insufficient_space', 'failed', 'cancelled'].includes(currentSession.status) && (
        <section className="bg-slate-900 border border-rose-900/40 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                {currentSession.status === 'interrupted'
                  ? 'BACKUP INTERRUPTED'
                  : currentSession.status === 'stopped_insufficient_space'
                  ? 'BACKUP STOPPED — INSUFFICIENT STORAGE'
                  : currentSession.status === 'cancelled'
                  ? 'BACKUP CANCELLED'
                  : 'BACKUP ENCOUNTERED AN ERROR'}
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                {currentSession.status === 'interrupted' &&
                  'The backup drive was disconnected before copying finished. Dero Vault halted cleanly to prevent database corruption. Plug the drive back in to automatically rescan and copy remaining files.'}
                {currentSession.status === 'stopped_insufficient_space' &&
                  'There is not enough free space on the destination drive to safely store the selected files. Dero Vault does not delete existing backup files automatically.'}
                {currentSession.status === 'cancelled' &&
                  'The backup operation was stopped by the user.'}
                {currentSession.status === 'failed' &&
                  (currentSession.errors[0]?.error || 'A critical storage read/write error occurred.')}
              </p>
            </div>
          </div>

          {currentSession.errors.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-rose-300 font-mono space-y-1 max-h-32 overflow-y-auto">
              {currentSession.errors.map((err, idx) => (
                <div key={idx}>
                  [{new Date(err.timestamp).toLocaleTimeString()}] {err.error}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => onStartManualBackup(currentSession.driveStableId)}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry Backup</span>
            </button>
            <button
              onClick={() => onViewReport(currentSession)}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              View Full Incident Details
            </button>
          </div>
        </section>
      )}

      {/* 4. ACTIVE CONNECTED DRIVES (Prompt Section 2) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Connected Storage Devices
          </h3>
          <span className="text-xs text-slate-500">
            {activeDrives.filter(d => d.isConnected).length} active volume(s)
          </span>
        </div>

        {connectedRegistered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectedRegistered.map((drive) => (
              <div
                key={drive.stableHardwareId}
                className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">
                        {drive.friendlyName || drive.volumeLabel}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>Drive {drive.driveLetter}</span>
                        <span aria-hidden="true">·</span>
                        <span>{drive.deviceModel}</span>
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Registered Granary
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums">
                    <span>Available Storage</span>
                    <span>
                      {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/80 rounded-full"
                      style={{
                        width: `${Math.max(5, ((drive.totalBytes - drive.freeBytes) / drive.totalBytes) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <div className="text-slate-400">
                    Last backup: {drive.lastBackupAt ? new Date(drive.lastBackupAt).toLocaleDateString() : 'Pending initial run'}
                  </div>

                  <button
                    disabled={isBackingUp}
                    onClick={() => onStartManualBackup(drive.stableHardwareId)}
                    className="px-3.5 py-1.5 font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Back Up Now</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : connectedUnregistered.length > 0 ? (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            {connectedUnregistered.map((drive) => (
              <div key={drive.stableHardwareId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">
                      Unregistered Drive: {drive.volumeLabel || 'Removable Disk'} [{drive.driveLetter}]
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {drive.deviceModel} · {formatBytes(drive.freeBytes)} available
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onOpenRegisterModal(drive)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <span>Register Drive</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* Empty / Waiting State */
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 text-emerald-400 flex items-center justify-center mx-auto border border-slate-700/60">
              <HardDrive className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-base font-semibold text-slate-100">
                Your digital granary is ready.
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Plug in an external hard drive or USB flash disk. Dero Vault will recognize it and automatically begin backing up your important files.
              </p>
            </div>
            <div className="pt-2 flex justify-center items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Waiting for removable storage device to be connected...</span>
            </div>
          </div>
        )}
      </section>

      {/* 5. CORE PHILOSOPHY CALLOUT */}
      <section className="p-4 bg-slate-900/50 border border-slate-800/60 rounded-xl flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-slate-200">Data safety guarantee:</strong> Dero Vault is strictly one-directional. Source files are never modified, deleted, or moved.
          </span>
        </div>
        <span className="hidden sm:inline text-slate-500 font-serif italic">
          "Make the safe action the lazy action."
        </span>
      </section>
    </div>
  );
};
