import React from 'react';

/**
 * RoadBoss logo — custom hex shield + semi-truck silhouette with road
 * perspective vanishing to a horizon (the "boss watching the road").
 *
 * Design intent:
 *   - Pure SVG — sharp at any size, from 24px favicon to billboard print.
 *   - Hex shield = trucker patch / badge identity.
 *   - Inside: a stylized cab + flatbed silhouette in amber, with two
 *     converging white road lines underneath that vanish to a glowing
 *     horizon dot. Movement + authority in one mark.
 *   - Wordmark "ROAD" (semibold, slightly tighter) + "BOSS" (extrabold,
 *     bigger weight) — built so the round "D" and "B" letterforms have
 *     wide-open counters and crisp stem geometry. Readable at 12px.
 */
export function Logo({ size = 32, withWordmark = true, className = '', tagline = 'Wreckerlogix' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-label="RoadBoss"
        role="img"
      >
        <defs>
          <linearGradient id="rb-shield" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1f29" />
            <stop offset="100%" stopColor="#0a0e14" />
          </linearGradient>
          <linearGradient id="rb-shield-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="rb-truck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <radialGradient id="rb-horizon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="60%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Hex shield with amber chrome border */}
        <path
          d="M32 3l25 14v30L32 61 7 47V17z"
          fill="url(#rb-shield)"
          stroke="url(#rb-shield-edge)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Inner glow on the horizon */}
        <ellipse cx="32" cy="42" rx="16" ry="6" fill="url(#rb-horizon)" opacity="0.55" />

        {/* Road perspective — two converging lines vanishing to horizon dot */}
        <path
          d="M19 50 L30 38"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M45 50 L34 38"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* Center dashed road line */}
        <path
          d="M32 50 L32 39"
          stroke="#ffffff"
          strokeOpacity="0.7"
          strokeWidth="1.6"
          strokeDasharray="2.5 2"
          strokeLinecap="round"
        />

        {/* Vanishing-point glow */}
        <circle cx="32" cy="38" r="1.8" fill="#fef3c7" />

        {/* Semi-truck silhouette (cab + flatbed) — sits above the road */}
        {/* Cab */}
        <path
          d="M14 30
             L14 24
             Q14 22 16 22
             L21 22
             L24 18
             L28 18
             L28 30
             Z"
          fill="url(#rb-truck)"
        />
        {/* Cab window */}
        <path
          d="M22.5 22 L26 22 L26 26 L22.5 26 Q21.7 26 21.7 25.2 L21.7 22.7 Q21.7 22 22.5 22 Z"
          fill="#0a0e14"
          opacity="0.45"
        />
        {/* Flatbed / box trailer */}
        <rect x="28.5" y="20" width="20" height="10" rx="0.8" fill="url(#rb-truck)" />
        {/* Subtle highlight stripe on bed */}
        <rect x="29.5" y="22" width="18" height="1" fill="#fef3c7" opacity="0.6" />
        {/* Wheels */}
        <circle cx="19" cy="31.5" r="2.4" fill="#0a0e14" stroke="#fbbf24" strokeWidth="1" />
        <circle cx="35" cy="31.5" r="2.4" fill="#0a0e14" stroke="#fbbf24" strokeWidth="1" />
        <circle cx="44" cy="31.5" r="2.4" fill="#0a0e14" stroke="#fbbf24" strokeWidth="1" />
      </svg>

      {withWordmark && (
        <div className="leading-none">
          <div className="flex items-baseline gap-[1px]">
            <span
              className="text-[14px] tracking-tight text-slate-200"
              style={{ fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              ROAD
            </span>
            <span
              className="text-[15px] tracking-tight text-amber-300"
              style={{ fontWeight: 800, letterSpacing: '-0.01em' }}
            >
              BOSS
            </span>
          </div>
          {tagline && (
            <div className="text-[8px] uppercase tracking-[0.32em] text-amber-400/70 mt-1 font-semibold">
              {tagline}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
