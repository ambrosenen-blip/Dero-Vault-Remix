/**
 * Dero Vault — Windows 11 Title Bar & Header
 * Clean, calm desktop window frame with granary emblem and tray minimize.
 */

import React from 'react';
import { Minus, Square, X, HardDrive, Shield, Bell } from 'lucide-react';

interface WindowHeaderProps {
  onMinimizeToTray: () => void;
  isAutoBackupActive: boolean;
  activeDrivesCount: number;
  isBackingUp: boolean;
}

export const WindowHeader: React.FC<WindowHeaderProps> = ({
  onMinimizeToTray,
  isAutoBackupActive,
  activeDrivesCount,
  isBackingUp,
}) => {
  return (
    <header className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-slate-300 select-none text-xs">
      {/* Left: Window title and brand */}
      <div className="flex items-center gap-2.5">
        {/* Granary Emblem */}
        <div className="w-5 h-5 rounded bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
          <Shield className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100 tracking-tight text-sm">Dero Vault</span>
          <span className="text-slate-500 hidden sm:inline" aria-hidden="true">·</span>
          <span className="text-slate-400 font-normal hidden sm:inline">Your digital granary</span>
        </div>
      </div>

      {/* Center: Live background status indicator */}
      <div className="hidden md:flex items-center gap-3 text-slate-400 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isBackingUp
                ? 'bg-amber-400 animate-pulse'
                : isAutoBackupActive
                ? 'bg-emerald-400'
                : 'bg-slate-500'
            }`}
          />
          <span>
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
            <div className="flex items-center gap-1 text-slate-300">
              <HardDrive className="w-3 h-3 text-slate-400" />
              <span>{activeDrivesCount} drive{activeDrivesCount > 1 ? 's' : ''} connected</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Windows Controls */}
      <div className="flex items-center gap-1.5 -mr-1">
        <button
          onClick={onMinimizeToTray}
          title="Return to quiet background tray mode"
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-750 text-[11px] text-slate-300 hover:text-emerald-300 transition-colors border border-slate-700/60"
        >
          <Shield className="w-3 h-3 text-emerald-400" />
          <span className="hidden sm:inline">Minimize to Tray</span>
        </button>

        <button
          onClick={onMinimizeToTray}
          title="Minimize to System Tray"
          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          title="Maximize"
          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={onMinimizeToTray}
          title="Close to Tray"
          className="p-1.5 hover:bg-rose-900/40 hover:text-rose-300 rounded text-slate-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
