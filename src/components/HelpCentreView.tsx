/**
 * Dero Vault — Help Centre & Digital Granary Guide
 * Complete, offline-accessible documentation, guiding philosophy,
 * Turbo Backup performance guide, drive setup, and direct file recovery.
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Zap,
  Shield,
  HardDrive,
  FolderSync,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileText,
  Lock,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { DeroGranaryEmblem, DeroWordmark, EnenDigitalLabsLogo } from './BrandLogo';

export const HelpCentreView: React.FC<{
  onNavigateTab?: (tab: 'dashboard' | 'drives' | 'profiles' | 'history' | 'settings') => void;
}> = ({ onNavigateTab }) => {
  const [activeCategory, setActiveCategory] = useState<
    'philosophy' | 'turbo' | 'architecture' | 'recovery' | 'faq'
  >('philosophy');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E3466]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-['Poppins',sans-serif] text-white">
              Help Centre &amp; Documentation
            </h2>
            <span className="text-[10px] font-bold text-[#F4A62A] bg-[#162852] px-2 py-0.5 rounded-full border border-[#1E3466]">
              Offline Knowledge Base
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 font-['Inter',sans-serif]">
            Everything you need to know about your digital granary, Turbo backup pipelines, and disaster recovery.
          </p>
        </div>

        {/* Category Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#0D1B3D] border border-[#1E3466] rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setActiveCategory('philosophy')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'philosophy'
                ? 'bg-[#162852] text-[#F4A62A] font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Philosophy
          </button>
          <button
            onClick={() => setActiveCategory('turbo')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeCategory === 'turbo'
                ? 'bg-[#162852] text-[#F4A62A] font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-[#F4A62A]" />
            <span>Turbo Backup</span>
          </button>
          <button
            onClick={() => setActiveCategory('architecture')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'architecture'
                ? 'bg-[#162852] text-[#F4A62A] font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            How It Works
          </button>
          <button
            onClick={() => setActiveCategory('recovery')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'recovery'
                ? 'bg-[#162852] text-[#F4A62A] font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Direct Recovery
          </button>
          <button
            onClick={() => setActiveCategory('faq')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'faq'
                ? 'bg-[#162852] text-[#F4A62A] font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            FAQ
          </button>
        </div>
      </div>

      {/* CATEGORY 1: GUIDING PHILOSOPHY */}
      {activeCategory === 'philosophy' && (
        <div className="space-y-6 text-slate-200">
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-sm">
            <div className="flex items-center gap-3">
              <DeroGranaryEmblem size={44} showGlow={true} />
              <div>
                <span className="font-['Poppins',sans-serif] font-bold text-white text-lg tracking-tight">
                  The Dero Vault Philosophy
                </span>
                <p className="text-xs text-[#F4A62A] font-medium">
                  Your digital granary. Built for calm, reliable, everyday peace of mind.
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              For generations, agricultural communities maintained a granary—a secure, elevated place of storage built to keep the harvest safe from drought, pests, and bad weather. You never bet your survival on good luck; you put the seed in the granary every single day. Dero Vault brings that timeless ethos to your personal digital workstation.
            </p>

            {/* The 4 Core Tenets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F4A62A]/20 flex items-center justify-center text-[#F4A62A] font-bold text-xs">
                    1
                  </div>
                  <h4 className="font-bold text-white text-sm font-['Poppins',sans-serif]">
                    Your digital granary.
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your files represent months and years of hard work, financial spreadsheets, client contracts, and family memories. Dero Vault preserves that digital harvest on physical hardware you own and control.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F4A62A]/20 flex items-center justify-center text-[#F4A62A] font-bold text-xs">
                    2
                  </div>
                  <h4 className="font-bold text-white text-sm font-['Poppins',sans-serif]">
                    Plug in. Back up. Get on with your work.
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Backup software should never interrupt you with modal pop-ups, modal blockers, or endless configuration Wizards during your workday. Simply insert your external drive, and Dero Vault quietly secures your files in the background.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F4A62A]/20 flex items-center justify-center text-[#F4A62A] font-bold text-xs">
                    3
                  </div>
                  <h4 className="font-bold text-white text-sm font-['Poppins',sans-serif]">
                    Make the safe action the lazy action.
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Human beings forget routines when they require effort, navigation, or mental overhead. By automating the entire backup trigger upon hardware connection, the safest habit becomes the easiest, effortless habit.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F4A62A]/20 flex items-center justify-center text-[#F4A62A] font-bold text-xs">
                    4
                  </div>
                  <h4 className="font-bold text-white text-sm font-['Poppins',sans-serif]">
                    The computer is replaceable; the office is portable.
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Laptops break, fall, get lost, or short circuit. If your laptop disappears today, can you plug your USB drive into another computer tomorrow and resume work immediately? With Dero Vault, yes. Your files are transparently mirrored without proprietary encodings.
                </p>
              </div>
            </div>

            {/* Enen Digital Labs™ Brand Story & Foundational Pillars */}
            <div className="pt-4 border-t border-[#1E3466]/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <EnenDigitalLabsLogo size="md" showText={true} showTagline={true} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#00A884] bg-[#00A884]/15 px-2.5 py-1 rounded-full border border-[#00A884]/30 self-start sm:self-auto font-['Poppins',sans-serif]">
                  Engineering The Future
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-['Inter',sans-serif]">
                Dero Vault™ was conceived, designed, and engineered by <strong>Enen Digital Labs™</strong>. At Enen Digital Labs, our mission is simple yet uncompromising: <span className="text-white font-medium">"Building Trust. Designing Impact. Delivering Future."</span> We build software that treats your autonomy, privacy, and data ownership as sacred principles.
              </p>

              {/* 5 Core Pillars from Enen Digital Labs Brand Mark */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                <div className="p-3 rounded-xl bg-[#081126] border border-[#1E3466] text-center space-y-1">
                  <div className="text-[#38BDF8] font-bold text-[11px] font-['Poppins',sans-serif]">
                    IDENTITY
                  </div>
                  <div className="text-[10px] text-slate-400">Verified &amp; Sovereign</div>
                </div>

                <div className="p-3 rounded-xl bg-[#081126] border border-[#1E3466] text-center space-y-1">
                  <div className="text-[#00A884] font-bold text-[11px] font-['Poppins',sans-serif]">
                    TRUST
                  </div>
                  <div className="text-[10px] text-slate-400">By Design &amp; Action</div>
                </div>

                <div className="p-3 rounded-xl bg-[#081126] border border-[#1E3466] text-center space-y-1">
                  <div className="text-[#F4A62A] font-bold text-[11px] font-['Poppins',sans-serif]">
                    TECHNOLOGY
                  </div>
                  <div className="text-[10px] text-slate-400">At Our Core</div>
                </div>

                <div className="p-3 rounded-xl bg-[#081126] border border-[#1E3466] text-center space-y-1">
                  <div className="text-[#A855F7] font-bold text-[11px] font-['Poppins',sans-serif]">
                    LABS MINDSET
                  </div>
                  <div className="text-[10px] text-slate-400">Innovate &amp; Impact</div>
                </div>

                <div className="p-3 rounded-xl bg-[#081126] border border-[#1E3466] text-center space-y-1 col-span-2 sm:col-span-1">
                  <div className="text-[#EC4899] font-bold text-[11px] font-['Poppins',sans-serif]">
                    HUMAN IMPACT
                  </div>
                  <div className="text-[10px] text-slate-400">Empowering Lives</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY 2: TURBO BACKUP PIPELINE */}
      {activeCategory === 'turbo' && (
        <div className="space-y-6 text-slate-200">
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E3466]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#F4A62A]/20 border border-[#F4A62A]/40 text-[#F4A62A]">
                  <Zap className="w-6 h-6 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-['Poppins',sans-serif] text-white">
                    Turbo Backup Engine vs Standard Mode
                  </h3>
                  <p className="text-xs text-slate-300">
                    Understanding the two high-integrity pipelines and how to choose the right mode.
                  </p>
                </div>
              </div>

              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('settings')}
                  className="px-3 py-1.5 rounded-lg bg-[#162852] hover:bg-[#1E3466] text-xs font-semibold text-[#F4A62A] border border-[#1E3466] transition-colors"
                >
                  Configure in Settings →
                </button>
              )}
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              Dero Vault features an explicit user-controlled dual-pipeline engine. You have full transparency and control over whether your backups use the high-speed Turbo pipeline or the conservative Standard pipeline.
            </p>

            {/* Pipeline Comparison Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#132247]/70 border border-[#F4A62A]/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#F4A62A]" />
                    <span>Turbo Backup: ON</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F4A62A]/20 text-[#F4A62A] border border-[#F4A62A]/40">
                    Optimized
                  </span>
                </div>

                <ul className="text-xs text-slate-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Bounded Parallel Concurrency:</strong> Up to 16 concurrent workers for small/mixed files, 4 workers for large media archives.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">High-Throughput Streaming:</strong> 512KB read/write stream buffers and zero-latency batch directory caching.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Pipelined SHA-256 Hashing:</strong> Cryptographic checksums calculated simultaneously during file streaming.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Best For:</strong> Modern USB 3.0/3.1/3.2 drives, external SSDs, NVMe drives, multi-core PCs.</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-slate-300" />
                    <span>Turbo Backup: OFF</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Standard Mode
                  </span>
                </div>

                <ul className="text-xs text-slate-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Strictly Sequential Worker:</strong> Exactly one file copied at a time (concurrency = 1) to eliminate disk head seeking.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Conservative 64KB Buffers:</strong> Minimal memory footprint, preventing bus saturation on low-power USB controllers.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Full Verification Safeguards:</strong> Exact same SHA-256 validation and atomic staging as Turbo mode.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A884] shrink-0 mt-0.5" />
                    <span><strong className="text-white">Best For:</strong> Legacy USB 2.0 thumb drives, bus-powered mechanical hard drives, ultra-low power laptops.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Integrity Guarantee Note */}
            <div className="p-4 rounded-xl bg-[#081126] border border-[#1E3466] text-xs text-slate-300 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#F4A62A]" />
                <span>Zero Compromise on File Integrity</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                In both modes, every file is staged to a temporary <code className="text-[#F4A62A] font-mono">.dero_part</code> file before atomic promotion. If a drive is unplugged mid-write, partial files are safely cleaned and original files remain unharmed. Integrity checks are never weakened for speed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY 3: ARCHITECTURE & HOW IT WORKS */}
      {activeCategory === 'architecture' && (
        <div className="space-y-6 text-slate-200">
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-2xl p-6 sm:p-8 space-y-5">
            <h3 className="text-base font-bold font-['Poppins',sans-serif] text-white">
              Under the Hood: Native Windows Storage Detection
            </h3>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p>
                Unlike generic backup scripts that poll the filesystem constantly, Dero Vault uses native Windows PnP Subsystem hooks (<code className="text-[#F4A62A] font-mono">WM_DEVICECHANGE</code>) to listen directly for storage bus events.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 bg-[#081126] border border-[#1E3466] rounded-xl space-y-1">
                  <div className="font-bold text-white text-xs">1. Hardware Identity</div>
                  <p className="text-[11px] text-slate-400">
                    Drive letters like <code className="text-[#F4A62A] font-mono">E:</code> change when other flash drives are plugged in. Dero Vault matches drives by permanent volume serials and PNP IDs so backups never write to the wrong disk.
                  </p>
                </div>

                <div className="p-3.5 bg-[#081126] border border-[#1E3466] rounded-xl space-y-1">
                  <div className="font-bold text-white text-xs">2. Incremental Comparison</div>
                  <p className="text-[11px] text-slate-400">
                    Before copying, Dero Vault checks file size and modification timestamps (<code className="text-[#F4A62A] font-mono">mtime</code>). Only new and altered files are copied. Unchanged files are skipped in milliseconds.
                  </p>
                </div>

                <div className="p-3.5 bg-[#081126] border border-[#1E3466] rounded-xl space-y-1">
                  <div className="font-bold text-white text-xs">3. Atomic File Promotion</div>
                  <p className="text-[11px] text-slate-400">
                    Files stream directly to <code className="text-[#F4A62A] font-mono">filename.dero_part</code>. Once verified against source size and SHA-256 hash, an atomic filesystem rename promotes the file to its final location.
                  </p>
                </div>
              </div>

              {/* Disk Directory Structure */}
              <div className="mt-4 p-4 rounded-xl bg-[#081126] border border-[#1E3466] space-y-2">
                <div className="font-bold text-white text-xs flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-[#F4A62A]" />
                  <span>On-Disk Granary Structure</span>
                </div>
                <pre className="p-3 bg-[#020617] rounded-lg font-mono text-[11px] text-slate-300 border border-[#1E3466] overflow-x-auto">
{`E:\\ (Your USB or External Hard Drive)
└── DERO_VAULT_BACKUP\\
    ├── CURRENT\\          <-- Exact, transparent mirror of your protected folders
    │   ├── Documents\\
    │   └── Desktop\\
    ├── VERSIONS\\         <-- Timestamped prior versions (if version retention enabled)
    │   └── 2026-10-18_14-30-00\\
    └── REPORTS\\          <-- JSON and TXT audit reports for every backup session`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY 4: DIRECT RECOVERY */}
      {activeCategory === 'recovery' && (
        <div className="space-y-6 text-slate-200">
          <div className="bg-[#0D1B3D] border border-[#1E3466] rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-[#1E3466]">
              <div className="p-2.5 rounded-xl bg-[#00A884]/20 border border-[#00A884]/40 text-[#00A884]">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-['Poppins',sans-serif] text-white">
                  Direct Recovery (Zero Vendor Lock-In)
                </h3>
                <p className="text-xs text-slate-300">
                  How to restore your files immediately on any computer, anywhere in the world.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p>
                Most commercial backup systems pack your data into proprietary proprietary archives (e.g. <code className="text-[#F4A62A] font-mono">.tib</code>, <code className="text-[#F4A62A] font-mono">.bkf</code>, or custom databases). If the software breaks, is discontinued, or isn't installed on a replacement PC, your files are held hostage.
              </p>

              <div className="p-4 rounded-xl bg-[#081126] border border-[#00A884]/30 text-xs space-y-2">
                <span className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#00A884]" />
                  <span>The Dero Vault Guarantee: Pure Standard Files</span>
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Dero Vault stores all files in standard directory hierarchies inside <code className="text-[#F4A62A] font-mono">DERO_VAULT_BACKUP/CURRENT</code>. No proprietary containers. No cloud login required.
                </p>
              </div>

              <h4 className="font-bold text-white text-sm pt-2">How to recover in 3 steps:</h4>
              <ol className="list-decimal list-inside space-y-2 pl-2 text-slate-300 text-xs">
                <li>
                  <strong className="text-white">Plug your USB drive</strong> into any Windows, macOS, or Linux computer.
                </li>
                <li>
                  <strong className="text-white">Open File Explorer</strong> (or Finder) and navigate to the drive letter (e.g. <code className="text-[#F4A62A] font-mono">E:\DERO_VAULT_BACKUP\CURRENT</code>).
                </li>
                <li>
                  <strong className="text-white">Drag and drop</strong> your documents, spreadsheets, photos, or desktop files straight back onto the computer. That’s it!
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY 5: FAQ & TROUBLESHOOTING */}
      {activeCategory === 'faq' && (
        <div className="space-y-4">
          {[
            {
              q: 'What happens if I unplug my drive while a backup is running?',
              a: 'Dero Vault is crash-resilient by design. All writing occurs to temporary .dero_part files. If a disconnect occurs mid-write, original destination files are never corrupted. When the drive is reconnected, Dero Vault cleans orphaned partial files and safely resumes where it left off.',
            },
            {
              q: 'How does Turbo Backup achieve faster speeds?',
              a: 'Standard backups copy files one-by-one with 64KB buffers. For hundreds of small office documents, OS file-open overhead dominates elapsed time. Turbo mode uses bounded parallel workers (up to 16 concurrent operations), large 512KB streaming buffers, and calculates SHA-256 checksums in flight.',
            },
            {
              q: 'Does Dero Vault send any data to the cloud or external servers?',
              a: 'Never. Dero Vault operates 100% locally on your computer. Zero telemetry, zero cloud storage, zero tracking, and zero remote dependencies. All database records and logs stay on your local disk.',
            },
            {
              q: 'Can I have multiple USB drives registered to different folders?',
              a: 'Yes. You can register multiple external drives (e.g., an Office USB drive that backs up Documents and Desktop, and a Home External Drive that backs up Projects and Photos). Dero Vault identifies each drive by hardware ID and runs the appropriate profile automatically.',
            },
            {
              q: 'Where are prior versions of modified files stored?',
              a: 'If "Preserve modified file versions" is enabled in Settings, previous revisions of edited files are timestamped and preserved in DERO_VAULT_BACKUP/VERSIONS on the drive instead of being overwritten.',
            },
            {
              q: 'How do I completely exit the application?',
              a: 'Closing the main window with the X button minimizes the application to the system tray so that automatic drive detection continues. To fully quit, right-click the Dero Vault tray icon near the Windows clock and click "Exit Dero Vault". If a backup is active, it will prompt you before closing.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-[#0D1B3D] border border-[#1E3466] rounded-xl overflow-hidden shadow-sm transition-all"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full p-4 text-left flex items-center justify-between text-xs font-semibold text-white hover:bg-[#132247] transition-colors"
              >
                <span className="font-['Poppins',sans-serif]">{item.q}</span>
                {expandedFaq === idx ? (
                  <ChevronDown className="w-4 h-4 text-[#F4A62A] shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>
              {expandedFaq === idx && (
                <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-[#1E3466]/60 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
