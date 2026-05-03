import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Lock, CheckCircle2 } from 'lucide-react';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (params.get('token')) setToken(params.get('token')); }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    if (!token) { toast.error('Reset token is missing.'); return; }
    if (pw.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { toast.error('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      await api.post('/auth/reset', { token, new_password: pw });
      setDone(true);
      toast.success('Password reset.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Reset failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen hp-grid-bg flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Link to="/"><Logo size={36} /></Link></div>
        <div className="hp-panel-bordered rounded-2xl p-8 hp-glow">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-2">Set new password</div>
          <h1 className="text-2xl font-bold text-white">Choose a strong password</h1>
          {done ? (
            <div className="mt-6 text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <div className="text-white">Password reset. Redirecting...</div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              {!params.get('token') && (
                <Input data-testid="reset-token" placeholder="Reset token" value={token} onChange={(e) => setToken(e.target.value)} className="bg-[#0a0e14] border-white/10" required />
              )}
              <Input data-testid="reset-pw" type="password" placeholder="New password (min 8 chars)" value={pw} onChange={(e) => setPw(e.target.value)} className="bg-[#0a0e14] border-white/10" required />
              <Input data-testid="reset-pw2" type="password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="bg-[#0a0e14] border-white/10" required />
              <Button data-testid="reset-submit" type="submit" disabled={submitting} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Lock className="w-4 h-4 mr-1" /> {submitting ? 'Resetting...' : 'Reset password'}</Button>
            </form>
          )}
        </div>
        <div className="mt-6 text-center"><Link to="/login" className="text-xs text-slate-500 hover:text-white">← Back to sign in</Link></div>
      </motion.div>
    </div>
  );
}
