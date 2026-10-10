/**
 * Dero Vault — Backup Profiles Screen
 * Prompt Section 11 & 12
 */

import React, { useState } from 'react';
import { FolderSync, Plus, Trash2, Check, ShieldCheck, HardDrive } from 'lucide-react';
import { BackupProfile, RemovableDrive } from '../types';

interface BackupProfilesViewProps {
  backupProfiles: BackupProfile[];
  registeredDrives: RemovableDrive[];
  onUpdateProfile: (driveStableId: string, updates: Partial<BackupProfile>) => void;
}

export const BackupProfilesView: React.FC<BackupProfilesViewProps> = ({
  backupProfiles,
  registeredDrives,
  onUpdateProfile,
}) => {
  const [selectedStableId, setSelectedStableId] = useState<string>(
    registeredDrives[0]?.stableHardwareId || ''
  );
  const [newFolderInput, setNewFolderInput] = useState('');

  const currentProfile = backupProfiles.find((p) => p.driveStableId === selectedStableId);
  const currentDrive = registeredDrives.find((d) => d.stableHardwareId === selectedStableId);

  const handleAddFolder = () => {
    if (!currentProfile || !newFolderInput.trim()) return;
    const clean = newFolderInput.trim();
    if (!currentProfile.sourceFolders.includes(clean)) {
      onUpdateProfile(currentProfile.driveStableId, {
        sourceFolders: [...currentProfile.sourceFolders, clean],
      });
      setNewFolderInput('');
    }
  };

  const handleRemoveFolder = (folderToRemove: string) => {
    if (!currentProfile) return;
    onUpdateProfile(currentProfile.driveStableId, {
      sourceFolders: currentProfile.sourceFolders.filter((f) => f !== folderToRemove),
    });
  };

  const handleToggleAutoBackup = () => {
    if (!currentProfile) return;
    onUpdateProfile(currentProfile.driveStableId, {
      autoBackupEnabled: !currentProfile.autoBackupEnabled,
    });
  };

  const handleToggleVerify = () => {
    if (!currentProfile) return;
    onUpdateProfile(currentProfile.driveStableId, {
      verifyBackups: !currentProfile.verifyBackups,
    });
  };

  const handleToggleVersions = () => {
    if (!currentProfile) return;
    onUpdateProfile(currentProfile.driveStableId, {
      preserveVersions: !currentProfile.preserveVersions,
    });
  };

  if (registeredDrives.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-center space-y-3">
        <FolderSync className="w-12 h-12 text-slate-600 mx-auto" />
        <h3 className="text-base font-semibold text-slate-200">No backup profiles configured</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Register a removable storage drive first to create a tailored digital granary profile.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="pb-4 border-b border-slate-800">
        <h2 className="text-xl font-bold text-slate-100">Backup Profiles</h2>
        <p className="text-xs text-slate-400 mt-1">
          Customize which folders are automatically protected for each registered drive.
        </p>
      </div>

      {/* Drive Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {registeredDrives.map((drive) => {
          const isSelected = (selectedStableId || registeredDrives[0].stableHardwareId) === drive.stableHardwareId;
          return (
            <button
              key={drive.stableHardwareId}
              onClick={() => setSelectedStableId(drive.stableHardwareId)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                isSelected
                  ? 'bg-slate-800 border-emerald-500/50 text-slate-100 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <HardDrive className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>{drive.friendlyName || drive.volumeLabel}</span>
              <span className="text-[11px] font-mono text-slate-500">[{drive.driveLetter}]</span>
            </button>
          );
        })}
      </div>

      {currentProfile && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 text-xs shadow-sm">
          {/* Section: Protected Source Folders */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Protected Source Folders
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  Dero Vault scans these locations on your computer and safely copies new or modified files.
                </p>
              </div>
              <span className="font-mono text-slate-400">
                {currentProfile.sourceFolders.length} folder(s)
              </span>
            </div>

            {/* Folder List */}
            <div className="space-y-2">
              {currentProfile.sourceFolders.map((folder, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-slate-950 border border-slate-850 rounded-lg group"
                >
                  <span className="font-mono text-slate-200 text-xs break-all">
                    {folder}
                  </span>
                  <button
                    onClick={() => handleRemoveFolder(folder)}
                    disabled={currentProfile.sourceFolders.length <= 1}
                    title={currentProfile.sourceFolders.length <= 1 ? 'At least one folder required' : 'Remove folder'}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Custom Folder */}
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                value={newFolderInput}
                onChange={(e) => setNewFolderInput(e.target.value)}
                placeholder="Enter absolute folder path (e.g. D:\Backups or C:\Users\User\Documents)"
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-hidden"
              />
              <button
                onClick={handleAddFolder}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Folder</span>
              </button>
            </div>
          </div>

          {/* Section: Profile Options */}
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Granary Backup Rules
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                onClick={handleToggleAutoBackup}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  currentProfile.autoBackupEnabled
                    ? 'bg-slate-850 border-emerald-500/40 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-slate-200">Auto-Backup</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      currentProfile.autoBackupEnabled ? 'bg-emerald-400' : 'bg-slate-700'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Automatically start backing up as soon as this drive is plugged in.
                </p>
              </div>

              <div
                onClick={handleToggleVerify}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  currentProfile.verifyBackups
                    ? 'bg-slate-850 border-emerald-500/40 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-slate-200">Verify Integrity</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      currentProfile.verifyBackups ? 'bg-emerald-400' : 'bg-slate-700'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Verify destination file size and SHA-256 checksums after copy.
                </p>
              </div>

              <div
                onClick={handleToggleVersions}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  currentProfile.preserveVersions
                    ? 'bg-slate-850 border-emerald-500/40 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-slate-200">Version History</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      currentProfile.preserveVersions ? 'bg-emerald-400' : 'bg-slate-700'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Archive older versions of modified files in the VERSIONS directory.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
