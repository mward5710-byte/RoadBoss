// ShareKit — public page with ready-to-copy social media assets for RoadBoss.
// Anyone (Mike, creators, investors, fans) can grab copy/scripts/links and share.
// Focused on TikTok / Facebook Groups / Reddit / LinkedIn / X.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Copy,
  Check,
  Share2,
  Film,
  Hash,
  Video,
  PenSquare,
  ExternalLink,
  Phone,
  Mail,
  Sparkles,
  Rocket,
  TrendingUp,
  Users,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import BrandedFooter from '@/components/BrandedFooter';

function CopyBlock({ label, text, tone = 'sky', testId }) {
  const [copied, setCopied] = useState(false);
  const tones = {
    sky:     'border-sky-500/30 bg-sky-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    amber:   'border-amber-500/30 bg-amber-500/5',
    rose:    'border-rose-500/30 bg-rose-500/5',
    violet:  'border-violet-500/30 bg-violet-500/5',
  };
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copy failed — long-press the text to copy manually');
    }
  };
  return (
    <div className={`rounded-2xl border ${tones[tone] || tones.sky} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-xs uppercase tracking-widest text-slate-300 font-semibold">{label}</div>
        <Button
          onClick={onCopy}
          size="sm"
          data-testid={testId}
          className="bg-white/10 hover:bg-white/20 text-white h-7 px-2"
        >
          {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-100">{text}</pre>
    </div>
  );
}

export default function ShareKit() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://roadboss.app';
  const tryLink = `${origin}/try`;
  const deckLink = `${origin}/deck`;

  const tiktokCaption = `Built by a trucker, for truckers. Voice-first. Never look at your phone again. 🚛
Try the live app 👉 ${tryLink}
#TruckTok #Trucker #TruckingLife #OTR #CDL #TruckDriverLife #TruckerLife #Trucking`;

  const facebookCaption = `I built the app I always wanted when I was on the road.

RoadBoss — voice-first, always on, always protecting.
- Co-Pilot AI takes commands while you drive
- Auto crash detection alerts dispatch + your emergency contact
- FMCSA-compliant pre-trip inspections
- Integrated dispatch messaging, GPS, roadside, and dashcam

First 500 drivers get founder pricing. Try it free, no signup:
${tryLink}

#trucking #logistics #trucker #CDL #safety`;

  const redditPost = `Title: I'm a trucker from Indiana. I built an app so we never have to look at our phones again. Want to test it?

Hey r/Truckers. I'm not a programmer or a VC. I'm a truck driver who got tired of juggling 8 apps and watching friends die looking at phones. I spent the last few weeks building what I wish I had.

It's called RoadBoss. Voice-first. Co-Pilot AI that actually DOES things when you tell it to. Auto crash detection. FMCSA DVIR. Truck-aware GPS. Dispatch messaging. All hands-free.

Free to try right now — no signup, no card, no email. Literally just click and you're in the demo app: ${tryLink}

I don't want karma. I want brutal feedback from real truckers. What's broken? What's stupid? What's missing? What would make you pay $29/mo? Drop comments or DM me.

First 100 drivers from this post get lifetime 50% off when we go paid.

— Mike`;

  const linkedInPost = `Two weeks ago I couldn't write a line of code.

Today, RoadBoss is live.

I'm a truck driver from Kokomo, Indiana. For years I watched my friends juggle 5-8 apps just to do their jobs. Some of them died looking at phones. 4,000 people die like that every year in this country.

So I built the app I always wanted:

🎙 Voice-first AI Co-Pilot — "Hey Co-Pilot, start my pre-trip"
🛡 Auto crash detection — alerts dispatch + emergency contact if I can't
📋 FMCSA-compliant inspections
📞 Integrated roadside, messaging, billing

It's not a deck. It's live and running. I'm looking for my first 10 drivers, first angel investors, and my first strategic partners.

Try the live demo: ${tryLink}
Investor deck: ${deckLink}

If you're in trucking, mobility, or B2B SaaS — I'd love a conversation.

#trucking #logistics #IndianaBiz #founders #mobility #B2BSaaS`;

  const xThread = `🧵 I'm a trucker from Kokomo, Indiana.

I built an app so drivers never have to look at their phones again.

Here's what it does — and why I think it's a $100M opportunity 👇

---

1/ The problem: 3.5M US truckers juggle 5-8 apps per shift.
- 45+ min/day lost to app-switching
- 4,000+ deaths/yr from distracted driving in commercial vehicles
- $16K avg ELD violation fine

2/ The solution: ONE app. Voice-first. Always on.
- Co-Pilot AI takes voice commands
- Crash detection auto-calls for help
- FMCSA-compliant ELD + DVIR
- Integrated roadside, dispatch, dashcam

3/ Try it free right now — no signup, no email:
${tryLink}

4/ Pitch deck for investors:
${deckLink}

5/ Looking for:
- First 100 truckers to use it
- $500K seed round (angels welcome)
- Strategic partners in fleets/insurance

DM me. Let's build. 🚛`;

  const dmTemplate = `Hey [FIRST NAME], big fan of your content.

I'm a trucker from Indiana who just built an app voice-first so drivers never have to touch their phones. It's called RoadBoss.

I've got 10 free lifetime Pro accounts ($29/mo value) to give to creators who'll test it and post honestly — good OR bad. No contract. No strings.

Try the app (no signup): ${tryLink}

Want one? Reply and I'll send the unlock code tonight.

— Mike`;

  const subject = `Trucker-built SaaS (MVP is live) — 30 sec skim`;
  const angelEmail = `Subject: ${subject}

Hi [First Name],

My name is Mike Ward. I'm a truck driver and small-business owner from Kokomo, Indiana. I built RoadBoss — a voice-first AI command center for truckers.

The MVP is live with Stripe, Twilio, SendGrid, Mapbox, and Google OAuth already wired. I'm raising a $500K seed round.

Live demo (no signup): ${tryLink}
Pitch deck: ${deckLink}

Would you have 15 minutes for a demo this week?

Mike Ward
Founder, RoadBoss (DBA of Apex Epoxy Flooring LLC)
mward5710@gmail.com · +1 (765) 480-8889`;

  // ---- Fleet Owner (B2B) templates — Phase 2H.4 ----
  const fleetLinkedInDM = `Hi [First Name] — I'm a trucker from Indiana who built an app that replaces most of what fleets currently pay Motive / Samsara for, at a third of the cost.

It's called RoadBoss. Voice-first, so your drivers never have to touch a phone on the road (huge insurance win). FMCSA DVIR compliant, unified dashcam feed across Samsara/Lytx/Verizon, integrated dispatch, and automatic crash alerts to your dispatcher + driver's family.

We have a 60-second ROI calculator that shows what you'd save on [X] trucks: ${origin}/roi

Happy to do a live 10-minute demo — no deck, just the dashboard running on my screen.

Mike Ward · (765) 480-8889`;

  const fleetColdEmail = `Subject: Cut your trucking app stack by 60% — built by a trucker

Hi [First Name],

I'm Mike Ward — a truck driver and small-business owner from Kokomo, Indiana. For the past month I've been building what I wish my friends had been using when they lost their lives looking at phones.

It's called RoadBoss. Voice-first, always-on, runs in the background behind Spotify and Apple Maps. It replaces most of what a fleet currently subscribes to:

 - ELD / HOS compliance  (vs Motive/Samsara at ~$33/truck/mo)
 - FMCSA DVIR inspections  (signed PDFs, DOT-audit ready)
 - Truck-aware GPS with weight/height/hazmat routing
 - Integrated SMS dispatch — no separate messaging platform
 - Auto crash detection + driver/family notification
 - Unified dashcam feed across Samsara, Lytx, Verizon, RoadBoss native
 - Roadside assistance dispatch with vendor network

RoadBoss Fleet is $19.99 per truck per month — and your app-stack savings alone usually pay for it 3x over in the first year.

See the math for your exact truck count: ${origin}/roi
Try the fleet admin dashboard live (no signup, no card): ${tryLink}
Full pitch deck: ${deckLink}

Would you have 15 minutes this week for a no-pressure demo? If it's not a fit, I'll take 5 minutes of your feedback instead — it's more valuable to me than another slide.

Mike Ward
Founder, RoadBoss (DBA of Apex Epoxy Flooring LLC)
mward5710@gmail.com | +1 (765) 480-8889
Kokomo, Indiana`;

  const fleetIndustryChannels = `WHERE FLEET OWNERS HANG OUT — A SIMPLE HIT-LIST

🏛  Associations to join / post in
  • ATA (American Trucking Associations) — trucking.org — 2,300+ member fleets
  • NASTC (Nat'l Assoc. of Small Trucking Companies) — nastc.com — 8,500+ small fleets (your sweet spot)
  • TCA (Truckload Carriers Association) — truckload.org
  • OOIDA (Owner-Operator Independent Drivers Assoc.) — ooida.com — 150K+ members
  • National Private Truck Council (NPTC) — nptc.org

📰  Trade publications — pitch to editors or buy low-cost banner ads
  • Overdrive Magazine — overdriveonline.com
  • Commercial Carrier Journal (CCJ) — ccjdigital.com
  • FleetOwner — fleetowner.com
  • Land Line Magazine (OOIDA's) — landline.media
  • Transport Topics — ttnews.com
  • Heavy Duty Trucking (HDT) — truckinginfo.com

🎪  Conferences to attend — where deals close
  • MATS (Mid-America Trucking Show) — Louisville, KY · March — 70K+ attendees · drive from Kokomo
  • ATA Management Conference & Exhibition — October
  • Truckload Carriers Association Annual Convention — March
  • Great American Trucking Show (GATS) — Dallas, August
  • CCJ Innovator Summit — invite-only but worth applying

🎙  Podcasts fleet owners actually listen to (pitch yourself as a guest)
  • Over The Road (OOIDA)
  • Haulin' Assets
  • The Trucker Podcast
  • Trucking Business Podcast
  • Freight 360

💼  LinkedIn search queries (copy-paste into LinkedIn search)
  • "Fleet Manager" + "trucking"
  • "Director of Operations" + "motor carrier"
  • "VP Transportation" + "logistics"
  • "Owner" + "trucking company"
  • Filter by: Indiana, Ohio, Illinois, Michigan, Kentucky (start regional)

📋  FREE public database — FMCSA SAFER
  • saferweb.fmcsa.dot.gov — search every DOT-registered carrier in the US
  • Filter by state, fleet size, operation type
  • Export CSV; cold-call or mail your local targets

🎯  Midwest target fleets (good first calls — under 100 trucks, Indiana/Ohio/Illinois)
  • Kokomo Motor Freight (local to you)
  • Duncan Family Farms Transport (IN)
  • Interstate Distributor Co (IN)
  • Indiana Express Trucking
  • HSI Logistics (Indianapolis)
  • DCT Trucking (Ohio border)
  • Find more via SAFER with a 1-minute search`;

  const fleetConfPrep = `MATS (Mid-America Trucking Show) — Launch Plan for First-Time Founder

Where: Kentucky Exposition Center, Louisville (5-hour drive from Kokomo)
When: Late March annually · 2027 dates: tba
Attendance: ~70,000 fleet owners, drivers, vendors

Before you go:
  ✓ Print 500 business cards with your name, phone, roadboss.app/try + QR code
  ✓ Print 100 one-page flyers with "Try the live app" QR code — hand to drivers
  ✓ Wear a polo with the RoadBoss logo (Vistaprint, $30)
  ✓ Rent a 10x10 vendor booth if budget allows (~$2-5K) — OR walk the floor free with an attendee badge

At the show:
  ✓ Hit every OEM booth (Kenworth, Freightliner, Volvo) and ask for the tech integrations team
  ✓ Stake out the Samsara and Motive booths — their customers walk by, leave a card with "Cheaper alternative: roadboss.app"
  ✓ Attend at least one OOIDA panel and ask a question from the mic — free mindshare
  ✓ Crash the vendor-networking nights (usually held at nearby hotels)

After:
  ✓ Email every scanned business card within 24 hours with subject "Great meeting you at MATS"
  ✓ Connect with everyone on LinkedIn

Budget: $500-2,000 depending on booth or just attending. Either way, it's the #1 ROI event for fleet-founder networking.`;

  // ---- Fleet Owner (B2B) templates — Phase 2H.4 ----

  const videoScript = `RoadBoss TikTok / Reels / Shorts Script — 60 seconds
(100% animated — no founder face needed)

[0:00–0:04] SCREEN RECORDING of roadboss.app/try phone demo playing
TEXT OVERLAY: "POV: A trucker got tired of 8 apps."
VOICEOVER (AI or record yourself): "Three-point-five million truckers."

[0:04–0:10] Quick cuts of phone demo cycling through scenes
VO: "They juggle 8 apps every shift. Some of them die looking at phones."
TEXT: "4,000 deaths a year."

[0:10–0:22] Screen-record the live /try demo — show Co-Pilot responding
VO: "RoadBoss is voice-first. One app does it all.
Co-Pilot AI. Crash detection. Dispatch messaging. FMCSA logs."
TEXT pulses on each keyword.

[0:22–0:35] Phone demo → crash scene → SMS pops out → map routing
VO: "It runs in the background. Never leaves your pocket.
Never stops listening. Never stops protecting."

[0:35–0:48] Marketing site or pricing card
VO: "Free tier forever. Pro is $29 a month.
First 500 drivers get founder pricing — locked in for life."

[0:48–0:60] End card with QR + link
TEXT: "Try it free. No signup. No card."
URL: roadboss.app/try

HOW TO FILM THIS (free tools):
1. Open ${tryLink} on your phone.
2. Start your phone's built-in SCREEN RECORDER (iPhone: swipe-down Control Center; Android: notification shade).
3. Let the animated phone mockup auto-cycle on the /try page — that IS the demo.
4. Stop recording. Import into CapCut (free iOS/Android app).
5. Use CapCut's AI voiceover feature OR record your own voice over the clip.
6. Add text overlays matching the script above.
7. Export vertical 1080x1920. Post.

Total time: ~20 minutes. Cost: $0.`;

  const hashtags = `#TruckTok #Trucker #TruckingLife #OTR #CDL #CDLLife #TruckDriverLife #TruckerTok #Trucking #HotShot #OwnerOperator #OTR #DriverSafety #TruckSafety #FleetManagement #Logistics #IndianaBiz #StartupLife #Founders #B2BSaaS #MadeInAmerica`;

  const outlets = [
    {
      k: 'TikTok Creators to DM (30 min)',
      items: [
        '@jenna_lashae (2.5M)',
        '@truckinwithbigrigsteve (900K)',
        '@clayton_stepp (500K)',
        '@truckerkameel (700K)',
        '@trucker_cla (1M+)',
        '@616sean (300K)',
        '@trucker_josh (280K)',
      ],
    },
    {
      k: 'Facebook Groups to Post In',
      items: [
        'Truckers Only (450K+)',
        'Women In Trucking (90K+)',
        'Owner Operator Truckers (200K+)',
        'CDL Truckers Nationwide (180K+)',
        'Hot Shot Truckers (75K+)',
        'OTR Truckers and Family (120K+)',
      ],
    },
    {
      k: 'Subreddits',
      items: [
        'r/Truckers (310K)',
        'r/truckdrivers (85K)',
        'r/FirstTruck (45K)',
        'r/CDL (25K)',
        'r/logistics (180K)',
      ],
    },
    {
      k: 'YouTube / Other',
      items: [
        'Smart Trucking (YouTube)',
        'AllieKnight (YouTube)',
        'Trucker Josh VLOGS',
        '619 Trucker',
        'Indian Trucker USA',
        'Instagram #truckstagram #truckersofinstagram',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#07090d] text-white" data-testid="share-kit-page">
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={26} withWordmark={false} />
            <span className="text-sm font-semibold text-white">RoadBoss</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/try" className="text-slate-300 hover:text-white transition">Try it</Link>
            <Link to="/deck" className="text-slate-300 hover:text-white transition hidden md:inline">Investors</Link>
            <Link to="/pricing" className="text-slate-300 hover:text-white transition hidden md:inline">Pricing</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-12 space-y-10">
        {/* Hero */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-amber-300 mb-3">
            <Rocket className="h-3 w-3" /> Share kit · V1
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            Everything you need to help RoadBoss spread.
          </h1>
          <p className="text-slate-300 mt-3 max-w-3xl">
            Copy any of the pre-written posts below. Paste on TikTok, Facebook, Reddit, LinkedIn, X,
            or text. Send your network to <span className="text-sky-300 font-semibold">{tryLink}</span> — they&apos;re inside
            the app in 3 seconds, no signup required.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={tryLink} target="_blank" rel="noreferrer">
              <Button data-testid="share-open-try" className="bg-sky-500 text-slate-950 hover:bg-sky-400">
                <Play className="h-4 w-4 mr-1.5" /> Open demo
              </Button>
            </a>
            <a href={deckLink} target="_blank" rel="noreferrer">
              <Button variant="outline" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/5">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Investor deck
              </Button>
            </a>
          </div>
        </div>

        {/* Quick links block */}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Live demo link', url: tryLink, tone: 'emerald', icon: Play, id: 'share-trylink' },
            { label: 'Pitch deck link', url: deckLink, tone: 'sky', icon: TrendingUp, id: 'share-decklink' },
            { label: 'Hashtag pack', url: hashtags, tone: 'violet', icon: Hash, id: 'share-hashtags' },
          ].map((l) => (
            <CopyBlock key={l.id} label={l.label} text={l.url} tone={l.tone} testId={l.id} />
          ))}
        </div>

        {/* Social captions */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <PenSquare className="h-5 w-5 text-sky-300" />
            <h2 className="text-xl font-bold text-white">Ready-to-paste captions</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <CopyBlock label="TikTok / Reels / Shorts caption" text={tiktokCaption} tone="sky"     testId="share-tiktok" />
            <CopyBlock label="Facebook group post"             text={facebookCaption} tone="emerald" testId="share-fb" />
            <CopyBlock label="Reddit (r/Truckers) post"        text={redditPost}     tone="amber"   testId="share-reddit" />
            <CopyBlock label="LinkedIn launch post"            text={linkedInPost}   tone="violet"  testId="share-linkedin" />
            <CopyBlock label="X / Twitter thread"              text={xThread}        tone="sky"     testId="share-x" />
            <CopyBlock label="Creator / influencer DM"         text={dmTemplate}     tone="rose"    testId="share-dm" />
          </div>
        </section>

        {/* Investor email */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-300" />
            <h2 className="text-xl font-bold text-white">Angel investor cold email</h2>
          </div>
          <CopyBlock label="Email body" text={angelEmail} tone="amber" testId="share-angel" />
        </section>

        {/* Fleet Owner B2B Outreach Kit */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-300" />
            <h2 className="text-xl font-bold text-white">Fleet owner outreach kit (B2B)</h2>
            <span className="text-xs text-slate-500 ml-2">Different playbook — LinkedIn, cold email, conferences, ROI math</span>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 mb-3">
            <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
              <Sparkles className="h-4 w-4" /> Your #1 weapon for fleet outreach
            </div>
            <p className="text-sm text-slate-200 mt-2">
              Send fleet owners to <a className="text-emerald-300 font-semibold" href="/roi" target="_blank" rel="noreferrer">roadboss.app/roi</a> — an
              interactive ROI calculator. They plug in their truck count and instantly see what they&apos;d save.
              Nothing converts a B2B prospect faster than seeing their own numbers.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <CopyBlock label="LinkedIn DM to a fleet owner" text={fleetLinkedInDM} tone="sky"     testId="share-fleet-linkedin" />
            <CopyBlock label="Cold email to Ops Director / CEO" text={fleetColdEmail} tone="emerald" testId="share-fleet-email" />
          </div>
          <CopyBlock label="Fleet industry channel hit-list (copy & keep)" text={fleetIndustryChannels} tone="violet" testId="share-fleet-channels" />
          <CopyBlock label="MATS conference launch plan" text={fleetConfPrep} tone="amber" testId="share-fleet-conf" />
        </section>

        {/* Video script */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-rose-300" />
            <h2 className="text-xl font-bold text-white">60-second animated video script</h2>
            <span className="text-xs text-slate-500 ml-2">No face needed · screen-record the /try demo</span>
          </div>
          <CopyBlock label="Video script + production steps" text={videoScript} tone="rose" testId="share-video-script" />
        </section>

        {/* Outlets */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-emerald-300" />
            <h2 className="text-xl font-bold text-white">Where to post — trucker community hit-list</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {outlets.map((o) => (
              <div key={o.k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-sm font-semibold text-white mb-2">{o.k}</div>
                <ul className="space-y-1">
                  {o.items.map((i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-slate-500" /> {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Founder contact block */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="h-5 w-5 text-sky-300" />
            <h2 className="text-xl font-bold text-white">Direct contact (for press / partnerships / investors)</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Founder</div>
              <div className="text-white font-medium">Mike Ward</div>
              <div className="text-slate-400 text-xs">Kokomo, Indiana</div>
            </div>
            <a href="mailto:mward5710@gmail.com" className="rounded-xl border border-white/10 p-3 hover:bg-white/5 transition block">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</div>
              <div className="text-sky-300 font-mono text-xs">mward5710@gmail.com</div>
            </a>
            <a href="tel:+17654808889" className="rounded-xl border border-white/10 p-3 hover:bg-white/5 transition block">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</div>
              <div className="text-emerald-300 font-mono text-xs">+1 (765) 480-8889</div>
            </a>
          </div>
        </section>

        {/* Video tools note */}
        <section className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Video className="h-5 w-5 text-sky-300" />
            <h2 className="text-lg font-bold text-white">Animated video shortcut (no filming, no face)</h2>
          </div>
          <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
            <li>Open <code className="text-sky-300">{tryLink}</code> on your phone. The animated demo auto-plays.</li>
            <li>Use your phone&apos;s built-in <strong>screen recorder</strong> (iPhone Control Center / Android notification shade).</li>
            <li>Record ~30 seconds of the animation.</li>
            <li>Open <strong>CapCut</strong> (free). Drop the clip in. Add text overlays using the video script above.</li>
            <li>Use CapCut&apos;s <strong>AI voiceover</strong> feature — pick a neutral narrator voice.</li>
            <li>Export vertical 1080×1920. Post to TikTok / Reels / Shorts.</li>
          </ol>
          <div className="mt-4 text-xs text-slate-400">
            Alternatives: HeyGen (AI avatar), Synthesia (AI avatar), Pictory (AI explainer), Canva video templates — all have free tiers.
          </div>
        </section>

        <BrandedFooter className="pt-10" />
      </main>
    </div>
  );
}
