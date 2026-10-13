/**
 * Dero Vault — System Tray Simulation
 * Prompt Section 29: Windows system tray menu and background monitor indicator.
 */

import React, { useState } from 'react';
import { Play, Pause, Settings, X, Maximize2, HardDrive } from 'lucide-react';
import { DeroGranaryEmblem } from './BrandLogo';

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
        <div className="absolute bottom-12 right-0 w-64 bg-[#0D1B3D] border border-[#1E3466] rounded-xl shadow-2xl p-2 text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2 space-y-1">
          <div className="px-3 py-2 border-b border-[#1E3466] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DeroGranaryEmblem size={20} />
              <span className="font-bold font-['Poppins',sans-serif] text-white">DERO VAULT</span>
            </div>
            <span className="text-[10px] text-[#F4A62A] font-medium">Tray Mode</span>
          </div>

          {/* Status line */}
          <div className="px-3 py-1.5 text-[11px] text-slate-300">
            {isBackingUp ? (
              <span className="text-[#F4A62A] font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F4A62A] animate-pulse" />
                Backing up to {activeDriveName || 'Drive'}...
              </span>
            ) : isAutoBackupActive ? (
              <span className="text-[#00A884] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884]" />
                Monitoring for USB drives
              </span>
            ) : (
              <span className="text-slate-400">Auto-backup paused</span>
            )}
          </div>

          <div className="pt-1 border-t border-[#1E3466] space-y-0.5">
            <button
              onClick={() => {
                onRestore();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#162852] text-white flex items-center gap-2.5 transition-colors font-medium"
            >
              <Maximize2 className="w-3.5 h-3.5 text-[#F4A62A]" />
              <span>Open Dero Vault</span>
            </button>

            <button
              onClick={onToggleAutoBackup}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#162852] text-slate-200 flex items-center gap-2.5 transition-colors"
            >
              {isAutoBackupActive ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-[#F4A62A]" />
                  <span>Pause Automatic Backup</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-[#00A884] fill-current" />
                  <span>Resume Automatic Backup</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onOpenSettings();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#162852] text-slate-200 flex items-center gap-2.5 transition-colors"
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
            ? 'bg-[#0D1B3D] border-[#F4A62A] text-[#F4A62A] animate-pulse'
            : isAutoBackupActive
            ? 'bg-[#0D1B3D] border-[#1E3466] hover:border-[#F4A62A]/60 text-slate-200'
            : 'bg-[#0A1530] border-[#1E3466] text-slate-400'
        }`}
      >
        <div className="relative flex items-center">
          <DeroGranaryEmblem size={18} />
          <span
            className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
              isBackingUp ? 'bg-[#F4A62A]' : isAutoBackupActive ? 'bg-[#00A884]' : 'bg-slate-500'
            }`}
          />
        </div>
        <span className="font-['Poppins',sans-serif] font-bold text-xs hidden sm:inline text-white">DERO VAULT</span>
        {isBackingUp && <span className="font-mono text-[10px] text-[#F4A62A]">Backing up...</span>}
      </button>
    </div>
  );
};
