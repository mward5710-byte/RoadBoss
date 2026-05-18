/**
 * AppFooter — shared proprietary copyright + legal footer.
 * Rendered at the bottom of every major surface: Login, AppShell,
 * WreckerShell sidebar, and Marketing.
 *
 * © Mike Ward · RoadBoss™ · WreckerLogix™  All Rights Reserved.
 */
import React from 'react';
import { Link } from 'react-router-dom';

const YEAR = new Date().getFullYear();

/**
 * @param {'light'|'dark'} variant - 'dark' (default) for app shells,
 *   'light' is slightly brighter for standalone pages.
 */
export default function AppFooter({ variant = 'dark', className = '' }) {
  const text = variant === 'light' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-400';
  const divider = variant === 'light' ? 'bg-white/8' : 'bg-white/5';

  return (
    <footer
      className={`w-full px-4 pb-4 pt-3 ${className}`}
      data-testid="app-footer"
    >
      <div className={`h-px w-full ${divider} mb-3`} />
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-[10px] text-slate-600 uppercase tracking-[0.22em] font-semibold">
          Proprietary &amp; Confidential
        </p>
        <p className="text-[10px] text-slate-600">
          © {YEAR} Mike Ward · RoadBoss™ &amp; WreckerLogix™ · All Rights Reserved
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <Link
            to="/legal/terms"
            className={`text-[10px] transition ${text}`}
            data-testid="footer-terms-link"
          >
            Terms of Use
          </Link>
          <span className="text-slate-700 text-[10px]">·</span>
          <Link
            to="/legal/privacy"
            className={`text-[10px] transition ${text}`}
            data-testid="footer-privacy-link"
          >
            Privacy Policy
          </Link>
          <span className="text-slate-700 text-[10px]">·</span>
          <a
            href="mailto:support@roadboss.app"
            className={`text-[10px] transition ${text}`}
            data-testid="footer-contact-link"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
