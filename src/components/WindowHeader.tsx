/**
 * Dero Vault — Consolidated Windows Title Bar & Header
 * Single, coherent in-app title bar conforming to Windows 11 desktop conventions.
 * Features:
 * - Left: Granary emblem, DERO VAULT and "Your digital granary."
 * - Middle/Right: Live backup status and connected-drive status.
 * - Far Right: Exactly one consolidated set of window controls (Minimize, Maximize/Restore, Close).
 * - Full dragging support via -webkit-app-region with no-drag exclusion on buttons.
 */

import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, HardDrive, Download } from 'lucide-react';
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
  const [isMaximized, setIsMaximized] = useState(false);

  // Sync window maximized state with Electron native window
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const api = (window as any).electronAPI;
      if (api.isMaximized) {
        api.isMaximized().then((max: boolean) => setIsMaximized(Boolean(max))).catch(() => {});
      }
      if (api.onWindowStateChange) {
        const cleanup = api.onWindowStateChange((state: { isMaximized: boolean }) => {
          setIsMaximized(Boolean(state.isMaximized));
        });
        return cleanup;
      }
    }
  }, []);

  const handleMinimize = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.minimizeWindow) {
      (window as any).electronAPI.minimizeWindow();
    } else {
      onMinimizeToTray();
    }
  };

  const handleToggleMaximize = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.toggleMaximize) {
      const state = await (window as any).electronAPI.toggleMaximize();
      setIsMaximized(Boolean(state));
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.closeWindow) {
      (window as any).electronAPI.closeWindow();
    } else {
      onMinimizeToTray();
    }
  };

  return (
    <header
      className="flex items-center justify-between px-3.5 py-1.5 bg-[#0A142F] border-b border-[#1E3466] text-slate-300 select-none text-xs w-full relative z-40"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: Window title, granary emblem, and brand slogan */}
      <div
        className="flex items-center gap-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <div className="relative flex items-center justify-center shrink-0">
          <DeroGranaryEmblem size={22} showGlow={true} />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center">
            <span className="font-['Poppins',sans-serif] font-bold text-white tracking-tight text-sm leading-none">
              DERO VAULT
            </span>
            <sup className="text-[#F4A62A] text-[9px] font-bold ml-0.5">™</sup>
          </div>
          <span className="text-[#F4A62A] text-xs" aria-hidden="true">·</span>
          <span className="text-slate-300 font-normal hidden sm:inline text-[11px] leading-none">
            Your digital granary.
          </span>
          <span className="text-slate-600 font-mono text-[10px] hidden lg:inline" aria-hidden="true">|</span>
          <span className="text-slate-400 font-normal hidden lg:inline text-[10px] leading-none">
            a product of <strong className="text-slate-300 font-medium">Enen Digital Labs™</strong>
          </span>
        </div>
      </div>

      {/* Middle/Right: Live backup status and connected-drive status */}
      <div
        className="hidden md:flex items-center gap-3 text-slate-300 text-xs mx-auto"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#132247]/80 border border-[#1E3466]"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isBackingUp
                ? 'bg-[#F4A62A] animate-pulse'
                : isAutoBackupActive
                ? 'bg-[#00A884]'
                : 'bg-slate-500'
            }`}
          />
          <span className="text-[11px] font-medium text-slate-200">
            {isBackingUp
              ? 'Backup in progress...'
              : isAutoBackupActive
              ? 'Monitoring for removable drives'
              : 'Auto-backup paused'}
          </span>
        </div>
        {activeDrivesCount > 0 && (
          <div
            className="flex items-center gap-1 text-slate-300 text-[11px]"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <HardDrive className="w-3 h-3 text-[#F4A62A]" />
            <span>{activeDrivesCount} drive{activeDrivesCount > 1 ? 's' : ''} connected</span>
          </div>
        )}
      </div>

      {/* Far Right: Exactly one consolidated set of window controls */}
      <div
        className="flex items-center gap-0.5 -mr-1"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {/* Web download link (suppressed inside Electron app) */}
        {onOpenDownloadModal && typeof window !== 'undefined' && !(window as any).electronAPI?.isElectron && (
          <button
            onClick={onOpenDownloadModal}
            title="Download Installable Windows Software (.exe)"
            className="flex items-center gap-1.5 px-2.5 py-1 mr-2 rounded bg-[#F4A62A]/15 hover:bg-[#F4A62A]/25 text-[11px] text-[#F4A62A] font-semibold transition-colors border border-[#F4A62A]/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Download .exe</span>
          </button>
        )}

        {/* Windows 11 Minimize Control */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize Window"
          className="w-10 h-8 flex items-center justify-center hover:bg-[#162852] rounded text-slate-400 hover:text-white transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Windows 11 Maximize / Restore Control */}
        <button
          onClick={handleToggleMaximize}
          title={isMaximized ? 'Restore Down' : 'Maximize'}
          aria-label={isMaximized ? 'Restore Window' : 'Maximize Window'}
          className="w-10 h-8 flex items-center justify-center hover:bg-[#162852] rounded text-slate-400 hover:text-white transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        {/* Windows 11 Close Control (Hides safely to System Tray) */}
        <button
          onClick={handleClose}
          title="Close (Hide to Tray)"
          aria-label="Close to Tray"
          className="w-10 h-8 flex items-center justify-center hover:bg-[#E81123] hover:text-white rounded text-slate-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
