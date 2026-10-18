/**
 * Dero Vault — Navigation Bar
 * Follows top bar contract with 3 clean zones: Brand, Navigation links, and Primary Action / Test Lab.
 */

import React from 'react';
import { LayoutDashboard, HardDrive, FolderSync, History, Settings, Download } from 'lucide-react';

export type NavTab = 'dashboard' | 'drives' | 'profiles' | 'history' | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  registeredCount: number;
  onOpenDownloadModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  registeredCount,
  onOpenDownloadModal,
}) => {
  const tabs = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'drives' as NavTab, label: `Registered Drives (${registeredCount})`, icon: HardDrive },
    { id: 'profiles' as NavTab, label: 'Backup Profiles', icon: FolderSync },
    { id: 'history' as NavTab, label: 'Backup History', icon: History },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="flex items-center justify-between px-6 py-2.5 bg-[#0A1530] border-b border-[#1E3466] text-sm gap-2">
      {/* Navigation links */}
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = currentTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[#162852] text-[#F4A62A] font-semibold border border-[#1E3466] shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#112042]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F4A62A]' : 'text-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Download Desktop App Button (Only shown in browser/website context) */}
      {onOpenDownloadModal && typeof window !== 'undefined' && !(window as any).electronAPI?.isElectron && (
        <button
          onClick={onOpenDownloadModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#0D1B3D] bg-[#F4A62A] hover:bg-[#F6B54A] transition-all shadow-sm font-['Poppins',sans-serif] whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download App (.exe)</span>
        </button>
      )}
    </nav>
  );
};
