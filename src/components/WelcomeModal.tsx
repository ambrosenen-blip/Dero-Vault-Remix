/**
 * Dero Vault — Installation & Welcome Wizard
 * Welcomes user to Dero Vault™ — a product of Enen Digital Labs™
 * Features the official brand logo, Enen Digital Labs™ co-branding,
 * local-first architecture guidance, and initial preference setup.
 */

import React, { useState } from 'react';
import {
  HardDrive,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Bell,
  Clock,
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Check,
  Laptop,
} from 'lucide-react';
import { DeroGranaryEmblem, DeroVaultFullLogo, EnenDigitalLabsLogo } from './BrandLogo';
import { AppSettings, BackupReminderSettings, ReminderFrequency } from '../types';
import { ApiClient } from '../services/api';

interface WelcomeModalProps {
  isOpen: boolean;
  onGetStarted: () => void;
  settings?: AppSettings;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
  onUpdateReminderSettings?: (updates: Partial<BackupReminderSettings>) => Promise<void> | void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onGetStarted,
  settings,
  onUpdateSettings,
  onUpdateReminderSettings,
}) => {
  const EULA_VERSION = '1.0.0';
  const PRIVACY_VERSION = '1.0.0';

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Local state for wizard settings setup
  const [wizardAutoBackup, setWizardAutoBackup] = useState(settings?.autoBackup ?? true);
  const [wizardTurbo, setWizardTurbo] = useState(settings?.turboBackup ?? true);
  const [wizardStartAtLogin, setWizardStartAtLogin] = useState(settings?.startAtLogin ?? true);
  const [wizardReminderEnabled, setWizardReminderEnabled] = useState(settings?.reminders?.enabled ?? true);
  const [wizardFrequency, setWizardFrequency] = useState<ReminderFrequency>(settings?.reminders?.frequency ?? 'weekly');
  const [wizardTime, setWizardTime] = useState(settings?.reminders?.time ?? '17:00');

  if (!isOpen) return null;

  const handleFinishWizard = () => {
    // Commit preferences if update handlers are present
    if (onUpdateSettings) {
      onUpdateSettings({
        startAtLogin: wizardStartAtLogin,
        startMinimized: true,
        autoBackup: wizardAutoBackup,
        turboBackup: wizardTurbo,
        legalAcceptance: {
          eulaVersion: settings?.legalAcceptance?.eulaVersion || EULA_VERSION,
          eulaAcceptedAt: settings?.legalAcceptance?.eulaAcceptedAt || new Date().toISOString(),
          privacyNoticeVersion: settings?.legalAcceptance?.privacyNoticeVersion || PRIVACY_VERSION,
          privacyNoticeViewedAt: settings?.legalAcceptance?.privacyNoticeViewedAt || new Date().toISOString(),
        },
        reminders: {
          ...(settings?.reminders || {
            enabled: true,
            frequency: 'weekly',
            weeklyDays: [5],
            monthlyDay: 1,
            time: '17:00',
            snoozeUntil: null,
            lastNotifiedOccurrenceId: null,
            lastDismissedOccurrenceId: null,
          }),
          enabled: wizardReminderEnabled,
          frequency: wizardFrequency,
          time: wizardTime,
        },
      });

      // Ensure local legal acceptance record exists
      if (!settings?.legalAcceptance?.eulaAcceptedAt) {
        ApiClient.recordLegalAcceptance('eula', EULA_VERSION);
        ApiClient.recordLegalAcceptance('privacy', PRIVACY_VERSION);
      }
    }

    if (onUpdateReminderSettings) {
      onUpdateReminderSettings({
        enabled: wizardReminderEnabled,
        frequency: wizardFrequency,
        time: wizardTime,
      });
    }

    onGetStarted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-300 overflow-y-auto">
      <div className="w-full max-w-xl bg-[#0D1B3D] border border-[#1E3466] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-5 text-slate-100 relative overflow-hidden my-auto">
        {/* Ambient Warm Golden & Cyan Gradients */}
        <div className="absolute top-0 left-1/3 w-80 h-36 bg-[#F4A62A]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-72 h-36 bg-[#00A884]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Wizard Header: Brand Lockup & Co-Branding */}
        <div className="relative z-10 flex items-center justify-between pb-4 border-b border-[#1E3466]">
          {/* Enen Digital Labs™ Brand Attribution */}
          <div className="flex items-center gap-2">
            <EnenDigitalLabsLogo size="sm" showText={true} showTagline={false} />
          </div>

          {/* Wizard Step Indicator */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="font-medium text-slate-300">Step {currentStep} of 3</span>
            <div className="flex items-center gap-1 ml-1.5">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`h-1.5 rounded-full transition-all ${
                    currentStep === step
                      ? 'w-6 bg-[#F4A62A]'
                      : currentStep > step
                      ? 'w-2 bg-[#00A884]'
                      : 'w-2 bg-[#1E3466]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* STEP 1: WELCOME TO DERO VAULT™ & ENEN DIGITAL LABS™ */}
        {currentStep === 1 && (
          <div className="relative z-10 space-y-5 text-center">
            {/* Visual Header: Full Dero Vault Logo */}
            <div className="flex flex-col items-center justify-center pt-1">
              <DeroVaultFullLogo size="md" showTagline={false} />
              <div className="mt-2 text-center">
                <h2 className="text-xl sm:text-2xl font-black font-['Poppins',sans-serif] text-white tracking-tight flex items-center justify-center gap-1">
                  <span>Welcome to Dero Vault</span>
                  <sup className="text-[#F4A62A] text-xs font-bold leading-none">™</sup>
                </h2>
                <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-slate-300 font-['Inter',sans-serif]">
                  <span>A product of</span>
                  <span className="font-bold text-[#F4A62A]">Enen Digital Labs</span>
                  <sup className="text-[#F4A62A] text-[9px] font-bold">™</sup>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-300 italic font-medium">Your digital granary.</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto font-['Inter',sans-serif]">
              In agricultural heritage, the granary (<em className="text-[#F4A62A] font-semibold not-italic">dero</em>) securely preserves the harvest against storms and hardship. Dero Vault™ brings that quiet protection to your digital documents, spreadsheets, client records, and photos.
            </p>

            {/* Core Pillars Grid */}
            <div className="bg-[#081126] border border-[#1E3466] rounded-xl p-4 text-left text-xs space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-[#00A884]/15 text-[#00A884] shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-white font-['Poppins',sans-serif]">
                    100% Local &amp; Private (Trust By Design)
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                    Zero cloud accounts, zero telemetry, and zero remote servers. Everything operates locally on your machine and physical drives.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-[#F4A62A]/15 text-[#F4A62A] shrink-0 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-white font-['Poppins',sans-serif]">
                    Plug In &amp; Forget
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                    No manual dragging or complex routines. Plug in your registered USB drive, and incremental backups initiate automatically.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-[#38BDF8]/15 text-[#38BDF8] shrink-0 mt-0.5">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-white font-['Poppins',sans-serif]">
                    Zero Vendor Lock-In
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                    Files are mirrored in standard directory formats. If your computer breaks, plug your drive into any PC to restore work immediately.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between gap-3">
              <div className="text-[11px] text-[#F4A62A]/90 font-medium">
                Plug in. Back up. Get on with your work.
              </div>
              <button
                onClick={() => setCurrentStep(2)}
                className="py-2.5 px-5 text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-xl transition-all shadow-md shadow-[#F4A62A]/20 flex items-center gap-1.5 font-['Poppins',sans-serif]"
              >
                <span>Continue Setup</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SETUP PREFERENCES & BACKUP REMINDERS */}
        {currentStep === 2 && (
          <div className="relative z-10 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#F4A62A] font-['Poppins',sans-serif]">
                Installation Wizard — Step 2
              </span>
              <h3 className="text-lg font-bold font-['Poppins',sans-serif] text-white mt-0.5">
                Configure Backup &amp; Reminder Preferences
              </h3>
              <p className="text-xs text-slate-300 mt-1 font-['Inter',sans-serif]">
                Choose how Dero Vault™ safeguards your workstation. You can modify any of these anytime in Settings.
              </p>
            </div>

            <div className="space-y-3 font-['Inter',sans-serif]">
              {/* Option 0: Automatic Windows Startup */}
              <div
                onClick={() => setWizardStartAtLogin(!wizardStartAtLogin)}
                className="p-3.5 rounded-xl bg-[#081126] border border-[#1E3466] hover:border-slate-500 cursor-pointer transition-all flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#00A884]/15 text-[#00A884] shrink-0 mt-0.5">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs font-['Poppins',sans-serif] flex items-center gap-1.5">
                      <span>Launch Automatically at Windows Startup</span>
                      <span className="text-[10px] text-[#00A884] font-medium bg-[#00A884]/15 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Runs quietly in your system tray upon Windows sign-in to patrol and protect drives automatically.
                    </div>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    wizardStartAtLogin ? 'bg-[#00A884] text-white' : 'border border-slate-600'
                  }`}
                >
                  {wizardStartAtLogin && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              {/* Option 1: Automatic Backup on Connect */}
              <div
                onClick={() => setWizardAutoBackup(!wizardAutoBackup)}
                className="p-3.5 rounded-xl bg-[#081126] border border-[#1E3466] hover:border-slate-500 cursor-pointer transition-all flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#00A884]/15 text-[#00A884] shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs font-['Poppins',sans-serif]">
                      Start Automatic Backup on Drive Connection
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Backups begin quietly the moment you insert your registered USB drive.
                    </div>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    wizardAutoBackup ? 'bg-[#00A884] text-white' : 'border border-slate-600'
                  }`}
                >
                  {wizardAutoBackup && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              {/* Option 2: Turbo Backup Engine */}
              <div
                onClick={() => setWizardTurbo(!wizardTurbo)}
                className="p-3.5 rounded-xl bg-[#081126] border border-[#1E3466] hover:border-slate-500 cursor-pointer transition-all flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#F4A62A]/15 text-[#F4A62A] shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs font-['Poppins',sans-serif]">
                      Turbo Backup Engine (High Performance)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Bounded parallel workers with pipelined SHA-256 verification.
                    </div>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    wizardTurbo ? 'bg-[#F4A62A] text-[#0D1B3D]' : 'border border-slate-600'
                  }`}
                >
                  {wizardTurbo && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              {/* Option 3: Backup Reminders (Advisory Alerts) */}
              <div className="p-3.5 rounded-xl bg-[#081126] border border-[#1E3466] space-y-3">
                <div
                  onClick={() => setWizardReminderEnabled(!wizardReminderEnabled)}
                  className="flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[#F4A62A]/15 text-[#F4A62A] shrink-0 mt-0.5">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white text-xs font-['Poppins',sans-serif] flex items-center gap-1.5">
                        <span>Backup Reminders</span>
                        <span className="text-[10px] text-[#00A884] font-medium bg-[#00A884]/15 px-2 py-0.5 rounded-full">
                          Advisory
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Reminds you when it's time to connect your backup drive without taking over your PC.
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                      wizardReminderEnabled ? 'bg-[#00A884] text-white' : 'border border-slate-600'
                    }`}
                  >
                    {wizardReminderEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>

                {wizardReminderEnabled && (
                  <div className="pt-2 border-t border-[#1E3466]/80 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 text-[11px]">Reminder Cadence:</span>
                      <div className="flex items-center gap-1 bg-[#132247] p-0.5 rounded-lg border border-[#1E3466]">
                        {(['daily', 'weekly', 'monthly'] as ReminderFrequency[]).map((freq) => (
                          <button
                            key={freq}
                            type="button"
                            onClick={() => setWizardFrequency(freq)}
                            className={`px-2.5 py-1 rounded text-[11px] capitalize font-medium transition-colors ${
                              wizardFrequency === freq
                                ? 'bg-[#F4A62A] text-[#0D1B3D] font-bold'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {freq}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 text-[11px]">Local Reminder Time:</span>
                      <input
                        type="time"
                        value={wizardTime}
                        onChange={(e) => setWizardTime(e.target.value)}
                        className="bg-[#132247] border border-[#1E3466] text-white text-[11px] px-2.5 py-1 rounded-lg focus:outline-hidden focus:border-[#F4A62A]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="py-2.5 px-4 text-xs font-semibold text-slate-300 hover:text-white bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] rounded-xl transition-colors flex items-center gap-1.5 font-['Poppins',sans-serif]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                onClick={() => setCurrentStep(3)}
                className="py-2.5 px-5 text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-xl transition-all shadow-md shadow-[#F4A62A]/20 flex items-center gap-1.5 font-['Poppins',sans-serif]"
              >
                <span>Next: Hardware Connection</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: READY TO PROTECT FILES */}
        {currentStep === 3 && (
          <div className="relative z-10 space-y-5 text-center">
            <div className="flex justify-center">
              <div className="p-3 rounded-2xl bg-[#00A884]/15 border border-[#00A884]/30 text-[#00A884]">
                <ShieldCheck className="w-10 h-10" />
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#00A884] font-['Poppins',sans-serif]">
                Setup Complete
              </span>
              <h3 className="text-xl font-bold font-['Poppins',sans-serif] text-white mt-0.5">
                Your Digital Granary is Ready
              </h3>
              <p className="text-xs text-slate-300 mt-1 font-['Inter',sans-serif] max-w-md mx-auto">
                Whenever you are ready to secure your files, simply insert an external USB drive or flash disk.
              </p>
            </div>

            {/* Quick Next Steps */}
            <div className="bg-[#081126] border border-[#1E3466] rounded-xl p-4 text-left text-xs space-y-2.5 text-slate-300">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#F4A62A]/20 text-[#F4A62A] flex items-center justify-center font-bold text-[10px]">
                  1
                </div>
                <span>
                  <strong className="text-white font-['Poppins',sans-serif]">Insert USB Drive:</strong> Dero Vault detects the hardware insertion in real time.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#F4A62A]/20 text-[#F4A62A] flex items-center justify-center font-bold text-[10px]">
                  2
                </div>
                <span>
                  <strong className="text-white font-['Poppins',sans-serif]">Register in 1-Click:</strong> Select which folders (Documents, Desktop, etc.) to mirror.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#F4A62A]/20 text-[#F4A62A] flex items-center justify-center font-bold text-[10px]">
                  3
                </div>
                <span>
                  <strong className="text-white font-['Poppins',sans-serif]">Peace of Mind:</strong> Subsequent connections back up automatically in the background.
                </span>
              </div>
            </div>

            {/* Enen Digital Labs Guarantee Footer */}
            <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2">
                <EnenDigitalLabsLogo size="sm" showText={false} />
                <div className="text-[10px] text-slate-400">
                  <span>Enen Digital Labs™</span>
                  <div className="text-slate-300 font-medium">Building Trust. Designing Impact.</div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="py-2.5 px-3.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#132247] hover:bg-[#1A2E5E] border border-[#1E3466] rounded-xl transition-colors font-['Poppins',sans-serif]"
                >
                  Back
                </button>
                <button
                  onClick={handleFinishWizard}
                  className="flex-1 sm:flex-initial py-2.5 px-6 text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] rounded-xl transition-all shadow-lg shadow-[#F4A62A]/20 flex items-center justify-center gap-1.5 font-['Poppins',sans-serif]"
                >
                  <span>Finish &amp; Start Dero Vault™</span>
                  <CheckCircle2 className="w-4 h-4 text-[#0D1B3D]" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
