import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowRight, Mail } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await api.post('/auth/forgot', { email });
      setSent(true);
      // In dev/preview, the API returns a dev_token to enable testing without email
      if (r.data.dev_token) setDevToken(r.data.dev_token);
      toast.success(r.data.message);
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Could not send reset.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen hp-grid-bg flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Link to="/"><Logo size={36} /></Link></div>
        <div className="hp-panel-bordered rounded-2xl p-8 hp-glow">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-2">Reset password</div>
          <h1 className="text-2xl font-bold text-white">Forgot your password?</h1>
          <p className="text-sm text-slate-400 mt-1">Enter your email and we’ll send a reset link.</p>
          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/30 p-4 text-sm text-sky-100">
                <div className="flex items-center gap-2 mb-1"><Mail className="w-4 h-4" /> Check your inbox</div>
                <div className="text-xs text-slate-300">If the email exists, a reset link was sent.</div>
              </div>
              {devToken && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-100">
                  <div className="font-semibold mb-1">Dev mode (no email service yet)</div>
                  <div className="text-amber-200/90 mb-2">Use this link to reset:</div>
                  <Link to={`/reset-password?token=${devToken}`} className="text-sky-300 underline break-all">{`/reset-password?token=${devToken}`}</Link>
                </div>
              )}
              <Button onClick={() => navigate('/login')} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">Back to sign in</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              <Input data-testid="forgot-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#0a0e14] border-white/10" required />
              <Button data-testid="forgot-submit" type="submit" disabled={submitting} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
                {submitting ? 'Sending...' : <>Send reset link <ArrowRight className="w-4 h-4 ml-1" /></>}
              </Button>
            </form>
          )}
        </div>
        <div className="mt-6 text-center"><Link to="/login" className="text-xs text-slate-500 hover:text-white">← Back to sign in</Link></div>
      </motion.div>
    </div>
  );
}
