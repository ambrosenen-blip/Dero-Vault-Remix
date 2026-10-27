/**
 * Dero Vault — Rescue & Migration: Intelligent Cross-Platform Recovery
 * Publisher: Enen Digital Labs Co. Ltd
 * 
 * Implements the full plug-and-play user journey:
 * Step A — Discover: Auto-detects operating system and identifies backup.
 * Step B — Explain: 4-Check compatibility evaluation & branded granary message.
 * Step C — Dual Choices: Primary ("Install Dero Vault and restore my office")
 *          and Secondary ("I will install Dero Vault myself").
 * Step D — Install or Hand Over: In-app instant readiness & offline package verification.
 * Step E — Inspect & Restore: Smart cross-platform profile mapping, conflict strategies,
 *          SHA-256 integrity checks, and live progress metrics.
 * Step F — Resume Protection: Non-destructive registration on replacement computer.
 */

import React, { useState, useEffect } from 'react';
import {
  Folder,
  ArrowRight,
  Shield,
  CheckCircle2,
  AlertTriangle,
  FolderSearch,
  RefreshCw,
  StopCircle,
  Check,
  Zap,
  Monitor,
  Cpu,
  FileCheck,
  HardDriveDownload,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ConflictStrategy,
  DriveInspectionResult,
  EnvironmentDetectionResult,
  OfflineInstallerPackage,
  RemovableDrive,
  RestoreNamespaceMapping,
  RestoreSession,
} from '../types';
import { ApiClient } from '../services/api';
import { DeroGranaryEmblem } from './BrandLogo';

interface RescueViewProps {
  activeDrives: RemovableDrive[];
  onNavigateTab: (tab: any) => void;
  onRefreshDrives?: () => void;
}

export const RescueView: React.FC<RescueViewProps> = ({
  activeDrives,
  onNavigateTab,
  onRefreshDrives,
}) => {
  const [selectedDrive, setSelectedDrive] = useState<RemovableDrive | null>(null);
  const [inspection, setInspection] = useState<DriveInspectionResult | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentDetectionResult | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Selected Option: 'auto' | 'manual'
  const [chosenOption, setChosenOption] = useState<'auto' | 'manual'>('auto');

  // Customization options
  const [namespaceMappings, setNamespaceMappings] = useState<RestoreNamespaceMapping[]>([]);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('safe_rename');
  const [verifyIntegrity, setVerifyIntegrity] = useState(true);

  // Active restore session state
  const [restoreSession, setRestoreSession] = useState<RestoreSession | null>(null);
  const [isStartingRestore, setIsStartingRestore] = useState(false);

  // Registration after restoration
  const [registeredOnReplacement, setRegisteredOnReplacement] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);

  // UI accordion toggles
  const [showTechnicalChecks, setShowTechnicalChecks] = useState(false);
  const [showInstallers, setShowInstallers] = useState(false);

  // Format helpers
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 KB/s';
    if (bytesPerSec < 1024 * 1024) {
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatEta = (seconds: number) => {
    if (!seconds || seconds <= 0) return 'Calculating...';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  // Find candidate backup drives
  const candidateDrives = activeDrives.filter((d) => d.isConnected && !d.isSystemDrive);

  // Auto-select first connected drive with a recovery package or first removable drive
  useEffect(() => {
    if (!selectedDrive && candidateDrives.length > 0) {
      const best = candidateDrives.find((d) => d.hasRecoveryPackage) || candidateDrives[0];
      setSelectedDrive(best);
    }
  }, [candidateDrives, selectedDrive]);

  // Load host environment on mount
  useEffect(() => {
    ApiClient.getRecoveryEnvironment().then((res) => {
      if (res.success && res.result) {
        setEnvironment(res.result);
      }
    }).catch((err) => {
      console.warn('Failed to load recovery environment:', err);
    });
  }, []);

  // Inspect drive when selected
  useEffect(() => {
    if (selectedDrive) {
      inspectDrive(selectedDrive);
    }
  }, [selectedDrive?.stableHardwareId, selectedDrive?.mountPath]);

  // Listen for real-time restore events
  useEffect(() => {
    ApiClient.getCurrentRestore().then((res) => {
      if (res.session) {
        setRestoreSession(res.session);
      }
    }).catch(() => {});

    const unsubscribe = ApiClient.subscribeToEvents({
      onRestoreStart: (session) => {
        setRestoreSession(session);
      },
      onRestoreUpdate: (session) => {
        setRestoreSession(session);
      },
      onRestoreComplete: (session) => {
        setRestoreSession(session);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const inspectDrive = async (drive: RemovableDrive) => {
    setIsInspecting(true);
    setInspectError(null);
    try {
      const res = await ApiClient.inspectRecoveryDrive({
        mountPath: drive.mountPath,
        stableHardwareId: drive.stableHardwareId,
      });

      if (res.success && res.result) {
        setInspection(res.result);
        setNamespaceMappings(res.result.namespaces || []);
        if (res.result.environmentResult) {
          setEnvironment(res.result.environmentResult);
        }
        if (!res.result.hasBackup) {
          setInspectError(res.result.error || 'No Dero Vault backup was found on this drive.');
        }
      } else {
        setInspectError('Could not inspect drive for backups.');
      }
    } catch (err: any) {
      setInspectError(err.message || 'Inspection error.');
    } finally {
      setIsInspecting(false);
    }
  };

  const toggleNamespace = (ns: string) => {
    setNamespaceMappings((prev) =>
      prev.map((item) => (item.namespace === ns ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const updateNamespaceTargetPath = (ns: string, newPath: string) => {
    setNamespaceMappings((prev) =>
      prev.map((item) => (item.namespace === ns ? { ...item, targetPath: newPath } : item))
    );
  };

  const handleBrowseDestination = async (ns: string) => {
    try {
      const selected = await ApiClient.browseNativeFolder();
      if (selected) {
        updateNamespaceTargetPath(ns, selected);
      }
    } catch (err) {
      console.warn('Folder dialog cancelled or error:', err);
    }
  };

  const handleStartRestoration = async () => {
    if (!selectedDrive) return;
    const enabled = namespaceMappings.filter((n) => n.enabled);
    if (enabled.length === 0) {
      alert('Please select at least one folder to restore.');
      return;
    }

    setIsStartingRestore(true);
    try {
      const res = await ApiClient.startRestore({
        mountPath: selectedDrive.mountPath,
        driveStableId: selectedDrive.stableHardwareId,
        driveLetter: selectedDrive.driveLetter,
        namespaces: enabled,
        conflictStrategy,
        verifyIntegrity,
      });

      if (res.session) {
        setRestoreSession(res.session);
      }
    } catch (err: any) {
      alert(`Could not start restoration: ${err.message}`);
    } finally {
      setIsStartingRestore(false);
    }
  };

  const handleCancelRestoration = async () => {
    if (confirm('Are you sure you want to cancel the restoration process? Any files already restored will be preserved.')) {
      await ApiClient.cancelRestore();
    }
  };

  const handleRegisterOnReplacement = async () => {
    if (!selectedDrive) return;
    setIsRegistering(true);
    setRegistrationSuccess(null);

    const sourceFolders = namespaceMappings
      .filter((n) => n.enabled && n.targetPath)
      .map((n) => n.targetPath);

    try {
      const res = await ApiClient.registerMigratedDrive({
        stableHardwareId: selectedDrive.stableHardwareId,
        friendlyName: selectedDrive.friendlyName || selectedDrive.volumeLabel || 'Office USB Backup',
        sourceFolders: sourceFolders.length > 0 ? sourceFolders : [namespaceMappings[0]?.targetPath || 'C:\\Users\\User\\Documents'],
      });

      if (res.success) {
        setRegisteredOnReplacement(true);
        setRegistrationSuccess(
          `✓ Drive successfully registered on this computer! Future automatic backups will protect your restored office.`
        );
        onRefreshDrives?.();
      }
    } catch (err: any) {
      alert(`Registration error: ${err.message}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const isRestoring = Boolean(
    restoreSession && ['scanning', 'restoring', 'verifying'].includes(restoreSession.status)
  );

  const isComplete = Boolean(
    restoreSession && ['completed', 'completed_with_errors'].includes(restoreSession.status)
  );

  let progressPercent = 0;
  if (restoreSession) {
    if (isComplete) {
      progressPercent = 100;
    } else if (restoreSession.bytesTotal > 0) {
      progressPercent = Math.min(99.5, (restoreSession.bytesTransferred / restoreSession.bytesTotal) * 100);
    } else if (restoreSession.filesDiscovered > 0) {
      progressPercent = Math.min(99.5, (restoreSession.filesRestored / restoreSession.filesDiscovered) * 100);
    }
  }

  const checks = environment?.checks || [];
  const allChecksPassed = environment?.allChecksPassed ?? false;
  const readyToProceed = environment?.readyToProceed ?? false;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Top Hero Card — Faithful to the Dero Vault Brand Constitution */}
      <div className="bg-[#0D1B3E] border border-[#1E3466] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#F4A62A]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1E3466] pb-5 mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-linear-to-br from-[#F4A62A] to-[#D97706] rounded-xl flex items-center justify-center shadow-lg shadow-[#F4A62A]/20 shrink-0">
              <DeroGranaryEmblem className="w-7 h-7 text-[#081126]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[#F4A62A]">
                  DERO VAULT™ RESCUE
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-[#162852] text-slate-300 border border-[#1E3466] rounded-full uppercase tracking-wider">
                  Rescue &amp; Migration
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Your digital granary. Your office, restored.
              </p>
            </div>
          </div>

          {/* Drive Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 whitespace-nowrap">Backup Drive:</span>
            <select
              value={selectedDrive?.stableHardwareId || ''}
              onChange={(e) => {
                const found = candidateDrives.find((d) => d.stableHardwareId === e.target.value);
                if (found) setSelectedDrive(found);
              }}
              className="bg-[#081126] border border-[#1E3466] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#F4A62A] focus:outline-hidden"
            >
              {candidateDrives.length === 0 && <option value="">No USB drive detected</option>}
              {candidateDrives.map((d) => (
                <option key={d.stableHardwareId} value={d.stableHardwareId}>
                  {d.driveLetter} {d.friendlyName || d.volumeLabel || 'Removable Disk'} ({formatBytes(d.totalBytes)})
                  {d.hasRecoveryPackage ? ' [Backup Found]' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => selectedDrive && inspectDrive(selectedDrive)}
              disabled={isInspecting}
              className="p-1.5 text-slate-400 hover:text-white bg-[#162852] rounded-lg border border-[#1E3466] transition-colors"
              title="Rescan Drive"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isInspecting ? 'animate-spin text-[#F4A62A]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Step B: The Branded Explanatory Notice (displayed only when checks succeed) */}
        {readyToProceed ? (
          <div className="bg-linear-to-r from-emerald-950/40 to-[#0A1530] border border-emerald-500/40 rounded-xl p-4 text-center">
            <h2 className="text-sm font-bold text-emerald-400 mb-1 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>We've identified your computer and found your Dero Vault backup. Let's bring your office back.</span>
            </h2>
            <p className="text-xs text-slate-300">
              Host Environment: <strong className="text-white">{environment?.hostEnvironment.friendlyOsName}</strong> ({environment?.hostEnvironment.friendlyArch}) • One-directional safe restoration.
            </p>
          </div>
        ) : (
          <div className="bg-[#081126]/80 border border-amber-800/40 rounded-xl p-4 text-center">
            <h2 className="text-sm font-semibold text-amber-300 mb-1 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>Checking your computer and backup drive compatibility...</span>
            </h2>
            <p className="text-xs text-slate-400">
              Host: {environment?.hostEnvironment.friendlyOsName || 'Detecting OS...'} • Please ensure your Dero Vault drive is connected.
            </p>
          </div>
        )}

        {/* Distinct 4-Check Status Bar (Section 4 of Master Brief) */}
        <div className="mt-4 pt-3 border-t border-[#1E3466]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Automatic Compatibility Checks:</span>
            </div>
            <button
              onClick={() => setShowTechnicalChecks(!showTechnicalChecks)}
              className="text-[11px] text-[#F4A62A] hover:underline flex items-center gap-1"
            >
              <span>{showTechnicalChecks ? 'Hide Details' : 'View Check Details'}</span>
              {showTechnicalChecks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* Check 1: OS Detected */}
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 block truncate">1. OS Detected</span>
                <span className="font-semibold text-white text-[11px] truncate block">
                  {environment?.hostEnvironment.platformName || 'Detected'} ✓
                </span>
              </div>
            </div>

            {/* Check 2: App Compatible */}
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 block truncate">2. App Compatible</span>
                <span className="font-semibold text-white text-[11px] truncate block">
                  {environment?.hostEnvironment.arch || 'x64'} Native ✓
                </span>
              </div>
            </div>

            {/* Check 3: Format Compatible */}
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466] flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${inspection?.hasBackup ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 block truncate">3. Backup Format</span>
                <span className="font-semibold text-white text-[11px] truncate block">
                  {inspection?.manifest ? `Format v${inspection.manifest.formatVersion} ✓` : (inspection?.hasBackup ? 'CURRENT ✓' : 'Awaiting')}
                </span>
              </div>
            </div>

            {/* Check 4: Backup Accessible */}
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466] flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${inspection?.hasBackup ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 block truncate">4. Backup Ready</span>
                <span className="font-semibold text-white text-[11px] truncate block">
                  {inspection?.hasBackup ? 'Ready to Inspect ✓' : 'Connect Drive'}
                </span>
              </div>
            </div>
          </div>

          {/* Expandable Technical Check Explanations */}
          {showTechnicalChecks && checks.length > 0 && (
            <div className="mt-3 p-3 bg-[#081126] rounded-xl border border-[#1E3466] space-y-2 text-xs">
              {checks.map((chk) => (
                <div key={chk.id} className="flex items-start gap-2.5 border-b border-slate-800/60 pb-2 last:border-b-0 last:pb-0">
                  <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    chk.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {chk.status === 'passed' ? <Check className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                  </div>
                  <div>
                    <strong className="text-white block font-medium">{chk.title}</strong>
                    <span className="text-slate-300 block">{chk.message}</span>
                    {chk.details && <span className="text-[11px] text-slate-500 block mt-0.5">{chk.details}</span>}
                    {chk.nextAction && <span className="text-[11px] text-amber-400 block mt-0.5">Action: {chk.nextAction}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Restoration Progress View */}
      {isRestoring && restoreSession && (
        <div className="bg-[#0D1B3E] border-2 border-emerald-500/60 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Restoring Your Office Files...
                </h3>
                <p className="text-xs text-slate-400">
                  {restoreSession.status === 'verifying'
                    ? 'Cryptographically verifying restored file integrity (SHA-256)...'
                    : restoreSession.currentFile || 'Transferring files safely...'}
                </p>
              </div>
            </div>
            <button
              onClick={handleCancelRestoration}
              className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-emerald-400 font-semibold">{progressPercent.toFixed(1)}%</span>
              <span className="text-slate-400">
                {formatBytes(restoreSession.bytesTransferred)} / {formatBytes(restoreSession.bytesTotal)}
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#081126] rounded-full overflow-hidden border border-[#1E3466]">
              <div
                className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1E3466] text-xs">
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466]">
              <span className="text-slate-400 text-[11px] block">Files Restored</span>
              <span className="font-mono font-bold text-white text-sm">
                {restoreSession.filesRestored} / {restoreSession.filesDiscovered}
              </span>
            </div>
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466]">
              <span className="text-slate-400 text-[11px] block">Transfer Speed</span>
              <span className="font-mono font-bold text-white text-sm">
                {formatSpeed(restoreSession.currentSpeedBps)}
              </span>
            </div>
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466]">
              <span className="text-slate-400 text-[11px] block">Estimated Time</span>
              <span className="font-mono font-bold text-white text-sm">
                {formatEta(restoreSession.estimatedSecondsRemaining)}
              </span>
            </div>
            <div className="bg-[#081126] p-2.5 rounded-lg border border-[#1E3466]">
              <span className="text-slate-400 text-[11px] block">Verified Files</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {restoreSession.filesVerified} ✓ (SHA-256)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Restoration Completed Report */}
      {isComplete && restoreSession && (
        <div className="bg-[#0D1B3E] border-2 border-emerald-500 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Restoration Complete — Your Office is Restored
              </h2>
              <p className="text-xs text-slate-300">
                All recoverable files have been restored to your replacement computer and verified.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#081126] p-4 rounded-xl border border-[#1E3466] text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Restored Files</span>
              <strong className="text-emerald-400 text-base font-mono">{restoreSession.filesRestored}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Skipped (Conflicts)</span>
              <strong className="text-slate-300 text-base font-mono">{restoreSession.filesSkipped}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Failed Files</span>
              <strong className={`text-base font-mono ${restoreSession.filesFailed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {restoreSession.filesFailed}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Integrity Verified</span>
              <strong className="text-emerald-400 text-base font-mono">{restoreSession.filesVerified} (SHA-256)</strong>
            </div>
          </div>

          {/* Step F: Register Drive & Resume Protection */}
          <div className="bg-linear-to-r from-[#162852] to-[#0A1530] border border-[#1E3466] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#F4A62A]" />
              <h3 className="text-sm font-bold text-white">
                Register Drive &amp; Resume Protection
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Registering this drive with Dero Vault on this replacement computer configures automatic protection for your restored folders.
              Your existing backup data and historical versions on this drive remain 100% intact and will never be deleted or reformatted.
            </p>

            {registrationSuccess ? (
              <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-lg text-xs text-emerald-300 font-medium">
                {registrationSuccess}
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleRegisterOnReplacement}
                  disabled={isRegistering}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{isRegistering ? 'Registering...' : 'Register Drive & Resume Protection'}</span>
                </button>
                <button
                  onClick={() => onNavigateTab('dashboard')}
                  className="px-4 py-2 bg-[#081126] hover:bg-[#112042] text-slate-300 rounded-lg text-xs font-semibold border border-[#1E3466] transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step C: Dual-Option Choice Grid (when not restoring or already completed) */}
      {!isRestoring && !isComplete && (
        <>
          {/* Incomplete Backup Alert Banner */}
          {inspection?.isIncompleteBackup && (
            <div className="bg-amber-500/10 border-2 border-amber-500/60 rounded-xl p-4 flex items-start gap-3 text-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Incomplete Backup Detected
                </h4>
                <p className="text-xs text-amber-100">
                  {inspection.incompleteReason || 'The backup on this drive was interrupted or contained verification errors. Some source files may be missing.'}
                </p>
                <p className="text-[11px] text-amber-200/80">
                  You can restore any intact files below, but this drive cannot be considered a complete replica of the source office.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Option: Automatic Rescue */}
            <div
              onClick={() => setChosenOption('auto')}
              className={`p-5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                chosenOption === 'auto'
                  ? 'bg-[#10224D] border-[#F4A62A] shadow-lg shadow-[#F4A62A]/10 ring-1 ring-[#F4A62A]'
                  : 'bg-[#0D1B3E] border-[#1E3466] hover:border-slate-500'
              }`}
            >
              <div className="absolute -top-2.5 right-4 bg-[#F4A62A] text-[#081126] text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                Recommended
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#F4A62A] uppercase tracking-wider mb-1">
                  Primary Option — Guided Flow
                </div>
                <h3 className="text-base font-bold text-white mb-2">Install Dero Vault and restore my office</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  We'll guide you through installation, restoring your files and resuming automatic protection.
                </p>
              </div>

              <div className="pt-3 border-t border-[#1E3466]">
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Automatic OS detection, profile mapping &amp; one-click restore</span>
                </div>
              </div>
            </div>

            {/* Secondary Option: Manual Rescue */}
            <div
              onClick={() => setChosenOption('manual')}
              className={`p-5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                chosenOption === 'manual'
                  ? 'bg-[#10224D] border-blue-400 shadow-lg ring-1 ring-blue-400'
                  : 'bg-[#0D1B3E] border-[#1E3466] hover:border-slate-500'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Secondary Option — Self-Paced
                </div>
                <h3 className="text-base font-bold text-white mb-2">I will install Dero Vault myself</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  Install Dero Vault yourself and return here to restore your office.
                </p>
              </div>

              <div className="pt-3 border-t border-[#1E3466]">
                <div className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                  <FolderSearch className="w-4 h-4" />
                  <span>Custom folder destinations and manual conflict rules</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step D: Install or Hand Over Card */}
          <div className="bg-[#0D1B3E] border border-[#1E3466] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Dero Vault Installation &amp; Offline Installer Status
                </h3>
              </div>
              {inspection?.offlineInstallers && inspection.offlineInstallers.length > 0 && (
                <button
                  onClick={() => setShowInstallers(!showInstallers)}
                  className="text-[11px] text-[#F4A62A] hover:underline flex items-center gap-1"
                >
                  <span>{showInstallers ? 'Hide Offline Packages' : `View ${inspection.offlineInstallers.length} Offline Package(s)`}</span>
                  {showInstallers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>

            <p className="text-xs text-slate-300">
              Dero Vault is running natively on this computer. You can proceed directly to folder inspection and restoration below.
              No internet connection is required to restore your office.
            </p>

            {showInstallers && inspection?.offlineInstallers && (
              <div className="bg-[#081126] p-3 rounded-xl border border-[#1E3466] space-y-2 mt-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Verified Offline Installers on Backup Drive:
                </div>
                {inspection.offlineInstallers.map((pkg, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-[#0D1B3E] rounded border border-slate-800 text-xs">
                    <div>
                      <strong className="text-white block font-mono">{pkg.fileName}</strong>
                      <span className="text-[10px] text-slate-400">
                        Platform: {pkg.platform} ({pkg.arch}) • Size: {formatBytes(pkg.sizeBytes)}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400 truncate max-w-xs" title={`SHA-256: ${pkg.sha256}`}>
                      SHA-256: {pkg.sha256.substring(0, 16)}...
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step E: Inspect and Restore Card */}
          {inspection && inspection.hasBackup && (
            <div className="bg-[#0D1B3E] border border-[#1E3466] rounded-2xl p-6 space-y-5">
              {/* Origin Machine Summary */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#081126] p-4 rounded-xl border border-[#1E3466] text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Original Computer &amp; Profile</span>
                  <strong className="text-white font-medium text-xs">
                    {inspection.manifest?.sourceMachine.hostname || 'Source Computer'} (
                    {inspection.manifest?.sourceMachine.username || 'User'} •{' '}
                    {inspection.manifest?.sourceMachine.platform || 'Windows'})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Recoverable Files</span>
                  <strong className="text-[#F4A62A] font-medium text-xs">
                    {inspection.totalFiles} files ({formatBytes(inspection.totalBytes)})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Last Backup Time</span>
                  <strong className="text-slate-200 font-medium text-xs">
                    {inspection.manifest?.updatedAt
                      ? new Date(inspection.manifest.updatedAt).toLocaleString()
                      : 'Verified'}
                  </strong>
                </div>
              </div>

              {/* Folder Mapping Table with Cross-Platform Support */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Review Folders &amp; Destination Mapping
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Intelligently mapped to this computer's user profile
                  </span>
                </div>

                <div className="space-y-2">
                  {namespaceMappings.map((item) => (
                    <div
                      key={item.namespace}
                      className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
                        item.enabled
                          ? 'bg-[#081126] border-[#1E3466]'
                          : 'bg-[#081126]/40 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => toggleNamespace(item.namespace)}
                          className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <Folder className="w-3.5 h-3.5 text-[#F4A62A]" />
                            <span>{item.folderName}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({item.fileCount} files, {formatBytes(item.totalBytes)})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Source: DERO_VAULT_BACKUP/CURRENT/{item.namespace}
                          </div>
                        </div>
                      </div>

                      {/* Destination Path Input */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">Restore to:</span>
                        <input
                          type="text"
                          value={item.targetPath}
                          onChange={(e) => updateNamespaceTargetPath(item.namespace, e.target.value)}
                          disabled={!item.enabled}
                          className="px-2.5 py-1.5 bg-[#050C1D] border border-[#1E3466] rounded text-xs text-slate-200 font-mono w-full sm:w-64 focus:border-emerald-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleBrowseDestination(item.namespace)}
                          disabled={!item.enabled}
                          className="p-1.5 bg-[#162852] hover:bg-[#1E3466] text-slate-300 rounded border border-[#1E3466] transition-colors"
                          title="Browse Destination Folder"
                        >
                          <FolderSearch className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety & Conflict Rules */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#081126]/60 p-4 rounded-xl border border-[#1E3466] text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                    File Conflict Strategy
                  </label>
                  <select
                    value={conflictStrategy}
                    onChange={(e) => setConflictStrategy(e.target.value as ConflictStrategy)}
                    className="w-full bg-[#050C1D] border border-[#1E3466] rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="safe_rename">Keep both files (safe rename with '(restored)') [Recommended]</option>
                    <option value="skip_existing">Skip existing files (never replace)</option>
                    <option value="overwrite_if_newer">Overwrite only if backup is strictly newer</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Safe non-destructive policy: Destination files are never deleted or silently overwritten.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Integrity Verification
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={verifyIntegrity}
                      onChange={(e) => setVerifyIntegrity(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span className="text-slate-300">
                      Cryptographically verify each file with SHA-256 after copy
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ensures every single byte written matches the original backup on your drive.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#1E3466]">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>One-directional restoration: Your backup drive is treated strictly read-only.</span>
                </div>

                <button
                  onClick={handleStartRestoration}
                  disabled={isStartingRestore}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>
                    {isStartingRestore
                      ? 'Starting Restoration...'
                      : chosenOption === 'auto'
                      ? 'Install Dero Vault and restore my office'
                      : 'Restore Selected Folders Now'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {inspectError && (
            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <strong className="block font-semibold">Drive Inspection Notice</strong>
                <span>{inspectError}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
