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
  size = 36,
  withWordmark = true,
  className = '',
}) {
  const visualSize = Math.round(size * 1.1);
  if (!withWordmark) {
    return (
      <img
        src={SRC}
        alt="WreckerLogix"
        draggable={false}
        width={visualSize}
        height={visualSize}
        className={`rounded-md object-contain bg-white/[0.04] border border-white/10 ${className}`}
        style={{ width: visualSize, height: visualSize, padding: Math.max(1, Math.round(visualSize * 0.05)), boxSizing: 'border-box' }}
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
        className="rounded-md object-contain bg-white/[0.04] border border-white/10 shrink-0"
        style={{ width: visualSize, height: visualSize, padding: Math.max(1, Math.round(visualSize * 0.05)), boxSizing: 'border-box' }}
      />
      <div className="leading-none min-w-0">
        <div
          className="font-bold text-white tracking-wider"
          style={{ fontSize: Math.max(11, visualSize * 0.36) }}
        >
          WRECKER<span className="text-amber-400">LOGIX</span>
        </div>
        <div
          className="uppercase tracking-[0.32em] text-slate-500 mt-1"
          style={{ fontSize: Math.max(7, visualSize * 0.22) }}
        >
          Towing &amp; Recovery
        </div>
      </div>
    </div>
  );
}

export default WreckerLogixLogo;
