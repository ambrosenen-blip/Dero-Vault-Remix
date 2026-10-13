/**
 * Dero Vault — Unregistered Removable Drive Detected Modal
 * Prompt Section 8 & 34: Prompts user when unknown removable device is connected.
 */

import React from 'react';
import { HardDrive, ArrowRight, X } from 'lucide-react';
import { RemovableDrive } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0D1B3D] border border-[#1E3466] rounded-2xl shadow-2xl p-6 space-y-6 text-slate-100">
        {/* Header with emblem */}
        <div className="flex items-start justify-between pb-3 border-b border-[#1E3466]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <DeroGranaryEmblem size={34} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#F4A62A] font-['Poppins',sans-serif]">
                New Removable Storage
              </span>
              <h3 className="text-lg font-bold text-white font-['Poppins',sans-serif] mt-0.5">
                Removable Drive Detected
              </h3>
            </div>
          </div>
          <button
            onClick={onIgnore}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drive Info Card matching Prompt Section 8 */}
        <div className="bg-[#081126] border border-[#1E3466] rounded-xl p-4 space-y-2.5 text-xs font-['Inter',sans-serif]">
          <div className="flex justify-between items-center py-1 border-b border-[#1E3466]/80">
            <span className="text-slate-400 font-medium">Drive:</span>
            <span className="font-semibold text-white font-['Poppins',sans-serif]">{drive.volumeLabel || 'Removable Disk'}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-[#1E3466]/80">
            <span className="text-slate-400 font-medium">Drive letter:</span>
            <span className="font-mono font-bold text-[#00A884] bg-[#00A884]/15 px-2 py-0.5 rounded border border-[#00A884]/30">
              {drive.driveLetter}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-[#1E3466]/80">
            <span className="text-slate-400 font-medium">Hardware Model:</span>
            <span className="text-slate-300 truncate max-w-[200px]">{drive.deviceModel}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-[#1E3466]/80">
            <span className="text-slate-400 font-medium">Capacity:</span>
            <span className="font-mono text-slate-200">{formatBytes(drive.totalBytes)}</span>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="text-slate-400 font-medium">Available:</span>
            <span className="font-mono text-[#00A884] font-semibold">{formatBytes(drive.freeBytes)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-['Inter',sans-serif]">
          This drive has not been registered with Dero Vault. To protect your data, automatic backup will not begin until you register and configure what to protect.
        </p>

        {/* Buttons matching Prompt Section 8 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onIgnore}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#132247] hover:bg-[#1A2E5E] rounded-lg transition-colors border border-[#1E3466]"
          >
            Ignore
          </button>
          <button
            onClick={() => onRegister(drive)}
            className="px-5 py-2 text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-[#F4A62A]/20 font-['Poppins',sans-serif]"
          >
            <span>Register Drive</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
