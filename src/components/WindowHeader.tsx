/**
 * Dero Vault — Windows 11 Title Bar & Header
 * Clean, calm desktop window frame with granary emblem and tray minimize.
 */

import React from 'react';
import { Minus, Square, X, HardDrive, Bell, Download } from 'lucide-react';
import { DeroGranaryEmblem } from './BrandLogo';

interface WindowHeaderProps {
  onMinimizeToTray: () => void;
  isAutoBackupActive: boolean;
  activeDrivesCount: number;
  isBackingUp: boolean;
  onOpenDownloadModal?: () => void;
}

export const WindowHeader: React.FC<WindowHeaderProps> = ({
  onMinimizeToTray,
  isAutoBackupActive,
  activeDrivesCount,
  isBackingUp,
  onOpenDownloadModal,
}) => {
  return (
    <header className="flex items-center justify-between px-3.5 py-2 bg-[#0D1B3D] border-b border-[#1E3466] text-slate-300 select-none text-xs">
      {/* Left: Window title and brand */}
      <div className="flex items-center gap-2.5">
        {/* Granary Emblem */}
        <div className="relative flex items-center justify-center">
          <DeroGranaryEmblem size={24} showGlow={true} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-['Poppins',sans-serif] font-bold text-white tracking-tight text-sm">
            DERO VAULT
          </span>
          <span className="text-[#F4A62A]" aria-hidden="true">·</span>
          <span className="text-slate-300 font-normal hidden sm:inline text-[11px]">
            Your digital granary
          </span>
        </div>
      </div>

      {/* Center: Live background status indicator */}
      <div className="hidden md:flex items-center gap-3 text-slate-300 text-xs">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#162852]/80 border border-[#1E3466]">
          <span
            className={`w-2 h-2 rounded-full ${
              isBackingUp
                ? 'bg-[#F4A62A] animate-pulse'
                : isAutoBackupActive
                ? 'bg-[#00A884]'
                : 'bg-slate-500'
            }`}
          />
          <span className="text-[11px] font-medium">
            {isBackingUp
              ? 'Backup in progress...'
              : isAutoBackupActive
              ? 'Monitoring for removable drives'
              : 'Auto-backup paused'}
          </span>
        </div>
        {activeDrivesCount > 0 && (
          <>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <div className="flex items-center gap-1 text-slate-200">
              <HardDrive className="w-3 h-3 text-[#F4A62A]" />
              <span>{activeDrivesCount} drive{activeDrivesCount > 1 ? 's' : ''} connected</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Windows Controls */}
      <div className="flex items-center gap-1.5 -mr-1">
        {onOpenDownloadModal && (
          <button
            onClick={onOpenDownloadModal}
            title="Download Installable Windows Software (.exe)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F4A62A]/15 hover:bg-[#F4A62A]/25 text-[11px] text-[#F4A62A] font-semibold transition-colors border border-[#F4A62A]/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Download .exe</span>
          </button>
        )}

        <button
          onClick={onMinimizeToTray}
          title="Return to quiet background tray mode"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#162852] hover:bg-[#1E3466] text-[11px] text-slate-200 hover:text-[#F4A62A] transition-colors border border-[#1E3466]"
        >
          <DeroGranaryEmblem size={14} />
          <span className="hidden sm:inline">Minimize to Tray</span>
        </button>

        <button
          onClick={onMinimizeToTray}
          title="Minimize to System Tray"
          className="p-1.5 hover:bg-[#162852] rounded text-slate-400 hover:text-white transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          title="Maximize"
          className="p-1.5 hover:bg-[#162852] rounded text-slate-400 hover:text-white transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={onMinimizeToTray}
          title="Close to Tray"
          className="p-1.5 hover:bg-rose-950/60 hover:text-rose-300 rounded text-slate-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
