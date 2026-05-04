# Highway Pilot (stealth) → RoadBoss — Master Plan

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward (mward5710-byte, Kokomo, IN).
> Tagline (locked from investor deck): **"One app. Every mile. Hands free."**
> Mission: eliminate the 4,000+ distracted-driving fatalities/yr involving commercial vehicles.

---

## Status: STAGE 3 — PHASE 2C.3 COMPLETE ✅ (ENTERING PHASE 2G.1)
- Stage 1 (Foundation): ✅ Done
- Stage 2 (Workflows + Stripe + Google OAuth): ✅ Done
- Stage 3 Phase 1 (Pricing alignment + AI Copilot): ✅ Done
- Stage 3 Phase 1.5 (Co-Pilot action execution + FMCSA DVIR): ✅ Done
- Stage 3 Phase 1.6 (Wake-word + iframe-aware mic UX): ✅ Done
- Stage 3 Phase 2A (Crash Detection + Roadside Assistance): ✅ Done
- Stage 3 Phase 2B (Mapbox truck-aware GPS): ✅ Done
- Stage 3 Phase 2D (Driver Home Surgery — shift-flow state machine): ✅ Done
- Stage 3 Phase 2E (Investor-grade demo data seeding): ✅ Done
- Stage 3 Phase 2F.1 (Refactor: extract seed module): ✅ Done
- Stage 3 Phase 2C (Twilio SMS + SendGrid Email surface): ✅ Done
- Stage 3 Phase 2C.2 (Inbound SMS — driver replies → admin alert feed): ✅ Done
- **Stage 3 Phase 2C.3 (Co-Pilot voice-to-SMS — hands-free dispatch comm): ✅ Done** ← latest shipped
- **Stage 3 Phase 2G.1 (Driver Onboarding Tour): ✅ Done** ← 6-step framer-motion overlay, auto-first-visit, Replay in Settings
- **Stage 3 Phase 2G.2 (PWA Push Notifications): ✅ Done** ← VAPID + SW + subscribe/test/unsubscribe + wired into crash/roadside/dispatch (40/41 tests, 98%)
- **Stage 3 Phase 2G.3 (Admin Settings — Emergency Contacts CRUD): ✅ Done** ← `/app/settings`, DB-backed contacts with env fallback (31/31 tests, 100%)
- **Stage 3 Phase 2G.4 (Mock Dashcam API Adapters): 🔜 Next**
- Stage 4 / 5: Backlog (CB Talker network, native iOS shell, deeper dashcam adapters)

**External integration status notes (operational reality):**
- **Twilio toll-free verification submitted** (1–3 weeks typical). Until approved, sends to verified destinations work best; non-verified may be carrier-filtered.
- **Twilio inbound SMS webhook** works when Twilio Console “A MESSAGE COMES IN” points at our preview/prod URL; if the preview URL changes, it must be updated.

---

## Stage 1 — Foundation (DONE)
- Marketing site at `/` (hero, roadmap, waitlist).
- Login + 4 roles (driver / fleet_admin / dispatcher / super_admin) with JWT + bcrypt.
- Fleet Command Center at `/app` (Overview, Drivers, Vehicles, Trips, Maintenance, Alerts, Dashcam, Waitlist Admin, Profile).
- Driver PWA at `/driver` (Home with HOS, voice command, trip card, alerts; tabs for Trips, Truck, Settings).
- Auto-seeded demo data on startup.
- Test result: Backend 26/26 ✅. Frontend E2E ✅.

## Stage 2 — Trucker Core Workflows (DONE)
- HOS duty status changes wired (UI button + voice → `/api/hos`).
- Trip lifecycle (start → active → end with mileage capture).
- IFTA state-by-state mileage breakdown + CSV/PDF exports.
- Maintenance: reminders surfaced on driver PWA.
- Voice command expansion (intent matching for HOS, trip, alerts, duty, fuel).
- **Stripe subscriptions** wired with test keys (lazy product creation, billing portal, webhook).
- **Google OAuth** login wired (`/api/auth/google`, callback, JWT issuance).
- Test result: Backend 32/32 ✅, Frontend E2E ✅ across 3 iterations.

---

## Stage 3 — Integrations (in progress)

### Phase 1 (DONE — May 3) ✅
**1. Stripe pricing realigned to investor Pitch Deck** — locked-in tiers:
  - **Free** $0 — TTS messaging, basic GPS, voice demo (no Stripe).
  - **Pro** $29.99/mo — Solo owner-operator, all driver features.
  - **Fleet** $19.99/truck/mo — per-seat pricing with adjustable quantity at Stripe checkout.
  - **Enterprise** Custom — `mailto` to sales (no Stripe).
  - Old plan keys (`owner_op`, `small_fleet`, `mid_fleet`) replaced with `pro` and `fleet`.
  - Drivers can no longer self-subscribe (403) — only fleet_admin / super_admin can.
  - Pricing.jsx UI rebuilt: 4-tier grid, deck tagline ("ONE APP · EVERY MILE · HANDS FREE"), live truck count → monthly estimate calculator, "MOST POPULAR" badge on Pro.

**2. AI Copilot — "Co-Pilot Buddy" (RoadBoss flagship voice feature)**
  - Backend: `/api/copilot/chat`, `/api/copilot/history`, `/api/copilot/reset`, `/api/copilot/status`.
  - Model: **Anthropic Claude Sonnet 4.5** via Emergent Universal LLM Key (`emergentintegrations` lib).
  - Persona: friendly trucker tone ("Hey boss", "Copy that", "Pulling that up now"). Replies <50 words, voice-optimized (no markdown, plain spoken English, numbers spoken naturally).
  - Safety rules baked into system prompt: NEVER tell driver to look at screen while driving; if drowsy/stressed/in trouble → safety advice first.
  - Live context injected each turn: driver name, duty status, HOS minutes remaining, active trip, vehicle, recent alerts.
  - Multi-turn: last 6 messages replayed via system prompt (history persisted in `copilot_chats` MongoDB collection).
  - Frontend: dedicated `/driver/copilot` full-screen page with mic orb, mute toggle, hands-free continuous mode, "Repeat" button on every reply.
  - Test result: 33/33 backend tests passed (100%).

### Phase 1.5 (DONE — May 3) ✅ — Co-Pilot ACTIONS + FMCSA DVIR
**Bug fix that prompted this phase**: Founder reported the Driver Home voice button transcribed correctly but never actually changed duty status. Root cause: old `/voice/command` endpoint used brittle keyword matching. **Fix**: replaced with Co-Pilot AI + action execution layer.

**1. Co-Pilot ACTION EXECUTION** — the AI now performs real side-effects, not just talks
  - System prompt extended to instruct the model to emit `<<<ACTION:{json}>>>` markers when the driver clearly requests an action.
  - Backend parser strips the marker, validates the JSON, executes the whitelisted action via existing helpers, and returns a clean spoken reply + action result.
  - Whitelisted actions: `duty_change` (driving / on_duty / off_duty / sleeper), `start_trip`, `end_trip`, `log_fuel`, `start_inspection` (pre_trip / post_trip).
  - For `start_inspection`, returns a redirect URL so the frontend auto-navigates to the inspection page.
  - Driver Home voice button rewired: now calls `/api/copilot/chat` instead of legacy `/api/voice/command`. Toast feedback + state refresh on every executed action.
  - Old `/api/voice/command` kept for backward-compatibility (regression coverage maintained).

**2. FMCSA-compliant DVIR (Driver Vehicle Inspection Reports)** — required by 49 CFR § 396.11/396.13
  - Standard 27-item template: 18 tractor items + 9 trailer items.
  - Backend endpoints: `GET /api/inspections/template`, `GET /api/inspections`, `POST /api/inspections`, `GET /api/inspections/{id}`, `PUT /api/inspections/{id}/item`, `POST /api/inspections/{id}/certify`.
  - Defect → auto-creates a MaintenanceRecord + Alert for the fleet admin.
  - Certify requires a typed signature; locks the record from further edits.
  - Driver frontend: `/driver/inspection/:id` with voice walkthrough mode + tap mode.
  - Admin frontend: inspections list + detail review pages.
  - Test result: **64/64 backend tests passed (100%)**.

### Phase 1.6 (DONE — May 3) ✅ — Wake-Word "Hey Co-Pilot" + iframe-aware mic UX
- `useWakeWord` hook + `WakeWordBar` UI with 4 wake-phrase presets; prefs in `localStorage` (`roadboss.wakeword.v1`).
- iframe detection + actionable guidance for mic-blocked preview environments.

### Phase 2A (DONE — May 3) ✅ — Crash Detection + Roadside Assistance
- CrashGuardian (DeviceMotion crash detection) + backend crash events + admin crash dashboard.
- Roadside dispatch workflow with provider directory + lifecycle + Co-Pilot action.

### Phase 2B (DONE — May 3) ✅ — Mapbox Truck-Aware GPS
- Mapbox config endpoint + reusable Mapbox component.
- Fleet map, driver trip detail routing, roadside detail location pin.

### Phase 2D (DONE — May 4) ✅ — Driver Home Surgery (shift-flow state machine)
- `useDriverShift` models driver day into 6 states; DriverHome renders a single primary action card to reduce distraction.

### Phase 2E (DONE — May 4) ✅ — Investor-grade demo data seeding
- Robust multi-driver seed data (trips, HOS, DVIRs, crash events, roadside dispatches, maintenance, alerts, dashcam events).
- `/api/seed?force=true` to wipe and reseed without restart.

### Phase 2C.2 + 2C.3 (DONE — May 4) ✅ — Inbound SMS replies + Co-Pilot voice-to-SMS
- Bidirectional Twilio SMS: inbound webhook → admin notifications UI.
- Co-Pilot `send_sms` action: driver voice → real SMS to dispatch/admin.
- Centralized `/app/backend/notifications.py` wrapping Twilio + SendGrid with audit logging to `notification_logs`.

### Phase 2F.1 (DONE — May 4) ✅ — Server.py refactor: extract seed module
- Seed data extracted to `/app/backend/seed_data.py` with dependency injection.
- `server.py` reduced by ~18% with zero behavior change.

---

## Stage 3 — Phase 2G (NEW) — Adoption + Retention + “First 60 seconds” polish
**Why Phase 2G exists:** we have a feature-complete voice-first driver command center. The next growth lever is **adoption**: a new driver must succeed hands-free inside the first minute.

### Phase 2G.1 (NEXT) — Driver Onboarding Tour (P1)
**Goal:** first-run driver experience that teaches the 6 core concepts fast, safely, and without reading a manual.

**UX spec (locked):**
- Framer-motion **modal overlay** with **6 crisp steps**:
  1. **Welcome** — “RoadBoss is your hands-free command center.”
  2. **Co-Pilot** — press mic / talk naturally; Co-Pilot executes actions.
  3. **Wake Word** — “Hey Co-Pilot” (and presets); how arming works.
  4. **Shift Flow** — one primary card; “What do I do next?”
  5. **Crash Shield** — CrashGuardian + SOS; what happens if you don’t respond.
  6. **Ready** — quick “Try it now” suggestions.
- Auto-show on **first driver visit** using a `localStorage` flag.
- Add **“Replay Tour”** entry in **DriverSettings**.
- Mount inside **DriverShell** so it overlays all driver pages.

**Implementation plan:**
1. **Frontend component**
   - Create `DriverOnboardingTour.jsx` (likely `/app/frontend/src/components/DriverOnboardingTour.jsx`).
   - Use `framer-motion` (`AnimatePresence` + `motion.div`) for fade/slide transitions.
   - Overlay pattern:
     - Full-screen dim backdrop with high z-index above bottom nav.
     - Center card with: step title, 1–2 sentences, icon, progress dots (6), Back/Next buttons, Skip.
     - Accessibility: focus trap-ish behavior (at minimum: close on Escape, disable background scroll).
2. **Persistence**
   - `localStorage` key: `roadboss.driver_tour_seen.v1`.
   - Auto-open if key not present.
   - Set the key on: Skip, Finish.
3. **Mount in DriverShell**
   - Render `<DriverOnboardingTour />` at shell level so it overlays Home/Trips/Truck/Settings.
   - Ensure overlay doesn’t break WakeWordBar / CrashGuardian (they can remain mounted behind it).
4. **DriverSettings: Replay Tour**
   - Add row button: “Replay onboarding tour”.
   - Behavior: clears the seen flag OR calls a global event to open the tour without clearing.
5. **Copy + tone (voice-first)**
   - Keep each step under ~120 characters for quick scanning.
   - No “tap this tiny button” language; instruct voice-first usage.
6. **Testing**
   - Frontend smoke test:
     - First load of `/driver` shows tour.
     - Next navigation does not show tour.
     - Replay Tour triggers it.
     - Tour overlays and blocks background taps.

**Definition of done:**
- First-time driver sees tour once.
- Existing drivers are not interrupted.
- Replay works.
- No regressions to wake-word and crash guardian.

### Phase 2G.2 (UPCOMING) — PWA Push Notifications (P1)
**Goal:** complement SMS with **free** push for crash + dispatch events.

High-level plan (implementation details to be finalized when we start):
- Add service worker push support (VAPID keys) for web push.
- Permission prompt gating (only after onboarding / in Settings).
- Event triggers:
  - Crash confirmed
  - Dispatch SMS sent / inbound reply
  - Roadside dispatch created / status changes
- UI: Settings page toggle + “Send test push”.
- Note: iOS web push requires iOS 16.4+ installed PWA; handle capability checks.

### Phase 2G.3 (UPCOMING) — Admin Settings UI for Crash Contact Phones (P2)
**Goal:** remove `.env` hardcoding for `NOTIFY_CRASH_CONTACTS` and make it fleet-configurable.

Plan:
- Add admin Settings page with CRUD for emergency contacts:
  - name, phone (E.164 normalization), channels (sms/push/email later)
- Backend: new collection (e.g., `fleet_settings` or `emergency_contacts`) keyed by fleet.
- Crash alert pipeline reads from DB first, then falls back to env.

### Phase 2G.4 (UPCOMING) — Mock Dashcam API Adapters (P3)
**Goal:** investor/demo polish: dashcam tab shows realistic “live” streams from Samsara/Lytx/Verizon (mocked).

Plan:
- Create adapter interfaces and simulated event generators.
- Admin dashcam page displays vendor filter, severity, and event detail.
- Later swap mocks for real vendor APIs.

### Phase 2G.5 (UPCOMING) — Stripe → SendGrid Real Receipt Emails (P3)
**Goal:** branded receipts and subscription emails sent via SendGrid triggered by Stripe webhooks.

Plan:
- Stripe webhook handler:
  - `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`
- Build SendGrid templates for receipts and dunning.
- Log to `notification_logs` with `event_type=stripe_receipt_*`.

---

### Phase 2F.2+ (BACKLOG — refactor remaining modules incrementally)
Remaining bloat in `server.py` (in priority order for future extraction):
- **routers/copilot.py** — system prompt + chat endpoints + action parser.
- **routers/dvir.py** — DVIR templates + lifecycle endpoints.
- **routers/roadside.py** — providers + dispatch lifecycle.
- **routers/crash.py** — smaller footprint.
- **routers/stripe.py** + **routers/google_oauth.py** — stable; keep until needed.

**Refactoring discipline:** Each extraction follows the same pattern as 2F.1 (own module file, dependency injection, thin server.py wrappers, zero behavior change verified by re-running backend tests).

---

## Stage 4 — Differentiators (backlog)
1. CB Talker network — geo-aware WebRTC voice rooms.
2. Crash event ingestion API for future native iOS app.
3. Fleet billing + white-label.

## Stage 5 — Investor / Beta Ready (backlog)
1. Investor portal with metrics dashboard.
2. Beta tester onboarding flow.
3. Public demo URL with seeded data.
4. Pitch Deck UI rebuild (Reveal.js + PDF export based on `/app/memory/pitch_deck.md`).

## Stage 6 — Outside Emergent (founder will hand off)
1. Hire iOS native contractor (AVSpeechSynthesizer / SFSpeechRecognizer / Siri Shortcuts / Core Motion crash / Bluetooth OBD-II).
2. FMCSA ELD certification process.

---

## Brand Notes
- Stealth = "Highway Pilot" (chrome hex shield + glowing blue eye dot).
- Public launch = "RoadBoss" (chrome split-truck/robot Optimus logo).
- Color system: deep charcoal cockpit (`#07090d`), chrome (`#c8d0d8`), electric blue (`#38bdf8`), amber warnings, red criticals.
- Tone: blue-collar founder voice — plainspoken, respectful, confident. No corporate jargon.

## Tech
- Backend: FastAPI + Motor (async Mongo) + JWT (bcrypt) + Stripe + httpx + emergentintegrations (Claude Sonnet 4.5).
- Frontend: React 19 + react-router 7 + Tailwind + shadcn/ui + Framer Motion + Sonner + Web Speech API (STT/TTS).
- Map: Mapbox GL JS.
- Notifications: Twilio SMS + SendGrid Email + `notification_logs` audit trail.

## Decisions Locked (do not change without Mike's OK)
- **Pricing**: $29.99 Pro / $19.99 per-truck Fleet (matches Pitch Deck).
- **AI persona**: Co-Pilot Buddy (friendly trucker tone). Picked by Mike.
- **AI model**: Claude Sonnet 4.5 via Emergent universal key.
- **Safety mandate**: Never instruct a driver to interact with screen while driving — voice-first always.
- **Investor deck source of truth**: `/app/memory/pitch_deck.md`.

## Reference Files
- `/app/backend/server.py` — single-file API (large; incremental refactor backlog).
- `/app/backend/notifications.py` — Twilio + SendGrid wrapper + audit logging.
- `/app/backend/seed_data.py` — investor-grade demo seed.
- `/app/frontend/src/pages/driver/DriverShell.jsx` — shell; where tour overlay will mount.
- `/app/frontend/src/pages/driver/DriverSettings.jsx` — will add “Replay Tour”.
- `/app/frontend/src/components/WakeWordBar.jsx` — wake word surface.
- `/app/frontend/src/components/CrashGuardian.jsx` — crash detection surface.
- `/app/memory/test_credentials.md` — demo accounts.
- `/app/test_reports/iteration_7.json` — seed data test report.
- `/app/test_reports/iteration_8.json` — Twilio/SendGrid integration test report.
- `/app/test_reports/iteration_9.json` — inbound SMS + voice-to-SMS test report.
