import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  Mic,
  Shield,
  MapPin,
  MessageSquare,
  Truck,
  Gauge,
  ClipboardCheck,
  Bell,
  LifeBuoy,
  Bot,
  Radio,
  Printer,
  Phone,
  AlertTriangle,
  BookOpen,
  Play,
  Users,
  CreditCard,
  ArrowRight,
  Search,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import BrandedFooter from '@/components/BrandedFooter';

/*
  UserGuide — the plain-English "How to use RoadBoss" manual.
  Public at /guide. Written for truckers, not engineers. Printable.
  Organized as collapsible chapters so drivers can jump straight to what they need.
*/

const CHAPTERS = [
  {
    id: 'starter',
    icon: Play,
    title: 'Quick Start — 60 Seconds to Your First Drive',
    audience: 'Every user',
    accent: 'text-emerald-300',
    sections: [
      {
        h: 'If you landed here from TikTok / Facebook / a friend',
        body: [
          'Tap **Try it** at the top of the site (or go to roadboss.app/try).',
          'Pick **"Try as a driver"** — you are logged in with a demo account in 3 seconds. No email. No password. No card.',
          'You land on the Driver home screen. Everything is real: voice, GPS, SMS, crash detection.',
          'Tap the **onboarding tour** if it pops up — 60 seconds, it teaches you the wake word, Co-Pilot, and safety toggles.',
        ],
      },
      {
        h: 'If you want a real account (to keep your data)',
        body: [
          'Tap **Sign in** at the top right.',
          'Use **"Continue with Google"** for the fastest setup (one tap).',
          'Or enter your email + password (we use Google OAuth, JWT, and bcrypt — industry standard).',
          'Roles are automatic: if your email is a fleet owner, you get the admin dashboard. Drivers get the driver shell.',
        ],
      },
    ],
  },
  {
    id: 'voice',
    icon: Mic,
    title: 'Voice Commands — How to Talk to Co-Pilot',
    audience: 'Drivers',
    accent: 'text-sky-300',
    sections: [
      {
        h: 'Arm the wake word',
        body: [
          'On the driver Home screen, look at the **bottom bar**. Tap the microphone icon.',
          'The first time, your phone asks for **microphone permission** — say yes.',
          'You can pick your wake word from: **"Hey Co-Pilot"**, **"Highway Pilot"**, **"Hey Boss"**, or **"Hey RoadBoss"**.',
          'Once armed, you can talk to Co-Pilot without touching your phone.',
        ],
      },
      {
        h: 'Commands that work right now',
        body: [
          '**"Hey Co-Pilot, start my pre-trip"** — opens the 27-item DVIR inspection.',
          '**"Hey Co-Pilot, I\'m on duty"** — changes HOS status to On Duty (Not Driving).',
          '**"Hey Co-Pilot, I\'m driving now"** — starts Drive time logging.',
          '**"Hey Co-Pilot, rest time"** — switches to Sleeper Berth.',
          '**"Hey Co-Pilot, tell dispatch I\'m late"** — Co-Pilot sends a real SMS to your dispatcher.',
          '**"Hey Co-Pilot, what\'s my HOS?"** — reads your remaining drive time out loud.',
          '**"Hey Co-Pilot, call roadside"** — triggers a roadside assistance dispatch.',
          '**"Hey Co-Pilot, route me to [destination]"** — starts truck-aware GPS navigation.',
        ],
      },
      {
        h: 'If the wake word does not hear you',
        body: [
          'Your browser may have blocked mic permission — tap the lock icon in the address bar and allow the mic.',
          'On iPhone, make sure you added RoadBoss to your Home Screen (iOS 16.4+) so it behaves like a real app.',
          'In noisy truck cabs, speak at normal volume — the model was trained on highway audio and handles diesel engines well.',
          'If still nothing, tap the microphone icon manually to start listening.',
        ],
      },
    ],
  },
  {
    id: 'dvir',
    icon: ClipboardCheck,
    title: 'Pre-Trip & Post-Trip Inspections (DVIR)',
    audience: 'Drivers',
    accent: 'text-amber-300',
    sections: [
      {
        h: 'What this is',
        body: [
          'FMCSA requires a Driver Vehicle Inspection Report before you drive and after you finish your shift.',
          'RoadBoss has all 27 items from FMCSA regs 49 CFR § 396.11 and § 396.13 baked in.',
          'Inspections are signed digitally, timestamped, and emailed as PDF receipts — DOT-ready.',
        ],
      },
      {
        h: 'How to do one',
        body: [
          'Say **"Hey Co-Pilot, start my pre-trip"** OR tap the **Inspections** tab.',
          'Go through each item: Brakes · Tires · Lights · Horn · Mirrors · Coupling devices · etc.',
          'Tap ✅ Pass or ⚠ Issue. If there is an issue, add a short note.',
          'At the end, **sign** with your finger on the touchscreen.',
          'Co-Pilot saves it, emails a signed PDF to you, and logs it to the fleet dashboard.',
        ],
      },
    ],
  },
  {
    id: 'crash',
    icon: Shield,
    title: 'Crash Guardian — What Happens If You Wreck',
    audience: 'Drivers',
    accent: 'text-rose-300',
    sections: [
      {
        h: 'How it works',
        body: [
          'Your phone has motion sensors (accelerometer + gyroscope). RoadBoss reads them 60 times a second.',
          'If g-forces or rotation exceed the crash threshold, CrashGuardian triggers.',
          'A big red screen appears with a **20-second countdown** — "Are you OK?"',
          'If you are okay, tap **"I\'m okay — cancel"** and nothing happens.',
          'If you do NOT cancel within 20 seconds, the app assumes the worst.',
        ],
      },
      {
        h: 'What happens if you cannot cancel',
        body: [
          'RoadBoss SMS-blasts every emergency contact on your fleet profile — family, dispatch, safety director.',
          'It pushes a CRITICAL notification to every fleet admin with push enabled.',
          'The alert includes your name, truck, last GPS coordinates, severity, and g-force.',
          'Admins see it instantly in the dashboard → Crash Events tab, and can coordinate response.',
        ],
      },
      {
        h: 'The SOS button',
        body: [
          'If you need help but there was no crash (fire, medical, attacker, hazmat leak), tap the red **SOS** button.',
          'Same alert flow, no 20-second delay. Instant broadcast.',
        ],
      },
    ],
  },
  {
    id: 'gps',
    icon: MapPin,
    title: 'Truck-Aware GPS',
    audience: 'Drivers',
    accent: 'text-violet-300',
    sections: [
      {
        h: 'Why it is better than Google Maps',
        body: [
          'Google Maps will send you under a 12\'6" bridge with a 13\'6" trailer. RoadBoss will not.',
          'Powered by Mapbox — routing accounts for **weight, height, length, and hazmat class**.',
          'Your vehicle profile (set once in Fleet → Vehicles) follows you across every trip.',
        ],
      },
      {
        h: 'Starting a trip',
        body: [
          'Tap the **Map** tab OR say **"Hey Co-Pilot, route me to [destination]"**.',
          'Enter city, address, or terminal name.',
          'Co-Pilot reads turn-by-turn directions out loud — never look at the phone.',
        ],
      },
    ],
  },
  {
    id: 'dispatch',
    icon: MessageSquare,
    title: 'Messaging Dispatch (SMS)',
    audience: 'Drivers + Admins',
    accent: 'text-cyan-300',
    sections: [
      {
        h: 'Driver side — voice-to-SMS',
        body: [
          'Say **"Hey Co-Pilot, tell dispatch [your message]"**.',
          'Co-Pilot sends a real SMS through Twilio to your dispatcher.',
          'Example: **"Hey Co-Pilot, tell dispatch I\'m running 40 minutes late due to traffic on I-70."**',
        ],
      },
      {
        h: 'Admin side — fleet messaging',
        body: [
          'Go to **Drivers** tab → pick a driver → tap **Send SMS**.',
          'Type your message, hit send. Message goes via Twilio to the driver\'s cell.',
          'All inbound replies from drivers appear on the **Notifications** page in real time.',
        ],
      },
    ],
  },
  {
    id: 'hos',
    icon: Gauge,
    title: 'Hours of Service (HOS) & ELD',
    audience: 'Drivers',
    accent: 'text-emerald-300',
    sections: [
      {
        h: 'Plain-English FMCSA rules baked in',
        body: [
          '**11-hour driving limit** within a 14-hour duty period.',
          '**30-minute break** after 8 cumulative hours of driving.',
          '**70-hour / 8-day rule** for most property-carrying drivers.',
          'RoadBoss tracks all of this automatically based on your duty status changes.',
        ],
      },
      {
        h: 'How to change duty status',
        body: [
          'Use voice: **"Hey Co-Pilot, I\'m on duty"** / **"driving"** / **"rest time"** / **"off duty"**.',
          'Or tap the duty bar on the driver Home screen.',
          'RoadBoss warns you when you are 30 minutes from a limit and again at 5 minutes.',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Notifications — SMS, Email, and Push',
    audience: 'Everyone',
    accent: 'text-amber-300',
    sections: [
      {
        h: 'Three channels, each with a job',
        body: [
          '**SMS (Twilio)**: crash alerts, dispatch messages, HOS warnings, roadside dispatch. Goes to real cell phones.',
          '**Email (SendGrid)**: DVIR signed copies, billing receipts, fleet invites, password resets, dunning emails.',
          '**Push (Web Push)**: cross-platform notifications to the browser/PWA even when the app is closed. FREE.',
        ],
      },
      {
        h: 'Turning push on',
        body: [
          'Drivers: Settings → Push Notifications → **Enable push**.',
          'Admins: Notifications page → **Enable push** at the top.',
          'You can send yourself a test push to confirm it works.',
          'Push works on Chrome/Edge/Firefox everywhere, and on iOS 16.4+ once you add RoadBoss to your Home Screen.',
        ],
      },
    ],
  },
  {
    id: 'admin',
    icon: Users,
    title: 'Fleet Admin Dashboard',
    audience: 'Admins / Dispatchers',
    accent: 'text-sky-300',
    sections: [
      {
        h: 'The tabs, left to right',
        body: [
          '**Overview** — live fleet health, active drivers, trips in progress, HOS alerts.',
          '**Drivers** — roster, CDL expirations, phone numbers, subscription status.',
          '**Vehicles** — VIN, DOT number, weight/height/hazmat for GPS.',
          '**Trips** — every run with start/end, mileage, state-by-state miles (for IFTA).',
          '**Inspections** — signed DVIRs with PDF download.',
          '**Crash Events** — CrashGuardian history with severity, location, resolution notes.',
          '**Dashcam** — unified feed from Samsara, Lytx, Verizon Connect, and RoadBoss native cams.',
          '**Roadside** — vendor dispatch with estimated arrival time and cost.',
          '**Notifications** — audit log of every SMS, email, and push.',
          '**Settings** — emergency contacts, fleet preferences.',
          '**Billing** — subscription and invoice history.',
          '**Waitlist** — prospects who signed up at marketing site.',
        ],
      },
      {
        h: 'Emergency contacts (critical)',
        body: [
          'Go to **Settings** → **Emergency crash contacts**.',
          'Click **Add contact**. Enter name, phone, role (Safety Director / Night Dispatch / Spouse).',
          'When CrashGuardian fires, these people get SMS automatically.',
          'You can pause contacts without deleting them (Active toggle).',
        ],
      },
    ],
  },
  {
    id: 'billing',
    icon: CreditCard,
    title: 'Payments & Billing',
    audience: 'Anyone paying',
    accent: 'text-emerald-300',
    sections: [
      {
        h: 'Plans',
        body: [
          '**Free** — $0 — TTS hands-free messaging, basic GPS, voice commands.',
          '**Pro** — $29.99/mo — everything unlocked for solo owner-operators.',
          '**Fleet** — $19.99 per truck per month — Pro features + fleet dashboard and analytics.',
          '**Enterprise** — custom — white-label, API access, dedicated support.',
        ],
      },
      {
        h: 'How to pay',
        body: [
          'Pricing page → pick a plan → Stripe Checkout opens.',
          'Accepted methods: Visa, Mastercard, Amex, Discover, Apple Pay, Google Pay, **Cash App Pay**, Stripe Link, and **ACH bank transfer** (best for large fleets).',
          'You get a **branded SendGrid receipt email** within seconds of paying.',
          'Cancel anytime in one click from **Billing** → Manage subscription.',
        ],
      },
    ],
  },
  {
    id: 'roadside',
    icon: LifeBuoy,
    title: 'Roadside Assistance',
    audience: 'Drivers',
    accent: 'text-amber-300',
    sections: [
      {
        h: 'Getting help',
        body: [
          'Tap **Roadside** on the driver tab OR say **"Hey Co-Pilot, call roadside"**.',
          'Pick the service: Tow, Tire, Fuel, Jump, Mechanical, Lockout.',
          'RoadBoss finds the nearest vetted provider, dispatches them, and texts them with your location.',
          'Admins see the roadside ticket on their dashboard in real time.',
        ],
      },
    ],
  },
  {
    id: 'troubleshoot',
    icon: AlertTriangle,
    title: 'Troubleshooting',
    audience: 'Everyone',
    accent: 'text-rose-300',
    sections: [
      {
        h: 'Common fixes',
        body: [
          '**Mic not working?** Allow microphone in your browser settings (lock icon in the address bar).',
          '**Push not arriving?** Notifications disabled at OS level — on iOS, Settings → Notifications → RoadBoss → Allow.',
          '**GPS not loading?** Make sure location permission is granted to the browser.',
          '**Voice-to-SMS silent?** Twilio toll-free verification is in review — SMS works only to verified numbers during this window.',
          '**Crash false-positive?** Tap "I\'m okay — cancel" within 20 seconds. You can also temporarily mute CrashGuardian from Settings when loading/unloading.',
          '**Can\'t log in?** Use password reset link on login page. Or contact Mike directly.',
        ],
      },
      {
        h: 'Data safety',
        body: [
          'Your password is hashed with bcrypt. We never see it.',
          'Your payment is processed by Stripe. We never see your card.',
          'Your GPS is only stored when you are on a trip, never while off duty.',
          'Your DVIRs are FMCSA-grade audit trails — nobody can edit them after signing.',
        ],
      },
    ],
  },
  {
    id: 'contact',
    icon: Phone,
    title: 'Contact the Founder Directly',
    audience: 'Everyone',
    accent: 'text-sky-300',
    sections: [
      {
        h: 'Mike Ward · Founder',
        body: [
          'Email: **mward5710@gmail.com**',
          'Phone: **+1 (765) 480-8889**',
          'Based in: **Kokomo, Indiana**',
          'Reply within 24 hours, guaranteed. I am a real trucker building this for real truckers.',
          'If you\'re a journalist, investor, or fleet owner — skip the form. Text me direct.',
        ],
      },
    ],
  },
];

function Chapter({ ch, openAll, query }) {
  const [open, setOpen] = useState(false);
  const visible = useMemo(() => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (ch.title.toLowerCase().includes(q)) return true;
    return ch.sections.some(
      (s) => s.h.toLowerCase().includes(q) || s.body.some((b) => b.toLowerCase().includes(q))
    );
  }, [ch, query]);
  const Icon = ch.icon;
  const expanded = open || openAll || !!query;
  if (!visible) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden" data-testid={`guide-chapter-${ch.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left px-5 py-4 hover:bg-white/[0.03] transition"
      >
        <div className="h-9 w-9 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
          <Icon className={`h-4 w-4 ${ch.accent}`} />
        </div>
        <div className="flex-1">
          <div className="text-white font-semibold">{ch.title}</div>
          <div className="text-xs text-slate-400">{ch.audience}</div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-white/5 pt-4">
          {ch.sections.map((s, i) => (
            <div key={i}>
              <div className="text-sm font-semibold text-white mb-2">{s.h}</div>
              <ul className="space-y-1.5 list-disc list-outside ml-5">
                {s.body.map((line, j) => (
                  <li
                    key={j}
                    className="text-sm text-slate-300 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: line
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>'),
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UserGuide() {
  const [query, setQuery] = useState('');
  const [openAll, setOpenAll] = useState(false);

  return (
    <div className="min-h-screen bg-[#07090d] text-white" data-testid="user-guide-page">
      <header className="border-b border-white/5 sticky top-0 bg-[#07090d]/90 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={26} withWordmark={false} />
            <span className="text-sm font-semibold text-white">RoadBoss</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/try" className="text-slate-300 hover:text-white transition">Try it</Link>
            <Link to="/deck" className="text-slate-300 hover:text-white transition hidden md:inline">Investors</Link>
            <Link to="/pricing" className="text-slate-300 hover:text-white transition hidden md:inline">Pricing</Link>
            <button
              onClick={() => window.print()}
              data-testid="guide-print-btn"
              className="p-1.5 rounded text-slate-300 hover:bg-white/5 hover:text-white"
              aria-label="Print guide"
            >
              <Printer className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-10 space-y-8">
        <section>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-sky-300 mb-3">
            <BookOpen className="h-3 w-3" /> Manual · v1 · for real truckers
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            How to use RoadBoss.
          </h1>
          <p className="text-slate-300 mt-3 max-w-2xl">
            Plain English. Written by a trucker, for truckers. Jump to what you need — Quick Start
            if you just landed, Troubleshooting if something is broken, Contact if you want to
            reach Mike directly.
          </p>
        </section>

        {/* Search + expand toggle */}
        <section className="flex flex-col md:flex-row gap-3 items-stretch">
          <div className="flex-1 relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the manual — &quot;crash&quot;, &quot;SMS&quot;, &quot;pre-trip&quot;, &quot;billing&quot;…"
              data-testid="guide-search"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500/50"
            />
          </div>
          <button
            onClick={() => setOpenAll((o) => !o)}
            data-testid="guide-expand-all"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-200 hover:bg-white/[0.05]"
          >
            {openAll ? 'Collapse all' : 'Expand all'}
          </button>
        </section>

        {/* Quick jump pills */}
        <section className="flex flex-wrap gap-2">
          {CHAPTERS.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              onClick={() => setOpenAll(true)}
              className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] transition inline-flex items-center gap-1.5"
            >
              <c.icon className={`h-3 w-3 ${c.accent}`} />
              {c.title.split('—')[0].trim()}
            </a>
          ))}
        </section>

        {/* Chapters */}
        <section className="space-y-3">
          {CHAPTERS.map((ch) => (
            <div id={ch.id} key={ch.id}>
              <Chapter ch={ch} openAll={openAll} query={query} />
            </div>
          ))}
        </section>

        {/* Closing CTA */}
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6 text-center">
          <div className="inline-flex items-center gap-2 text-sky-300 font-semibold">
            <Bot className="h-4 w-4" /> Still stuck?
          </div>
          <p className="text-slate-300 mt-2 max-w-xl mx-auto">
            Text Mike directly at <span className="text-sky-300 font-semibold">+1 (765) 480-8889</span> or
            email <a className="text-sky-300 underline" href="mailto:mward5710@gmail.com">mward5710@gmail.com</a>.
            You get a real human — the founder — inside 24 hours.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 justify-center">
            <Link to="/try">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 text-slate-950 px-4 py-2 text-sm font-medium hover:bg-sky-400 transition">
                <Play className="h-4 w-4" /> Try the live demo
              </span>
            </Link>
            <Link to="/share-kit">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-transparent text-slate-100 px-4 py-2 text-sm hover:bg-white/5 transition">
                Share kit <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </section>

        <BrandedFooter className="py-10" />
      </main>

      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { background: white !important; color: black !important; }
          header, nav, section:nth-of-type(2), section:nth-of-type(3) { display: none !important; }
          [data-testid="user-guide-page"] { background: white !important; }
          [data-testid^="guide-chapter-"] { break-inside: avoid; border: 1px solid #ccc !important; background: white !important; }
          [data-testid^="guide-chapter-"] * { color: black !important; }
        }
      `}</style>
    </div>
  );
}
