import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { WreckerLogixLogo } from '@/components/WreckerLogixLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth, setSession, getUser } from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Truck, Zap, ChevronDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Login — simplified per Mike's request:
 *  - Email + password is the PRIMARY path. No more 3-way confusion.
 *  - Google sign-in is collapsed under "More sign-in options" so it doesn't
 *    dominate the screen (still available for those who want it).
 *  - Demo accounts hidden by default — only show with ?demo=1 in the URL
 *    so when Mike texts Kenny the link, Kenny sees ONLY the form and his
 *    own credentials, not a wall of demo buttons.
 *  - Tokens last 10 years (backend) — true "set it and forget it." Drivers
 *    sign in once on their phone and stay signed in until they tap Sign Out
 *    or wipe the device. Mirrors how Towbook works in the cab. QuickBooks
 *    integration is unaffected (uses its own OAuth tokens).
 */
export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Which product is the user trying to sign into? (Set when they pick a
  // card on the HOME splash, e.g. /login?app=wreckerlogix.) The logo + the
  // copy below adapts so the Login feels like it belongs to the product
  // they just chose — strict brand-wall per Mike's V2 spec.
  const app = (searchParams.get('app') || '').toLowerCase();
  const isWrecker = app === 'wreckerlogix' || app === 'wrecker';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Show demo accounts only when explicitly requested via ?demo=1
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const showDemo = params.get('demo') === '1';

  // Surface Google OAuth errors from query string. We INTENTIONALLY do NOT
  // auto-redirect already-signed-in users from /login anymore. Mike's V2
  // architecture (see /app/memory/v2_architecture_spec.md §2) makes the Home
  // splash the single entry point — every cold-start must show the
  // WreckerLogix · RoadBoss · Investors picker first. The previous auto-
  // redirect was bypassing that splash for anyone whose iPhone PWA icon was
  // installed back when start_url=/login (because the home-screen icon kept
  // launching /login and skipping straight into the cab).
  React.useEffect(() => {
    const ge = params.get('google_error');
    if (ge) toast.error(`Google sign-in: ${ge}`);
    // If somebody hits /login while already signed in WITHOUT a product hint,
    // bounce them to the Home splash so they pick their workspace cleanly.
    // (?app=wreckerlogix or ?app=roadboss skips the bounce — those are the
    // intentional "switch product" flows from the splash itself.)
    const me = getUser();
    if (me && !ge && !app && params.get('force') !== '1') {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const googleSignIn = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google?next=/app`;
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await auth.login(email, password);
      setSession(r.access_token, r.user);
      toast.success(`Welcome, ${r.user.name.split(' ')[0]}.`);
      // Route each role to its landing page
      if (r.user.role === 'driver') navigate('/driver');
      else if (r.user.role === 'wrecker_operator') navigate('/wrecker/me');
      else if (['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin'].includes(r.user.role)) navigate('/wrecker');
      else if (r.user.role === 'super_admin') navigate('/super');
      else navigate('/app');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Login failed');
    } finally { setSubmitting(false); }
  };

  const quickFill = (em) => { setEmail(em); setPassword('HighwayPilot2026!'); };

  return (
    <div className="min-h-screen hp-grid-bg flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        {/* Brand lockup — swaps to WreckerLogix when they came in via the
            wrecker product card on the splash. Bigger size so it reads as
            "you're entering THIS app", not "generic sign in screen". */}
        <div className="flex justify-center mb-8">
          <Link to="/" data-testid="login-brand-link">
            {isWrecker
              ? <WreckerLogixLogo size={56} withWordmark />
              : <Logo size={44} />}
          </Link>
        </div>

        <div className="hp-panel-bordered rounded-2xl p-6 sm:p-8 hp-glow">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-2">Sign in</div>
          <h1 className="text-2xl font-bold text-white">Welcome back, captain.</h1>
          <p className="text-sm text-slate-400 mt-1">Enter the email and password Mike sent you.</p>

          {/* PRIMARY: email + password. The form Kenny actually uses. */}
          <form onSubmit={submit} className="mt-6 space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Email</label>
              <Input
                data-testid="login-email"
                type="email"
                placeholder="you@yourcompany.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#0a0e14] border-white/10 mt-1 h-11 text-base"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Password</label>
              <Input
                data-testid="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#0a0e14] border-white/10 mt-1 h-11 text-base"
                required
                autoComplete="current-password"
              />
            </div>
            <Button
              data-testid="login-submit"
              type="submit"
              disabled={submitting}
              className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold h-12 text-base"
            >
              {submitting ? 'Signing in…' : <>Sign in <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Stays signed in until you sign out
              </span>
              <Link to="/forgot-password" className="text-sky-400 hover:text-sky-300">Forgot password?</Link>
            </div>
          </form>

          {/* SECONDARY: collapsible "More sign-in options" — Google tucked here. */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-widest text-slate-500 hover:text-slate-300 transition py-2"
              data-testid="login-more-options-toggle"
            >
              {showMore ? 'Hide' : 'More sign-in options'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showMore && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <button
                    data-testid="google-signin-btn"
                    type="button"
                    onClick={googleSignIn}
                    className="mt-2 w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-md bg-white text-slate-900 font-medium hover:bg-slate-100 transition"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continue with Google
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* DEMO ACCOUNTS — hidden unless ?demo=1 in URL. Keeps Kenny's
              login screen clean when he opens his invite link. */}
          {showDemo && (
            <>
              <div className="hp-divider my-6" />
              <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">Demo accounts</div>
              <div className="space-y-2">
                <button data-testid="login-demo-admin" type="button" onClick={() => quickFill('fleet_admin@highwaypilot.io')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 transition text-left">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Zap className="w-4 h-4 text-amber-300" /></div>
                  <div className="flex-1">
                    <div className="text-sm text-white">Fleet Admin</div>
                    <div className="text-[11px] text-slate-500">RoadBoss demo · auto-fills credentials</div>
                  </div>
                  <div className="text-[11px] text-slate-500">Click to fill</div>
                </button>
                <button data-testid="login-demo-driver" type="button" onClick={() => quickFill('driver@highwaypilot.io')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 transition text-left">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Truck className="w-4 h-4 text-amber-300" /></div>
                  <div className="flex-1">
                    <div className="text-sm text-white">Driver (PWA)</div>
                    <div className="text-[11px] text-slate-500">RoadBoss demo · in-cab experience</div>
                  </div>
                  <div className="text-[11px] text-slate-500">Click to fill</div>
                </button>
              </div>
              <div className="mt-4 text-center text-[11px] text-slate-500">
                Demo creds auto-fill on click.
              </div>
            </>
          )}
        </div>
        <div className="mt-6 text-center"><Link to="/" className="text-xs text-slate-500 hover:text-white">← Back to home</Link></div>
      </motion.div>
    </div>
  );
}
