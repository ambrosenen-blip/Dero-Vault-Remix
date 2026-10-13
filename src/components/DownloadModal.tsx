/**
 * Dero Vault — Desktop Application Download Modal
 * Direct 1-click Windows installer download and guidance for GitHub Releases & Actions.
 */

import React, { useState, useEffect } from 'react';
import {
  Download,
  X,
  CheckCircle2,
  HardDrive,
  ExternalLink,
  Laptop,
  AlertCircle,
  FileArchive,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { DeroGranaryEmblem } from './BrandLogo';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [buildInfo, setBuildInfo] = useState<{
    hasZip: boolean;
    zipSize: number;
    hasSetup: boolean;
    setupSize: number;
  }>({
    hasZip: true,
    zipSize: 51103935,
    hasSetup: true,
    setupSize: 170482,
  });

  const [activeTab, setActiveTab] = useState<'direct' | 'github'>('direct');

  useEffect(() => {
    if (isOpen) {
      fetch('/api/build/info')
        .then((r) => r.json())
        .then((data) => setBuildInfo(data))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#0D1B3D] border border-[#1E3466] rounded-2xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100 my-8">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#1E3466]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <DeroGranaryEmblem size={38} showGlow={true} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#F4A62A] font-['Poppins',sans-serif]">
                Installable Software
              </span>
              <h3 className="text-xl font-bold font-['Poppins',sans-serif] text-white mt-0.5">
                Download Dero Vault Desktop
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 p-1 bg-[#081126] border border-[#1E3466] rounded-xl text-xs">
          <button
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'direct'
                ? 'bg-[#132247] text-[#F4A62A] font-semibold border border-[#1E3466] shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Direct 1-Click Download</span>
          </button>
          <button
            onClick={() => setActiveTab('github')}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'github'
                ? 'bg-[#132247] text-[#00A884] font-semibold border border-[#1E3466] shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>GitHub Releases &amp; Actions Guide</span>
          </button>
        </div>

        {activeTab === 'direct' ? (
          <div className="space-y-4 font-['Inter',sans-serif]">
            {/* Option 1: Official Windows Installer (Recommended) */}
            <div className="p-5 rounded-xl bg-[#081126] border-2 border-[#F4A62A]/70 hover:border-[#F4A62A] transition-all space-y-4 relative group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-xl bg-[#F4A62A]/15 border border-[#F4A62A]/30 text-[#F4A62A] shrink-0">
                    <Laptop className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#F4A62A]/20 text-[#F4A62A] text-[10px] font-bold font-['Poppins',sans-serif] uppercase mb-1">
                      <Sparkles className="w-3 h-3" />
                      <span>Recommended for Windows 10 &amp; 11</span>
                    </div>
                    <h4 className="text-base font-bold text-white font-['Poppins',sans-serif]">
                      Dero Vault Setup Installer (.exe)
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Installs Dero Vault onto your computer with Start Menu and Desktop shortcuts. Automatically launches in quiet background tray mode.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#1E3466]/80 text-xs">
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <span>File: <strong className="text-slate-200">DeroVault-Setup.exe</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(buildInfo.setupSize || 170482)}</span>
                </div>
                <a
                  href="/api/download/installer"
                  download="DeroVault-Setup.exe"
                  className="px-5 py-2.5 rounded-xl bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] font-bold font-['Poppins',sans-serif] text-xs flex items-center justify-center gap-2 shadow-md shadow-[#F4A62A]/20 transition-all self-start sm:self-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>Download DeroVault-Setup.exe</span>
                </a>
              </div>
            </div>

            {/* Option 2: Portable ZIP Archive */}
            <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] hover:border-slate-600 transition-all space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-[#162852] border border-[#1E3466] text-slate-300 shrink-0">
                    <FileArchive className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white font-['Poppins',sans-serif]">
                      Portable Windows Archive (.zip)
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Standalone portable build. Extract and double-click to run immediately without administrative install permissions.
                    </p>
                  </div>
                </div>
                <a
                  href="/api/download/windows-app"
                  download="DeroVault-v1.0.0-Windows-x64.zip"
                  className="px-4 py-2 rounded-lg bg-[#132247] hover:bg-[#1A2E5E] text-slate-200 hover:text-white font-semibold text-xs flex items-center gap-1.5 border border-[#1E3466] transition-colors whitespace-nowrap self-start"
                >
                  <Download className="w-3.5 h-3.5 text-[#00A884]" />
                  <span>Download ZIP ({formatBytes(buildInfo.zipSize || 51103935)})</span>
                </a>
              </div>
            </div>

            {/* Installation Steps */}
            <div className="p-4 rounded-xl bg-[#0A1530] border border-[#1E3466] space-y-2 text-xs text-slate-300">
              <h5 className="font-semibold text-white font-['Poppins',sans-serif] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#00A884]" />
                <span>How to Install on Windows</span>
              </h5>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
                <li>Download and open <strong className="text-slate-100">DeroVault-Setup.exe</strong>.</li>
                <li>If Windows SmartScreen appears, click <strong className="text-slate-100">"More info"</strong> and select <strong className="text-slate-100">"Run anyway"</strong>.</li>
                <li>The digital granary will initialize and minimize safely to your Windows System Tray (next to your clock).</li>
                <li>Plug in any USB hard drive or flash disk to begin protecting your documents!</li>
              </ol>
            </div>
          </div>
        ) : (
          /* Tab: GitHub Releases & Actions Explanation */
          <div className="space-y-4 font-['Inter',sans-serif] text-xs">
            {/* Explanation of the User's Screenshot */}
            <div className="p-4 rounded-xl bg-[#132247]/70 border border-[#1E3466] space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#F4A62A] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-white font-['Poppins',sans-serif]">
                    Why GitHub wasn't showing the download button:
                  </h4>
                  <p className="text-slate-300 leading-relaxed">
                    1. <strong>"Verify it's you" prompt:</strong> Notice the alert badge next to your GitHub profile icon in your screenshot. GitHub locks artifact downloads until you click that banner and verify your account session.
                  </p>
                  <p className="text-slate-300 leading-relaxed">
                    2. <strong>GitHub Artifacts vs. GitHub Releases:</strong> Actions artifacts are temporary build logs wrapped in a 299 MB zip archive for CI pipelines, rather than user-facing software.
                  </p>
                  <p className="text-slate-300 leading-relaxed">
                    3. <strong>Now Fixed in Workflow:</strong> We updated your GitHub Actions workflows (<code className="text-[#00A884]">build-windows.yml</code> and <code className="text-[#00A884]">build-cross-platform.yml</code>) so every build now automatically creates a formal <strong>GitHub Release</strong> with direct, 1-click download links!
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://github.com/ambrosenen-blip/Dero-Vault-Remix/releases"
                target="_blank"
                rel="noreferrer"
                className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] hover:border-[#00A884] transition-all space-y-2 group block"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-['Poppins',sans-serif] flex items-center gap-1.5">
                    <span>GitHub Releases</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#00A884]" />
                  </span>
                  <span className="text-[10px] text-[#00A884] font-medium bg-[#00A884]/15 px-2 py-0.5 rounded-full">
                    Official Hub
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Go directly to repository Releases to download without needing to navigate GitHub Actions.
                </p>
              </a>

              <a
                href="https://github.com/ambrosenen-blip/Dero-Vault-Remix/actions"
                target="_blank"
                rel="noreferrer"
                className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] hover:border-[#F4A62A] transition-all space-y-2 group block"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-['Poppins',sans-serif] flex items-center gap-1.5">
                    <span>GitHub Actions Runs</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#F4A62A]" />
                  </span>
                  <span className="text-[10px] text-[#F4A62A] font-medium bg-[#F4A62A]/15 px-2 py-0.5 rounded-full">
                    CI / CD
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  To download directly from an Actions run, click the exact blue link named <strong>DeroVault-Windows-x64</strong> in the Artifacts table.
                </p>
              </a>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#1E3466] text-xs">
          <span className="text-slate-400 font-['Inter',sans-serif]">
            Version 1.0.0 · Local-First Automatic Backup
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-300 hover:text-white bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
