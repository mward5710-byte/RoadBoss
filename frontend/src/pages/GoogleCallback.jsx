import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setSession } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const userB64 = params.get('user');
  const next = params.get('next') || '/app';
  const error = params.get('google_error') || params.get('error');

  useEffect(() => {
    if (error || !token || !userB64) return;
    try {
      // Decode user from urlsafe base64 JSON
      const padded = userB64.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(window.atob(padded)));
      const user = JSON.parse(json);
      setSession(token, user);
      // Drivers go to /driver, everyone else to /app
      const dest = user.role === 'driver' ? '/driver' : (next.startsWith('/') ? next : '/app');
      setTimeout(() => navigate(dest, { replace: true }), 600);
    } catch (e) {
      console.error('Google callback decode failed', e);
      setTimeout(() => navigate('/login?google_error=decode_failed', { replace: true }), 800);
    }
  }, [error, token, userB64, next, navigate]);

  return (
    <div className="min-h-screen hp-grid-bg flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Logo size={36} /></div>
        <div className="hp-panel-bordered rounded-2xl p-8 hp-glow text-center">
          {error ? (
            <>
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <div className="text-white font-semibold">Sign-in failed</div>
              <div className="text-xs text-slate-500 mt-1">{error}</div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <div className="text-white font-semibold">Signed in with Google</div>
              <div className="text-xs text-slate-500 mt-1">Routing you to your dashboard...</div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
