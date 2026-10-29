/**
 * Dero Vault — Prominent Capacity Warning Modal
 * Workstream A: Unmistakable central modal for destination capacity exhaustion
 * 
 * Displays when a backup is stopped by preflight capacity safety.
 * Renders exact required, available, and additional space metrics from the authoritative session.
 * Provides explicit actions: Revise Backup Assignment, Select Another Drive, Dismiss.
 */

import React from 'react';
import { AlertTriangle, HardDrive, FolderSync, X, ArrowRight, ShieldAlert } from 'lucide-react';
import { BackupSession } from '../types';

interface CapacityWarningModalProps {
  session: BackupSession;
  onDismiss: () => void;
  onReviseAssignment: (driveStableId: string) => void;
  onSelectAnotherDrive: () => void;
}

export const CapacityWarningModal: React.FC<CapacityWarningModalProps> = ({
  session,
  onDismiss,
  onReviseAssignment,
  onSelectAnotherDrive,
}) => {
  const assessment = session.capacityAssessment;
  const driveName = session.driveName || 'Removable Storage';
  const driveLetter = session.driveLetter || 'USB';

  // Format fallback helpers if formatted strings not present
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const reqSpace = assessment?.formattedRequired || formatBytes(session.bytesTotal || assessment?.totalRequiredBytes);
  const availSpace = assessment?.formattedAvailable || formatBytes(assessment?.availableBytes);
  const neededSpace = assessment?.formattedAdditionalNeeded || formatBytes(assessment?.additionalNeededBytes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="capacity-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-xl bg-[#0D1B3D] border-2 border-amber-500/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Amber accent top bar */}
        <div className="h-2 bg-gradient-to-r from-amber-500 via-[#F4A62A] to-amber-600" />

        <div className="p-6 sm:p-7 space-y-6">
          {/* Header with prominent icon */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-[#F4A62A] shrink-0 shadow-inner">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-amber-400 font-mono">
                  Capacity Safety Preflight
                </span>
                <h2
                  id="capacity-modal-title"
                  className="text-lg sm:text-xl font-bold font-['Poppins',sans-serif] text-white tracking-tight"
                >
                  DESTINATION CAPACITY INSUFFICIENT
                </h2>
              </div>
            </div>
            <button
              onClick={onDismiss}
              title="Dismiss warning"
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1E3466] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Core statement */}
          <div className="p-4 bg-[#081126] border border-[#1E3466] rounded-xl space-y-2">
            <p className="text-sm text-slate-200 leading-relaxed font-['Inter',sans-serif]">
              The selected backup drive <strong className="text-white font-semibold">{driveName} ({driveLetter})</strong> does not have enough available space to complete this backup safely.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 font-['Poppins',sans-serif]">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Zero backup files have been transferred. Your data is protected.</span>
            </div>
          </div>

          {/* Three Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-[#132247] border border-[#1E3466] rounded-xl text-center space-y-1">
              <span className="text-[11px] font-medium text-slate-300 uppercase tracking-wider block">
                Required space
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-white block">
                {reqSpace}
              </span>
            </div>

            <div className="p-3.5 bg-[#132247] border border-[#1E3466] rounded-xl text-center space-y-1">
              <span className="text-[11px] font-medium text-slate-300 uppercase tracking-wider block">
                Available space
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-amber-300 block">
                {availSpace}
              </span>
            </div>

            <div className="p-3.5 bg-[#1F1722] border border-amber-500/40 rounded-xl text-center space-y-1">
              <span className="text-[11px] font-medium text-amber-300 uppercase tracking-wider block">
                Additional needed
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-rose-400 block">
                {neededSpace}
              </span>
            </div>
          </div>

          {/* FAT32 File Size Warning if applicable */}
          {assessment?.fat32Violations && assessment.fat32Violations.length > 0 && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 space-y-1">
              <span className="font-semibold block font-['Poppins',sans-serif]">Filesystem Constraint: FAT32 Limit</span>
              <p className="text-[11px] text-slate-300">
                The destination is formatted as FAT32, which cannot store single files exceeding 4 GB:
              </p>
              <div className="font-mono text-[10px] text-amber-200">
                {assessment.fat32Violations.map((v: { path: string; formattedSize?: string }) => `${v.path} (${v.formattedSize || 'exceeds 4GB'})`).join(', ')}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 bg-transparent hover:bg-[#132247] text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-[#1E3466] transition-colors order-3 sm:order-1"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onSelectAnotherDrive}
              className="px-4 py-2.5 bg-[#132247] hover:bg-[#1A2E5E] text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-[#1E3466] flex items-center justify-center gap-1.5 transition-colors order-2"
            >
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>Select Another Drive</span>
            </button>
            <button
              type="button"
              onClick={() => onReviseAssignment(session.driveStableId)}
              className="px-4 py-2.5 bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] rounded-xl text-xs font-bold font-['Poppins',sans-serif] flex items-center justify-center gap-1.5 shadow-md transition-colors order-1 sm:order-3"
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>Revise Backup Assignment</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
