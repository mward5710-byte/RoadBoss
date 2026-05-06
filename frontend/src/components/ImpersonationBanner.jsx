import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { isImpersonating, endImpersonation, getUser } from '@/lib/api';
import { toast } from 'sonner';

/**
 * ImpersonationBanner — sticky red strip shown app-wide when a super_admin
 * is currently logged-in-as another user. Provides a one-tap "End Session"
 * to restore the original super_admin session.
 *
 * Mounted near the top of <App> so it floats above ALL routes.
 */
export default function ImpersonationBanner() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [actingAs, setActingAs] = useState(null);

  useEffect(() => {
    const check = () => {
      const isImp = isImpersonating();
      setActive(isImp);
      setActingAs(isImp ? getUser() : null);
    };
    check();
    // Recheck whenever localStorage changes (e.g. another tab) or every 2s
    const t = setInterval(check, 2000);
    window.addEventListener('storage', check);
    return () => { clearInterval(t); window.removeEventListener('storage', check); };
  }, []);

  if (!active || !actingAs) return null;

  const end = () => {
    endImpersonation();
    toast.success('Back to your super-admin session.');
    setActive(false);
    setActingAs(null);
    setTimeout(() => navigate('/super'), 150);
  };

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] bg-rose-600/95 backdrop-blur border-b border-rose-300/40 text-white shadow-lg shadow-rose-900/30"
      data-testid="impersonation-banner"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-rose-300/20 border border-rose-200/40 flex items-center justify-center shrink-0">
          <Eye className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-rose-100/90 font-bold leading-none">SUPER-ADMIN IMPERSONATION ACTIVE</div>
          <div className="text-xs sm:text-sm font-semibold leading-tight truncate">
            Acting as <span className="text-white">{actingAs.name || actingAs.email}</span>
            <span className="text-rose-100/80 ml-2 hidden sm:inline">· {actingAs.role}</span>
          </div>
        </div>
        <button
          onClick={end}
          data-testid="impersonation-end-btn"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/95 text-rose-700 hover:bg-white text-xs font-bold transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          End Session
        </button>
      </div>
    </div>
  );
}
