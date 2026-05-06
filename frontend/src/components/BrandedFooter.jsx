import React from 'react';

/**
 * BrandedFooter — unified copyright/branding footer used at the bottom of
 * public-facing pages (pitch deck, try page, ROI calculator, share kit, user guide).
 *
 * Single source of truth — edit here, propagates everywhere.
 *
 * Props:
 *   variant      'dark' (default) | 'light'  — for use on white backgrounds
 *   className    extra utility classes
 *   compact      bool — single-line micro version for tight footers
 */
export default function BrandedFooter({ variant = 'dark', className = '', compact = false }) {
  const year = new Date().getFullYear();
  const isLight = variant === 'light';
  const baseColor = isLight ? 'text-slate-500' : 'text-slate-500';
  const accent = isLight ? 'text-slate-700' : 'text-slate-300';

  if (compact) {
    return (
      <div data-testid="branded-footer-compact" className={`text-[10px] ${baseColor} text-center leading-relaxed ${className}`}>
        © {year} Apex Epoxy Flooring LLC · Operating as RoadBoss · Built by Michael Ward
      </div>
    );
  }

  return (
    <footer data-testid="branded-footer" className={`text-xs ${baseColor} text-center leading-relaxed space-y-1 ${className}`}>
      <div className={accent}>
        Apex Epoxy Flooring LLC · Operating as RoadBoss
      </div>
      <div>
        RoadBoss · Wreckerlogix · Co-Pilot
      </div>
      <div>
        Built by <span className={accent}>Michael Ward</span> · Kokomo, Indiana
      </div>
      <div className="pt-1">
        © {year} Apex Epoxy Flooring LLC. All rights reserved.
      </div>
    </footer>
  );
}
