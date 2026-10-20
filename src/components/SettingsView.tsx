/**
 * Dero Vault — Settings & Local Logging Screen
 * Prompt Section 28 & 31
 */

import React, { useState } from 'react';
import { Settings, Shield, FileText, Check, AlertCircle, RefreshCw, Terminal, Laptop, Download, ExternalLink, Zap } from 'lucide-react';
import { AppLogEntry, AppSettings, PlatformInfo } from '../types';
import { DeroGranaryEmblem } from './BrandLogo';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  logs: AppLogEntry[];
  logFilePath: string;
  onRefreshLogs: () => void;
  platformInfo?: PlatformInfo | null;
  isBackingUp?: boolean;
  currentBackupMode?: 'turbo' | 'standard';
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  logs,
  logFilePath,
  onRefreshLogs,
  platformInfo,
  isBackingUp = false,
  currentBackupMode = 'turbo',
}) => {
  const [activeTab, setActiveTab] = useState<'preferences' | 'logs'>('preferences');

  const toggle = (key: keyof AppSettings) => {
    onUpdateSettings({ [key]: !settings[key] });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E3466]">
        <div>
          <h2 className="text-xl font-bold font-['Poppins',sans-serif] text-white">Settings &amp; Diagnostics</h2>
          <p className="text-xs text-slate-300 mt-1 font-['Inter',sans-serif]">
            Configure automatic background behavior and inspect local application diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0D1B3D] border border-[#1E3466] rounded-lg text-xs">
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeTab === 'preferences' ? 'bg-[#162852] text-[#F4A62A] font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Preferences
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeTab === 'logs' ? 'bg-[#162852] text-[#F4A62A] font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Local Log ({logs.length})
          </button>
        </div>
      </div>

      {activeTab === 'preferences' ? (
        <div className="space-y-6 text-xs font-['Inter',sans-serif]">
          {/* Turbo Backup Control Section (Priority 1) */}
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1E3466]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#F4A62A]" />
                  <h3 className="text-sm font-bold font-['Poppins',sans-serif] text-white">
                    Turbo Backup Engine
                  </h3>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      settings.turboBackup
                        ? 'bg-[#F4A62A]/15 text-[#F4A62A] border-[#F4A62A]/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {settings.turboBackup ? 'Turbo Mode' : 'Standard Mode'}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">
                  Choose between high-throughput bounded parallel copying and conservative sequential pipeline.
                </p>
              </div>

              {/* Dedicated Two-State Control with Unmistakable States */}
              <div className="flex items-center p-1 bg-[#081126] border border-[#1E3466] rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ turboBackup: true })}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all ${
                    settings.turboBackup
                      ? 'bg-[#F4A62A] text-[#0D1B3D] shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Turbo Backup: ON</span>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ turboBackup: false })}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all ${
                    !settings.turboBackup
                      ? 'bg-[#162852] text-white border border-[#1E3466] shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Turbo Backup: OFF</span>
                </button>
              </div>
            </div>

            {/* If a backup is currently running, explain that changed preference applies to the next session */}
            {isBackingUp && (
              <div className="p-3 rounded-lg bg-[#162852]/70 border border-[#F4A62A]/30 text-[11px] text-[#F4A62A] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    A backup is currently running in {currentBackupMode === 'turbo' ? 'Turbo Mode' : 'Standard Mode'}.
                  </span>
                  <span className="block text-slate-300 mt-0.5">
                    Your preference change will apply automatically starting with your next backup session.
                  </span>
                </div>
              </div>
            )}

            {/* Clear explanation of both modes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div
                className={`p-3.5 rounded-lg border transition-all ${
                  settings.turboBackup
                    ? 'bg-[#132247]/60 border-[#F4A62A]/40'
                    : 'bg-[#081126] border-[#1E3466]'
                }`}
              >
                <div className="flex items-center gap-2 text-white font-semibold mb-1">
                  <Zap className="w-3.5 h-3.5 text-[#F4A62A]" />
                  <span>Turbo Backup: ON (Optimized Pipeline)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Uses the application’s optimised backup pipeline with adaptive bounded parallel workers (up to 16 workers for small/mixed office files, 4 for large files), 512KB streaming buffers, and pipelined SHA-256 calculation.
                </p>
              </div>

              <div
                className={`p-3.5 rounded-lg border transition-all ${
                  !settings.turboBackup
                    ? 'bg-[#132247]/60 border-slate-400'
                    : 'bg-[#081126] border-[#1E3466]'
                }`}
              >
                <div className="flex items-center gap-2 text-white font-semibold mb-1">
                  <Shield className="w-3.5 h-3.5 text-slate-300" />
                  <span>Turbo Backup: OFF (Standard Safe Pipeline)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Uses the application’s supported standard conservative backup pipeline. Files are copied strictly sequentially one-by-one with standard 64KB buffers. Recommended for slower legacy USB flash drives or bus-powered mechanical HDDs.
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-[#081126]/60 p-2.5 rounded-lg border border-[#1E3466]">
              <span className="text-slate-300 font-semibold">Integrity Guarantee: </span>
              Both modes strictly enforce atomic file staging via <code className="text-[#F4A62A] font-mono">.dero_part</code> files, revision retention in <code className="text-[#F4A62A] font-mono">VERSIONS</code>, destination size validation, and cryptographic SHA-256 integrity verification. Integrity checks are never weakened.
            </div>
          </div>

          {/* Automatic Backup Section */}
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white flex items-center gap-2">
              <DeroGranaryEmblem size={20} />
              <span>Automatic Granary Protection</span>
            </h3>

            <div className="divide-y divide-[#1E3466]">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Automatic Backup</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    Master switch for automatic backup engine.
                  </div>
                </div>
                <button
                  onClick={() => toggle('autoBackup')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.autoBackup ? 'bg-[#00A884]' : 'bg-[#162852]'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.autoBackup ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">
                    Start backup automatically when a registered drive is connected
                  </div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    No manual clicks required: plugging in a known drive initiates incremental backup.
                  </div>
                </div>
                <button
                  onClick={() => toggle('startOnConnect')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.startOnConnect ? 'bg-[#00A884]' : 'bg-[#162852]'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.startOnConnect ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Verify backups after writing</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    Checks destination file size and cryptographic checksums before marking complete.
                  </div>
                </div>
                <button
                  onClick={() => toggle('verifyBackups')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.verifyBackups ? 'bg-[#00A884]' : 'bg-[#162852]'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.verifyBackups ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Preserve modified file versions</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    Stores prior revisions in DERO_VAULT_BACKUP/VERSIONS rather than overwriting.
                  </div>
                </div>
                <button
                  onClick={() => toggle('preserveVersions')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.preserveVersions ? 'bg-[#00A884]' : 'bg-[#162852]'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.preserveVersions ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white">
              Desktop Notifications
            </h3>

            <div className="divide-y divide-[#1E3466]">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Show notification when backup begins</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    Notifies when a registered drive is plugged in and scanning starts.
                  </div>
                </div>
                <button
                  onClick={() => toggle('notifyOnStart')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.notifyOnStart ? 'bg-[#00A884]' : 'bg-[#162852]'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.notifyOnStart ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Show notification when backup completes</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    Confirms that files have been safely secured in your digital granary.
                  </div>
                </div>
                <button
                  onClick={() => toggle('notifyOnComplete')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.notifyOnComplete ? 'bg-[#00A884]' : 'bg-[#162852]'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.notifyOnComplete ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* About & Operating System Environment */}
          <div className="bg-[#0D1B3D] border border-[#1E3466] p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-[#F4A62A]" />
                <span>Operating Environment</span>
              </span>
              <span className="text-[11px] font-mono text-[#F4A62A]">v1.0.0</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-[#081126] rounded-lg border border-[#1E3466]">
                <div className="text-slate-400 text-[10px]">Operating System</div>
                <div className="font-semibold text-white mt-0.5">
                  {platformInfo?.platformName || 'Desktop'} ({platformInfo?.osArch || 'x64'})
                </div>
              </div>
              <div className="p-2.5 bg-[#081126] rounded-lg border border-[#1E3466]">
                <div className="text-slate-400 text-[10px]">Driver Integration Status</div>
                <div className="font-medium text-[#00A884] text-[11px] mt-0.5">
                  {platformInfo?.hardwareDetectionValidated
                    ? 'Reference Implementation (Verified)'
                    : platformInfo?.supportStatusMessage || 'Architecture Supported'}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Application Installers & Packages */}
          <div className="bg-[#0D1B3D] border border-[#1E3466] p-5 rounded-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-[#F4A62A]" />
                  <span>Desktop Application Downloads (Windows 10 &amp; 11)</span>
                </h3>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                  Download the installable application directly to your local PC.
                </p>
              </div>
              <span className="text-[10px] font-bold text-[#00A884] bg-[#00A884]/15 px-2 py-0.5 rounded-full font-['Poppins',sans-serif]">
                v1.0.0 Ready
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <a
                href="/api/download/installer"
                download="DeroVault-Setup.exe"
                className="p-3.5 bg-[#081126] border border-[#1E3466] hover:border-[#F4A62A] rounded-xl flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-[#F4A62A]" />
                  <div>
                    <div className="font-semibold text-white font-['Poppins',sans-serif]">DeroVault-Setup.exe</div>
                    <div className="text-[11px] text-slate-400">Windows Installer (1-click)</div>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[#F4A62A] group-hover:underline">Download</span>
              </a>

              <a
                href="/api/download/windows-app"
                download="DeroVault-v1.0.0-Windows-x64.zip"
                className="p-3.5 bg-[#081126] border border-[#1E3466] hover:border-[#00A884] rounded-xl flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-[#00A884]" />
                  <div>
                    <div className="font-semibold text-white font-['Poppins',sans-serif]">Portable ZIP Package</div>
                    <div className="text-[11px] text-slate-400">Extract &amp; Run (~49 MB)</div>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[#00A884] group-hover:underline">Download</span>
              </a>
            </div>

            <div className="pt-2 border-t border-[#1E3466]/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Looking for GitHub Releases or CI builds?</span>
              <a
                href="https://github.com/ambrosenen-blip/Dero-Vault-Remix/releases"
                target="_blank"
                rel="noreferrer"
                className="text-[#F4A62A] hover:underline flex items-center gap-1 font-medium"
              >
                <span>GitHub Releases Page</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Local Offline Architecture */}
          <div className="bg-[#0D1B3D] border border-[#1E3466] p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold font-['Poppins',sans-serif] text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#00A884]" />
              <span>Local Offline Architecture</span>
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              Dero Vault operates locally on your computer and removable backup drives.
            </p>
            <div className="text-slate-300 text-xs space-y-1">
              <div>It does not require:</div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
                <li>an online account;</li>
                <li>cloud storage;</li>
                <li>remote backup servers; or</li>
                <li>telemetry for its core backup operation.</li>
              </ul>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed pt-1">
              Your backed-up files remain on your local storage and your registered removable backup drives.
            </p>
          </div>
        </div>
      ) : (
        /* Logs Tab */
        <div className="space-y-4 text-xs font-['Inter',sans-serif]">
          <div className="flex items-center justify-between p-3.5 bg-[#0D1B3D] border border-[#1E3466] rounded-xl">
            <div className="space-y-0.5">
              <div className="font-semibold text-white">Application Log File</div>
              <div className="font-mono text-[#00A884] text-[11px] select-all">
                {logFilePath}
              </div>
            </div>
            <button
              onClick={onRefreshLogs}
              className="px-3 py-1.5 bg-[#132247] hover:bg-[#1A2E5E] text-slate-200 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors border border-[#1E3466]"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#F4A62A]" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="bg-[#081126] border border-[#1E3466] rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-slate-400 text-center py-8">Log file is currently empty.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="leading-relaxed border-b border-[#1E3466]/40 pb-1.5 last:border-0">
                  <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span
                    className={`font-semibold ${
                      log.level === 'error'
                        ? 'text-rose-400'
                        : log.level === 'warn'
                        ? 'text-[#F4A62A]'
                        : log.level === 'success'
                        ? 'text-[#00A884]'
                        : 'text-slate-300'
                    }`}
                  >
                    [{log.module}]
                  </span>{' '}
                  <span className="text-slate-200">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
