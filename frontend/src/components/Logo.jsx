import React from 'react';

/**
 * RoadBoss official brand mark.
 *
 * Uses Mike's commissioned chrome "Transformers-style" wordmark where the
 * center of the word literally morphs from a polished semi-truck grille
 * (with three amber roof markers, mirror, and chrome stack) into a sleek
 * AI robot head with a glowing blue sensor eye.
 *
 *   - withWordmark=true  -> full PNG wordmark (RO[truck/robot]SS)
 *   - withWordmark=false -> just the central truck/robot head, square
 *
 * Both assets are pre-cropped/optimized PNGs in /public/brand so the
 * component itself is just a thin <img> wrapper — no SVG redraw needed.
 */
const WORDMARK_SRC = '/brand/roadboss-wordmark.png';
const ICON_SRC = '/brand/roadboss-icon.png';
// Aspect ratio of the wordmark PNG (917 / 744 ≈ 1.23). Used so the
// element reserves the right amount of horizontal space for the artwork.
const WORDMARK_ASPECT = 917 / 744;

export function Logo({
  size = 32,
  withWordmark = true,
  className = '',
  tagline = '',
}) {
  if (!withWordmark) {
    return (
      <img
        src={ICON_SRC}
        alt="RoadBoss"
        draggable={false}
        width={size}
        height={size}
        className={`rounded-md ${className}`}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          display: 'inline-block',
          background: '#0a0e16',
        }}
        data-testid="brand-logo-icon"
      />
    );
  }

  // The wordmark already contains "ROADBOSS" lettering, so we don't
  // render extra text — only the optional small tagline below the mark.
  const wordmarkHeight = Math.round(size * 1.6);
  const wordmarkWidth = Math.round(wordmarkHeight * WORDMARK_ASPECT);

  return (
    <div
      className={`inline-flex flex-col items-center gap-1 ${className}`}
      data-testid="brand-logo"
    >
      <img
        src={WORDMARK_SRC}
        alt="RoadBoss — Wreckerlogix"
        draggable={false}
        width={wordmarkWidth}
        height={wordmarkHeight}
        style={{
          width: wordmarkWidth,
          height: wordmarkHeight,
          objectFit: 'contain',
          display: 'block',
          filter: 'drop-shadow(0 2px 8px rgba(56,189,248,0.20))',
          pointerEvents: 'none',
        }}
      />
      {tagline && (
        <span
          className="text-[8px] uppercase tracking-[0.32em] text-amber-400/70 font-semibold leading-none"
          data-testid="brand-tagline"
        >
          {tagline}
        </span>
      )}
    </div>
  );
}

export default Logo;
