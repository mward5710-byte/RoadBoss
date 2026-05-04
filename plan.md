# Highway Pilot (stealth) → RoadBoss — Master Plan

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward (mward5710-byte, Kokomo, IN).
> Tagline (locked from investor deck): **"One app. Every mile. Hands free."**
> Mission: eliminate the 4,000+ distracted-driving fatalities/yr involving commercial vehicles.

---

## Status: STAGE 3 — PHASE 3A COMPLETE ✅ / PHASE 3B v2(a) COMPLETE ✅ (ENTERING PHASE 3B v2(b) — RECEIPTS)
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
- Stage 3 Phase 2C.3 (Co-Pilot voice-to-SMS — hands-free dispatch comm): ✅ Done
- Stage 3 Phase 2G.1 (Driver Onboarding Tour): ✅ Done
- Stage 3 Phase 2G.2 (PWA Push Notifications): ✅ Done
- Stage 3 Phase 2G.3 (Admin Settings — Emergency Contacts CRUD): ✅ Done
- Stage 3 Phase 2G.4 (Mock Dashcam Feeds): ✅ Done
- Stage 3 Phase 2G.5 (Stripe → SendGrid + expanded payment methods): ✅ Done
- Stage 3 Phase 2H.1 (Investor Pitch Deck at /deck): ✅ Done
- Stage 3 Phase 2H.2 (iOS PWA polish + meta tags): ✅ Done
- Stage 3 Phase 2H.3 (Viral Launch Kit): ✅ Done
- **Stage 3 Phase 3A (Wreckerlogix Master Spec Doc): ✅ Done**
- **Stage 3 Phase 3B v1 (Wrecker Mode in RoadBoss — web/PWA cockpit): ✅ Done**
- **Stage 3 Phase 3B v2(a) (Wrecker Voice Intents via Co-Pilot actions): ✅ Done**
- Stage 4 / 5: Backlog (CB Talker network, native iOS shell, deeper dashcam adapters)

**External integration status notes (operational reality):**
- **Twilio toll-free verification submitted** (1–3 weeks typical). Until approved, sends to verified destinations work best; non-verified may be carrier-filtered.
- **Twilio inbound SMS webhook** works when Twilio Console “A MESSAGE COMES IN” points at our preview/prod URL; if the preview URL changes, it must be updated.
- **FuelCloud API**: access is **request-only** (help.fuelcloud.com). Manual logging is available now; API wiring begins after approval.

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

## Stage 3 — Integrations (active)

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
  - Persona: friendly trucker tone ("Hey boss", "Copy that", "Pulling that up now"). Replies <50 words, voice-optimized.
  - Safety rules baked into system prompt: NEVER tell driver to look at screen while driving; if drowsy/stressed/in trouble → safety advice first.
  - Live context injected each turn: driver name, duty status, HOS minutes remaining, active trip, vehicle, recent alerts.
  - Multi-turn: last 6 messages replayed via system prompt (history persisted in `copilot_chats` MongoDB collection).
  - Frontend: dedicated `/driver/copilot` full-screen page with mic orb, mute toggle, hands-free continuous mode, "Repeat" button.
  - Test result: 33/33 backend tests passed (100%).

### Phase 1.5 (DONE — May 3) ✅ — Co-Pilot ACTIONS + FMCSA DVIR
**Bug fix that prompted this phase**: Driver Home voice button transcribed but didn’t change duty status. Root cause: legacy brittle keyword matching. **Fix**: Co-Pilot AI + action execution.

**1. Co-Pilot ACTION EXECUTION**
  - Model emits `<<<ACTION:{json}>>>` markers.
  - Backend validates + executes whitelisted actions and returns spoken response.
  - Whitelisted actions: `duty_change`, `start_trip`, `end_trip`, `log_fuel`, `start_inspection`, `dispatch_roadside`, `send_sms`.
  - Driver Home rewired: calls `/api/copilot/chat`.
  - Legacy `/api/voice/command` kept for backward compatibility.

**2. FMCSA-compliant DVIR**
  - Template + lifecycle endpoints.
  - Defect → MaintenanceRecord + Alert.
  - Certify locks record.
  - Driver + admin UI shipped.
  - Test result: 64/64 backend tests passed (100%).

### Phase 1.6 (DONE — May 3) ✅ — Wake-Word "Hey Co-Pilot" + iframe-aware mic UX
- `useWakeWord` hook + `WakeWordBar` UI.
- iframe detection + mic guidance.

### Phase 2A (DONE — May 3) ✅ — Crash Detection + Roadside Assistance
- CrashGuardian + crash event admin dashboard.
- Roadside dispatch workflow.

### Phase 2B (DONE — May 3) ✅ — Mapbox Truck-Aware GPS
- Mapbox config endpoint + reusable Mapbox component.
- Fleet map + routing surfaces.

### Phase 2D (DONE — May 4) ✅ — Driver Home Surgery
- `useDriverShift` state machine for a single safe “primary action.”

### Phase 2E (DONE — May 4) ✅ — Investor-grade demo data seeding
- Robust seed datasets + `/api/seed?force=true`.

### Phase 2C.2 + 2C.3 (DONE — May 4) ✅ — Inbound SMS replies + Co-Pilot voice-to-SMS
- Bidirectional Twilio SMS.
- Co-Pilot `send_sms` action.
- `notification_logs` audit trail.

### Phase 2F.1 (DONE — May 4) ✅ — Server.py refactor: extract seed module
- Seed extracted to `/app/backend/seed_data.py`.

---

## Stage 3 — Phase 2G (DONE) — Adoption + Retention ✅
- Onboarding Tour
- Push Notifications
- Emergency Contacts CRUD
- Mock Dashcam Feeds
- Stripe receipts + expanded payment methods

---

## Stage 3 — Phase 2H (DONE) — Investor Demo + Growth Surfaces ✅
- `/deck`, `/try`, `/share-kit`, `/roi`, `/guide`

---

## Stage 3 — Phase 3 (ACTIVE) — Two-Front Battle Plan: Wreckerlogix + RoadBoss “Wrecker Mode”

### Phase 3A (DONE ✅) — Wreckerlogix Master Spec Doc (deliverable: `/app/memory/wreckerlogix_master_spec.md`)
**Goal:** ship Wreckerlogix (Flutter/Dart) to App Store ASAP while keeping RoadBoss as the “super-app” vision.

**Delivered:** `/app/memory/wreckerlogix_master_spec.md` (400+ lines), copy/paste ready for a new Emergent session. Includes:
- Repo audit + branch cleanup strategy
- CI/TestFlight workflow repair steps
- Towbook parity matrix + leapfrog plan
- Missing features roadmap: Motor Clubs, Impound, QuickBooks, e-sign, FuelCloud
- Picovoice Porcupine wake-word plan
- Apple privacy questionnaire draft answers + Info.plist permission strings
- App Store Connect metadata draft + screenshot list
- TestFlight → App Store push checklist

**Definition of done:** ✅ Complete.

**Next execution step (outside this repo):** Start a **new Emergent session** with the Flutter repo URL and paste the master spec doc as instructions.

### Phase 3B v1 (DONE ✅) — Wrecker Mode inside RoadBoss (web/PWA cockpit)
**Goal:** unify Mike’s scattered apps into one command center while still allowing a dedicated towing operator cockpit.

**Shipped (v1):**
- Backend module: `/app/backend/wrecker.py`
  - Models: TowJob, Impound, MotorClub, FuelTank, FuelTransaction
  - Endpoints under `/api/wrecker/*`:
    - Jobs: CRUD + status transitions + active dispatch
    - Impound: CRUD + release + **public lookup endpoint** `/api/wrecker/impounds/lookup`
    - Motor clubs: CRUD
    - Fuel tanks + transactions + FuelCloud integration status
    - Overview dashboard
  - Demo seed: 8+ tow jobs, 2 impounds, 6 motor clubs, 2 fuel tanks
  - Fixed impound storage fee calculation (timezone-aware)
- Auth:
  - New role: `wrecker_operator`
  - Demo login: `POST /api/auth/demo` with `role='wrecker'` → routes to `/wrecker`
- Frontend:
  - New pages under `/app/frontend/src/pages/wrecker/`:
    - `WreckerShell`, `WreckerDashboard`, `WreckerJobNew`, `WreckerJobDetail`, `WreckerImpound`, `WreckerMotorClubs`, `WreckerFuel`, `WreckerBilling`
  - Routing wired in `App.js` with role-gated access
  - Login redirect supports `wrecker_operator`
  - `/try` page includes **“🚛 Wrecker Mode”** demo button

**Testing:**
- All 7 endpoint groups return 200 (smoke-tested)
- Create job + advance status works
- Screenshots verified: Dispatch Board, Impound, Fuel

**Definition of done (v1):** ✅ Complete.

### Phase 3B v2(a) (DONE ✅) — Wrecker Voice Intents (Towbook-killer hands-free dispatch)
**Goal:** give tow operators the same “don’t touch the phone” superpower as RoadBoss drivers.

**Completed — Co-Pilot Buddy now natively supports `wrecker_operator` with full action set:**
- `tow_job_status` (en_route/on_scene/in_progress/completed/cancelled): updates operator’s active tow job
- `tow_job_next`: reads active job aloud (customer, vehicle, address, service type)
- `fuel_check`: reads tank levels aloud with percentages
- `impound_quick`: converts active job into an impound record

**Key engineering wins:**
- Added `_build_wrecker_context()` helper: fetches active tow job, fuel tanks, today’s completed/revenue
- Extended `_build_driver_context(..., wrecker_ctx=...)` so Claude gets LIVE wrecker context inside the system prompt
- Action results support `spoken_addendum` and backend appends it to the spoken reply so the AI reads real data aloud
- `/wrecker/voice` route reuses `Copilot.jsx` with role-aware back button (BOARD vs CAB)
- Toast feedback added for all 4 wrecker action types

**Smoke tests verified (production preview):**
- “What is my next call?” → reads job details aloud
- “Check fuel level” → reads tank levels aloud
- “Mark me in progress, hooking up now” → status advances to `in_progress`
- “Job complete, all done” → status → `completed` + `tow_job_completed` alert fired

**Definition of done:** ✅ Complete.

### Phase 3B v2(b) (NEXT) — SMS/Email receipts on job completion
**Goal:** turn job completion into immediate cashflow and clean books (no chasing receipts).

**Current state:**
- A `tow_job_completed` alert is fired on voice completion; Twilio/SendGrid infrastructure exists in `/app/backend/notifications.py`.

**Implementation steps (rev 1):**
1. **Receipt model + storage**
   - Create `tow_receipts` collection: `{id, job_id, customer_name, customer_phone/email, line_items, total, sent_via, sent_at, status}`
2. **Trigger rules**
   - Trigger on transition to `completed` (voice or UI)
   - Option A: auto-send if customer phone/email exists and setting enabled
   - Option B: UI prompt on Job Detail: “Send receipt” button
3. **Receipt formatting**
   - v1: SMS with summary + link to web receipt page (`/receipt/:id`)
   - v1.5: SendGrid HTML email with PDF attachment
4. **Audit logging**
   - Log to `notification_logs` with `event_type='tow_receipt'`
5. **Admin controls**
   - Wrecker Settings: default receipt channel (SMS/email), sender branding, opt-out

**Definition of done (v2b):**
- Completing a tow job can send an SMS/email receipt in one tap (or automatically per settings)
- Receipt send attempts are logged and visible in UI

### Phase 3B v2(c) (NEXT) — E-signature capture (optional but high value)
- Add signature capture UI on job completion and store `signature_url` on job.
- For RoadBoss web: implement HTML canvas signature pad.

### Phase 3B v2(d) (NEXT) — QuickBooks Online sync
- Map completed jobs → QuickBooks invoices.
- Track payment states.

### Phase 3B v2(e) (NEXT) — Customer/PD public lookup web page
- API already live: `/api/wrecker/impounds/lookup`
- Add frontend page: `/lookup` with rate limiting + basic abuse controls.

---

### Phase 2F.2+ (BACKLOG — refactor remaining modules incrementally)
Remaining bloat in `server.py` (priority order):
- routers/copilot.py
- routers/dvir.py
- routers/roadside.py
- routers/crash.py
- routers/stripe.py + routers/google_oauth.py

Refactor discipline: extract module, keep endpoints identical, re-run backend tests.

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
- Pricing: $29.99 Pro / $19.99 per-truck Fleet (matches Pitch Deck).
- AI persona: Co-Pilot Buddy (friendly trucker tone).
- AI model: Claude Sonnet 4.5 via Emergent universal key.
- Safety mandate: Never instruct a driver to interact with screen while driving.
- Investor deck source of truth: `/app/memory/pitch_deck.md`.

## Reference Files
- `/app/backend/server.py` — single-file API (large; incremental refactor backlog).
- `/app/backend/wrecker.py` — Wrecker Mode backend module (v1 shipped).
- `/app/backend/notifications.py` — Twilio + SendGrid wrapper + audit logging.
- `/app/backend/seed_data.py` — investor-grade demo seed.
- `/app/frontend/src/pages/wrecker/*` — Wrecker Mode UI.
- `/app/frontend/src/pages/driver/Copilot.jsx` — shared Co-Pilot voice UI (now supports `/wrecker/voice`).
- `/app/frontend/src/components/WakeWordBar.jsx` — wake word surface.
- `/app/frontend/src/components/CrashGuardian.jsx` — crash detection surface.
- `/app/memory/test_credentials.md` — demo accounts.
- `/app/test_reports/iteration_10.json` — push notifications.
- `/app/test_reports/iteration_11.json` — emergency contacts.
- `/app/test_reports/iteration_12.json` — Stripe webhooks.
- `/app/memory/wreckerlogix_master_spec.md` — Flutter rescue + App Store shipping plan.
