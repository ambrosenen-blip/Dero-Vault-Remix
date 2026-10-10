/**
 * Dero Vault — Navigation Bar
 * Follows top bar contract with 3 clean zones: Brand, Navigation links, and Primary Action / Test Lab.
 */

import React from 'react';
import { LayoutDashboard, HardDrive, FolderSync, History, Settings } from 'lucide-react';

export type NavTab = 'dashboard' | 'drives' | 'profiles' | 'history' | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  registeredCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  registeredCount,
}) => {
  const tabs = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'drives' as NavTab, label: `Registered Drives (${registeredCount})`, icon: HardDrive },
    { id: 'profiles' as NavTab, label: 'Backup Profiles', icon: FolderSync },
    { id: 'history' as NavTab, label: 'Backup History', icon: History },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="flex items-center justify-between px-6 py-2.5 bg-slate-900 border-b border-slate-800 text-sm">
      {/* Navigation links */}
      <div className="flex items-center gap-1 sm:gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = currentTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
