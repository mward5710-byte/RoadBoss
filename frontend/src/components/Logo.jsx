import React from 'react';

export function Logo({ size = 28, withWordmark = true, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Highway Pilot">
        <defs>
          <linearGradient id="hp-chrome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#c8d0d8" />
            <stop offset="55%" stopColor="#5b6470" />
            <stop offset="100%" stopColor="#dfe5ec" />
          </linearGradient>
          <radialGradient id="hp-eye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
        </defs>
        {/* Hex shield */}
        <path d="M32 3l25 14v30L32 61 7 47V17z" fill="url(#hp-chrome)" stroke="#0a0e14" strokeWidth="1.5"/>
        {/* Inner emblem - stylized HP / road */}
        <path d="M32 14l16 9v18L32 50 16 41V23z" fill="#0a0e14" />
        {/* Road lines */}
        <path d="M32 18 L32 46" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="3 3" opacity="0.95"/>
        {/* H */}
        <rect x="20" y="24" width="2.4" height="16" fill="url(#hp-chrome)"/>
        <rect x="27" y="24" width="2.4" height="16" fill="url(#hp-chrome)"/>
        <rect x="22" y="31" width="5" height="2" fill="url(#hp-chrome)"/>
        {/* P */}
        <rect x="35" y="24" width="2.4" height="16" fill="url(#hp-chrome)"/>
        <path d="M37 24h5a3 3 0 010 6h-5" fill="none" stroke="url(#hp-chrome)" strokeWidth="2.4"/>
        {/* Eye dot (homage to RoadBoss) */}
        <circle cx="32" cy="54" r="2.2" fill="url(#hp-eye)"/>
      </svg>
      {withWordmark && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-wide hp-chrome-text">HIGHWAY PILOT</div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-sky-400/70">stealth // v0.1</div>
        </div>
      )}
    </div>
  );
}
