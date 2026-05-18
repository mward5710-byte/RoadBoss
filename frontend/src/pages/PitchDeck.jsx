// PitchDeck — an investor-ready in-browser slide deck for RoadBoss.
// Accessible at /deck (public). Arrow / Space / Click advances; Esc exits fullscreen.
// Designed to feel like a native Keynote/Pitch.com deck — dark, premium, typography-first.
// The source of truth for copy is /app/memory/pitch_deck.md.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ExternalLink,
  Printer,
  Sparkles,
  Radio,
  Shield,
  TrendingUp,
  Target,
  Zap,
  Users,
  Building2,
  DollarSign,
  Wrench,
  MapPin,
  AlertTriangle,
  Bot,
  Phone,
  Mail,
  Rocket,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import BrandedFooter from '@/components/BrandedFooter';
const slides = [
  {
    id: 'cover',
    accent: '#38bdf8',
    render: () => (
      <div className="flex h-full flex-col items-center justify-center text-center gap-6 px-8">
        <Logo size={80} withWordmark={false} />
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.4em] text-sky-400">Investor Deck · Confidential</div>
          <h1 className="text-6xl md:text-7xl font-bold text-white tracking-tight">RoadBoss</h1>
          <p className="text-xl md:text-2xl text-slate-300 font-light">
            The AI-Powered Command Center for Every Truck Driver
          </p>
          <p className="text-base text-sky-300 italic mt-2">
            &ldquo;One app. Every mile. Hands free.&rdquo;
          </p>
        </div>
        <div className="mt-12 text-sm text-slate-400 space-y-1">
          <div className="font-medium text-slate-200">Mike Ward · Founder</div>
          <div>Kokomo, Indiana · April 2026</div>
        </div>
      </div>
    ),
  },
  {
    id: 'problem',
    label: 'The Problem',
    accent: '#f43f5e',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-rose-400">01 · The Problem</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            Truckers juggle 5–8 apps to do one job.
          </h2>
          <p className="text-lg text-slate-300 mt-4 max-w-2xl">
            It costs them time, money, sanity — and far too often, <span className="text-rose-300 font-semibold">their lives.</span>
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5 max-w-4xl">
          {[
            { icon: AlertTriangle, stat: '4,000+', label: 'distracted-driving deaths/yr involving commercial vehicles', tone: 'text-rose-300' },
            { icon: DollarSign, stat: '$800–$1,500', label: 'per truck/year lost to fragmented subscriptions', tone: 'text-amber-300' },
            { icon: MapPin, stat: '45+ min', label: 'per shift lost to app-switching', tone: 'text-sky-300' },
            { icon: Shield, stat: '$16,000', label: 'average ELD-violation fine', tone: 'text-fuchsia-300' },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-widest">
                <k.icon className="h-3.5 w-3.5" /> Stat
              </div>
              <div className={`text-3xl font-bold mt-2 ${k.tone}`}>{k.stat}</div>
              <div className="text-slate-300 text-sm mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'solution',
    label: 'The Solution',
    accent: '#38bdf8',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400">02 · The Solution</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            One platform. Always listening. Always protecting.
          </h2>
          <p className="text-lg text-slate-300 mt-4 max-w-3xl">
            Voice-first, AI-powered, always-on. Every critical trucker workflow — <span className="text-sky-300">in a single hands-free app.</span>
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 max-w-5xl">
          {[
            { icon: Bot, label: 'Co-Pilot AI', desc: 'Context-aware voice brain across every feature' },
            { icon: Shield, label: 'Crash Detection', desc: 'Auto-dispatch dispatch + emergency contact on impact' },
            { icon: MapPin, label: 'Truck-Aware GPS', desc: 'Mapbox routing with weight / height / hazmat' },
            { icon: Wrench, label: 'FMCSA DVIR', desc: '27-item inspections, signature-certified' },
            { icon: Radio, label: 'CB Talker', desc: 'Geo-WebRTC voice rooms (coming)' },
            { icon: Sparkles, label: 'ELD + HOS', desc: 'Hands-free duty changes + FMCSA compliance' },
          ].map((f) => (
            <div key={f.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/5 to-transparent p-5 hover:border-sky-500/40 transition">
              <f.icon className="h-6 w-6 text-sky-300" />
              <div className="mt-3 text-lg font-semibold text-white">{f.label}</div>
              <div className="text-sm text-slate-400 mt-1">{f.desc}</div>
            </div>
          ))}
        </div>
        <div className="max-w-3xl pt-2">
          <div className="inline-block rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-2 text-sm text-sky-200">
            <span className="font-semibold">Differentiator:</span> everything runs simultaneously in the background. Driver uses Spotify, Apple Maps, takes calls — RoadBoss never stops listening, logging, or protecting.
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'product',
    label: 'Live Product',
    accent: '#34d399',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-400">03 · Live Product</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            Already running. Already integrated.
          </h2>
          <p className="text-lg text-slate-300 mt-4 max-w-3xl">
            Not a slide-deck dream. A shipped MVP with real users, real SMS, real crash detection.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4 max-w-5xl">
          {[
            { k: 'Voice AI Co-Pilot', v: 'Claude Sonnet 4.5 · executes actions via voice' },
            { k: 'FMCSA DVIR', v: '49 CFR § 396.11/.13 compliant · signed & logged' },
            { k: 'Crash Detection', v: 'DeviceMotion · auto-SMS + push in 20s' },
            { k: 'Payments', v: 'Stripe: Cards · Apple Pay · Cash App Pay · Link · ACH' },
            { k: 'Messaging', v: 'Twilio outbound + inbound webhook + voice-to-SMS' },
            { k: 'Email', v: 'SendGrid branded receipts + DVIR copies + dunning' },
            { k: 'Push', v: 'VAPID Web Push — free cross-platform alerts' },
            { k: 'GPS', v: 'Mapbox truck-aware routing' },
            { k: 'Auth', v: 'Google OAuth + JWT + role-based access' },
            { k: 'Dashcam', v: 'Unified feed: Samsara · Lytx · Verizon · RoadBoss Native' },
          ].map((row) => (
            <div key={row.k} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">{row.k}</div>
                <div className="text-xs text-slate-400">{row.v}</div>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.5">Live</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'market',
    label: 'Market',
    accent: '#a78bfa',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-violet-400">04 · Market</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            A $15B+ TAM. 3.5 million drivers waiting.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4 max-w-5xl">
          {[
            { k: 'Owner-Operators', v: '~350,000', desc: 'Free → Pro $29.99/mo', icon: Users },
            { k: 'Small Fleets (5–50)', v: '~150,000', desc: 'Fleet $19.99/truck/mo', icon: Building2 },
            { k: 'Enterprise (50+)', v: '~25,000', desc: 'Custom / white-label', icon: Target },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-transparent p-6">
              <s.icon className="h-6 w-6 text-violet-300" />
              <div className="text-xs uppercase tracking-widest text-violet-300 mt-3">{s.k}</div>
              <div className="text-3xl font-bold text-white mt-1">{s.v}</div>
              <div className="text-sm text-slate-400 mt-1">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="pt-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Why now</div>
          <ul className="grid md:grid-cols-3 gap-3 mt-3 max-w-5xl">
            {[
              'FMCSA ELD mandate fully enforced',
              'Distracted-driving regulation mounting',
              'Fleet insurance premiums rising 15%/yr',
            ].map((w) => (
              <li key={w} className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200">
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: 'edge',
    label: 'Competitive Edge',
    accent: '#fbbf24',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400">05 · Competitive Edge</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            They charge $35/truck. We start at free.
          </h2>
          <p className="text-lg text-slate-300 mt-4 max-w-3xl">
            Motive, Samsara, KeepTruckin — expensive, hardware-heavy, and still no hands-free voice, no integrated roadside, no crash-auto-alert to your spouse.
          </p>
        </div>
        <div className="overflow-x-auto max-w-5xl">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400 border-b border-white/10">
                <th className="py-3 pr-4">Capability</th>
                <th className="py-3 px-4">RoadBoss</th>
                <th className="py-3 px-4">Motive</th>
                <th className="py-3 px-4">Samsara</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Voice-first Co-Pilot',           true,  false, false],
                ['Free tier',                      true,  false, false],
                ['Integrated roadside',            true,  false, false],
                ['Auto crash-to-family SMS',       true,  false, false],
                ['FMCSA ELD + DVIR',               true,  true,  true],
                ['Truck-aware GPS',                true,  true,  true],
                ['Dashcam unification',            true,  false, false],
                ['Monthly price',                  '$29.99 solo · $19.99/truck', '$33+/truck', '$35+/truck'],
              ].map((row, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-slate-200">{row[0]}</td>
                  {row.slice(1).map((cell, j) => (
                    <td key={j} className="py-3 px-4">
                      {typeof cell === 'boolean' ? (
                        cell ? (
                          <span className="text-emerald-300">✓</span>
                        ) : (
                          <span className="text-rose-400">✗</span>
                        )
                      ) : (
                        <span className="text-slate-200">{cell}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    accent: '#38bdf8',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400">06 · Pricing</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            Priced to convert. Built to compound.
          </h2>
        </div>
        <div className="grid md:grid-cols-4 gap-3 max-w-5xl">
          {[
            { name: 'Free',       price: '$0',     sub: 'per driver',   desc: 'TTS messaging · basic GPS · voice commands', accent: 'border-white/10' },
            { name: 'Pro',        price: '$29.99', sub: 'per month',    desc: 'Solo operator · everything unlocked',       accent: 'border-sky-500/40' },
            { name: 'Fleet',      price: '$19.99', sub: 'per truck/mo', desc: 'Fleet dashboard + analytics',               accent: 'border-sky-500/40' },
            { name: 'Enterprise', price: 'Custom', sub: 'contact sales', desc: 'White-label · API · custom integrations',   accent: 'border-amber-500/40' },
          ].map((t, i) => (
            <div key={t.name} className={`rounded-2xl border ${t.accent} bg-gradient-to-br from-white/[0.04] to-transparent p-5`}>
              <div className="text-sm uppercase tracking-widest text-slate-400">{t.name}</div>
              {i === 1 && <div className="text-[10px] uppercase tracking-widest text-sky-300 mt-1">Most popular</div>}
              <div className="text-3xl font-bold text-white mt-2">{t.price}</div>
              <div className="text-xs text-slate-400">{t.sub}</div>
              <div className="text-sm text-slate-300 mt-3">{t.desc}</div>
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-3 max-w-5xl pt-4">
          {[
            { k: 'CAC', v: '$25–40' },
            { k: 'LTV', v: '$720+' },
            { k: 'LTV:CAC', v: '18:1+' },
          ].map((u) => (
            <div key={u.k} className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="text-xs uppercase tracking-widest text-emerald-300">{u.k}</div>
              <div className="text-2xl font-bold text-white mt-1">{u.v}</div>
            </div>
          ))}
        </div>
        <div className="max-w-5xl pt-2 text-sm text-slate-400">
          <span className="text-slate-200 font-semibold">Payment methods already wired:</span>{' '}
          Visa · Mastercard · Amex · Discover · Apple Pay · Google Pay · Cash App Pay · Stripe Link · ACH
        </div>
      </div>
    ),
  },
  {
    id: 'revenue',
    label: 'Revenue Streams',
    accent: '#10b981',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-400">07 · Additional Revenue</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            Five stacked revenue streams beyond subscriptions.
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4 max-w-5xl">
          {[
            { k: 'Roadside referral fees',   v: '$15–25/dispatch',  d: 'Vetted network — we earn on every tow, tire, jumpstart' },
            { k: 'Dashcam hardware affiliate', v: 'Share of sale',  d: 'We unify vendor feeds, they ship the hardware' },
            { k: 'Fuel discount partnerships', v: 'Per-gallon fee',  d: 'Pilot, Loves, TA — activated via Co-Pilot' },
            { k: 'Insurance premium discounts', v: 'Rev-share',       d: 'Lower rates for drivers with Crash Guardian on' },
            { k: 'Anonymized data analytics',  v: 'B2B data buyers', d: 'Route heatmaps to logistics buyers — HIPAA-grade anonymization' },
          ].map((r) => (
            <div key={r.k} className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-300" />
                <div className="text-lg font-semibold text-white">{r.k}</div>
              </div>
              <div className="text-sm text-emerald-200 mt-1 font-medium">{r.v}</div>
              <div className="text-xs text-slate-400 mt-2">{r.d}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'financials',
    label: 'Financials',
    accent: '#38bdf8',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400">08 · Financial Projections</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            Path to $27M ARR in 3 years.
          </h2>
          <p className="text-sm text-slate-400 mt-3 max-w-2xl">
            Conservative: 20% free→paid conversion · 24-mo retention · 12 trucks/fleet · zero enterprise revenue modeled.
          </p>
        </div>
        <div className="overflow-x-auto max-w-5xl">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400 border-b border-white/10">
                <th className="py-3 pr-4">Metric</th>
                <th className="py-3 px-4 text-right">Year 1</th>
                <th className="py-3 px-4 text-right">Year 2</th>
                <th className="py-3 px-4 text-right text-sky-300">Year 3</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Registered Users',  '10,000', '50,000',  '200,000'],
                ['Pro Subscribers',   '2,000',  '15,000',  '75,000'],
                ['Fleet Accounts',    '50',     '300',     '1,500'],
                ['MRR',               '$60K',   '$450K',   '$2.25M'],
                ['ARR',               '$720K',  '$5.4M',   '$27M'],
                ['Gross Margin',      '75%',    '80%',     '85%'],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-slate-200 font-medium">{row[0]}</td>
                  <td className="py-3 px-4 text-right text-slate-300">{row[1]}</td>
                  <td className="py-3 px-4 text-right text-slate-300">{row[2]}</td>
                  <td className="py-3 px-4 text-right text-sky-300 font-semibold">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: 'ask',
    label: 'The Ask',
    accent: '#f59e0b',
    render: () => (
      <div className="h-full flex flex-col justify-center px-12 md:px-24 space-y-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400">09 · The Ask</div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 tracking-tight">
            Raising a $500K Seed.
          </h2>
          <p className="text-lg text-slate-300 mt-4 max-w-3xl">
            MVP is live. Integrations are wired. <span className="text-amber-300">What we need now is runway to hit the App Store, certify ELD, and reach 2,000 paid subscribers.</span>
          </p>
        </div>
        <div className="grid md:grid-cols-5 gap-3 max-w-5xl">
          {[
            { k: 'Engineering',         v: '$275K', pct: '55%', icon: Wrench },
            { k: 'Product & Design',    v: '$75K',  pct: '15%', icon: Sparkles },
            { k: 'Legal & IP',          v: '$50K',  pct: '10%', icon: Shield },
            { k: 'Marketing & Launch',  v: '$60K',  pct: '12%', icon: Target },
            { k: 'Operations',          v: '$40K',  pct: '8%',  icon: TrendingUp },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
              <c.icon className="h-5 w-5 text-amber-300" />
              <div className="text-xs uppercase tracking-widest text-slate-400 mt-2">{c.k}</div>
              <div className="text-2xl font-bold text-white mt-1">{c.v}</div>
              <div className="text-xs text-amber-300 mt-1">{c.pct}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 max-w-4xl">
          <div className="text-xs uppercase tracking-widest text-amber-300">What $500K buys</div>
          <div className="text-lg text-white mt-2">
            MVP on App Store · FMCSA ELD certification started · 10,000 registered drivers · 2,000 paid Pro
            subscribers · <span className="font-bold">$60K MRR · clear path to Series A.</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'mission',
    label: 'Mission',
    accent: '#e11d48',
    render: () => (
      <div className="h-full flex flex-col items-center justify-center text-center gap-8 px-12">
        <Rocket className="h-12 w-12 text-rose-300" />
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.4em] text-rose-400">10 · Mission</div>
          <blockquote className="text-3xl md:text-4xl font-semibold text-white leading-snug mt-6 tracking-tight">
            &ldquo;Every year, 4,000 people die because truck drivers have to look at their phones.
            <span className="text-rose-300"> RoadBoss makes that unnecessary.</span>
            <br />
            That&apos;s not just a business — that&apos;s a mission.&rdquo;
          </blockquote>
        </div>
        <div className="mt-8 text-base text-slate-300">— Mike Ward</div>
      </div>
    ),
  },
  {
    id: 'contact',
    label: 'Contact',
    accent: '#38bdf8',
    render: () => (
      <div className="flex h-full flex-col items-center justify-center text-center gap-6 px-8">
        <Logo size={56} withWordmark={false} />
        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Let&apos;s build this.</h2>
        <div className="text-lg text-slate-300 max-w-2xl">
          Demo the live app, get a copy of the financial model, or just ask hard questions — we&apos;re in.
        </div>
        <div className="mt-8 grid md:grid-cols-3 gap-4 max-w-3xl w-full">
          <a
            href="mailto:mward5710@gmail.com"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06] transition flex flex-col items-center gap-2"
          >
            <Mail className="h-5 w-5 text-sky-300" />
            <div className="text-xs uppercase tracking-widest text-slate-400">Email</div>
            <div className="text-sm text-white">mward5710@gmail.com</div>
          </a>
          <a
            href="tel:+17654808889"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06] transition flex flex-col items-center gap-2"
          >
            <Phone className="h-5 w-5 text-emerald-300" />
            <div className="text-xs uppercase tracking-widest text-slate-400">Phone</div>
            <div className="text-sm text-white">Michael Ward</div>
            <div className="text-sm text-white">+1 (765) 480-8889</div>
          </a>
          <Link
            to="/login"
            className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-5 hover:bg-sky-500/20 transition flex flex-col items-center gap-2"
          >
            <ExternalLink className="h-5 w-5 text-sky-300" />
            <div className="text-xs uppercase tracking-widest text-sky-300">Live demo</div>
            <div className="text-sm text-white">Sign in to the app</div>
          </Link>
        </div>
        <BrandedFooter className="mt-10" />
      </div>
    ),
  },
];

export default function PitchDeck() {
  const [idx, setIdx] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const total = slides.length;
  const slide = slides[idx];

  const next = useCallback(() => setIdx((i) => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const go = useCallback((n) => setIdx(Math.max(0, Math.min(total - 1, n))), [total]);

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        go(0);
      } else if (e.key === 'End') {
        go(total - 1);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFs();
      } else if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, prev, go, total]);

  useEffect(() => {
    const onFsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFs = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } catch {}
  };

  const progress = useMemo(() => ((idx + 1) / total) * 100, [idx, total]);

  return (
    <div
      className="fixed inset-0 bg-[#07090d] text-white overflow-hidden"
      data-testid="pitch-deck"
    >
      {/* Ambient background glow that shifts per-slide accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 transition-colors duration-700"
        style={{
          background: `radial-gradient(60% 50% at 30% 20%, ${slide.accent}22, transparent 70%),
                       radial-gradient(60% 50% at 80% 80%, ${slide.accent}18, transparent 70%)`,
        }}
      />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#07090d]/70 backdrop-blur">
        <Link to="/" className="flex items-center gap-2 text-slate-300 hover:text-white transition">
          <Logo size={22} withWordmark={false} />
          <div className="text-xs uppercase tracking-widest text-slate-400">Pitch Deck · v1</div>
        </Link>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 hidden md:block">
          ← / → to navigate · F for fullscreen · Esc to exit
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            data-testid="deck-print-btn"
            aria-label="Print deck"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={toggleFs}
            data-testid="deck-fullscreen-btn"
            aria-label="Toggle fullscreen"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Slide stage — overflow-y-auto so tall slides scroll within the
          fixed-height shell (Mike's "non-scrollable pages" bug fix). */}
      <div className="absolute inset-0 pt-14 pb-16 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            data-testid={`slide-${slide.id}`}
            initial={{ opacity: 0, y: 20, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.995 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative min-h-full w-full"
          >
            {slide.render()}
          </motion.div>
        </AnimatePresence>

        {/* Click zones for clean click-to-advance */}
        <button
          aria-label="Previous slide"
          onClick={prev}
          data-testid="deck-prev-zone"
          className="absolute left-0 top-0 bottom-0 w-1/4 cursor-w-resize focus:outline-none"
        />
        <button
          aria-label="Next slide"
          onClick={next}
          data-testid="deck-next-zone"
          className="absolute right-0 top-0 bottom-0 w-2/4 cursor-e-resize focus:outline-none"
        />
      </div>

      {/* Bottom chrome */}
      <div className="absolute bottom-0 inset-x-0 z-20 border-t border-white/5 bg-[#07090d]/80 backdrop-blur">
        <div
          aria-hidden
          className="h-0.5 transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: slide.accent }}
        />
        <div className="flex items-center justify-between px-5 py-3">
          <button
            onClick={prev}
            disabled={idx === 0}
            data-testid="deck-prev-btn"
            className="flex items-center gap-1 text-sm text-slate-300 hover:text-white disabled:opacity-30 transition"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <div className="flex items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => go(i)}
                data-testid={`deck-dot-${i}`}
                aria-label={`Go to slide ${i + 1} ${s.label || s.id}`}
                className={`transition-all h-1.5 rounded-full ${
                  i === idx ? 'w-8 bg-white' : 'w-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
          <button
            onClick={next}
            disabled={idx === total - 1}
            data-testid="deck-next-btn"
            className="flex items-center gap-1 text-sm text-slate-300 hover:text-white disabled:opacity-30 transition"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-2 text-center text-[10px] uppercase tracking-widest text-slate-500">
          {idx + 1} / {total} · {slide.label || 'Cover'}
        </div>
      </div>

      {/* Print stylesheet — puts every slide on its own page for PDF export */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 0; }
          body { background: #07090d !important; }
          [data-testid="pitch-deck"] { position: static !important; height: auto !important; }
          [data-testid="pitch-deck"] > div:first-child { display: none !important; }
          [data-testid^="slide-"] { page-break-after: always; height: 100vh; }
        }
      `}</style>
    </div>
  );
}
