/**
 * Dero Vault — Backup Profiles Screen
 * Prompt Section 11 & 12, Workstream B Repair
 * 
 * Provides responsive, validated folder management per registered drive.
 * Validates folder existence and accessibility, prevents duplicates,
 * provides native folder browsing, and maintains strict drive profile isolation.
 */

import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  Plus,
  Trash2,
  Check,
  ShieldCheck,
  HardDrive,
  Folder,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { BackupProfile, RemovableDrive } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';
import { ApiClient } from '../services/api';

interface BackupProfilesViewProps {
  backupProfiles: BackupProfile[];
  registeredDrives: RemovableDrive[];
  onUpdateProfile: (driveStableId: string, updates: Partial<BackupProfile>) => Promise<void> | void;
  initialDriveStableId?: string;
}

export const BackupProfilesView: React.FC<BackupProfilesViewProps> = ({
  backupProfiles,
  registeredDrives,
  onUpdateProfile,
  initialDriveStableId,
}) => {
  const [selectedStableId, setSelectedStableId] = useState<string>(
    initialDriveStableId || registeredDrives[0]?.stableHardwareId || ''
  );
  const [newFolderInput, setNewFolderInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize selected drive when registeredDrives array updates or changes
  useEffect(() => {
    if (initialDriveStableId && registeredDrives.some((d) => d.stableHardwareId === initialDriveStableId)) {
      setSelectedStableId(initialDriveStableId);
      return;
    }
    if ((!selectedStableId || !registeredDrives.some((d) => d.stableHardwareId === selectedStableId)) && registeredDrives.length > 0) {
      setSelectedStableId(registeredDrives[0].stableHardwareId);
    }
  }, [registeredDrives, initialDriveStableId, selectedStableId]);

  // Robust profile resolution with fallback to first drive's profile
  const effectiveStableId = selectedStableId || registeredDrives[0]?.stableHardwareId || '';
  const currentProfile = backupProfiles.find((p) => p.driveStableId === effectiveStableId) ||
    (registeredDrives.length > 0 ? backupProfiles.find((p) => p.driveStableId === registeredDrives[0].stableHardwareId) : undefined);
  const currentDrive = registeredDrives.find((d) => d.stableHardwareId === effectiveStableId);

  const handleBrowseFolder = async () => {
    setInputError(null);
    try {
      if ((window as any).electronAPI?.browseFolder) {
        const chosen = await (window as any).electronAPI.browseFolder();
        if (chosen) {
          setNewFolderInput(chosen);
        }
      } else {
        const entered = prompt('Enter absolute folder path (e.g. C:\\Users\\User\\Documents or /home/user/docs):');
        if (entered && entered.trim()) {
          setNewFolderInput(entered.trim());
        }
      }
    } catch (err: any) {
      console.warn('Folder picker error:', err);
    }
  };

  const handleAddFolder = async () => {
    if (!currentProfile) {
      setInputError('No backup profile selected.');
      return;
    }

    const clean = newFolderInput.trim().replace(/^["']+|["']+$/g, '').trim();
    if (!clean) {
      setInputError('Please specify a valid absolute folder path.');
      return;
    }

    // Check duplicate (case-insensitive for Windows, exact for Linux)
    const isDuplicate = currentProfile.sourceFolders.some(
      (f) => f.toLowerCase() === clean.toLowerCase()
    );
    if (isDuplicate) {
      setInputError(`"${clean}" is already in the protected list for this drive.`);
      return;
    }

    setIsSaving(true);
    setInputError(null);
    setFeedbackSuccess(null);

    try {
      // Validate folder exists and is accessible
      const validation = await ApiClient.validateFolder(clean);
      if (!validation.valid) {
        setInputError(validation.error || 'The specified folder could not be verified.');
        setIsSaving(false);
        return;
      }

      const validatedPath = validation.path || clean;
      const updatedFolders = [...currentProfile.sourceFolders, validatedPath];

      await onUpdateProfile(currentProfile.driveStableId, {
        sourceFolders: updatedFolders,
      });

      setNewFolderInput('');
      setFeedbackSuccess(`Folder "${validatedPath}" successfully added and saved.`);
      setTimeout(() => setFeedbackSuccess(null), 4000);
    } catch (err: any) {
      setInputError(err.message || 'Failed to save folder to profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveFolder = async (folderToRemove: string) => {
    if (!currentProfile) return;
    if (currentProfile.sourceFolders.length <= 1) {
      setInputError('At least one source folder must remain protected.');
      return;
    }

    setIsSaving(true);
    setInputError(null);
    try {
      const updated = currentProfile.sourceFolders.filter((f) => f !== folderToRemove);
      await onUpdateProfile(currentProfile.driveStableId, { sourceFolders: updated });
      setFeedbackSuccess(`Folder removed from profile.`);
      setTimeout(() => setFeedbackSuccess(null), 3000);
    } catch (err: any) {
      setInputError(err.message || 'Failed to remove folder.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAutoBackup = async () => {
    if (!currentProfile) return;
    await onUpdateProfile(currentProfile.driveStableId, {
      autoBackupEnabled: !currentProfile.autoBackupEnabled,
    });
  };

  const handleToggleVerify = async () => {
    if (!currentProfile) return;
    await onUpdateProfile(currentProfile.driveStableId, {
      verifyBackups: !currentProfile.verifyBackups,
    });
  };

  const handleToggleVersions = async () => {
    if (!currentProfile) return;
    await onUpdateProfile(currentProfile.driveStableId, {
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
          const isSelected = effectiveStableId === drive.stableHardwareId;
          return (
            <button
              key={drive.stableHardwareId}
              onClick={() => {
                setSelectedStableId(drive.stableHardwareId);
                setInputError(null);
                setFeedbackSuccess(null);
              }}
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
                <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white flex items-center gap-2">
                  <span>Protected Source Folders</span>
                  <span className="text-[11px] font-mono text-slate-400 font-normal">
                    for {currentDrive?.friendlyName || currentDrive?.volumeLabel || 'Drive'} [{currentDrive?.driveLetter}]
                  </span>
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
                    disabled={currentProfile.sourceFolders.length <= 1 || isSaving}
                    title={currentProfile.sourceFolders.length <= 1 ? 'At least one folder required' : 'Remove folder'}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Custom Folder Input & Actions */}
            <div className="space-y-2 pt-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => {
                    setNewFolderInput(e.target.value);
                    if (inputError) setInputError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddFolder();
                    }
                  }}
                  placeholder="Enter absolute folder path (e.g. D:\Backups or C:\Users\User\Documents)"
                  disabled={isSaving}
                  className="flex-1 px-3.5 py-2 bg-[#081126] border border-[#1E3466] rounded-lg text-slate-200 placeholder:text-slate-500 focus:border-[#F4A62A] focus:outline-hidden disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={isSaving}
                  title="Browse local folders"
                  className="px-3.5 py-2 bg-[#132247] hover:bg-[#1A2E5E] text-slate-200 hover:text-white rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors border border-[#1E3466] shrink-0"
                >
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>Browse...</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddFolder}
                  disabled={isSaving || !newFolderInput.trim()}
                  className="px-4 py-2 bg-[#F4A62A] hover:bg-[#F6B54A] disabled:bg-[#132247] text-[#0D1B3D] disabled:text-slate-500 rounded-lg font-bold font-['Poppins',sans-serif] flex items-center justify-center gap-1.5 transition-colors border border-[#1E3466] disabled:border-[#1E3466] shrink-0"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Folder</span>
                    </>
                  )}
                </button>
              </div>

              {/* Validation Error Feedback */}
              {inputError && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{inputError}</span>
                </div>
              )}

              {/* Success Feedback */}
              {feedbackSuccess && (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{feedbackSuccess}</span>
                </div>
              )}
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
