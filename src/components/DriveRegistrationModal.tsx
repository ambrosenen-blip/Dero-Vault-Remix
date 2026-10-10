/**
 * Dero Vault — Drive Registration & Protection Setup Modal
 * Real Windows folder picker integration, system directories, and custom folder validation.
 */

import React, { useState, useEffect } from 'react';
import { HardDrive, Folder, Check, Plus, Trash2, X, Shield, ArrowRight, FolderSearch } from 'lucide-react';
import { RemovableDrive } from '../types';
import { ApiClient } from '../services/api';

interface DriveRegistrationModalProps {
  drive: RemovableDrive | null;
  onClose: () => void;
  onComplete: (data: {
    stableHardwareId: string;
    friendlyName: string;
    sourceFolders: string[];
    autoBackupEnabled: boolean;
    verifyBackups: boolean;
    preserveVersions: boolean;
  }) => void;
}

export const DriveRegistrationModal: React.FC<DriveRegistrationModalProps> = ({
  drive,
  onClose,
  onComplete,
}) => {
  if (!drive) return null;

  const defaultName = drive.volumeLabel && drive.volumeLabel !== 'USB Drive' && drive.volumeLabel !== 'Removable Disk'
    ? `${drive.volumeLabel.replace(/_/g, ' ')} Backup`
    : `${drive.deviceModel || 'Office USB'} Backup`;

  const [friendlyName, setFriendlyName] = useState(defaultName);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [systemFolders, setSystemFolders] = useState<{ name: string; path: string; fileCount: number }[]>([]);
  const [customFolderPath, setCustomFolderPath] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [verifyBackups, setVerifyBackups] = useState(true);
  const [preserveVersions, setPreserveVersions] = useState(true);

  // Load real Windows user folders (Documents, Desktop, Pictures, etc.)
  useEffect(() => {
    ApiClient.getSystemFolders()
      .then((res) => {
        if (res.folders && res.folders.length > 0) {
          setSystemFolders(res.folders);
          // By default, select Documents if available
          const docs = res.folders.find((f) => f.name.toLowerCase() === 'documents') || res.folders[0];
          if (docs) {
            setSelectedPaths([docs.path]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const toggleFolder = (path: string) => {
    if (selectedPaths.includes(path)) {
      setSelectedPaths(selectedPaths.filter((p) => p !== path));
    } else {
      setSelectedPaths([...selectedPaths, path]);
    }
  };

  const handleBrowseNativeFolder = async () => {
    setIsBrowsing(true);
    setErrorMessage(null);
    try {
      const selected = await ApiClient.browseNativeFolder();
      if (selected && !selectedPaths.includes(selected)) {
        setSelectedPaths([...selectedPaths, selected]);
      }
    } catch (err: any) {
      setErrorMessage(`Folder picker error: ${err.message}`);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleAddCustomFolder = async () => {
    if (!customFolderPath.trim()) return;
    setErrorMessage(null);
    const clean = customFolderPath.trim();

    try {
      const check = await ApiClient.validateFolder(clean);
      if (!check.valid) {
        setErrorMessage(check.error || 'Folder not found on disk.');
        return;
      }

      if (!selectedPaths.includes(clean)) {
        setSelectedPaths([...selectedPaths, clean]);
        setCustomFolderPath('');
      }
    } catch (err: any) {
      setErrorMessage(`Validation error: ${err.message}`);
    }
  };

  const handleRemoveFolder = (path: string) => {
    setSelectedPaths(selectedPaths.filter((p) => p !== path));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendlyName.trim()) {
      setErrorMessage('Please give this drive a friendly name.');
      return;
    }

    if (selectedPaths.length === 0) {
      setErrorMessage('Please select at least one folder on your computer to protect.');
      return;
    }

    onComplete({
      stableHardwareId: drive.stableHardwareId,
      friendlyName: friendlyName.trim(),
      sourceFolders: selectedPaths,
      autoBackupEnabled,
      verifyBackups,
      preserveVersions,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-6 text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Granary Registration
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Register Storage Drive
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

        {errorMessage && (
          <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-lg text-xs text-rose-300">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {/* Step 1: Drive Friendly Name (Section 10 & 35) */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-200">
              Give this drive a name:
            </label>
            <input
              type="text"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="e.g. Office Backup, Work Documents, Client Archives"
              required
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-slate-100 text-sm placeholder:text-slate-600 transition-colors"
            />
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
              <span>Hardware: {drive.deviceModel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">Drive {drive.driveLetter}</span>
              {drive.volumeSerial && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500 text-[10px]">Serial: {drive.volumeSerial}</span>
                </>
              )}
            </div>
          </div>

          {/* Step 2: Choose what to protect (Section 11 & 35) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block font-medium text-slate-200">
                Choose folders to protect:
              </label>
              <button
                type="button"
                onClick={handleBrowseNativeFolder}
                disabled={isBrowsing}
                className="px-2.5 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 rounded font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <FolderSearch className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isBrowsing ? 'Opening dialog...' : 'Browse Folder...'}</span>
              </button>
            </div>

            {/* Standard Windows Folders */}
            <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
              {systemFolders.map((folder) => {
                const isSelected = selectedPaths.includes(folder.path);
                return (
                  <div
                    key={folder.path}
                    onClick={() => toggleFolder(folder.path)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-200'
                        : 'bg-slate-950/60 border-slate-850 hover:border-slate-750 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'border-slate-600 bg-slate-900'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-3" />}
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-slate-100">{folder.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">
                          {folder.path}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Any custom picked folders */}
              {selectedPaths
                .filter((p) => !systemFolders.some((sf) => sf.path === p))
                .map((customPath) => (
                  <div
                    key={customPath}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-emerald-950/30 border-emerald-500/60 text-emerald-200"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-4 h-4 rounded flex items-center justify-center bg-emerald-600 border-emerald-500 text-white shrink-0">
                        <Check className="w-3 h-3 stroke-3" />
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-slate-100">Custom Folder</div>
                        <div className="text-[11px] text-slate-300 font-mono truncate">
                          {customPath}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFolder(customPath)}
                      className="p-1 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>

            {/* Manual Path Input */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={customFolderPath}
                onChange={(e) => setCustomFolderPath(e.target.value)}
                placeholder="Or enter path: e.g. D:\Backups or C:\Users\User\Documents"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddCustomFolder}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors border border-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Step 3: Granary Protection Options */}
          <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Automatic backup upon drive connection
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={verifyBackups}
                onChange={(e) => setVerifyBackups(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Verify destination file integrity after writing (SHA-256)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preserveVersions}
                onChange={(e) => setPreserveVersions(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
              />
              <span className="text-slate-300 font-medium">
                Preserve historical revisions of modified files in VERSIONS
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <span>Register &amp; Back Up</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
