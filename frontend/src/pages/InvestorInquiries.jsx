import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Briefcase, Mail, Phone, ArrowRight, CheckCircle2, Send, Loader2, MapPin,
  Sparkles, TrendingUp, Shield, Truck, Calendar, ExternalLink, Building2, Award,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const RANGES = [
  '< $25k', '$25k – $100k', '$100k – $500k', '$500k – $2M', '$2M+', 'Strategic / Partner',
];
const ROLES = [
  'Angel Investor', 'Venture Capital', 'Strategic / Industry', 'Family Office',
  'Private Equity', 'Bank / Lender', 'Mentor / Advisor', 'Other',
];

const PROOF_POINTS = [
  { icon: Truck,       value: '50+',  label: 'Fleet & dispatch features shipped' },
  { icon: Shield,      value: '7',    label: 'Active third-party integrations' },
  { icon: TrendingUp,  value: '$200', label: 'Replaces /truck/mo of Towbook + others' },
  { icon: Award,       value: '100%', label: 'Built solo by a working trucker' },
];

export default function InvestorInquiries() {
  const [contact, setContact] = useState({ company_name: 'Apex Epoxy & Flooring LLC', dba_name: 'RoadBoss · Wreckerlogix',
    owner_name: 'Michael Ward', phone: '', email: '', city: 'Kokomo', state: 'IN' });
  const [form, setForm] = useState({
    name: '', email: '', phone: '', organization: '',
    role: 'Angel Investor', investment_range: '$100k – $500k', message: '',
    referral_source: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Capture marketing attribution on page load. Supports both standard UTM
  // params (utm_source, utm_medium, utm_campaign, utm_content) AND the
  // short ?ref= shortcut so Mike can blast simple links like
  // roadboss.app/investors?ref=tiktok and still get attribution.
  const [attribution, setAttribution] = useState({
    utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', landing_page: '',
  });
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || '';
      const next = {
        utm_source: params.get('utm_source') || ref || '',
        utm_medium: params.get('utm_medium') || (ref ? 'shortlink' : ''),
        utm_campaign: params.get('utm_campaign') || '',
        utm_content: params.get('utm_content') || '',
        landing_page: window.location.pathname + window.location.search,
      };
      setAttribution(next);
      // Persist for cross-page conversions (e.g. user reads /pitch then /investors)
      try { sessionStorage.setItem('rb_attribution', JSON.stringify(next)); } catch (_) {}
      // Also pre-fill the human-visible referral_source so the form shows it
      if (next.utm_source) {
        setForm((p) => ({ ...p, referral_source: p.referral_source || next.utm_source }));
      }
    } catch (_) {
      // SSR or non-browser env — skip
    }
  }, []);

  // Pull live business profile (public endpoint — no auth needed) so contact info stays in sync with Settings page
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/business-profile/public');
        if (r?.data) setContact((c) => ({ ...c, ...r.data }));
      } catch (e) { /* anonymous visitor — use defaults */ }
    })();
  }, []);

  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error('Please fill in your name, email, and a brief message.');
      return;
    }
    setSubmitting(true);
    try {
      // Pull the most recent attribution (this page or any earlier page in the session).
      let attr = attribution;
      try {
        const cached = sessionStorage.getItem('rb_attribution');
        if (cached) attr = { ...JSON.parse(cached), ...attribution };
      } catch (_) {}
      const r = await api.post('/investor-inquiry', { ...form, ...attr });
      toast.success(r.data?.message || 'Inquiry received.', { duration: 8000 });
      setSubmitted(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not submit inquiry. Please try email or phone instead.');
    } finally {
      setSubmitting(false);
    }
  };

  const phoneDisplay = contact.phone || '(765) — call form available';
  const emailDisplay = contact.email || 'mward5710@gmail.com';
  const ownerName = contact.owner_name || 'Michael Ward';

  return (
    <div className="min-h-screen bg-[#07090d] text-slate-200 hp-grid-bg">
      {/* Top nav */}
      <header className="sticky top-0 z-40 backdrop-blur bg-[#07090d]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between py-3.5">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-slate-400 hover:text-white hidden sm:inline">Back to site</Link>
            <Link to="/deck">
              <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10">
                View Pitch Deck <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-16 pb-12 text-center">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs uppercase tracking-widest mb-6">
            <Briefcase className="w-3.5 h-3.5" /> For Investors &amp; Strategic Partners
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
            Back the operating system <br />
            <span className="hp-chrome-text">truckers actually run.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
            RoadBoss is a real product, in production, used today. Built by a working trucker who lived the problem.
            We're raising to scale infrastructure, certify ELD compliance, and lock down enterprise fleet contracts.
          </p>
        </motion.div>

        {/* Proof points */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
          {PROOF_POINTS.map((p) => (
            <Card key={p.label} className="bg-[#0d1218] border-white/5 p-4 text-center" data-testid={`proof-${p.label.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="w-9 h-9 mx-auto rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-2">
                <p.icon className="w-4 h-4 text-amber-300" />
              </div>
              <div className="text-2xl font-bold text-white tabular-nums">{p.value}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 leading-tight">{p.label}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Two-column: form + direct contact */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <div className="grid lg:grid-cols-5 gap-5">
          {/* LEFT — Inquiry form (3 cols) */}
          <Card className="lg:col-span-3 bg-[#0d1218] border-white/5 p-6 md:p-8" data-testid="investor-form-card">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Send {ownerName.split(' ')[0]} a direct inquiry</h2>
              <p className="text-sm text-slate-400 mt-1.5">
                He reads every one personally. Expect a reply within 24 hours — usually same day.
              </p>
            </div>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
                data-testid="investor-form-success"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-300" />
                </div>
                <h3 className="text-xl font-semibold text-white">Inquiry received.</h3>
                <p className="text-slate-400 mt-2 max-w-md mx-auto">
                  Thank you for reaching out. {ownerName.split(' ')[0]} will be in touch personally within 24 hours.
                  In the meantime, feel free to <Link to="/deck" className="text-amber-300 hover:text-amber-200 underline">review the pitch deck</Link>.
                </p>
                <Button onClick={() => { setSubmitted(false); setForm({ ...form, name: '', email: '', phone: '', organization: '', message: '' }); }}
                        variant="outline" size="sm" className="mt-6 border-white/10 text-slate-300" data-testid="investor-form-submit-another">
                  Submit another
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Your name *" testid="iv-name">
                    <Input value={form.name} onChange={(e) => f('name', e.target.value)}
                           data-testid="iv-input-name" required placeholder="Jane Doe" className="bg-[#0a0e14] border-white/10 text-white" />
                  </Field>
                  <Field label="Organization" testid="iv-org">
                    <Input value={form.organization} onChange={(e) => f('organization', e.target.value)}
                           data-testid="iv-input-org" placeholder="Acme Ventures" className="bg-[#0a0e14] border-white/10 text-white" />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Email *" testid="iv-email">
                    <Input type="email" value={form.email} onChange={(e) => f('email', e.target.value)}
                           data-testid="iv-input-email" required placeholder="jane@firm.com" className="bg-[#0a0e14] border-white/10 text-white" />
                  </Field>
                  <Field label="Phone" testid="iv-phone">
                    <Input value={form.phone} onChange={(e) => f('phone', e.target.value)}
                           data-testid="iv-input-phone" placeholder="(555) 123-4567" className="bg-[#0a0e14] border-white/10 text-white" />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Your role" testid="iv-role">
                    <Select value={form.role} onValueChange={(v) => f('role', v)}>
                      <SelectTrigger data-testid="iv-input-role" className="bg-[#0a0e14] border-white/10 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Investment range" testid="iv-range">
                    <Select value={form.investment_range} onValueChange={(v) => f('investment_range', v)}>
                      <SelectTrigger data-testid="iv-input-range" className="bg-[#0a0e14] border-white/10 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RANGES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Tell Michael what caught your eye *" testid="iv-message">
                  <Textarea value={form.message} onChange={(e) => f('message', e.target.value)}
                            data-testid="iv-input-message" required rows={5}
                            placeholder="What would you like to discuss? Any specific questions about the product, traction, or roadmap?"
                            className="bg-[#0a0e14] border-white/10 text-white" />
                </Field>
                <Field label="How did you hear about RoadBoss?" testid="iv-referral">
                  <Input value={form.referral_source} onChange={(e) => f('referral_source', e.target.value)}
                         data-testid="iv-input-referral" placeholder="TikTok, intro from someone, found the demo, etc."
                         className="bg-[#0a0e14] border-white/10 text-white" />
                </Field>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/5">
                  <p className="text-[11px] text-slate-500 max-w-md">
                    Your information goes directly to Michael. We don't share, sell, or add you to any list.
                  </p>
                  <Button type="submit" disabled={submitting} data-testid="iv-submit"
                          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send to {ownerName.split(' ')[0]}</>}
                  </Button>
                </div>
              </form>
            )}
          </Card>

          {/* RIGHT — Direct contact (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-[#0d1218] border-white/5 overflow-hidden" data-testid="investor-direct-card">
              <div className="bg-gradient-to-br from-amber-500/15 to-amber-500/0 p-6 border-b border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-amber-400/80 font-semibold">Direct line</div>
                    <div className="text-lg font-bold text-white">Skip the form. Call him.</div>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <ContactRow icon={Briefcase} label="Founder" value={ownerName} testid="contact-founder" />
                <ContactRow icon={Building2} label="Company" value={contact.company_name} sub={contact.dba_name && `Operating as ${contact.dba_name}`} testid="contact-company" />
                <ContactRow icon={MapPin} label="Based In" value={`${contact.city || 'Kokomo'}, ${contact.state || 'IN'}`} testid="contact-location" />
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/[^0-9+]/g, '')}`} className="block group" data-testid="contact-phone-link">
                    <ContactRow icon={Phone} label="Phone" value={contact.phone} accent="amber" />
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}?subject=RoadBoss%20-%20Investment%20Inquiry`} className="block group" data-testid="contact-email-link">
                    <ContactRow icon={Mail} label="Email" value={contact.email} accent="amber" />
                  </a>
                )}
                <div className="pt-2 border-t border-white/5">
                  <a href={`mailto:${contact.email || 'mward5710@gmail.com'}?subject=RoadBoss%20-%20Schedule%20a%20Call&body=Hi%20Michael%2C%0A%0AI'd%20like%20to%20schedule%20a%20call%20to%20discuss%20RoadBoss.%0A%0AAvailability%3A%0A%0AThanks!`}>
                    <Button className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold" data-testid="contact-schedule-call">
                      <Calendar className="w-4 h-4 mr-2" /> Schedule a Call
                    </Button>
                  </a>
                </div>
              </div>
            </Card>

            <Card className="bg-[#0d1218] border-white/5 p-5" data-testid="investor-quick-facts">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Quick Facts
              </div>
              <ul className="space-y-2.5 text-sm text-slate-300">
                <Fact>Live in production at <span className="text-amber-300">wrecker-logix.com</span></Fact>
                <Fact>Multi-tenant SaaS — Square Payments, Twilio SMS, Mapbox, Anthropic Claude AI</Fact>
                <Fact>Replaces $200/mo Towbook (towing dispatch) at a fraction of the cost</Fact>
                <Fact>Built solo by a working trucker — every feature solves a real road problem</Fact>
                <Fact>Truck-aware GPS with low-bridge / weight-restriction routing already shipped</Fact>
                <Fact>Hands-free voice AI Co-Pilot — drivers run dispatch from behind the wheel</Fact>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#07090d]/80">
        <div className="max-w-6xl mx-auto px-5 py-8 text-center text-xs text-slate-500">
          <div>{contact.company_name || 'Apex Epoxy & Flooring LLC'} · Operating as RoadBoss · Built by {ownerName} · {contact.city || 'Kokomo'}, {contact.state || 'IN'}</div>
          <div className="mt-1">© {new Date().getFullYear()} All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children, testid }) {
  return (
    <div data-testid={testid}>
      <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">{label}</Label>
      {children}
    </div>
  );
}

function ContactRow({ icon: Icon, label, value, sub, testid, accent }) {
  const accentClass = accent === 'amber' ? 'group-hover:text-amber-200' : '';
  return (
    <div className="flex items-start gap-3" data-testid={testid}>
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        <div className={`text-sm text-white truncate transition ${accentClass}`}>{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function Fact({ children }) {
  return (
    <li className="flex gap-2 leading-relaxed">
      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
