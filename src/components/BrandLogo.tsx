/**
 * Dero Vault — Official Brand Assets & Components
 * Implements the brand style guide:
 * - Granary emblem with lifted conical thatch roof, cyclic backup arrows, and modern SSD with glowing cyan LED.
 * - Wordmark "DERO" featuring the signature golden grain / harvest seed leaf in the "D".
 * - "— VAULT —" with golden accent lines and "Your digital granary." tagline.
 * - Official Palette:
 *   #0D1B3D - Primary (Trust & Stability)
 *   #F4A62A - Accent (Growth & Backup)
 *   #8B5E3C - Granary (Tradition & Heritage)
 *   #E6EEF5 - Background (Clean & Modern)
 *   #00A884 - Success (Completed Backup)
 */

import React from 'react';

interface EmblemProps {
  className?: string;
  size?: number | string;
  showGlow?: boolean;
}

/**
 * High-fidelity Vector SVG of the Dero Granary Emblem:
 * Traditional African granary basket with open conical thatched roof,
 * cyclical golden backup arrows, and modern external SSD with blue LED port.
 */
export const DeroGranaryEmblem: React.FC<EmblemProps> = ({
  className = '',
  size = 48,
  showGlow = true,
}) => {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dero Vault Granary Emblem"
    >
      <defs>
        {/* Golden Backup Arrow Gradient */}
        <linearGradient id="deroGoldArrowGrad" x1="20" y1="30" x2="180" y2="170" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F9BC45" />
          <stop offset="50%" stopColor="#F4A62A" />
          <stop offset="100%" stopColor="#E28912" />
        </linearGradient>

        {/* Granary Woven Body Gradient */}
        <linearGradient id="deroGranaryBodyGrad" x1="60" y1="65" x2="140" y2="145" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A26A40" />
          <stop offset="35%" stopColor="#8B5E3C" />
          <stop offset="70%" stopColor="#764D2E" />
          <stop offset="100%" stopColor="#5D381E" />
        </linearGradient>

        {/* Thatched Roof Gradient */}
        <linearGradient id="deroThatchRoofGrad" x1="120" y1="20" x2="180" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E6A144" />
          <stop offset="40%" stopColor="#D9892B" />
          <stop offset="80%" stopColor="#B36A1C" />
          <stop offset="100%" stopColor="#87470C" />
        </linearGradient>

        {/* SSD Metallic Aluminum Body Gradient */}
        <linearGradient id="deroSsdBodyGrad" x1="110" y1="130" x2="175" y2="165" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="25%" stopColor="#E2E8F0" />
          <stop offset="70%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>

        {/* LED Cyan Port Glow */}
        <filter id="deroLedGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Drop Shadow for SSD & Granary */}
        <filter id="deroSoftShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0D1B3D" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* 1. BACK GOLDEN LOOPING ARROW (sweeps behind top/left to bottom) */}
      <path
        d="M 148 48 C 120 22, 60 22, 34 60 C 18 84, 18 116, 32 142"
        stroke="url(#deroGoldArrowGrad)"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      />
      {/* Arrowhead on lower-left sweeping upwards */}
      <path
        d="M 33 144 L 20 126 M 33 144 L 46 128"
        stroke="url(#deroGoldArrowGrad)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points="32,154 16,128 47,130"
        fill="#F4A62A"
      />

      {/* 2. GRANARY BASKET BASE (Woven traditional African cylindrical store) */}
      <g filter="url(#deroSoftShadow)">
        {/* Granary shadow on ground */}
        <ellipse cx="100" cy="148" rx="46" ry="12" fill="#0D1B3D" fillOpacity="0.22" />

        {/* Granary Cylindrical Body */}
        <path
          d="M 64 80 L 64 140 C 64 150, 136 150, 136 140 L 136 80 Z"
          fill="url(#deroGranaryBodyGrad)"
          stroke="#422512"
          strokeWidth="3"
        />

        {/* Granary Inner Vault Rim / Opening (Hollow storage inside) */}
        <ellipse cx="100" cy="80" rx="36" ry="11" fill="#3D1E0C" stroke="#422512" strokeWidth="2.5" />
        <ellipse cx="100" cy="80" rx="33" ry="8" fill="#241005" />

        {/* Granary Woven Brick/Lattice Texture Lines */}
        {/* Horizontal courses */}
        <path d="M 64 92 C 78 97, 122 97, 136 92" stroke="#522C14" strokeWidth="1.5" fill="none" />
        <path d="M 64 104 C 78 109, 122 109, 136 104" stroke="#522C14" strokeWidth="1.5" fill="none" />
        <path d="M 64 116 C 78 121, 122 121, 136 116" stroke="#522C14" strokeWidth="1.5" fill="none" />
        <path d="M 64 128 C 78 133, 122 133, 136 128" stroke="#522C14" strokeWidth="1.5" fill="none" />

        {/* Vertical weave dashes (alternating brick courses) */}
        {/* Row 1 */}
        <line x1="78" y1="83" x2="78" y2="92" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="96" y1="84" x2="96" y2="94" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="114" y1="84" x2="114" y2="94" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="128" y1="83" x2="128" y2="92" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        {/* Row 2 */}
        <line x1="70" y1="94" x2="70" y2="104" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="87" y1="95" x2="87" y2="106" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="105" y1="95" x2="105" y2="106" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="123" y1="95" x2="123" y2="105" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        {/* Row 3 */}
        <line x1="77" y1="106" x2="77" y2="117" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="94" y1="107" x2="94" y2="118" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="112" y1="107" x2="112" y2="118" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        {/* Row 4 */}
        <line x1="71" y1="118" x2="71" y2="129" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="88" y1="119" x2="88" y2="130" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="106" y1="119" x2="106" y2="130" stroke="#B3784A" strokeWidth="1.5" strokeLinecap="round" />

        {/* Granary Doorway Frame (Rustic timber posts & lintel) */}
        <rect x="86" y="103" width="28" height="34" rx="2" fill="#3D1E0C" stroke="#2B1406" strokeWidth="2" />
        <rect x="88" y="105" width="24" height="32" rx="1" fill="#764522" />
        {/* Wooden door panels & lintel */}
        <line x1="86" y1="106" x2="114" y2="106" stroke="#D9892B" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="86" y1="103" x2="86" y2="137" stroke="#4A250E" strokeWidth="2.5" />
        <line x1="114" y1="103" x2="114" y2="137" stroke="#4A250E" strokeWidth="2.5" />
        {/* Door planks */}
        <line x1="94" y1="108" x2="94" y2="135" stroke="#4A250E" strokeWidth="1" />
        <line x1="100" y1="108" x2="100" y2="135" stroke="#4A250E" strokeWidth="1" />
        <line x1="106" y1="108" x2="106" y2="135" stroke="#4A250E" strokeWidth="1" />
        {/* Golden Door Knob / Latch Keyhole */}
        <circle cx="109" cy="122" r="2.2" fill="#F4A62A" stroke="#B3784A" strokeWidth="0.8" />

        {/* 3. LIFTED CONICAL THATCHED ROOF (Tilted to the right) */}
        <g transform="rotate(22 138 60)">
          {/* Conical Straw Thatch Lid */}
          <path
            d="M 138 20 L 102 78 C 114 83, 162 83, 174 78 Z"
            fill="url(#deroThatchRoofGrad)"
            stroke="#4A250E"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Thatch ridgelines / straw textures */}
          <line x1="138" y1="20" x2="112" y2="79" stroke="#F6BA55" strokeWidth="1.5" />
          <line x1="138" y1="20" x2="124" y2="81" stroke="#F6BA55" strokeWidth="1.5" />
          <line x1="138" y1="20" x2="138" y2="82" stroke="#F6BA55" strokeWidth="1.8" />
          <line x1="138" y1="20" x2="152" y2="81" stroke="#E28912" strokeWidth="1.5" />
          <line x1="138" y1="20" x2="164" y2="79" stroke="#B36A1C" strokeWidth="1.5" />
          {/* Bottom fringe reeds */}
          <path
            d="M 102 78 C 114 84, 162 84, 174 78"
            stroke="#87470C"
            strokeWidth="3.5"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
          {/* Top thatch peak binding knot */}
          <ellipse cx="138" cy="20" rx="3.5" ry="4.5" fill="#5D320B" stroke="#2B1406" strokeWidth="1.5" />
        </g>
      </g>

      {/* 4. FRONT GOLDEN LOOPING ARROW (sweeps from lower left to granary mouth) */}
      <path
        d="M 36 122 C 42 162, 102 178, 142 160 C 165 149, 174 126, 172 102"
        stroke="url(#deroGoldArrowGrad)"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrowhead pointing toward the granary top */}
      <polygon
        points="146,38 178,42 168,70"
        fill="#F4A62A"
        stroke="#D9892B"
        strokeWidth="1.5"
      />

      {/* 5. MODERN EXTERNAL SSD / HARD DRIVE (Resting at entrance) */}
      <g filter="url(#deroSoftShadow)">
        {/* SSD Shadow */}
        <polygon
          points="102,154 152,126 182,142 132,170"
          fill="#0D1B3D"
          fillOpacity="0.35"
        />

        {/* SSD Aluminum Case (Isometric angled slab) */}
        {/* Top Face */}
        <polygon
          points="108,142 148,118 176,134 136,158"
          fill="url(#deroSsdBodyGrad)"
          stroke="#475569"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Right Side Flank */}
        <polygon
          points="136,158 176,134 176,144 136,168"
          fill="#64748B"
          stroke="#334155"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Front Port Face */}
        <polygon
          points="108,142 136,158 136,168 108,152"
          fill="#334155"
          stroke="#1E293B"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* USB-C Port Aperture on Front Face */}
        <path
          d="M 116 148 L 128 155 L 128 159 L 116 152 Z"
          fill="#0F172A"
          stroke="#475569"
          strokeWidth="0.8"
        />

        {/* Glowing Electric-Cyan LED in Port */}
        <ellipse
          cx="122"
          cy="153.5"
          rx="4"
          ry="2"
          fill="#00D2FF"
          filter={showGlow ? 'url(#deroLedGlow)' : undefined}
        />
        <circle cx="122" cy="153.5" r="1.5" fill="#E0F2FE" />

        {/* Sleek drive status LED dot on top edge */}
        <circle cx="140" cy="138" r="1.2" fill="#00A884" />
      </g>
    </svg>
  );
};

interface WordmarkProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
}

/**
 * DERO VAULT Official Wordmark:
 * - "DERO" in bold geometric Poppins font.
 * - The letter "D" contains the signature golden grain / harvest seed leaf crescent inside its counter.
 * - "— VAULT —" with flanking accent gold lines.
 * - "Your digital granary." tagline.
 */
export const DeroWordmark: React.FC<WordmarkProps> = ({
  variant = 'dark',
  size = 'md',
  showTagline = true,
  className = '',
}) => {
  const isLight = variant === 'light'; // Light background = dark navy text

  const sizeClasses = {
    sm: {
      title: 'text-xl',
      vault: 'text-[9px] tracking-[0.25em]',
      line: 'w-4',
      tagline: 'text-[10px]',
      leafScale: 0.85,
    },
    md: {
      title: 'text-2xl',
      vault: 'text-[11px] tracking-[0.28em]',
      line: 'w-6',
      tagline: 'text-xs',
      leafScale: 1,
    },
    lg: {
      title: 'text-3xl sm:text-4xl',
      vault: 'text-xs sm:text-sm tracking-[0.32em]',
      line: 'w-8 sm:w-10',
      tagline: 'text-xs sm:text-sm',
      leafScale: 1.3,
    },
    xl: {
      title: 'text-4xl sm:text-5xl',
      vault: 'text-sm sm:text-base tracking-[0.36em]',
      line: 'w-10 sm:w-14',
      tagline: 'text-sm sm:text-base',
      leafScale: 1.6,
    },
  }[size];

  return (
    <div className={`flex flex-col select-none ${className}`}>
      {/* Brand Title: DERO with golden seed leaf inside 'D' */}
      <div className="flex items-center leading-none">
        {/* Custom Stylized "D" with harvest grain seed inside */}
        <div className="relative inline-flex items-center">
          <span
            className={`font-['Poppins',sans-serif] font-black ${sizeClasses.title} ${
              isLight ? 'text-[#0D1B3D]' : 'text-white'
            }`}
          >
            D
          </span>
          {/* Golden Seed/Leaf Crescent nestled inside the lower bowl of D */}
          <svg
            viewBox="0 0 24 24"
            className="absolute -bottom-0.5 -left-0.5 pointer-events-none"
            style={{ width: `${1.1 * (size === 'sm' ? 14 : size === 'md' ? 18 : size === 'lg' ? 24 : 30)}px` }}
            fill="none"
          >
            {/* Organic warm golden harvest seed leaf arc */}
            <path
              d="M 6 19 C 11 19, 16 16, 17 11 C 13 14, 8 16, 6 19 Z"
              fill="url(#deroSeedGrad)"
            />
            <defs>
              <linearGradient id="deroSeedGrad" x1="6" y1="19" x2="17" y2="11" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F4A62A" />
                <stop offset="100%" stopColor="#FBBF24" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* ERO letters */}
        <span
          className={`font-['Poppins',sans-serif] font-black tracking-tight ${sizeClasses.title} ${
            isLight ? 'text-[#0D1B3D]' : 'text-white'
          }`}
        >
          ERO
        </span>
      </div>

      {/* Sub-label: — VAULT — */}
      <div className="flex items-center gap-2 mt-1">
        <span className={`${sizeClasses.line} h-[2px] bg-[#F4A62A] rounded-full`} />
        <span
          className={`font-['Poppins',sans-serif] font-bold uppercase text-[#F4A62A] ${sizeClasses.vault}`}
        >
          VAULT
        </span>
        <span className={`${sizeClasses.line} h-[2px] bg-[#F4A62A] rounded-full`} />
      </div>

      {/* Tagline: Your digital granary. */}
      {showTagline && (
        <span
          className={`font-['Inter',sans-serif] font-normal mt-1.5 ${sizeClasses.tagline} ${
            isLight ? 'text-slate-600' : 'text-slate-300'
          }`}
        >
          Your digital granary.
        </span>
      )}
    </div>
  );
};

interface BrandHeaderBannerProps {
  className?: string;
  showStatusIndicator?: boolean;
  statusText?: string;
  isBackingUp?: boolean;
}

/**
 * Official App Header / Splash Screen Banner:
 * Directly reproduces the header banner from the brand style guide:
 * Deep Navy background (#0D1B3D), granary emblem on the left,
 * clean vertical divider, and the DERO VAULT brand lockup on the right.
 */
export const DeroBrandBanner: React.FC<BrandHeaderBannerProps> = ({
  className = '',
  showStatusIndicator = false,
  statusText,
  isBackingUp = false,
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-xl sm:rounded-2xl bg-[#0D1B3D] border border-[#1E305C] shadow-lg p-5 sm:p-6 text-white ${className}`}
    >
      {/* Granary Basket Texture Watermark Pattern in background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay"
        style={{
          backgroundImage: `radial-gradient(circle at 10% 20%, #F4A62A 0%, transparent 25%),
            linear-gradient(45deg, #132247 25%, transparent 25%, transparent 75%, #132247 75%, #132247),
            linear-gradient(45deg, #132247 25%, transparent 25%, transparent 75%, #132247 75%, #132247)`,
          backgroundSize: '100% 100%, 20px 20px, 20px 20px',
          backgroundPosition: '0 0, 0 0, 10px 10px',
        }}
      />

      <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-center justify-between gap-6">
        {/* Brand Left Lockup: Emblem + Divider + Wordmark */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Granary Logo Emblem */}
          <div className="relative">
            <DeroGranaryEmblem size={68} className="drop-shadow-md" />
          </div>

          {/* Clean Vertical Divider */}
          <div className="h-12 w-[1.5px] bg-[#1E305C] shrink-0" aria-hidden="true" />

          {/* Wordmark + Tagline */}
          <DeroWordmark variant="dark" size="md" showTagline={true} />
        </div>

        {/* Optional Right Action / Live Monitor Pill */}
        {showStatusIndicator && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#132247]/90 border border-[#1E305C] text-xs text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackingUp
                  ? 'bg-[#F4A62A] animate-pulse'
                  : 'bg-[#00A884]'
              }`}
            />
            <span className="font-['Inter',sans-serif] font-medium text-slate-200">
              {statusText || (isBackingUp ? 'Backing up...' : 'Digital Granary Ready')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface AppIconProps {
  variant?: 'light' | 'dark';
  size?: number;
  className?: string;
}

/**
 * App Icon Card matching the style guide's App Icon (Light) and App Icon (Dark)
 */
export const DeroAppIcon: React.FC<AppIconProps> = ({
  variant = 'light',
  size = 140,
  className = '',
}) => {
  const isLight = variant === 'light';

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-3xl p-4 flex flex-col items-center justify-center shadow-xl select-none transition-transform hover:scale-105 ${
        isLight
          ? 'bg-[#E6EEF5] border border-slate-200 text-[#0D1B3D]'
          : 'bg-[#0D1B3D] border border-[#1E305C] text-white'
      } ${className}`}
    >
      <DeroGranaryEmblem size={Math.round(size * 0.58)} />
      <div className="mt-2 text-center">
        <div
          className={`font-['Poppins',sans-serif] font-black text-xs leading-none tracking-tight ${
            isLight ? 'text-[#0D1B3D]' : 'text-white'
          }`}
        >
          DERO
        </div>
        <div className="text-[8px] font-bold text-[#F4A62A] tracking-[0.2em] mt-0.5">
          — VAULT —
        </div>
      </div>
    </div>
  );
};
