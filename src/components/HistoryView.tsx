/**
 * Dero Vault — Backup History Screen
 * Prompt Section 26
 */

import React, { useState } from 'react';
import { History, CheckCircle2, AlertTriangle, XCircle, FileText, Trash2, ArrowUpRight } from 'lucide-react';
import { BackupSession } from '../types';

interface HistoryViewProps {
  history: BackupSession[];
  onViewReport: (session: BackupSession) => void;
  onClearHistory: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onViewReport,
  onClearHistory,
}) => {
  const [filter, setFilter] = useState<'all' | 'success' | 'errors'>('all');

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filtered = history.filter((s) => {
    if (filter === 'success') return s.status === 'completed';
    if (filter === 'errors') return s.status === 'completed_with_errors' || s.errors.length > 0;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E3466]">
        <div>
          <h2 className="text-xl font-bold font-['Poppins',sans-serif] text-white">Backup History</h2>
          <p className="text-xs text-slate-300 mt-1 font-['Inter',sans-serif]">
            Complete local record of digital granary operations. Stored strictly on your computer.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter buttons */}
          <div className="flex items-center gap-1 p-1 bg-[#0D1B3D] border border-[#1E3466] rounded-lg text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                filter === 'all' ? 'bg-[#162852] text-[#F4A62A] font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({history.length})
            </button>
            <button
              onClick={() => setFilter('success')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                filter === 'success' ? 'bg-[#162852] text-[#00A884] font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Success
            </button>
            <button
              onClick={() => setFilter('errors')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                filter === 'errors' ? 'bg-[#162852] text-[#F4A62A] font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              With Warnings
            </button>
          </div>

          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              title="Clear Local History"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-[#162852] rounded-lg transition-colors border border-transparent hover:border-[#1E3466]"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 bg-[#0D1B3D] border border-[#1E3466] rounded-xl text-center space-y-3">
          <History className="w-10 h-10 text-[#F4A62A]/60 mx-auto" />
          <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white">No backup records</h3>
          <p className="text-xs text-slate-300 max-w-sm mx-auto font-['Inter',sans-serif]">
            When you plug in a registered drive, backup sessions will appear here with complete verification logs.
          </p>
        </div>
      ) : (
        <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1E3466] bg-[#081126] text-slate-300 font-semibold uppercase tracking-wider text-[11px] font-['Poppins',sans-serif]">
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Drive</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4 text-right">Files</th>
                  <th className="py-3 px-4 text-right">Transferred</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3466]/70 text-slate-300">
                {filtered.map((item) => {
                  const dateStr = new Date(item.startTime).toLocaleString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onViewReport(item)}
                      className="hover:bg-[#132247] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                        {dateStr}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white font-['Poppins',sans-serif]">{item.driveName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">[{item.driveLetter}]</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#00A884] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Success</span>
                          </span>
                        ) : item.status === 'completed_with_errors' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#F4A62A] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{item.errors.length} error(s)</span>
                          </span>
                        ) : item.status === 'interrupted' ? (
                          <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Interrupted</span>
                          </span>
                        ) : item.status === 'stopped_insufficient_space' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#F4A62A] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Storage full</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 capitalize">{item.status}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <span className="text-white">{item.filesCopied}</span>
                        <span className="text-slate-400 text-[11px]"> / {item.filesScanned}</span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-[#00A884]">
                        {formatBytes(item.bytesTransferred)}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-medium ${
                            item.isVerified ? 'text-[#00A884]' : 'text-slate-400'
                          }`}
                        >
                          {item.isVerified ? 'Verified ✓' : 'Standard'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewReport(item);
                          }}
                          className="px-2.5 py-1 text-slate-200 hover:text-white bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] rounded font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <span>Report</span>
                          <ArrowUpRight className="w-3 h-3 text-[#F4A62A]" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
