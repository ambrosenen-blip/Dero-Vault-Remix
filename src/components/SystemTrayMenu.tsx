/**
 * Dero Vault — System Tray Simulation
 * Prompt Section 29: Windows system tray menu and background monitor indicator.
 */

import React, { useState } from 'react';
import { Shield, Play, Pause, Settings, X, Maximize2, HardDrive } from 'lucide-react';

interface SystemTrayMenuProps {
  isMinimized: boolean;
  onRestore: () => void;
  isAutoBackupActive: boolean;
  onToggleAutoBackup: () => void;
  onOpenSettings: () => void;
  isBackingUp: boolean;
  activeDriveName?: string;
}

export const SystemTrayMenu: React.FC<SystemTrayMenuProps> = ({
  isMinimized,
  onRestore,
  isAutoBackupActive,
  onToggleAutoBackup,
  onOpenSettings,
  isBackingUp,
  activeDriveName,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-3 right-4 z-50 select-none">
      {/* Tray Menu Popover */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2 space-y-1">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Shield className="w-3 h-3" />
              </div>
              <span className="font-bold text-slate-100">Dero Vault</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Tray Mode</span>
          </div>

          {/* Status line */}
          <div className="px-3 py-1.5 text-[11px] text-slate-400">
            {isBackingUp ? (
              <span className="text-amber-400 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Backing up to {activeDriveName || 'Drive'}...
              </span>
            ) : isAutoBackupActive ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Monitoring for USB drives
              </span>
            ) : (
              <span className="text-slate-400">Auto-backup paused</span>
            )}
          </div>

          <div className="pt-1 border-t border-slate-800/80 space-y-0.5">
            <button
              onClick={() => {
                onRestore();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-100 flex items-center gap-2.5 transition-colors font-medium"
            >
              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Dero Vault</span>
            </button>

            <button
              onClick={onToggleAutoBackup}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-100 flex items-center gap-2.5 transition-colors"
            >
              {isAutoBackupActive ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pause Automatic Backup</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
                  <span>Resume Automatic Backup</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onOpenSettings();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-100 flex items-center gap-2.5 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Settings</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Exit Dero Vault? Background drive monitoring will stop.')) {
                  if ((window as any).electronAPI?.closeApp) {
                    (window as any).electronAPI.closeApp();
                  } else {
                    window.location.reload();
                  }
                }
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 flex items-center gap-2.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit Dero Vault</span>
            </button>
          </div>
        </div>
      )}

      {/* Taskbar Tray Icon Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        onDoubleClick={() => {
          onRestore();
          setIsOpen(false);
        }}
        title="Dero Vault — System Tray (Click for menu, double-click to open)"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-lg backdrop-blur-md transition-all text-xs ${
          isBackingUp
            ? 'bg-amber-950/80 border-amber-500/50 text-amber-200 animate-pulse'
            : isAutoBackupActive
            ? 'bg-slate-900/95 border-slate-700/80 hover:border-slate-600 text-slate-200'
            : 'bg-slate-900/95 border-slate-800 text-slate-400'
        }`}
      >
        <div className="relative">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span
            className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
              isBackingUp ? 'bg-amber-400' : isAutoBackupActive ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
          />
        </div>
        <span className="font-semibold hidden sm:inline">Dero Tray</span>
        {isBackingUp && <span className="font-mono text-[10px]">Syncing...</span>}
      </button>
    </div>
  );
};
