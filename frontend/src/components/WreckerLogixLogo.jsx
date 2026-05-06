import React from 'react';

/**
 * WreckerLogixLogo — the dedicated brand for the towing/wrecker side.
 * Distinct from RoadBoss (umbrella SaaS / fleet brand). Uses Mike's
 * original WreckerLogix artwork that lives in /public/assets.
 *
 * Usage:
 *   <WreckerLogixLogo size={32} withWordmark />        // full mark + text
 *   <WreckerLogixLogo size={28} withWordmark={false} /> // icon only
 */
const SRC = '/assets/wreckerlogix-logo.jpeg';

export function WreckerLogixLogo({
  size = 32,
  withWordmark = true,
  className = '',
}) {
  if (!withWordmark) {
    return (
      <img
        src={SRC}
        alt="WreckerLogix"
        draggable={false}
        width={size}
        height={size}
        className={`rounded-md object-cover bg-white/[0.04] border border-white/10 ${className}`}
        style={{ width: size, height: size }}
        data-testid="wreckerlogix-logo-icon"
      />
    );
  }

  return (
    <div
      className={`flex items-center gap-2.5 ${className}`}
      data-testid="wreckerlogix-logo"
    >
      <img
        src={SRC}
        alt="WreckerLogix"
        draggable={false}
        className="rounded-md object-cover bg-white/[0.04] border border-white/10 shrink-0"
        style={{ width: size, height: size }}
      />
      <div className="leading-none min-w-0">
        <div
          className="font-bold text-white tracking-wider"
          style={{ fontSize: Math.max(11, size * 0.36) }}
        >
          WRECKER<span className="text-amber-400">LOGIX</span>
        </div>
        <div
          className="uppercase tracking-[0.32em] text-slate-500 mt-1"
          style={{ fontSize: Math.max(7, size * 0.22) }}
        >
          Towing &amp; Recovery
        </div>
      </div>
    </div>
  );
}

export default WreckerLogixLogo;
