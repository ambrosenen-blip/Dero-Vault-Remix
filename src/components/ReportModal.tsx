/**
 * Dero Vault — Backup Report Modal
 * Prompt Section 21 & 22: Detailed inspection of backup session results.
 */

import React from 'react';
import { FileText, CheckCircle2, AlertTriangle, XCircle, Download, X, ShieldCheck } from 'lucide-react';
import { BackupSession } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';

interface ReportModalProps {
  session: BackupSession | null;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ session, onClose }) => {
  if (!session) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dero_vault_report_${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#0D1B3D] border border-[#1E3466] rounded-2xl shadow-2xl p-6 space-y-6 text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#1E3466]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <DeroGranaryEmblem size={36} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#F4A62A] font-['Poppins',sans-serif]">
                Granary Inspection Report
              </span>
              <h3 className="text-lg font-bold font-['Poppins',sans-serif] text-white mt-0.5">
                Backup Session Summary
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="flex items-center justify-between p-4 bg-[#081126] rounded-xl border border-[#1E3466] text-xs">
          <div>
            <div className="text-slate-400">Target Storage Media:</div>
            <div className="text-sm font-bold font-['Poppins',sans-serif] text-white mt-0.5">
              {session.driveName} [{session.driveLetter}]
            </div>
          </div>

          <div className="text-right">
            <div className="text-slate-400">Session Result:</div>
            <div className="mt-0.5">
              {session.status === 'completed' ? (
                <span className="inline-flex items-center gap-1 font-bold text-[#00A884]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Success (Verified ✓)</span>
                </span>
              ) : session.status === 'completed_with_errors' ? (
                <span className="inline-flex items-center gap-1 font-bold text-[#F4A62A]">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Completed with {session.errors.length} Warning(s)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-rose-400">
                  <XCircle className="w-4 h-4" />
                  <span>{session.status.replace(/_/g, ' ').toUpperCase()}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[#132247] border border-[#1E3466] rounded-lg">
            <span className="text-slate-300 block mb-1">Files scanned</span>
            <span className="font-mono text-base font-bold text-white">
              {session.filesScanned.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-[#132247] border border-[#1E3466] rounded-lg">
            <span className="text-slate-300 block mb-1">New files written</span>
            <span className="font-mono text-base font-bold text-[#00A884]">
              {session.newFilesCount.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-[#132247] border border-[#1E3466] rounded-lg">
            <span className="text-slate-300 block mb-1">Modified files</span>
            <span className="font-mono text-base font-bold text-[#F4A62A]">
              {session.modifiedFilesCount.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-[#132247] border border-[#1E3466] rounded-lg">
            <span className="text-slate-300 block mb-1">Skipped (Unchanged)</span>
            <span className="font-mono text-base font-bold text-slate-300">
              {session.filesSkipped.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Detailed Timestamps and Space */}
        <div className="bg-[#081126] border border-[#1E3466] rounded-xl p-4 space-y-2 text-xs font-mono">
          <div className="flex justify-between py-1 border-b border-[#1E3466]/70">
            <span className="text-slate-400">Start Time:</span>
            <span className="text-slate-200">{new Date(session.startTime).toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[#1E3466]/70">
            <span className="text-slate-400">End Time:</span>
            <span className="text-slate-200">{session.endTime ? new Date(session.endTime).toLocaleString() : 'N/A'}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[#1E3466]/70">
            <span className="text-slate-400">Data Transferred:</span>
            <span className="text-[#00A884] font-semibold">{formatBytes(session.bytesTransferred)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Verification Status:</span>
            <span className={session.isVerified ? 'text-[#00A884] font-semibold' : 'text-[#F4A62A]'}>
              {session.isVerified ? 'Verified ✓ (Integrity confirmed)' : 'Standard / Skipped'}
            </span>
          </div>
        </div>

        {/* Errors Section */}
        {session.errors.length > 0 && (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-rose-400 flex items-center gap-1.5 font-['Poppins',sans-serif]">
              <AlertTriangle className="w-4 h-4" />
              <span>Reported Issues ({session.errors.length})</span>
            </div>
            <div className="bg-[#081126] border border-rose-900/60 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2 font-mono text-[11px]">
              {session.errors.map((err, idx) => (
                <div key={idx} className="border-b border-[#1E3466]/40 pb-1.5 last:border-0">
                  <div className="text-slate-400 break-all">{err.path}</div>
                  <div className="text-rose-400 font-medium">↳ {err.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#1E3466] text-xs">
          <button
            onClick={handleDownloadJson}
            className="px-3.5 py-2 bg-[#132247] hover:bg-[#1A2E5E] text-slate-200 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors border border-[#1E3466]"
          >
            <Download className="w-3.5 h-3.5 text-[#F4A62A]" />
            <span>Export Report JSON</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] font-bold font-['Poppins',sans-serif] rounded-lg transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
