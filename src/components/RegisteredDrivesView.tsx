/**
 * Dero Vault — Registered Drives Screen
 * Prompt Section 27
 */

import React, { useState } from 'react';
import { HardDrive, Edit3, Trash2, FolderSync, ShieldCheck, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { BackupProfile, RemovableDrive } from '../types';

interface RegisteredDrivesViewProps {
  registeredDrives: RemovableDrive[];
  activeDrives: RemovableDrive[];
  backupProfiles: BackupProfile[];
  onStartBackup: (stableHardwareId: string) => void;
  onUpdateDrive: (stableId: string, data: Partial<RemovableDrive>) => void;
  onUnregister: (stableId: string) => void;
  onViewHistory: () => void;
}

export const RegisteredDrivesView: React.FC<RegisteredDrivesViewProps> = ({
  registeredDrives,
  activeDrives,
  backupProfiles,
  onStartBackup,
  onUpdateDrive,
  onUnregister,
  onViewHistory,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleStartEdit = (drive: RemovableDrive) => {
    setEditingId(drive.stableHardwareId);
    setEditName(drive.friendlyName || drive.volumeLabel || '');
  };

  const handleSaveEdit = (stableId: string) => {
    if (editName.trim()) {
      onUpdateDrive(stableId, { friendlyName: editName.trim() });
    }
    setEditingId(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Registered Drives</h2>
          <p className="text-xs text-slate-400 mt-1">
            Physical storage media recognized by your digital granary. Dero Vault tracks hardware serial identities so changing Windows drive letters never loses your configuration.
          </p>
        </div>
        <button
          onClick={onViewHistory}
          className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors self-start sm:self-auto"
        >
          View All Backup History
        </button>
      </div>

      {registeredDrives.length === 0 ? (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
          <HardDrive className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-200">No registered drives yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Connect a USB hard drive or flash disk to register it as an automatic backup granary.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {registeredDrives.map((drive) => {
            const isCurrentlyConnected = activeDrives.some(
              (d) => d.stableHardwareId === drive.stableHardwareId && d.isConnected
            );
            const liveDrive = activeDrives.find((d) => d.stableHardwareId === drive.stableHardwareId);
            const profile = backupProfiles.find((p) => p.driveStableId === drive.stableHardwareId);

            return (
              <div
                key={drive.stableHardwareId}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/80 shrink-0">
                      <HardDrive className="w-6 h-6" />
                    </div>

                    <div className="space-y-1">
                      {editingId === drive.stableHardwareId ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2.5 py-1 text-sm bg-slate-950 border border-emerald-500 rounded text-slate-100"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(drive.stableHardwareId)}
                            className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-100">
                            {drive.friendlyName || drive.volumeLabel}
                          </h3>
                          <button
                            onClick={() => handleStartEdit(drive)}
                            title="Edit Friendly Name"
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{drive.deviceModel || 'Removable Device'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Capacity: {formatBytes(drive.totalBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Current letter:{' '}
                          <strong className="text-emerald-400 font-mono">
                            {liveDrive?.driveLetter || drive.driveLetter || '—'}
                          </strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-500 text-[11px]">
                          Serial: {drive.volumeSerial}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 self-start">
                    {isCurrentlyConnected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-emerald-950/40 border border-emerald-500/40 text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected &amp; Healthy</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 border border-slate-700 text-slate-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Not Connected</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Protected Folders */}
                {profile && (
                  <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-lg text-xs space-y-1.5">
                    <div className="text-slate-400 font-medium">Protected source folders:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.sourceFolders.map((sf, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-slate-300 text-[11px]"
                        >
                          {sf}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                  <div>
                    Last backup:{' '}
                    <strong className="text-slate-200">
                      {drive.lastBackupAt ? new Date(drive.lastBackupAt).toLocaleString() : 'Never'}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCurrentlyConnected && (
                      <button
                        onClick={() => onStartBackup(drive.stableHardwareId)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run Backup</span>
                      </button>
                    )}

                    <button
                      onClick={() => onUnregister(drive.stableHardwareId)}
                      title="Unregister drive (does not delete existing backup files on disk)"
                      className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 rounded-lg font-medium flex items-center gap-1.5 transition-colors border border-slate-700/60 hover:border-rose-900/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Unregister</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
