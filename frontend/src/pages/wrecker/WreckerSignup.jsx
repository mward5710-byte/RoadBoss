// WreckerSignup — public self-service signup for tow companies.
//
// URL: /wrecker/signup (also aliased as /signup for marketing convenience).
//
// Flow:
//   1. Visitor lands here from Home splash “Start Free Trial” CTA
//   2. Picks a plan (or default — Free Trial)
//   3. Submits company name + owner + email + password
//   4. Backend creates tenant + owner user, returns JWT
//   5. We persist the token (auto-login) + push them to /wrecker/setup
//
// No card on signup. 14-day free trial. Stripe billing kicks in at trial end.

import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Truck, ArrowRight, ShieldCheck, CheckCircle2, Loader2,
  Building2, User, Mail, Phone, Lock, Sparkles, ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { WreckerLogixLogo } from '@/components/WreckerLogixLogo';

const STORAGE_TOKEN = 'hp_token';
const STORAGE_USER = 'hp_user';

export default function WreckerSignup() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState({});
  const [selectedPlan, setSelectedPlan] = useState('trial');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    owner_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
  });

  useEffect(() => {
    api.get('/wrecker/plans').then((r) => setPlans(r?.data?.plans || {})).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.company_name.trim()) { toast.error('Company name is required.'); return; }
    if (!form.owner_name.trim()) { toast.error('Your name is required.'); return; }
    if (!form.email.includes('@')) { toast.error('A valid email is required.'); return; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm_password) { toast.error("Passwords don’t match."); return; }

    setSubmitting(true);
    try {
      const r = await api.post('/wrecker/signup', {
        company_name: form.company_name.trim(),
        owner_name: form.owner_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        plan: selectedPlan,
      });
      // Auto-login
      if (r?.data?.access_token) {
        localStorage.setItem(STORAGE_TOKEN, r.data.access_token);
        localStorage.setItem(STORAGE_USER, JSON.stringify(r.data.user));
      }
      toast.success(`Welcome aboard, ${r?.data?.tenant?.name || 'partner'}! Let’s set up your shop.`);
      navigate(r?.data?.next_step || '/wrecker/setup', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Signup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Build pricing rows (sort by price ascending)
  const planRows = Object.entries(plans)
    .filter(([k]) => k !== 'trial')
    .sort((a, b) => (a[1].price_monthly || 0) - (b[1].price_monthly || 0));

  return (
    <div className="min-h-screen bg-[#04060a] text-white flex flex-col" data-testid="wrecker-signup">
      {/* Header bar */}
      <header className="px-4 sm:px-8 py-4 border-b border-white/5 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition" data-testid="signup-back-home">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <WreckerLogixLogo className="h-7 w-auto" />
        <Link to="/login?app=wreckerlogix" className="text-sm text-slate-400 hover:text-white transition" data-testid="signup-existing-login">
          Have an account? <span className="text-amber-300 font-semibold">Sign in</span>
        </Link>
      </header>

      <div className="flex-1 px-4 sm:px-6 lg:px-12 py-8 max-w-6xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 mb-3">
            <Sparkles className="w-3 h-3 mr-1" /> 14-day free trial · No card required
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Start running your tow shop today.
          </h1>
          <p className="text-slate-400 mt-3 text-base">
            Everything you need to dispatch, charge, photograph, and bill —
            for half what the other guys charge.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* PRICING (left on desktop, top on mobile) */}
          <div className="order-2 lg:order-1 space-y-3">
            <h2 className="text-lg font-semibold text-white mb-2">Pick your plan</h2>
            <p className="text-xs text-slate-500 mb-3">
              Start free for 14 days. We won’t charge a card until trial ends — you can change or cancel anytime.
            </p>
            {planRows.length === 0 ? (
              <Card className="bg-[#0a0e14] border-white/5 p-4 text-sm text-slate-500">Loading plans…</Card>
            ) : (
              planRows.map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPlan(key)}
                  className={`w-full text-left rounded-lg border-2 p-4 transition ${
                    selectedPlan === key
                      ? 'border-amber-400 bg-amber-500/[0.06]'
                      : 'border-white/5 bg-[#0a0e14] hover:border-white/10'
                  }`}
                  data-testid={`plan-${key}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">{p.name}</span>
                        {selectedPlan === key && <CheckCircle2 className="w-4 h-4 text-amber-300" />}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Up to {p.call_limit?.toLocaleString()} calls / month · unlimited drivers + trucks
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-amber-300 tabular-nums">${p.price_monthly}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">/ month</div>
                    </div>
                  </div>
                </button>
              ))
            )}
            <div className="pt-3 text-[11px] text-slate-500 leading-relaxed">
              <ShieldCheck className="w-3 h-3 inline mr-1 text-emerald-400" />
              Half the price of the closest competitor at every tier. No setup fees, no per-user fees, cancel anytime.
            </div>
          </div>

          {/* SIGNUP FORM */}
          <Card className="order-1 lg:order-2 bg-[#0a0e14] border-white/10 p-6 lg:p-7" data-testid="signup-form">
            <h2 className="text-lg font-semibold text-white mb-1">Create your account</h2>
            <p className="text-xs text-slate-500 mb-5">
              You’ll be the owner of this WreckerLogix workspace. We’ll walk through the rest in 60 seconds.
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-400">Company name</Label>
                <div className="relative mt-1">
                  <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={form.company_name}
                    onChange={set('company_name')}
                    placeholder="e.g. Ward Towing & Recovery"
                    required
                    autoFocus
                    className="pl-9 bg-[#07090d] border-white/10 text-white"
                    data-testid="signup-company"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-400">Your name</Label>
                <div className="relative mt-1">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={form.owner_name}
                    onChange={set('owner_name')}
                    placeholder="Owner / dispatcher name"
                    required
                    className="pl-9 bg-[#07090d] border-white/10 text-white"
                    data-testid="signup-owner"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-slate-400">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="you@yourshop.com"
                      required
                      className="pl-9 bg-[#07090d] border-white/10 text-white"
                      data-testid="signup-email"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-slate-400">Phone (optional)</Label>
                  <div className="relative mt-1">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="(555) 555-1234"
                      className="pl-9 bg-[#07090d] border-white/10 text-white"
                      data-testid="signup-phone"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-400">Password</Label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder="At least 8 characters"
                    required
                    className="pl-9 bg-[#07090d] border-white/10 text-white"
                    data-testid="signup-password"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-400">Confirm password</Label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    value={form.confirm_password}
                    onChange={set('confirm_password')}
                    placeholder="Type it again"
                    required
                    className="pl-9 bg-[#07090d] border-white/10 text-white"
                    data-testid="signup-confirm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold h-11 text-base"
                data-testid="signup-submit"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating your shop…</>
                  : <>Start Free Trial <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>

              <p className="text-[11px] text-slate-500 leading-relaxed text-center pt-1">
                By creating an account, you agree to our{' '}
                <Link to="/legal/terms" className="text-amber-300 hover:underline">Terms</Link>{' '}
                and{' '}
                <Link to="/legal/privacy" className="text-amber-300 hover:underline">Privacy Policy</Link>.
              </p>
            </form>
          </Card>
        </div>

        {/* Trust strip */}
        <div className="mt-12 grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-center">
          {[
            ['No card to start', 'Test-drive the whole app for 14 days. Card only when trial ends.'],
            ['Half the cost', 'Every tier is half the price of the closest competitor. Locked in.'],
            ['Cancel anytime', 'No contracts, no setup fees, no per-user fees. Ever.'],
          ].map(([title, copy]) => (
            <div key={title} className="p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-white">{title}</div>
              <div className="text-xs text-slate-500 mt-1">{copy}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center py-6 text-xs text-slate-600">
        © {new Date().getFullYear()} WreckerLogix. Built for tow operators.
      </footer>
    </div>
  );
}
