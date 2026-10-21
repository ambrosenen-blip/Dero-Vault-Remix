/**
 * Dero Vault — Backup Reminder Banner
 * Non-intrusive, prominent in-app notification when a scheduled reminder is due.
 * 
 * Requirements:
 * - Distinguishes Reminders (prompts) from automated scheduled backups.
 * - Displays the last successful verified backup timestamp.
 * - Quick actions: "Back Up Now", "Snooze" (1h, 4h, Tomorrow), and "Dismiss".
 * - Dismissing clears current occurrence without disabling future cycles.
 */

import React, { useState } from 'react';
import { Bell, Clock, ShieldCheck, X, ChevronDown, Play, AlertCircle, HardDrive } from 'lucide-react';
import { ReminderNotificationData, RemovableDrive } from '../types';

interface ReminderBannerProps {
  notification: ReminderNotificationData;
  connectedRegisteredDrive?: RemovableDrive | null;
  onStartBackup?: () => void;
  onNavigateToDashboard?: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}

export const ReminderBanner: React.FC<ReminderBannerProps> = ({
  notification,
  connectedRegisteredDrive,
  onStartBackup,
  onNavigateToDashboard,
  onSnooze,
  onDismiss,
}) => {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const formatLastBackup = (iso: string | null) => {
    if (!iso) return 'No successful backup recorded yet.';
    try {
      const d = new Date(iso);
      return `Last verified backup: ${d.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return `Last verified backup: ${iso}`;
    }
  };

  const handleBackupClick = () => {
    if (connectedRegisteredDrive && onStartBackup) {
      onStartBackup();
    } else if (onNavigateToDashboard) {
      onNavigateToDashboard();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0D1B3D] via-[#132247] to-[#0D1B3D] border border-[#F4A62A]/40 shadow-lg text-white font-['Inter',sans-serif] animate-fadeIn">
      {/* Subtle top indicator bar */}
      <div className="h-1 bg-gradient-to-r from-[#F4A62A] via-[#00A884] to-[#F4A62A]" />

      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Icon & Narrative */}
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-lg bg-[#F4A62A]/15 border border-[#F4A62A]/30 text-[#F4A62A] shrink-0 mt-0.5">
            <Bell className="w-5 h-5 animate-pulse" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold font-['Poppins',sans-serif] text-white">
                Backup Reminder: Time to Protect Your Work
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#F4A62A]/20 text-[#F4A62A] border border-[#F4A62A]/40">
                Advisory Reminder
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              {notification.message || 'It is time to connect your vault drive and protect your files.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00A884]" />
                <span>{formatLastBackup(notification.lastVerifiedBackupAt)}</span>
              </div>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-400 text-[10px]">
                Dero Vault never performs unattended writes; you remain in control.
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          {/* Back up now button */}
          <button
            type="button"
            onClick={handleBackupClick}
            className="px-3.5 py-2 rounded-lg bg-[#F4A62A] hover:bg-[#e09520] text-[#0D1B3D] text-xs font-bold font-['Poppins',sans-serif] flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            {connectedRegisteredDrive ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Back Up Now</span>
              </>
            ) : (
              <>
                <HardDrive className="w-3.5 h-3.5" />
                <span>Connect Drive</span>
              </>
            )}
          </button>

          {/* Snooze Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              className="px-3 py-2 rounded-lg bg-[#162852] hover:bg-[#1E3466] border border-[#1E3466] text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Snooze</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showSnoozeMenu && (
              <div className="absolute right-0 mt-1 w-44 rounded-lg bg-[#081126] border border-[#1E3466] shadow-xl z-50 py-1 text-xs">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-[#1E3466]">
                  Postpone reminder
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSnoozeMenu(false);
                    onSnooze(60);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-[#162852] hover:text-white flex items-center justify-between transition-colors"
                >
                  <span>1 Hour</span>
                  <span className="text-[10px] text-slate-400">+60m</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSnoozeMenu(false);
                    onSnooze(240);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-[#162852] hover:text-white flex items-center justify-between transition-colors"
                >
                  <span>4 Hours</span>
                  <span className="text-[10px] text-slate-400">+4h</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSnoozeMenu(false);
                    onSnooze(1440);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-[#162852] hover:text-white flex items-center justify-between transition-colors border-t border-[#1E3466]"
                >
                  <span>Tomorrow</span>
                  <span className="text-[10px] text-slate-400">+24h</span>
                </button>
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss reminder for this cycle"
            className="p-2 rounded-lg bg-[#162852]/60 hover:bg-[#1E3466] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
