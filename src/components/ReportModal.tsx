/**
 * Dero Vault — Backup Report Modal
 * Prompt Section 21 & 22: Detailed inspection of backup session results.
 */

import React from 'react';
import { FileText, CheckCircle2, AlertTriangle, XCircle, Download, X, ShieldCheck } from 'lucide-react';
import { BackupSession } from '../types';

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
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-6 text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Granary Inspection Report
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Backup Session Summary
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <div>
            <div className="text-slate-400">Target Storage Media:</div>
            <div className="text-sm font-bold text-slate-100 mt-0.5">
              {session.driveName} [{session.driveLetter}]
            </div>
          </div>

          <div className="text-right">
            <div className="text-slate-400">Session Result:</div>
            <div className="mt-0.5">
              {session.status === 'completed' ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Success (Verified ✓)</span>
                </span>
              ) : session.status === 'completed_with_errors' ? (
                <span className="inline-flex items-center gap-1 font-bold text-amber-400">
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
          <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-lg">
            <span className="text-slate-400 block mb-1">Files scanned</span>
            <span className="font-mono text-base font-bold text-slate-200">
              {session.filesScanned.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-lg">
            <span className="text-slate-400 block mb-1">New files written</span>
            <span className="font-mono text-base font-bold text-emerald-400">
              {session.newFilesCount.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-lg">
            <span className="text-slate-400 block mb-1">Modified files</span>
            <span className="font-mono text-base font-bold text-amber-400">
              {session.modifiedFilesCount.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-lg">
            <span className="text-slate-400 block mb-1">Skipped (Unchanged)</span>
            <span className="font-mono text-base font-bold text-slate-400">
              {session.filesSkipped.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Detailed Timestamps and Space */}
        <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-4 space-y-2 text-xs font-mono">
          <div className="flex justify-between py-1 border-b border-slate-850">
            <span className="text-slate-400">Start Time:</span>
            <span className="text-slate-200">{new Date(session.startTime).toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-850">
            <span className="text-slate-400">End Time:</span>
            <span className="text-slate-200">{session.endTime ? new Date(session.endTime).toLocaleString() : 'N/A'}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-850">
            <span className="text-slate-400">Data Transferred:</span>
            <span className="text-slate-200">{formatBytes(session.bytesTransferred)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Verification Status:</span>
            <span className={session.isVerified ? 'text-emerald-400' : 'text-amber-400'}>
              {session.isVerified ? 'Verified ✓ (Integrity confirmed)' : 'Standard / Skipped'}
            </span>
          </div>
        </div>

        {/* Errors Section (Prompt Section 22) */}
        {session.errors.length > 0 && (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Reported Issues ({session.errors.length})</span>
            </div>
            <div className="bg-slate-950 border border-rose-900/40 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2 font-mono text-[11px]">
              {session.errors.map((err, idx) => (
                <div key={idx} className="border-b border-slate-900 pb-1.5 last:border-0">
                  <div className="text-slate-400 break-all">{err.path}</div>
                  <div className="text-rose-400 font-medium">↳ {err.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
          <button
            onClick={handleDownloadJson}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report JSON</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
