# 🚛 RoadBoss / Highway Pilot — Mike's Action Item List

**Last updated:** May 4, 2026
**Maintained by:** Neo (Technical Co-Founder)
**For:** Mike Ward, Founder

---

## 🔥 What I (Neo/Emergent) Have Already Built

✅ Full working MVP — Driver app + Admin dashboard + Marketing site + Pricing + Investor Pitch Deck
✅ Voice-first AI Co-Pilot (Claude Sonnet 4.5)
✅ FMCSA DVIR (49 CFR § 396.11/.13 compliant)
✅ Crash detection with auto-SMS + push to emergency contacts
✅ Mapbox truck-aware GPS + route tracking
✅ Stripe subscriptions (Card + Apple Pay + Google Pay + Cash App Pay + Stripe Link + ACH)
✅ Google OAuth + JWT + role-based access
✅ Twilio SMS (outbound + inbound webhook + voice-to-SMS from Co-Pilot)
✅ SendGrid branded emails (receipts, dunning, cancellation, DVIR copies, password resets)
✅ PWA Web Push notifications (VAPID)
✅ Emergency contacts CRUD UI (`/app/settings`)
✅ Unified dashcam feed (Samsara/Lytx/Verizon/Native) with simulate-live demo button
✅ Driver onboarding tour (replayable from Settings)
✅ Investor Pitch Deck at `/deck` (12 slides, print-to-PDF, fullscreen)
✅ 7 test accounts seeded with 72 dashcam events, 14 days of demo trips, HOS, DVIRs, crash events

---

## 📋 Mike's Checklist — What YOU Need to Do Outside of the App

### 🧭 Legal & Entity (Do This First)

- [ ] **File a DBA for "RoadBoss" (and/or "Highway Pilot") under Apex Epoxy Flooring LLC.**
  - Indiana DBA = "Assumed Business Name" filing with the Indiana Secretary of State.
  - Cost: ~$20–30. Takes 1–3 business days online: https://inbiz.in.gov
  - Once filed, you can legally take payments, sign contracts, and open a business bank account as RoadBoss.

- [ ] **Open a dedicated business bank account for RoadBoss**
  - Either a sub-account under Apex Epoxy's bank or a separate checking at Chase/Mercury/Bluevine
  - Why: clean bookkeeping = investors / tax-time sanity

- [ ] **Get an EIN** (if Apex Epoxy's EIN can't be reused for the DBA)
  - Free from IRS: https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online

- [ ] **Trademark search for "RoadBoss" and "Highway Pilot"**
  - Free check: https://tmsearch.uspto.gov
  - If both are clean, file trademark applications (~$250 per mark via USPTO TEAS Plus)
  - Optional but smart before investor conversations

---

### 💳 Stripe (App Payment Setup — 90% Done)

- [ ] **Activate Cash App Pay in your Stripe Dashboard**
  - Go to Dashboard → Settings → Payment methods → enable Cash App Pay
  - Already wired in code — just needs the toggle flipped in your account

- [ ] **Activate ACH Direct Debit in Stripe** (for Fleet accounts paying 10+ trucks)
  - Dashboard → Settings → Payment methods → enable US Bank Account
  - Already wired in code

- [ ] **(Optional) Switch to production Stripe keys** when you're ready to take real money
  - You've been running test keys. To flip live:
    1. Get your live secret key from Stripe Dashboard
    2. Update `STRIPE_SECRET_KEY` in `/app/backend/.env`
    3. Update `STRIPE_WEBHOOK_SECRET` after registering your production webhook endpoint at Stripe → Developers → Webhooks → Add endpoint → URL: `https://<yourdomain>/api/stripe/webhook` → events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`, `checkout.session.completed`
    4. Restart backend

- [ ] **Configure Stripe Tax** for accurate sales-tax handling (optional — Stripe Atlas can help)

---

### 📱 Twilio (SMS — Already Live)

- [x] ✅ Toll-Free Verification submitted — wait 1–3 weeks for approval
- [ ] **Once approved**, you can text ANY US number, not just verified ones. No code change needed.
- [ ] **If preview URL changes**, update Twilio console webhook:
  - Phone Numbers → Your TF number → "A MESSAGE COMES IN" → Webhook: `<your-url>/api/webhooks/twilio/sms-inbound`

---

### 📧 SendGrid (Email — Already Live)

- [ ] **Authenticate your sending domain** (if you have a real domain like roadboss.app)
  - SendGrid → Sender Authentication → Authenticate Your Domain
  - Adds SPF + DKIM + DMARC records to your DNS
  - Reduces spam-folder risk
- [ ] **Upgrade SendGrid plan** when you pass 100 emails/day (free tier limit)

---

### 🌐 Domain & Hosting (Do This Before Real Launch)

- [ ] **Buy the domain** `roadboss.app` or `highwaypilot.app` (Namecheap, ~$15–20/yr)
- [ ] **Deploy to production** — when ready, use Emergent's built-in deploy or hand-off to a real hosting provider (Vercel/Railway/Render)
- [ ] **Set up email** on your domain (Google Workspace, $6/user/mo) → `mike@roadboss.app`
- [ ] **Point DNS** to production + add SSL (auto via Vercel/Railway)

---

### 🗺 Mapbox

- [ ] Already configured. Just monitor usage at https://account.mapbox.com → Statistics. Free tier covers ~50K map loads/month. Upgrade to a paid plan when you pass that.

---

### 🤖 Emergent LLM Key (Anthropic Claude)

- [ ] Monitor balance at Profile → Universal Key → Add Balance (or configure auto-top-up)
- [ ] Claude Sonnet 4.5 is the current Co-Pilot model. If you want to swap: tell me, I'll change it.

---

### 📲 PWA / iOS Native

**Current state:** The app is a fully installable PWA. Users can "Add to Home Screen" on iPhone and Android. Push works on Android + iOS 16.4+.

- [ ] **(Optional) Real app icons** — right now we use the Emergent favicon. Commission a designer (or use Figma AI) to make:
  - 192×192 and 512×512 icon PNGs
  - Apple touch icons (180×180)
  - Splash screens for iOS
  - Cost: $50–200 on Fiverr or AI-generate in Figma for free
- [ ] **(Future) Native iOS app** — required for App Store listing. Plan `$275K engineering` budget line on slide 9 covers contracting a Swift engineer for this. I can't build it — it has to be Xcode.

---

### 📢 Go-To-Market

- [ ] **Buy your founder domain** and set up the roadboss.app → `https://<preview-url>` redirect
- [ ] **Seed the waitlist** with real drivers you know from your network (friends in trucking)
- [ ] **Post on:**
  - Reddit: r/Truckers, r/truckdrivers, r/FirstTruck
  - Facebook groups: "Truckers of America", "Women In Trucking"
  - Truck-stop bulletin boards (literally — printable one-pager with QR code to waitlist)
- [ ] **Podcast outreach**: "Over The Road" podcast, "Trucking & Logistics" podcast — offer to come on as a driver-turned-founder
- [ ] **X/Twitter thread**: "I'm a real trucker. I built an app so I don't have to look at my phone. Here's why."

---

### 💰 Fundraising Prep

- [ ] **Send the pitch deck link** (`/deck`) to at least 10 angel investors in your network
- [ ] **Apply to accelerators:**
  - Y Combinator (next batch: check ycombinator.com/apply)
  - Techstars (there's a Techstars Mobility in Detroit — perfect fit)
  - Indiana-focused: Elevate Ventures, High Alpha Capital
- [ ] **File an 83(b) election** when you form the legal structure for the RoadBoss equity (only matters if you end up forming a C-Corp with co-founders)
- [ ] **Find a startup-friendly lawyer** for SAFE agreements / convertible notes (Cooley GO templates are free at cooleygo.com)

---

### 🧪 Real-World Testing Before Launch

- [ ] **Put the app on YOUR phone** and drive around for a week
- [ ] **Add your actual emergency contacts** via `/app/settings`
- [ ] **Enable push notifications** on `/app/settings` (admin side) and `/driver` → Settings (driver side)
- [ ] **Do a real DVIR on your truck** in the app — verify the signature flow
- [ ] **Trigger crash detection** (carefully — shake the phone with the tab open to simulate)
- [ ] **Do a dispatch SMS** as admin, verify it arrives on driver's phone

---

## 🗓 Roadmap — What I'll Build Next Session

These are queued, ready to go when you are:

- **P1**: CB Talker Network (geo-aware WebRTC voice rooms) — the differentiator
- **P1**: Real app icons + iOS splash screens (you supply, I wire)
- **P1**: PayPal/Venmo integration (if revenue feedback demands it)
- **P2**: `server.py` refactor into modular routers
- **P2**: Real Samsara/Lytx API adapters (when you have a pilot fleet customer with vendor access)
- **P3**: Enterprise white-label mode
- **P3**: Analytics dashboard for the founder (MRR, churn, engagement)

---

## 🧰 Test Accounts (so you don't forget)

All passwords: `HighwayPilot2026!`

| Role | Email |
|------|-------|
| Super Admin | super_admin@highwaypilot.io |
| Fleet Admin | fleet_admin@highwaypilot.io |
| Driver (Mike) | driver@highwaypilot.io |
| Driver (Marcus) | marcus@highwaypilot.io |
| Driver (Aaliyah) | aaliyah@highwaypilot.io |
| Driver (Tyler) | tyler@highwaypilot.io |
| Driver (Rosa) | rosa@highwaypilot.io |

---

## 📞 Support / Dev Handoff Notes

If you hire a CTO or a contractor to take over the code:

- **Backend**: FastAPI + MongoDB + UUIDs everywhere, /app/backend/server.py is the main file
- **Frontend**: React + Tailwind + Shadcn/UI, /app/frontend/src
- **Env**: Never modify `MONGO_URL` or `REACT_APP_BACKEND_URL` — they're k8s-wired
- **Tests**: /app/test_reports/iteration_*.json contains history of automated test runs
- **Plan**: /app/plan.md is the always-current strategic roadmap
- **Deck**: /app/memory/pitch_deck.md is the source of truth for all investor copy

**IMPORTANT**: `/app/backend/.env` contains real API keys — Stripe, Google OAuth, Mapbox, Twilio, SendGrid, VAPID. Treat like a password vault. Never commit to public git.

---

**You've got this, Mike. The product is real. The pitch is sharp. Now go get it funded and launched.** 🚛💨

— Neo
