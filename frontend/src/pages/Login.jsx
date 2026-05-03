import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth, setSession } from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowRight, Truck, Zap } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await auth.login(email, password);
      setSession(r.access_token, r.user);
      toast.success(`Welcome, ${r.user.name.split(' ')[0]}.`);
      if (r.user.role === 'driver') navigate('/driver');
      else navigate('/app');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Login failed');
    } finally { setSubmitting(false); }
  };

  const quickFill = (em) => { setEmail(em); setPassword('HighwayPilot2026!'); };

  return (
    <div className="min-h-screen hp-grid-bg flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Link to="/"><Logo size={36} /></Link></div>
        <div className="hp-panel-bordered rounded-2xl p-8 hp-glow">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-2">Sign in</div>
          <h1 className="text-2xl font-bold text-white">Welcome back, captain.</h1>
          <p className="text-sm text-slate-400 mt-1">Drivers route to the cab. Admins to the command center.</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <Input data-testid="login-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#0a0e14] border-white/10" required />
            <Input data-testid="login-password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-[#0a0e14] border-white/10" required />
            <Button data-testid="login-submit" type="submit" disabled={submitting} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
              {submitting ? 'Signing in...' : <>Sign in <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
            <div className="text-right"><Link to="/forgot-password" className="text-xs text-sky-400 hover:text-sky-300">Forgot password?</Link></div>
          </form>
          <div className="hp-divider my-6" />
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">Demo accounts</div>
          <div className="space-y-2">
            <button data-testid="login-demo-admin" type="button" onClick={() => quickFill('fleet_admin@highwaypilot.io')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-sky-500/30 hover:bg-sky-500/5 transition text-left">
              <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center"><Zap className="w-4 h-4 text-sky-300" /></div>
              <div className="flex-1">
                <div className="text-sm text-white">Fleet Admin</div>
                <div className="text-[11px] text-slate-500">fleet_admin@highwaypilot.io</div>
              </div>
              <div className="text-[11px] text-slate-500">Click to fill</div>
            </button>
            <button data-testid="login-demo-driver" type="button" onClick={() => quickFill('driver@highwaypilot.io')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-sky-500/30 hover:bg-sky-500/5 transition text-left">
              <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center"><Truck className="w-4 h-4 text-sky-300" /></div>
              <div className="flex-1">
                <div className="text-sm text-white">Driver (PWA)</div>
                <div className="text-[11px] text-slate-500">driver@highwaypilot.io</div>
              </div>
              <div className="text-[11px] text-slate-500">Click to fill</div>
            </button>
          </div>
          <div className="mt-5 text-center text-[11px] text-slate-500">
            Demo password — <span className="text-slate-300">HighwayPilot2026!</span>
          </div>
        </div>
        <div className="mt-6 text-center"><Link to="/" className="text-xs text-slate-500 hover:text-white">← Back to home</Link></div>
      </motion.div>
    </div>
  );
}
