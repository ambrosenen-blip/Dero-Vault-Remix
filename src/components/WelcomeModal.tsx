/**
 * Dero Vault — First Launch Welcome Experience
 * Prompt Section 7
 */

import React from 'react';
import { Shield, HardDrive, ArrowRight, CheckCircle2 } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onGetStarted: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onGetStarted }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 space-y-6 text-slate-100 text-center">
        {/* Granary Icon */}
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
          <Shield className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Welcome to Dero Vault
          </h2>
          <p className="text-sm font-semibold text-emerald-400">
            Your digital granary.
          </p>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
          Protect your important files without the hassle of manual copying.
          Plug in an external hard drive or flash disk and Dero Vault can automatically back up your selected files.
        </p>

        {/* Feature Highlights */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-2.5 text-slate-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span><strong>Plug in &amp; forget:</strong> Backups initiate the moment your drive connects.</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span><strong>Incremental:</strong> Only copies new or modified files. Zero wasted time.</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span><strong>100% Offline:</strong> No cloud, no subscriptions, zero data leaves your PC.</span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={onGetStarted}
            className="w-full py-3 px-6 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 group"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          Plug in. Back up. Get on with your work.
        </div>
      </div>
    </div>
  );
};
