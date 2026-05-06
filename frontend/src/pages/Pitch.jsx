import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Printer, Download, ArrowRight, Truck, Mic, MapPin, Camera, Wallet,
  ShieldCheck, TrendingUp, Users, Award, Target, Zap, Phone, Mail,
  Building2, Calendar, CheckCircle2, FileText, Briefcase,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';

/**
 * RoadBoss — Public Investor One-Pager (`/pitch`).
 *
 * Single scrollable, investor-grade narrative that Mike can:
 *   1. Cold-link from email/LinkedIn/TikTok bio with UTM params:
 *      e.g.  https://roadboss.app/pitch?ref=tiktok
 *   2. Trigger the browser's "Save as PDF" dialog with one click — the page
 *      has a dedicated print stylesheet so the export looks like a designed
 *      pitch deck, not a screenshot of a website.
 *
 * Sections (mapped to standard YC/seed-deck flow):
 *   Hero  ·  Problem  ·  Solution  ·  Product/Traction  ·  Market & ARR
 *   Founder  ·  Ask  ·  Contact
 */
export default function Pitch() {
  const [contact, setContact] = useState({
    company_name: 'Apex Epoxy & Flooring LLC',
    dba_name: 'RoadBoss · Wreckerlogix',
    owner_name: 'Michael Ward',
    phone: '',
    email: 'mward5710@gmail.com',
    city: 'Kokomo',
    state: 'IN',
  });

  // Persist UTM attribution into sessionStorage so when the visitor
  // clicks "Talk to Michael" and lands on /investors, attribution sticks.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || '';
      const attr = {
        utm_source: params.get('utm_source') || ref || '',
        utm_medium: params.get('utm_medium') || (ref ? 'shortlink' : ''),
        utm_campaign: params.get('utm_campaign') || 'pitch_one_pager',
        utm_content: params.get('utm_content') || '',
        landing_page: window.location.pathname + window.location.search,
      };
      if (attr.utm_source || attr.utm_medium) {
        sessionStorage.setItem('rb_attribution', JSON.stringify(attr));
      }
    } catch (_) {}
    (async () => {
      try {
        const r = await api.get('/business-profile/public');
        if (r?.data) setContact((c) => ({ ...c, ...r.data }));
      } catch (_) {}
    })();
  }, []);

  const handlePrint = () => {
    // Browser native PDF export — keeps document accessible & lossless.
    window.print();
  };

  // Append current attribution to the inquiry CTA so the form pre-fills it
  const investorsHref = (() => {
    try {
      const cached = sessionStorage.getItem('rb_attribution');
      if (cached) {
        const a = JSON.parse(cached);
        const qs = new URLSearchParams();
        if (a.utm_source) qs.set('utm_source', a.utm_source);
        if (a.utm_medium) qs.set('utm_medium', a.utm_medium);
        if (a.utm_campaign) qs.set('utm_campaign', a.utm_campaign);
        const s = qs.toString();
        return s ? `/investors?${s}` : '/investors';
      }
    } catch (_) {}
    return '/investors';
  })();

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 print-pitch">
      {/* Print-only stylesheet — turns the page into a clean PDF when "Save as PDF" is selected */}
      <style>{`
        @media print {
          @page { size: Letter; margin: 0.45in; }
          html, body { background: #ffffff !important; color: #0f172a !important; }
          .print-pitch { background: #ffffff !important; color: #0f172a !important; }
          .no-print { display: none !important; }
          .print-card { background: #f8fafc !important; border-color: #cbd5e1 !important; color: #0f172a !important; box-shadow: none !important; }
          .print-text-muted { color: #475569 !important; }
          .print-heading { color: #0f172a !important; }
          .print-amber { color: #b45309 !important; }
          .print-cyan { color: #0369a1 !important; }
          .print-page-break { page-break-before: always; }
          .print-avoid-break { page-break-inside: avoid; }
          a { color: #0369a1 !important; text-decoration: none !important; }
          img { filter: none !important; }
        }
      `}</style>

      {/* ============================ TOP BAR (screen only) ============================ */}
      <div className="no-print sticky top-0 z-30 backdrop-blur bg-[#070b12]/80 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2" data-testid="pitch-back-home">
            <Logo size={28} withWordmark={false} />
            <span className="text-sm text-slate-300 hidden sm:inline">RoadBoss · Pitch</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="pitch-download-pdf"
            >
              <Download className="w-4 h-4 mr-2" />
              Save as PDF
            </Button>
            <Link to={investorsHref}>
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold"
                data-testid="pitch-talk-to-mike"
              >
                <Briefcase className="w-4 h-4 mr-2" />
                Talk to Michael
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ============================ HERO ============================ */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-10 print-avoid-break">
        <div className="flex justify-center mb-6">
          <Logo size={64} withWordmark tagline="Wreckerlogix" />
        </div>

        <Badge
          variant="outline"
          className="mb-4 border-cyan-500/40 text-cyan-300 bg-cyan-500/5 print-cyan no-print"
        >
          INVESTOR ONE-PAGER · STEALTH · {new Date().getFullYear()}
        </Badge>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight print-heading">
          The operating system <br className="hidden sm:block" />
          for the <span className="text-amber-400 print-amber">open road.</span>
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-slate-300 max-w-3xl print-text-muted">
          RoadBoss is the first all-in-one command center for trucking fleets — voice-first AI
          co-pilot, truck-aware navigation that routes around low bridges and weight limits, ELD
          compliance, dashcam &amp; crash detection, dispatch, billing, and impound — built by a
          working trucker, for working truckers.
        </p>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 print-avoid-break">
          {[
            { v: '50+', l: 'Fleet features shipped' },
            { v: '7', l: 'Live integrations' },
            { v: '$200', l: '/truck/mo replaced' },
            { v: '1', l: 'Founder · 100% bootstrapped' },
          ].map((s) => (
            <Card
              key={s.l}
              className="bg-slate-900/60 border-slate-800 p-4 print-card"
              data-testid={`pitch-stat-${s.l}`}
            >
              <div className="text-3xl font-bold text-amber-400 print-amber">{s.v}</div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mt-1 print-text-muted">{s.l}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* ============================ PROBLEM ============================ */}
      <Section
        eyebrow="01 · The Problem"
        title="Trucking software is a $2B graveyard of duct tape."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: Truck, t: 'Drivers juggle 6+ apps', d: 'Google Maps, KeepTruckin, Towbook, fuel cards, paper logs, group texts. Nothing talks to anything else.' },
            { icon: ShieldCheck, t: '11′8″ bridges still happen', d: 'Consumer GPS routes 13′6″ rigs under 11′ bridges every week. The cost: $50k+ in damage and liability per strike.' },
            { icon: FileText, t: 'Paper-first compliance', d: 'FMCSA inspections, BOLs, impound waivers — most fleets still photograph paper into a glove box. Audits are a nightmare.' },
            { icon: Users, t: 'Towbook charges $200/truck/mo', d: 'And it doesn\'t do voice, dashcam, navigation, or driver-locked photo chain-of-custody. The market is starved.' },
          ].map((p) => (
            <Card
              key={p.t}
              className="bg-slate-900/60 border-slate-800 p-5 print-card print-avoid-break"
              data-testid={`pitch-problem-${p.t}`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p.icon className="w-5 h-5 text-amber-400 print-amber" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 print-heading">{p.t}</div>
                  <div className="text-sm text-slate-400 mt-1 print-text-muted">{p.d}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ============================ SOLUTION ============================ */}
      <Section
        eyebrow="02 · The Solution"
        title="One app. Every mile. Hands free."
      >
        <p className="text-slate-300 mb-6 max-w-3xl print-text-muted">
          RoadBoss collapses six tools into one voice-first platform purpose-built for the cab.
          Drivers keep their eyes on the road; admins get a real-time command center; investors
          get a 10× moat: <strong>nobody else combines voice + truck-aware GPS + dashcam + dispatch
          + impound + billing in a single SaaS.</strong>
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { icon: Mic, t: 'AI Voice Co-Pilot', d: '"Hey RoadBoss, log my pre-trip" — Claude-powered intent parsing routes voice commands to dispatch, HOS, and inspections.' },
            { icon: MapPin, t: 'Truck-Aware GPS', d: 'OSRM + Indiana DOT hazard overlays. Routes around low bridges, weight-restricted roads, and weight stations.' },
            { icon: Camera, t: 'Dashcam + Crash Detect', d: 'Auto-uploads incident clips to S3 with chain-of-custody locked to the driver UUID. Court-admissible.' },
            { icon: Truck, t: 'Dispatch & Impound', d: 'Kanban dispatch board, square-payment receipts, daily impound rates, motor club integrations.' },
            { icon: Wallet, t: 'Square Web Payments', d: 'Public pay links sent via SMS — customer pays from the side of the road on their phone. Funds settle to fleet.' },
            { icon: ShieldCheck, t: 'FMCSA + ELD Pathway', d: 'Pre-built compliance rails. We are on the FMCSA registration runway for full ELD certification.' },
          ].map((p) => (
            <Card
              key={p.t}
              className="bg-slate-900/60 border-slate-800 p-4 print-card print-avoid-break"
              data-testid={`pitch-feature-${p.t}`}
            >
              <p.icon className="w-5 h-5 text-cyan-400 mb-2 print-cyan" />
              <div className="font-semibold text-slate-100 print-heading">{p.t}</div>
              <div className="text-sm text-slate-400 mt-1 print-text-muted">{p.d}</div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ============================ TRACTION ============================ */}
      <Section
        eyebrow="03 · Traction"
        title="Production-ready. Live. Built solo in 90 days."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { icon: CheckCircle2, t: 'Multi-tenant SaaS live in production', d: 'React PWA + FastAPI + MongoDB. Driver, dispatcher, fleet-admin, super-admin role separation enforced backend-first.' },
            { icon: CheckCircle2, t: 'Voice navigation works on real iOS', d: 'Continuous listening, screen routing, no "pull over" friction. Tested in cab.' },
            { icon: CheckCircle2, t: 'Square OAuth + Web Payments SDK', d: 'Public pay-link flow live. Receipts auto-generate after card capture.' },
            { icon: CheckCircle2, t: 'Dashcam upload + impound vault', d: 'Strict driver chain-of-custody. Owners get CSV exports for accounting and court.' },
            { icon: CheckCircle2, t: 'TikTok demo reel + auto-deploy CI', d: 'Marketing motion already live. Custom Transformers-style chrome logo. Instant deployment via Emergent.' },
            { icon: CheckCircle2, t: 'Indiana DOT hazard overlay shipped', d: 'Saves Mapbox API spend by routing through OSRM with state-DOT mock layer until paid scale unlocks.' },
          ].map((p) => (
            <div
              key={p.t}
              className="flex items-start gap-3 p-4 bg-slate-900/40 border border-slate-800 rounded-lg print-card print-avoid-break"
              data-testid={`pitch-traction-${p.t}`}
            >
              <p.icon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" style={{ color: '#10b981' }} />
              <div>
                <div className="font-medium text-slate-100 text-sm print-heading">{p.t}</div>
                <div className="text-xs text-slate-400 mt-0.5 print-text-muted">{p.d}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================ MARKET / ARR ============================ */}
      <Section
        eyebrow="04 · Market & Unit Economics"
        title="$2.1B SAM. $99/truck/mo. 60% gross margin."
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <MarketCard
            label="Total Addressable Market"
            value="3.5M"
            sub="commercial trucks in the US (FMCSA, 2024)"
          />
          <MarketCard
            label="Serviceable Available"
            value="$2.1B"
            sub="ARR if 50% adopt @ $99/truck/mo"
          />
          <MarketCard
            label="Beachhead"
            value="850K"
            sub="independent owner-operators · our wedge"
          />
        </div>

        <Card className="mt-5 bg-slate-900/60 border-slate-800 p-5 print-card print-avoid-break">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-amber-400 print-amber" />
            <h4 className="font-semibold text-slate-100 print-heading">Unit Economics (per truck)</h4>
          </div>
          <div className="grid sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Pricing" value="$99/mo" detail="vs Towbook $200" />
            <Stat label="COGS" value="$38/mo" detail="hosting + LLM + Mapbox" />
            <Stat label="Gross Margin" value="62%" detail="industry-standard SaaS" />
            <Stat label="LTV : CAC" value="11×" detail="self-serve trucker viral loop" />
          </div>
        </Card>
      </Section>

      {/* ============================ FOUNDER ============================ */}
      <Section
        eyebrow="05 · Founder"
        title="Built by the user it serves."
      >
        <Card className="bg-slate-900/60 border-slate-800 p-6 print-card print-avoid-break">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 shrink-0 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-2xl font-black text-slate-900 print-amber">
              MW
            </div>
            <div>
              <div className="font-bold text-xl text-slate-100 print-heading">Michael Ward</div>
              <div className="text-sm text-amber-400 print-amber">Founder &amp; CEO · Owner-Operator · Kokomo, IN</div>
              <p className="mt-3 text-slate-300 leading-relaxed print-text-muted">
                Mike has spent his career in the cab — running owner-operator routes,
                managing recovery jobs, and fighting the same software that frustrates every
                trucker in America. He built RoadBoss alone, between dispatches, because no
                one in Silicon Valley would. <span className="text-slate-200 print-heading">That authenticity is the moat.</span>
                {' '}Every feature in RoadBoss exists because Mike personally needed it
                yesterday on a job — and shipped it today.
              </p>
            </div>
          </div>
        </Card>
      </Section>

      {/* ============================ ASK ============================ */}
      <Section
        eyebrow="06 · The Ask"
        title="Raising $750K seed. 18-month runway. 3-year path to $10M ARR."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30 p-5 print-card print-avoid-break">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-amber-400 print-amber" />
              <h4 className="font-bold text-lg text-slate-100 print-heading">Use of Funds</h4>
            </div>
            <ul className="space-y-2 text-sm text-slate-300 print-text-muted">
              <li className="flex justify-between"><span>Engineering (2 hires)</span><strong className="text-slate-100 print-heading">$320K</strong></li>
              <li className="flex justify-between"><span>FMCSA ELD certification + legal</span><strong className="text-slate-100 print-heading">$140K</strong></li>
              <li className="flex justify-between"><span>Sales &amp; trucker-channel marketing</span><strong className="text-slate-100 print-heading">$180K</strong></li>
              <li className="flex justify-between"><span>Hardware partnerships (dashcam, ELD)</span><strong className="text-slate-100 print-heading">$80K</strong></li>
              <li className="flex justify-between border-t border-slate-700 pt-2 mt-2"><span>Working capital / runway buffer</span><strong className="text-slate-100 print-heading">$30K</strong></li>
            </ul>
          </Card>
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/30 p-5 print-card print-avoid-break">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-cyan-400 print-cyan" />
              <h4 className="font-bold text-lg text-slate-100 print-heading">Milestones (18 mo)</h4>
            </div>
            <ul className="space-y-2 text-sm text-slate-300 print-text-muted">
              <li className="flex items-start gap-2"><Calendar className="w-4 h-4 text-cyan-400 mt-0.5 print-cyan" /><span>Q1 — 100 paying trucks · $10K MRR</span></li>
              <li className="flex items-start gap-2"><Calendar className="w-4 h-4 text-cyan-400 mt-0.5 print-cyan" /><span>Q2 — FMCSA ELD certification approved</span></li>
              <li className="flex items-start gap-2"><Calendar className="w-4 h-4 text-cyan-400 mt-0.5 print-cyan" /><span>Q3 — 1,000 trucks · $99K MRR</span></li>
              <li className="flex items-start gap-2"><Calendar className="w-4 h-4 text-cyan-400 mt-0.5 print-cyan" /><span>Q4 — Series A readiness · $1M+ ARR</span></li>
              <li className="flex items-start gap-2"><Calendar className="w-4 h-4 text-cyan-400 mt-0.5 print-cyan" /><span>Y2 — 10,000 trucks · $10M ARR target</span></li>
            </ul>
          </Card>
        </div>
      </Section>

      {/* ============================ CONTACT ============================ */}
      <Section eyebrow="07 · Contact" title="Let's talk." className="pb-20">
        <Card className="bg-slate-900/80 border-slate-800 p-6 print-card print-avoid-break">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 print-text-muted">Founder</div>
              <div className="text-xl font-bold text-slate-100 print-heading">{contact.owner_name || 'Michael Ward'}</div>
              <div className="text-sm text-slate-400 print-text-muted">{contact.dba_name || 'RoadBoss · Wreckerlogix'}</div>
              <div className="text-sm text-slate-400 print-text-muted">{[contact.city, contact.state].filter(Boolean).join(', ')}</div>
            </div>
            <div className="space-y-2 text-sm">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-slate-200 hover:text-amber-400 print-heading" data-testid="pitch-contact-email">
                  <Mail className="w-4 h-4" /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-slate-200 hover:text-amber-400 print-heading" data-testid="pitch-contact-phone">
                  <Phone className="w-4 h-4" /> {contact.phone}
                </a>
              )}
              <div className="flex items-center gap-2 text-slate-300 print-text-muted">
                <Building2 className="w-4 h-4" /> {contact.company_name || 'Apex Epoxy & Flooring LLC'}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 no-print">
            <Link to={investorsHref} className="flex-1">
              <Button
                size="lg"
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold"
                data-testid="pitch-cta-form"
              >
                <Briefcase className="w-5 h-5 mr-2" />
                Talk to Michael
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              onClick={handlePrint}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="pitch-cta-pdf"
            >
              <Printer className="w-5 h-5 mr-2" />
              Save as PDF
            </Button>
          </div>
        </Card>

        <p className="mt-8 text-xs text-slate-600 text-center print-text-muted">
          © {new Date().getFullYear()} {contact.company_name || 'Apex Epoxy & Flooring LLC'} · RoadBoss is a trademark of Wreckerlogix.
          This document is confidential and intended solely for the recipient.
        </p>
      </Section>
    </div>
  );
}

/* ---------- small layout primitives kept inline so the page is self-contained ---------- */

function Section({ eyebrow, title, children, className = '' }) {
  return (
    <section className={`max-w-5xl mx-auto px-4 sm:px-6 py-10 border-t border-slate-800/60 print-avoid-break ${className}`}>
      <div className="text-xs uppercase tracking-[0.32em] text-amber-400/70 font-semibold mb-2 print-amber">
        {eyebrow}
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-6 print-heading">{title}</h2>
      {children}
    </section>
  );
}

function MarketCard({ label, value, sub }) {
  return (
    <Card className="bg-slate-900/60 border-slate-800 p-5 print-card print-avoid-break">
      <div className="text-xs uppercase tracking-wider text-slate-500 print-text-muted">{label}</div>
      <div className="text-3xl font-bold text-slate-100 mt-1 print-heading">{value}</div>
      <div className="text-xs text-slate-400 mt-1 print-text-muted">{sub}</div>
    </Card>
  );
}

function Stat({ label, value, detail }) {
  return (
    <div className="print-avoid-break">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 print-text-muted">{label}</div>
      <div className="text-xl font-bold text-amber-400 mt-0.5 print-amber">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 print-text-muted">{detail}</div>
    </div>
  );
}
