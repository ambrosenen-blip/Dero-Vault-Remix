/**
 * Dero Vault — Settings & Local Logging Screen
 * Prompt Section 28 & 31
 */

import React, { useState } from 'react';
import { Settings, Shield, FileText, Check, AlertCircle, RefreshCw, Terminal, Laptop } from 'lucide-react';
import { AppLogEntry, AppSettings, PlatformInfo } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  logs: AppLogEntry[];
  logFilePath: string;
  onRefreshLogs: () => void;
  platformInfo?: PlatformInfo | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  logs,
  logFilePath,
  onRefreshLogs,
  platformInfo,
}) => {
  const [activeTab, setActiveTab] = useState<'preferences' | 'logs'>('preferences');

  const toggle = (key: keyof AppSettings) => {
    onUpdateSettings({ [key]: !settings[key] });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Settings &amp; Diagnostics</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure automatic background behavior and inspect local application diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeTab === 'preferences' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Preferences
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeTab === 'logs' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Local Log ({logs.length})
          </button>
        </div>
      </div>

      {activeTab === 'preferences' ? (
        <div className="space-y-6 text-xs">
          {/* Automatic Backup Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Automatic Granary Protection</span>
            </h3>

            <div className="divide-y divide-slate-800/80">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Automatic Backup</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Master switch for automatic backup engine.
                  </div>
                </div>
                <button
                  onClick={() => toggle('autoBackup')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.autoBackup ? 'bg-emerald-600' : 'bg-slate-800'
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
                  <div className="font-semibold text-slate-200">
                    Start backup automatically when a registered drive is connected
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    No manual clicks required: plugging in a known drive initiates incremental backup.
                  </div>
                </div>
                <button
                  onClick={() => toggle('startOnConnect')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.startOnConnect ? 'bg-emerald-600' : 'bg-slate-800'
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
                  <div className="font-semibold text-slate-200">Verify backups after writing</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Checks destination file size and cryptographic checksums before marking complete.
                  </div>
                </div>
                <button
                  onClick={() => toggle('verifyBackups')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.verifyBackups ? 'bg-emerald-600' : 'bg-slate-800'
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
                  <div className="font-semibold text-slate-200">Preserve modified file versions</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Stores prior revisions in DERO_VAULT_BACKUP/VERSIONS rather than overwriting.
                  </div>
                </div>
                <button
                  onClick={() => toggle('preserveVersions')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.preserveVersions ? 'bg-emerald-600' : 'bg-slate-800'
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Desktop Notifications
            </h3>

            <div className="divide-y divide-slate-800/80">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Show notification when backup begins</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Notifies when a registered drive is plugged in and scanning starts.
                  </div>
                </div>
                <button
                  onClick={() => toggle('notifyOnStart')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.notifyOnStart ? 'bg-emerald-600' : 'bg-slate-800'
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
                  <div className="font-semibold text-slate-200">Show notification when backup completes</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Confirms that files have been safely secured in your digital granary.
                  </div>
                </div>
                <button
                  onClick={() => toggle('notifyOnComplete')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.notifyOnComplete ? 'bg-emerald-600' : 'bg-slate-800'
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
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-emerald-400" />
                <span>Operating Environment</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">v1.0.0</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Operating System</div>
                <div className="font-semibold text-slate-200 mt-0.5">
                  {platformInfo?.platformName || 'Desktop'} ({platformInfo?.osArch || 'x64'})
                </div>
              </div>
              <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Driver Integration Status</div>
                <div className="font-medium text-emerald-400 text-[11px] mt-0.5">
                  {platformInfo?.hardwareDetectionValidated
                    ? 'Reference Implementation (Verified)'
                    : platformInfo?.supportStatusMessage || 'Architecture Supported'}
                </div>
              </div>
            </div>
          </div>

          {/* Local Offline Architecture (Task 2) */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Local Offline Architecture</span>
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              Dero Vault operates locally on your computer and removable backup drives.
            </p>
            <div className="text-slate-400 text-xs space-y-1">
              <div>It does not require:</div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
                <li>an online account;</li>
                <li>cloud storage;</li>
                <li>remote backup servers; or</li>
                <li>telemetry for its core backup operation.</li>
              </ul>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed pt-1">
              Your backed-up files remain on your local storage and your registered removable backup drives.
            </p>
          </div>
        </div>
      ) : (
        /* Logs Tab (Prompt Section 31) */
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="space-y-0.5">
              <div className="font-semibold text-slate-200">Application Log File</div>
              <div className="font-mono text-emerald-400 text-[11px] select-all">
                {logFilePath}
              </div>
            </div>
            <button
              onClick={onRefreshLogs}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-8">Log file is currently empty.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="leading-relaxed border-b border-slate-900/80 pb-1.5 last:border-0">
                  <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span
                    className={`font-semibold ${
                      log.level === 'error'
                        ? 'text-rose-400'
                        : log.level === 'warn'
                        ? 'text-amber-400'
                        : log.level === 'success'
                        ? 'text-emerald-400'
                        : 'text-slate-300'
                    }`}
                  >
                    [{log.module}]
                  </span>{' '}
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
