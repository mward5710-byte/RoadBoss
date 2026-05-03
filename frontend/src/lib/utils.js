import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, '0')}m`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

export const dutyColor = {
  driving: { bg: 'bg-sky-500/15', text: 'text-sky-300', dot: 'bg-sky-400', label: 'Driving' },
  on_duty: { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-400', label: 'On Duty' },
  off_duty: { bg: 'bg-zinc-500/15', text: 'text-zinc-300', dot: 'bg-zinc-400', label: 'Off Duty' },
  sleeper: { bg: 'bg-purple-500/15', text: 'text-purple-300', dot: 'bg-purple-400', label: 'Sleeper' },
};

export const severityColor = {
  info: { bg: 'bg-sky-500/10', text: 'text-sky-300', border: 'border-sky-500/30' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30' },
  critical: { bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/40' },
};
