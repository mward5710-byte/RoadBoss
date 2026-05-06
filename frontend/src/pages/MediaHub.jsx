import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download, Copy, ChevronLeft, Film, Image as ImageIcon, QrCode,
  Megaphone, Link2, Briefcase, ExternalLink, Hammer, Wrench,
  Share2, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/Logo';
import { WreckerLogixLogo } from '@/components/WreckerLogixLogo';
import { toast } from 'sonner';

/**
 * Media Hub — Mike's one-stop marketing command center.
 *
 * Everything he needs to blast RoadBoss on TikTok, Instagram, LinkedIn,
 * truck-stop flyers, and cold investor emails — without hunting through
 * URLs or Photoshop. Each asset has a one-tap download, each link has a
 * one-tap copy, each caption is ready to paste.
 *
 * Sections:
 *   1. Brand — chrome logos, WreckerLogix mark, favicons (with downloads)
 *   2. Videos — TikTok cuts + intro reel (with mobile QR codes)
 *   3. Links — every share URL with UTM tags already baked in
 *   4. Captions — ready-to-paste social posts
 *   5. QR Codes — instant printable QR for every target URL
 */

const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://wrecker-logix.com';

const BRAND_ASSETS = [
  {
    key: 'roadboss-wordmark',
    label: 'Chrome ROADBOSS · full wordmark',
    desc: 'For flyers, email signatures, headers.',
    url: '/brand/roadboss-wordmark.png',
    preview: 'contain',
    bg: '#0a0e16',
  },
  {
    key: 'roadboss-icon',
    label: 'ROADBOSS square · 512×512',
    desc: 'TikTok / Instagram / Facebook profile photo.',
    url: '/brand/roadboss-icon.png',
    preview: 'cover',
    bg: '#0a0e16',
  },
  {
    key: 'roadboss-192',
    label: 'ROADBOSS · 192×192',
    desc: 'App icon, small thumbnails.',
    url: '/brand/icon-192.png',
    preview: 'cover',
    bg: '#0a0e16',
  },
  {
    key: 'roadboss-64',
    label: 'ROADBOSS · 64×64',
    desc: 'Email footers, small badges.',
    url: '/brand/icon-64.png',
    preview: 'cover',
    bg: '#0a0e16',
  },
  {
    key: 'wreckerlogix',
    label: 'WreckerLogix mark',
    desc: 'Dedicated branding for the towing module.',
    url: '/assets/wreckerlogix-logo.jpeg',
    preview: 'cover',
    bg: '#07090d',
  },
  {
    key: 'favicon',
    label: 'Favicon (.ico)',
    desc: 'Browser tab icon · multi-resolution.',
    url: '/favicon.ico',
    preview: 'cover',
    bg: '#0a0e16',
  },
];

const VIDEOS = [
  {
    key: 'cut-bridge',
    title: "Cut 1 · The 11'8\" Bridge",
    hook: 'POV: 13\u20196 rig vs a low bridge. Closes on "$50,000 SAVED".',
    shareUrl: '/cuts?ref=tiktok&utm_source=tiktok&utm_medium=video&utm_campaign=bridge_cut',
    tint: 'amber',
  },
  {
    key: 'cut-voice',
    title: 'Cut 2 · "Hey Pilot, log my pre-trip"',
    hook: 'Hands-free DVIR done in 3 seconds. Eyes never leave the road.',
    shareUrl: '/cuts?ref=tiktok&utm_source=tiktok&utm_medium=video&utm_campaign=voice_cut',
    tint: 'cyan',
  },
  {
    key: 'cut-crash',
    title: 'Cut 3 · Crash Detected',
    hook: 'Impact \u2192 evidence locked \u2192 dispatch notified. Under 10 seconds.',
    shareUrl: '/cuts?ref=tiktok&utm_source=tiktok&utm_medium=video&utm_campaign=crash_cut',
    tint: 'red',
  },
  {
    key: 'reel',
    title: 'Full Demo Reel',
    hook: 'Longer-form RoadBoss walkthrough. Good for Instagram Reels & YouTube Shorts.',
    shareUrl: '/reel?ref=tiktok',
    tint: 'emerald',
  },
  {
    key: 'intro',
    title: 'Chrome Intro · 10 sec stinger',
    hook: 'Stitch onto the front of any TikTok/Reel for brand polish.',
    shareUrl: '/intro',
    tint: 'purple',
  },
];

const SHARE_LINKS = [
  { key: 'home-tiktok',     label: 'Home \u2192 TikTok bio',           path: '/?ref=tiktok&utm_source=tiktok&utm_medium=bio' },
  { key: 'cuts-tiktok',     label: 'Cuts studio \u2192 TikTok bio',     path: '/cuts?ref=tiktok&utm_source=tiktok&utm_medium=bio' },
  { key: 'home-instagram',  label: 'Home \u2192 Instagram bio',         path: '/?ref=instagram&utm_source=instagram&utm_medium=bio' },
  { key: 'pitch-linkedin',  label: 'Pitch \u2192 LinkedIn post',        path: '/pitch?ref=linkedin&utm_source=linkedin&utm_medium=post&utm_campaign=investor_outreach' },
  { key: 'pitch-email',     label: 'Pitch \u2192 Cold email',           path: '/pitch?ref=email&utm_source=email&utm_medium=cold_outreach&utm_campaign=investor_outreach' },
  { key: 'investors-x',     label: 'Investor form \u2192 X/Twitter bio', path: '/investors?ref=twitter&utm_source=twitter&utm_medium=bio' },
  { key: 'home-fb',         label: 'Home \u2192 Facebook trucker groups', path: '/?ref=fb&utm_source=facebook&utm_medium=groups' },
  { key: 'home-qr',         label: 'Home \u2192 Truck-stop QR flyer',   path: '/?ref=qr&utm_source=qr&utm_medium=flyer' },
];

const CAPTIONS = [
  {
    key: 'bridge',
    title: 'Bridge Cut caption',
    text: `POV: You're driving a 13'6" rig. Google Maps just routed you under an 11'8" bridge. 💀

RoadBoss is the first GPS built for truckers — it actually knows your rig height, weight, and hazmat class.

Free during beta 👉 wrecker-logix.com

#trucking #owneroperator #trucktok #cdllife`,
  },
  {
    key: 'voice',
    title: 'Voice Cut caption',
    text: `Imagine logging your pre-trip without taking your hands off the wheel.

"Hey Pilot, log my pre-trip" — done in 3 seconds. No more paper, no more tablet juggling, no more fighting ELD menus on a bumpy road.

Built by a trucker, for truckers 👉 wrecker-logix.com

#trucking #trucktok #eld #dispatch`,
  },
  {
    key: 'crash',
    title: 'Crash Cut caption',
    text: `The second an impact hits, RoadBoss:
🔒 Locks your dashcam footage to YOUR driver ID
📡 Notifies dispatch automatically
💾 Pins evidence with chain-of-custody

Because when seconds matter, you want it handled. Even when you can't.

wrecker-logix.com  ·  Free during beta

#trucking #dashcam #trucksafety #owneroperator`,
  },
  {
    key: 'founder',
    title: 'Founder story (LinkedIn)',
    text: `Spent my career in the cab. Owner-operator routes, recovery jobs, and fighting the same software every trucker in America hates.

So I built RoadBoss — voice-first AI co-pilot, truck-aware GPS that routes around 11'8" bridges and weight limits, dashcam with crash detection, and dispatch + impound all in one app.

Built solo. No VC. Shipping features between tow jobs.

Now raising a $750K seed to finish what I started.

If you invest in trucking-tech, let's talk 👉 wrecker-logix.com/pitch

#trucking #saas #founderstory #seedraise`,
  },
  {
    key: 'investor',
    title: 'Investor cold-email opener',
    text: `Hi [Name],

Mike Ward here — owner-operator out of Kokomo, IN. I built RoadBoss solo over the last 90 days: a voice-first AI co-pilot for trucking fleets that replaces 6 apps (Towbook, KeepTruckin, Google Maps, fuel cards, paper logs, group texts) with one SaaS at less than half the price.

It's live, multi-tenant, and shipping real features every week. $750K seed, 18-month runway, targeting $10M ARR year 2.

Full pitch + unit economics: https://wrecker-logix.com/pitch?ref=email

Worth a 15-min call?

— Mike`,
  },
];

function qrURL(target, size = 400) {
  const full = target.startsWith('http') ? target : `${SITE}${target}`;
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(full)}&size=${size}x${size}&margin=10&bgcolor=0a0e16&color=FFFFFF`;
}

export default function MediaHub() {
  const [copied, setCopied] = useState('');
  const [tab, setTab] = useState('brand');

  const copy = (value, label = 'Copied') => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    toast.success(label);
    setTimeout(() => setCopied(''), 1200);
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200" data-testid="media-hub-page">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-[#0a0e14] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3 flex items-center gap-3">
          <Link to="/super" className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm" data-testid="media-back">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="h-5 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-amber-400/80 font-bold leading-none">Media Hub</div>
              <div className="text-sm font-semibold text-white leading-tight">All your marketing in one place</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-5 py-5 pb-12">
        {/* Hero summary */}
        <Card className="bg-gradient-to-br from-amber-500/10 to-slate-900/40 border-amber-500/20 p-4 sm:p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Hammer className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Built to steal eyeballs.</div>
              <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                Every logo, every TikTok cut, every share link is pre-staged below. Tap to download, tap to copy,
                tap to generate a QR for a flyer. When you post, remember: short hook in the first 1.5 seconds,
                loud caption, trucker-specific hashtags.
              </div>
            </div>
          </div>
        </Card>

        {/* TAB BAR */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mb-5 sticky top-[56px] z-10 bg-[#070b12]/95 backdrop-blur py-1.5 -mx-1 px-1">
          {[
            { id: 'brand',    label: 'Brand',    icon: ImageIcon, tint: 'border-amber-500/40 bg-amber-500/15 text-amber-200' },
            { id: 'videos',   label: 'Videos',   icon: Film,      tint: 'border-cyan-500/40  bg-cyan-500/15  text-cyan-200'  },
            { id: 'links',    label: 'Links',    icon: Link2,     tint: 'border-sky-500/40   bg-sky-500/15   text-sky-200'   },
            { id: 'captions', label: 'Captions', icon: Megaphone, tint: 'border-purple-500/40 bg-purple-500/15 text-purple-200' },
            { id: 'qr',       label: 'QR',       icon: QrCode,    tint: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`media-tab-${t.id}`}
                className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-xl border-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all min-h-[56px] ${
                  active ? t.tint + ' shadow-lg scale-[1.02]' : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span className="leading-none">{t.label}</span>
              </button>
            );
          })}
        </div>

        {tab === 'brand'    && <BrandPanel copy={copy} copied={copied} />}
        {tab === 'videos'   && <VideosPanel copy={copy} copied={copied} />}
        {tab === 'links'    && <LinksPanel copy={copy} copied={copied} />}
        {tab === 'captions' && <CaptionsPanel copy={copy} copied={copied} />}
        {tab === 'qr'       && <QRPanel copy={copy} copied={copied} />}
      </main>
    </div>
  );
}

/* ================================ BRAND ================================ */
function BrandPanel({ copy, copied }) {
  return (
    <div>
      <h2 className="text-base font-bold text-white mb-1">Logos &amp; icons</h2>
      <p className="text-xs text-slate-400 mb-4">Tap <strong className="text-slate-200">Download</strong> to save to your phone / desktop. Tap <strong className="text-slate-200">Copy URL</strong> to paste in a design tool.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {BRAND_ASSETS.map((a) => {
          const absUrl = `${SITE}${a.url}`;
          return (
            <Card key={a.key} className="bg-slate-900/60 border-slate-800 p-3 sm:p-4" data-testid={`brand-asset-${a.key}`}>
              <div
                className="w-full aspect-video rounded-lg mb-3 overflow-hidden border border-slate-800 flex items-center justify-center"
                style={{ backgroundColor: a.bg }}
              >
                <img
                  src={a.url}
                  alt={a.label}
                  draggable
                  className="max-w-full max-h-full"
                  style={{ objectFit: a.preview }}
                />
              </div>
              <div className="text-sm font-semibold text-white">{a.label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 mb-2.5 leading-snug">{a.desc}</div>
              <div className="flex gap-2">
                <a
                  href={a.url}
                  download
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
                  data-testid={`brand-download-${a.key}`}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(absUrl, 'URL copied')}
                  className="border-slate-700 text-slate-200 text-xs"
                  data-testid={`brand-copy-${a.key}`}
                >
                  {copied === absUrl ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  Copy URL
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================ VIDEOS ================================ */
function VideosPanel({ copy, copied }) {
  return (
    <div>
      <h2 className="text-base font-bold text-white mb-1">Videos &amp; cuts</h2>
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        How to capture: open the link on your iPhone, tap <strong className="text-slate-200">Screen Record</strong>
        {' '}from Control Center, let it loop once (<em>~17 sec</em>), stop, trim, post.
      </p>
      <div className="grid gap-3">
        {VIDEOS.map((v) => {
          const abs = `${SITE}${v.shareUrl}`;
          return (
            <Card key={v.key} className="bg-slate-900/60 border-slate-800 p-3 sm:p-4" data-testid={`video-${v.key}`}>
              <div className="grid sm:grid-cols-[120px_1fr] gap-3">
                <a
                  href={v.shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex sm:flex-col items-center justify-center gap-2 p-3 rounded-lg bg-[#0a0e14] border border-slate-800 hover:border-cyan-500/40 transition shrink-0"
                >
                  <img
                    src={qrURL(v.shareUrl, 160)}
                    alt="QR"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded"
                    loading="lazy"
                  />
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">Scan / open</span>
                </a>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">{v.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{v.hook}</div>
                    </div>
                    <Badge variant="outline" className="border-slate-700 text-slate-400 text-[9px] uppercase">{v.key}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={v.shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs font-bold hover:bg-cyan-500/25 transition">
                      <ExternalLink className="w-3 h-3" /> Open on this device
                    </a>
                    <Button size="sm" variant="outline" onClick={() => copy(abs, 'Share URL copied')} className="border-slate-700 text-slate-200 text-xs" data-testid={`video-copy-${v.key}`}>
                      {copied === abs ? <Check className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
                      Copy share URL
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================ LINKS ================================ */
function LinksPanel({ copy, copied }) {
  return (
    <div>
      <h2 className="text-base font-bold text-white mb-1">Share links (UTM-tagged)</h2>
      <p className="text-xs text-slate-400 mb-4">Every link carries its UTM source baked in. You'll see which channel produces real leads in your investor inbox.</p>
      <div className="space-y-2">
        {SHARE_LINKS.map((l) => {
          const abs = `${SITE}${l.path}`;
          return (
            <Card key={l.key} className="bg-slate-900/60 border-slate-800 p-3" data-testid={`share-link-${l.key}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Link2 className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="text-sm font-semibold text-white">{l.label}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-md bg-[#0a0e14] border border-slate-800 text-[11px] font-mono text-slate-300 truncate">{abs}</div>
                <Button size="sm" onClick={() => copy(abs, 'Link copied')} className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold shrink-0" data-testid={`share-copy-${l.key}`}>
                  {copied === abs ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================ CAPTIONS ================================ */
function CaptionsPanel({ copy, copied }) {
  return (
    <div>
      <h2 className="text-base font-bold text-white mb-1">Ready-to-post captions</h2>
      <p className="text-xs text-slate-400 mb-4">Pre-written for TikTok, Instagram, LinkedIn. Tap copy and paste.</p>
      <div className="space-y-3">
        {CAPTIONS.map((c) => (
          <Card key={c.key} className="bg-slate-900/60 border-slate-800 p-3 sm:p-4" data-testid={`caption-${c.key}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-bold text-white">{c.title}</div>
              <Button size="sm" onClick={() => copy(c.text, 'Caption copied')} className="bg-purple-500/90 hover:bg-purple-500 text-white text-xs font-bold" data-testid={`caption-copy-${c.key}`}>
                {copied === c.text ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                Copy
              </Button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed bg-[#0a0e14] border border-slate-800 rounded-lg p-3">{c.text}</pre>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================================ QR CODES ================================ */
function QRPanel({ copy, copied }) {
  const [custom, setCustom] = useState('');
  const targets = useMemo(() => ([
    { label: 'Home',             path: '/' },
    { label: 'TikTok Cuts',      path: '/cuts?ref=qr' },
    { label: 'Pitch (investors)', path: '/pitch?ref=qr' },
    { label: 'Investor Form',    path: '/investors?ref=qr' },
    { label: 'Towing / Wrecker', path: '/wrecker' },
    ...(custom ? [{ label: 'Custom', path: custom.startsWith('/') ? custom : '/' + custom }] : []),
  ]), [custom]);

  return (
    <div>
      <h2 className="text-base font-bold text-white mb-1">Printable QR codes</h2>
      <p className="text-xs text-slate-400 mb-4">
        Print these on flyers, business cards, the side of your truck. Scanning jumps straight to the page.
        Each QR is high-res (400px) — good for 4×4 inch prints.
      </p>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Custom path (optional)</div>
        <input
          type="text"
          placeholder="/any-path?ref=custom"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-full px-3 py-2.5 rounded-md bg-[#0a0e14] border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/50"
          data-testid="qr-custom-input"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {targets.map((t) => {
          const abs = `${SITE}${t.path}`;
          return (
            <Card key={t.path} className="bg-slate-900/60 border-slate-800 p-3 sm:p-4 text-center" data-testid={`qr-${t.label}`}>
              <img
                src={qrURL(t.path, 400)}
                alt={`QR for ${t.label}`}
                className="w-full max-w-[220px] mx-auto aspect-square rounded-lg border border-slate-800 bg-[#0a0e16] mb-3"
                loading="lazy"
              />
              <div className="text-sm font-bold text-white">{t.label}</div>
              <div className="text-[10px] text-slate-500 font-mono mt-1 break-all">{abs}</div>
              <div className="mt-3 flex gap-2">
                <a
                  href={qrURL(t.path, 800)}
                  download={`roadboss-qr-${t.label.replace(/\s/g, '-').toLowerCase()}.png`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" /> PNG
                </a>
                <Button size="sm" variant="outline" onClick={() => copy(abs, 'Target URL copied')} className="border-slate-700 text-slate-200 text-xs">
                  {copied === abs ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
