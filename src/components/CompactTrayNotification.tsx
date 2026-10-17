/**
 * Dero Vault — Compact Tray Notification & Inline Registration Pop-up
 * Smadav-style quiet Windows notification area assistant.
 * Performs backup work without interrupting the user's other work.
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Folder,
  ArrowRight,
  X,
  Maximize2,
  Loader2,
  Check,
  Pause,
  Play
} from 'lucide-react';
import { RemovableDrive, BackupSession, SourceFolderOption } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';

export type TrayNotificationState =
  | {
      type: 'unregistered';
      drive: RemovableDrive;
    }
  | {
      type: 'registered_connect';
      drive: RemovableDrive;
    }
  | {
      type: 'backing_up';
      session: BackupSession;
      driveName?: string;
    }
  | {
      type: 'complete';
      session: BackupSession;
      driveName?: string;
    }
  | {
      type: 'error';
      title: string;
      message: string;
      session?: BackupSession;
    }
  | null;

interface CompactTrayNotificationProps {
  notification: TrayNotificationState;
  onDismiss: () => void;
  onOpenFullApp: () => void;
  onQuickRegister: (data: {
    stableHardwareId: string;
    friendlyName: string;
    sourceFolders: string[];
    autoBackupEnabled: boolean;
    verifyBackups: boolean;
    preserveVersions: boolean;
  }) => Promise<void>;
  onCancelBackup?: () => void;
  availableSources: SourceFolderOption[];
  isFullAppOpen: boolean;
}

export const CompactTrayNotification: React.FC<CompactTrayNotificationProps> = ({
  notification,
  onDismiss,
  onOpenFullApp,
  onQuickRegister,
  onCancelBackup,
  availableSources,
  isFullAppOpen,
}) => {
  if (!notification) return null;

  // Inline registration state for unregistered drive pop-up
  const [friendlyName, setFriendlyName] = useState('');
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Initialize registration defaults whenever an unregistered drive notification arrives
  useEffect(() => {
    if (notification.type === 'unregistered' && notification.drive) {
      const drive = notification.drive;
      const defaultName = drive.volumeLabel && drive.volumeLabel !== 'USB Drive'
        ? `${drive.volumeLabel.replace(/_/g, ' ')}`
        : `${drive.deviceModel || 'Office USB'} (${drive.driveLetter})`;
      setFriendlyName(defaultName);

      // Select top default folders (Documents, Desktop) if available
      const defaultPaths: string[] = [];
      availableSources.forEach((s) => {
        const lower = s.name.toLowerCase();
        if (lower.includes('document') || lower.includes('desktop')) {
          defaultPaths.push(s.path);
        }
      });
      // Fallback: at least first source folder
      if (defaultPaths.length === 0 && availableSources.length > 0) {
        defaultPaths.push(availableSources[0].path);
      }
      setSelectedFolders(defaultPaths);
    }
  }, [notification, availableSources]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (notification.type !== 'unregistered') return;
    if (selectedFolders.length === 0) {
      setRegisterError('Please select at least one folder to protect.');
      return;
    }
    setRegisterError(null);

    try {
      setIsRegistering(true);
      await onQuickRegister({
        stableHardwareId: notification.drive.stableHardwareId,
        friendlyName: friendlyName.trim() || notification.drive.volumeLabel || 'Office Backup',
        sourceFolders: selectedFolders,
        autoBackupEnabled,
        verifyBackups: true,
        preserveVersions: true,
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const toggleFolder = (folderPath: string) => {
    setSelectedFolders((prev) =>
      prev.includes(folderPath) ? prev.filter((p) => p !== folderPath) : [...prev, folderPath]
    );
  };

  return (
    <div
      role="region"
      aria-label="Dero Vault Tray Notification"
      className="fixed bottom-14 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] bg-[#0D1B3D]/98 border border-[#1E3466] rounded-2xl shadow-2xl backdrop-blur-md text-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      {/* 1. UNREGISTERED DRIVE DETECTED: Inline Compact Registration */}
      {notification.type === 'unregistered' && (
        <div className="p-4 space-y-3.5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center">
                <DeroGranaryEmblem size={28} />
              </div>
              <div>
                <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white flex items-center gap-1.5">
                  <span>DERO VAULT</span>
                  <span className="text-[10px] font-normal text-[#F4A62A] bg-[#162852] px-1.5 py-0.2 rounded border border-[#1E3466]">
                    New Drive
                  </span>
                </h4>
                <p className="text-[11px] text-slate-300">
                  {notification.drive.volumeLabel || 'Removable Disk'} ({notification.drive.driveLetter})
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              title="Dismiss notification"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-snug">
            Would you like Dero Vault to protect your files on this drive?
          </p>

          {registerError && (
            <div className="p-2 bg-rose-950/70 border border-rose-800/80 rounded text-[11px] text-rose-300">
              {registerError}
            </div>
          )}

          {/* Quick Registration Form */}
          <form onSubmit={handleRegisterSubmit} className="space-y-3 pt-1">
            {/* Friendly Name */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1 font-['Poppins',sans-serif]">
                Drive Label in Dero Vault
              </label>
              <input
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="e.g. Office Backup"
                className="w-full bg-[#081126] border border-[#1E3466] focus:border-[#F4A62A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden"
              />
            </div>

            {/* Quick Source Folder Pickers */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1 font-['Poppins',sans-serif]">
                Folders to Protect ({selectedFolders.length} selected)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {availableSources.slice(0, 4).map((source) => {
                  const isChecked = selectedFolders.includes(source.path);
                  return (
                    <button
                      type="button"
                      key={source.path}
                      onClick={() => toggleFolder(source.path)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left text-xs transition-colors ${
                        isChecked
                          ? 'bg-[#162852] border-[#F4A62A]/60 text-[#F4A62A]'
                          : 'bg-[#081126] border-[#1E3466] hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                          isChecked ? 'bg-[#F4A62A] text-[#0D1B3D]' : 'border border-[#1E3466]'
                        }`}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5 font-bold" />}
                      </div>
                      <span className="truncate">{source.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Auto-backup toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-[#081126] border-[#1E3466] text-[#F4A62A] focus:ring-0"
              />
              <span>Back up automatically when plugged in</span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-[#1E3466]">
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Ignore
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenFullApp}
                  className="text-[11px] text-slate-300 hover:text-[#F4A62A] transition-colors"
                >
                  Advanced...
                </button>
                <button
                  type="submit"
                  disabled={isRegistering || selectedFolders.length === 0}
                  className="px-3.5 py-1.5 bg-[#F4A62A] hover:bg-[#F6B54A] disabled:bg-slate-800 disabled:text-slate-500 text-[#0D1B3D] text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 font-['Poppins',sans-serif]"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>Protect & Back Up</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 2. REGISTERED DRIVE CONNECTED: Quiet announcement */}
      {notification.type === 'registered_connect' && (
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center">
                <DeroGranaryEmblem size={28} />
              </div>
              <div>
                <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white flex items-center gap-1.5">
                  <span>DERO VAULT</span>
                  <span className="text-[10px] text-[#00A884]">· Ready</span>
                </h4>
                <p className="text-[11px] text-slate-300">
                  {notification.drive.friendlyName || notification.drive.volumeLabel} ({notification.drive.driveLetter})
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300">
            Registered drive recognized. Automatic backup is starting quietly in the background.
          </p>

          <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-[#1E3466]">
            <span className="text-[11px] text-[#00A884] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse" />
              You can continue working safely
            </span>
            <button
              onClick={onOpenFullApp}
              className="hover:text-white flex items-center gap-1 text-[11px] text-slate-300"
            >
              <span>Open Dero</span>
              <Maximize2 className="w-3 h-3 text-[#F4A62A]" />
            </button>
          </div>
        </div>
      )}

      {/* 3. BACKUP IN PROGRESS: Smadav-style compact live progress */}
      {notification.type === 'backing_up' && (() => {
        const session = notification.session;
        const totalPlanned =
          (session.newFilesCount + session.modifiedFilesCount) > 0
            ? session.newFilesCount + session.modifiedFilesCount
            : session.filesScanned > 0
            ? session.filesScanned
            : 0;

        const percent = session.bytesTotal > 0
          ? Math.round((session.bytesTransferred / session.bytesTotal) * 100)
          : totalPlanned > 0
          ? Math.round((session.filesCopied / totalPlanned) * 100)
          : 0;

        const actionText =
          session.status === 'scanning'
            ? 'Scanning source folders…'
            : session.status === 'comparing'
            ? 'Comparing against granary…'
            : session.status === 'copying'
            ? 'Backing up your office…'
            : session.status === 'verifying'
            ? 'Verifying file integrity…'
            : 'Backing up your office…';

        const displayBadge =
          session.status === 'scanning'
            ? 'Scanning...'
            : session.status === 'comparing'
            ? 'Comparing...'
            : session.status === 'verifying'
            ? 'Verifying...'
            : `${Math.min(100, Math.max(0, percent))}%`;

        return (
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center">
                  <DeroGranaryEmblem size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white">DERO VAULT</h4>
                    <span className="text-[10px] font-mono font-bold text-[#F4A62A] bg-[#162852] px-1.5 py-0.2 rounded border border-[#1E3466]">
                      {displayBadge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate max-w-[200px]">
                    {actionText}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={onOpenFullApp}
                  title="Expand full Dero Vault window"
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#F4A62A]" />
                </button>
                <button
                  onClick={onDismiss}
                  title="Minimize tray notification"
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Progress Bar with Brand Accent #F4A62A */}
            <div className="space-y-1.5">
              <div className="w-full h-2 rounded-full bg-[#081126] overflow-hidden border border-[#1E3466]">
                <div
                  className="h-full bg-gradient-to-r from-[#F4A62A] to-[#FBBF24] transition-all duration-300"
                  style={{
                    width:
                      session.status === 'scanning' || session.status === 'comparing'
                        ? '15%'
                        : session.status === 'verifying'
                        ? '98%'
                        : `${Math.min(100, Math.max(3, percent))}%`,
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-300 font-mono">
                <span>
                  {session.status === 'scanning'
                    ? `${session.filesScanned.toLocaleString()} files scanned`
                    : `${session.filesCopied.toLocaleString()} / ${Math.max(session.filesCopied, totalPlanned).toLocaleString()} files`}
                </span>
                <span>
                  {formatBytes(session.bytesTransferred)} / {formatBytes(session.bytesTotal)}
                </span>
              </div>
            </div>

            {/* Calming Assistant Banner */}
            <div className="bg-[#081126] border border-[#1E3466] rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px] text-slate-300">
              <span className="text-[#00A884] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse" />
                You can continue working without interruption
              </span>
              {onCancelBackup && (
                <button
                  type="button"
                  onClick={onCancelBackup}
                  className="text-[10px] text-slate-400 hover:text-rose-400 transition-colors ml-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 4. BACKUP COMPLETE: "✓ Today's work is safely backed up." */}
      {notification.type === 'complete' && (
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#00A884]/15 border border-[#00A884]/30 text-[#00A884] flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white">DERO VAULT</h4>
                <p className="text-[11px] font-semibold text-[#00A884]">
                  ✓ Today&apos;s work is safely backed up.
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              title="Dismiss"
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-[#081126] border border-[#1E3466] rounded-lg p-2.5 text-xs text-slate-300 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Protected files:</span>
              <span className="font-semibold text-white">
                {notification.session.filesCopied || notification.session.filesScanned || 0} files (
                {formatBytes(notification.session.bytesTransferred || notification.session.bytesTotal || 0)})
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Destination:</span>
              <span className="text-white truncate max-w-[180px]">
                {notification.driveName || notification.session.driveName || 'External Drive'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#1E3466] text-xs">
            <span className="text-[10px] text-slate-400">
              Safe to disconnect or keep plugged in
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDismiss}
                className="px-2.5 py-1 text-[11px] text-slate-300 hover:text-white bg-[#132247] rounded transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={onOpenFullApp}
                className="px-2.5 py-1 text-[11px] text-[#F4A62A] hover:text-[#F6B54A] font-semibold flex items-center gap-1 transition-colors"
              >
                <span>View Details</span>
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ERROR / INTERRUPTION */}
      {notification.type === 'error' && (
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#F4A62A]/15 text-[#F4A62A] border border-[#F4A62A]/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold font-['Poppins',sans-serif] text-white">DERO VAULT</h4>
                <p className="text-[11px] font-semibold text-[#F4A62A]">
                  {notification.title || 'Backup Notification'}
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {notification.message}
          </p>

          <div className="flex items-center justify-between pt-1 border-t border-[#1E3466] text-xs">
            <button
              type="button"
              onClick={onDismiss}
              className="text-slate-400 hover:text-white text-[11px]"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onOpenFullApp}
              className="px-3 py-1.5 bg-[#132247] hover:bg-[#1A2E5E] text-slate-100 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <span>Open Dero Vault for Details</span>
              <Maximize2 className="w-3.5 h-3.5 text-[#F4A62A]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
