/**
 * Dero Vault — First Launch Welcome Experience
 * Prompt Section 7
 */

import React from 'react';
import { HardDrive, ArrowRight, CheckCircle2 } from 'lucide-react';
import { DeroGranaryEmblem, DeroWordmark } from './BrandLogo';

interface WelcomeModalProps {
  isOpen: boolean;
  onGetStarted: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onGetStarted }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-[#0D1B3D] border border-[#1E3466] rounded-2xl shadow-2xl p-8 space-y-6 text-slate-100 text-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#F4A62A]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Granary Logo Emblem */}
        <div className="relative flex justify-center">
          <DeroGranaryEmblem size={96} showGlow={true} className="drop-shadow-xl" />
        </div>

        {/* Brand Wordmark & Slogan */}
        <div className="flex flex-col items-center">
          <DeroWordmark variant="dark" size="lg" showTagline={true} />
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto font-['Inter',sans-serif]">
          Protect your important files without the hassle of manual copying.
          Plug in an external hard drive or flash disk and Dero Vault can automatically back up your selected files.
        </p>

        {/* Feature Highlights with Brand Success #00A884 */}
        <div className="bg-[#081126] border border-[#1E3466] rounded-xl p-4 text-left text-xs space-y-2.5 text-slate-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#00A884] shrink-0" />
            <span><strong className="text-white font-['Poppins',sans-serif]">Plug in &amp; forget:</strong> Backups initiate the moment your drive connects.</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#00A884] shrink-0" />
            <span><strong className="text-white font-['Poppins',sans-serif]">Incremental:</strong> Only copies new or modified files. Zero wasted time.</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#00A884] shrink-0" />
            <span><strong className="text-white font-['Poppins',sans-serif]">100% Offline:</strong> No cloud, no subscriptions, zero data leaves your PC.</span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={onGetStarted}
            className="w-full py-3 px-6 text-sm font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-xl transition-all shadow-lg shadow-[#F4A62A]/20 flex items-center justify-center gap-2 group font-['Poppins',sans-serif]"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="text-[11px] text-[#F4A62A]/80 font-medium">
          Plug in. Back up. Get on with your work.
        </div>
      </div>
    </div>
  );
};
