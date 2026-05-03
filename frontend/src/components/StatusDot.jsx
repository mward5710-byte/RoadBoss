import React from 'react';
export function StatusDot({ color = 'sky', size = 8 }) {
  const map = { sky: '#38bdf8', amber: '#f59e0b', red: '#ef4444', green: '#10b981', purple: '#a855f7', zinc: '#94a3b8' };
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full hp-pulse" style={{ background: map[color] || color }} />
      <span className="absolute inset-0 rounded-full" style={{ background: map[color] || color }} />
    </span>
  );
}
