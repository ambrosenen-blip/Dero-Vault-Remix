/**
 * Dero Vault — Unregistered Removable Drive Detected Modal
 * Prompt Section 8 & 34: Prompts user when unknown removable device is connected.
 */

import React from 'react';
import { HardDrive, ShieldAlert, ArrowRight, X } from 'lucide-react';
import { RemovableDrive } from '../types';

interface UnregisteredDriveModalProps {
  drive: RemovableDrive | null;
  onRegister: (drive: RemovableDrive) => void;
  onIgnore: () => void;
}

export const UnregisteredDriveModal: React.FC<UnregisteredDriveModalProps> = ({
  drive,
  onRegister,
  onIgnore,
}) => {
  if (!drive) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-6 text-slate-100">
        {/* Header with warning icon */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                New Removable Storage
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Removable Drive Detected
              </h3>
            </div>
          </div>
          <button
            onClick={onIgnore}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drive Info Card matching Prompt Section 8 */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
            <span className="text-slate-400 font-medium">Drive:</span>
            <span className="font-semibold text-slate-200">{drive.volumeLabel || 'Removable Disk'}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
            <span className="text-slate-400 font-medium">Drive letter:</span>
            <span className="font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              {drive.driveLetter}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
            <span className="text-slate-400 font-medium">Hardware Model:</span>
            <span className="text-slate-300 truncate max-w-[200px]">{drive.deviceModel}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
            <span className="text-slate-400 font-medium">Capacity:</span>
            <span className="font-mono text-slate-200">{formatBytes(drive.totalBytes)}</span>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="text-slate-400 font-medium">Available:</span>
            <span className="font-mono text-emerald-300 font-semibold">{formatBytes(drive.freeBytes)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          This drive has not been registered with Dero Vault. To protect your data, automatic backup will not begin until you register and configure what to protect.
        </p>

        {/* Buttons matching Prompt Section 8 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onIgnore}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors"
          >
            Ignore
          </button>
          <button
            onClick={() => onRegister(drive)}
            className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span>Register Drive</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
