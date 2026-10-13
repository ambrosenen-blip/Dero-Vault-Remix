/**
 * Dero Vault — Backup Profiles Screen
 * Prompt Section 11 & 12
 */

import React, { useState } from 'react';
import { FolderSync, Plus, Trash2, Check, ShieldCheck, HardDrive } from 'lucide-react';
import { BackupProfile, RemovableDrive } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';

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
        <DeroGranaryEmblem size={56} className="mx-auto" />
        <h3 className="text-base font-semibold font-['Poppins',sans-serif] text-white">No backup profiles configured</h3>
        <p className="text-xs text-slate-300 max-w-md mx-auto font-['Inter',sans-serif]">
          Register a removable storage drive first to create a tailored digital granary profile.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="pb-4 border-b border-[#1E3466]">
        <h2 className="text-xl font-bold font-['Poppins',sans-serif] text-white">Backup Profiles</h2>
        <p className="text-xs text-slate-300 mt-1 font-['Inter',sans-serif]">
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
                  ? 'bg-[#132247] border-[#F4A62A] text-white font-semibold shadow-xs'
                  : 'bg-[#0D1B3D] border-[#1E3466] text-slate-300 hover:text-white'
              }`}
            >
              <HardDrive className={`w-3.5 h-3.5 ${isSelected ? 'text-[#F4A62A]' : 'text-slate-400'}`} />
              <span className="font-['Poppins',sans-serif]">{drive.friendlyName || drive.volumeLabel}</span>
              <span className="text-[11px] font-mono text-slate-400">[{drive.driveLetter}]</span>
            </button>
          );
        })}
      </div>

      {currentProfile && (
        <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-6 space-y-6 text-xs shadow-sm">
          {/* Section: Protected Source Folders */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white">
                  Protected Source Folders
                </h3>
                <p className="text-slate-300 text-xs mt-0.5">
                  Dero Vault scans these locations on your computer and safely copies new or modified files.
                </p>
              </div>
              <span className="font-mono text-[#F4A62A] font-semibold">
                {currentProfile.sourceFolders.length} folder(s)
              </span>
            </div>

            {/* Folder List */}
            <div className="space-y-2">
              {currentProfile.sourceFolders.map((folder, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-[#081126] border border-[#1E3466] rounded-lg group"
                >
                  <span className="font-mono text-slate-200 text-xs break-all">
                    {folder}
                  </span>
                  <button
                    onClick={() => handleRemoveFolder(folder)}
                    disabled={currentProfile.sourceFolders.length <= 1}
                    title={currentProfile.sourceFolders.length <= 1 ? 'At least one folder required' : 'Remove folder'}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                className="flex-1 px-3.5 py-2 bg-[#081126] border border-[#1E3466] rounded-lg text-slate-200 placeholder:text-slate-500 focus:border-[#F4A62A] focus:outline-hidden"
              />
              <button
                onClick={handleAddFolder}
                className="px-4 py-2 bg-[#132247] hover:bg-[#1A2E5E] text-[#F4A62A] hover:text-white rounded-lg font-bold font-['Poppins',sans-serif] flex items-center gap-1.5 transition-colors border border-[#1E3466]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Folder</span>
              </button>
            </div>
          </div>

          {/* Section: Profile Options */}
          <div className="pt-4 border-t border-[#1E3466] space-y-4">
            <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white">
              Granary Backup Rules
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                onClick={handleToggleAutoBackup}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  currentProfile.autoBackupEnabled
                    ? 'bg-[#132247] border-[#00A884]/60 text-white'
                    : 'bg-[#081126] border-[#1E3466] text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-slate-200 font-['Poppins',sans-serif]">Auto-Backup</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      currentProfile.autoBackupEnabled ? 'bg-[#00A884]' : 'bg-slate-700'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Automatically start backing up as soon as this drive is plugged in.
                </p>
              </div>

              <div
                onClick={handleToggleVerify}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  currentProfile.verifyBackups
                    ? 'bg-[#132247] border-[#00A884]/60 text-white'
                    : 'bg-[#081126] border-[#1E3466] text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-slate-200 font-['Poppins',sans-serif]">Verify Integrity</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      currentProfile.verifyBackups ? 'bg-[#00A884]' : 'bg-slate-700'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Verify destination file size and SHA-256 checksums after copy.
                </p>
              </div>

              <div
                onClick={handleToggleVersions}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  currentProfile.preserveVersions
                    ? 'bg-[#132247] border-[#F4A62A]/60 text-white'
                    : 'bg-[#081126] border-[#1E3466] text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-slate-200 font-['Poppins',sans-serif]">Version History</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      currentProfile.preserveVersions ? 'bg-[#F4A62A]' : 'bg-slate-700'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
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
