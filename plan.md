# Highway Pilot (stealth) → RoadBoss — Master Plan

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward (mward5710-byte, Kokomo, IN).
> Tagline (locked from investor deck): **"One app. Every mile. Hands free."**
> Mission: eliminate the 4,000+ distracted-driving fatalities/yr involving commercial vehicles.

---

## Status: STAGE 3 — PHASE 2C.3 COMPLETE ✅
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
- **Stage 3 Phase 2C.3 (Co-Pilot voice-to-SMS — hands-free dispatch comm): ✅ Done** ← latest
- Stage 4 / 5: Backlog (CB Talker network, dashcam adapters, native iOS shell, push notifications)

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
  - Standard 27-item template: 18 tractor items (service brakes, parking brake, steering, lights, tires, wheels, mirrors, windshield/wipers, horn, coupling/fifth wheel, fluid leaks, fluid levels, air brakes, suspension, exhaust, frame/body/doors, emergency equipment, seat belt) + 9 trailer items (brakes, lights, tires, wheels, coupling, doors, frame/body, suspension, load securement).
  - Backend endpoints: `GET /api/inspections/template`, `GET /api/inspections` (role-scoped — drivers see only their own), `POST /api/inspections`, `GET /api/inspections/{id}`, `PUT /api/inspections/{id}/item`, `POST /api/inspections/{id}/certify`.
  - Defect → auto-creates a MaintenanceRecord (`DVIR Defect: <item>`) AND an Alert for the fleet admin.
  - Certify requires a typed signature; locks the record from further edits.
  - Driver frontend: full-screen `/driver/inspection/:id` page with:
    - **Voice walkthrough mode** (default) — Co-Pilot speaks each item ("Service brakes — say good, defect, or skip"), STT listens, parser maps free-form speech ("yep, looks good" → pass; "tire's busted" → defect; etc.), defect path asks for description and records it, advances automatically.
    - **Tap mode** (toggle) — traditional checklist with Good / Defect / N/A buttons.
    - Section grouping (Tractor / Trailer), live progress bar, current-item highlight, defect modal for typed notes.
    - Certify-and-sign modal with FMCSA disclaimer and typed-signature input.
  - Driver Home: new "DVIR Inspections" card with Pre-Trip + Post-Trip launch buttons + voice hint.
  - Co-Pilot integration: saying "Hey, start my pre-trip" creates the inspection AND auto-navigates the driver to the walkthrough — fully hands-free.
  - Admin frontend: `/app/inspections` list page with stats (total, certified, defects), filters (type / status / search), table view + `/app/inspections/:id` detail page with full item-by-item review and signature.
  - Test result: **64/64 backend tests passed (100%)** — including 31 new tests for actions + DVIR.

### Phase 1.6 (DONE — May 3) ✅ — Wake-Word "Hey Co-Pilot" + iframe-aware mic UX
**Bug investigated**: Founder reported that even after Phase 1.5, tapping the mic in the Emergent preview showed "Could not capture audio". Root cause: **iOS Safari blocks microphone access inside cross-origin iframes** — this is the Emergent preview wrapper's security sandbox, NOT a code bug. App works fine in a standalone Safari/Chrome tab.

**1. Wake-Word Listener (browser-based "Hey Co-Pilot")**
  - `useWakeWord` React hook (`/app/frontend/src/hooks/useWakeWord.js`):
    - Continuous SpeechRecognition with auto-restart on `onend` (browsers tend to auto-stop after silence)
    - Watches interim + final transcripts for any of the configured wake phrases
    - When wake phrase + command in same breath → fires command immediately
    - When wake phrase alone → "armed" state, captures next utterance as command
    - Cooldown to avoid double-fires
    - Honest about limitations: requires page open & unlocked; iOS suspends mic ~30s after screen lock (true 24/7 wake word needs the Stage 6 native iOS shell)
  - `WakeWordBar` component (`/app/frontend/src/components/WakeWordBar.jsx`):
    - Floating pill above the bottom nav, always visible while in driver pages
    - Three states: off / listening for wake word / armed (waiting for command)
    - Settings popover with 4 wake-phrase presets: **"Hey Co-Pilot"** (default), **"Highway Pilot"**, **"Hey Boss"**, **"Hey RoadBoss"**
    - Preference persisted to `localStorage` under `roadboss.wakeword.v1`
    - WebAudio chime + voice spoken reply when wake word fires
    - Routes detected commands through `/api/copilot/chat` → executes actions exactly like a tap
  - Mounted at `DriverShell` so wake word survives navigation across all driver pages.

**2. iframe-aware mic error UX**
  - `isInIframe()` helper exported from the wake-word hook
  - Driver Home + Co-Pilot voice buttons now detect iframe context BEFORE attempting mic access; show actionable toast: *"Mic blocked in preview. Open in real Safari tab"* with one-tap "Open" button (`window.open(href, '_blank')`)
  - Co-Pilot page also shows a persistent amber banner at top when in iframe
  - Wake-Word settings modal includes the same warning + "Open in a new tab" button
  - Error codes (`not-allowed`, `service-not-allowed`, `audio-capture`) get distinct, helpful toast messages

### Phase 2 (NEXT — pending Mike's approval and any required keys)
- **Mapbox** — truck-restriction routing (height/weight/hazmat). Needs free Mapbox token (founder).
- **Twilio** — SMS dispatch alerts. Needs Account SID / Auth Token / from-number.
- **SendGrid** — transactional email (password resets, billing receipts, fleet invitations). Needs API key.
- **Samsara / Lytx / Verizon Connect** — dashcam adapters (mock interfaces ready to swap to real APIs).
- **QuickBooks Online** — OAuth flow for IFTA mileage export. Needs Intuit dev keys.

### Phase 2A (DONE — May 3) ✅ — Crash Detection + Roadside Assistance
**1. Crash Detection & Auto-Alert** (the OnStar-for-every-truck promise from Slide 3)
  - Backend: `POST /api/crash-events`, `GET /api/crash-events`, `PUT /api/crash-events/{id}/status` (admin-only)
  - When `confirmed=true`, auto-creates a critical alert in the alerts feed for fleet admin
  - Driver-scoped reads (drivers see only their own); admin endpoints require fleet_admin / dispatcher / super_admin
  - Frontend: `CrashGuardian` component mounted at DriverShell — runs across ALL driver pages
    - Listens to `DeviceMotionEvent` (browser accelerometer) — flags impacts above 3.5g threshold
    - When triggered, shows full-screen blocking modal with 15-second "I'm OK" countdown + alarm tone + Co-Pilot voice prompt
    - If driver doesn't respond → captures geolocation, files confirmed crash event with severity
    - Manual SOS triangle button (visible whenever Guardian is armed)
    - Permission flow handles iOS 13+ explicit `DeviceMotionEvent.requestPermission()` requirement
    - Preference persisted in `localStorage` so it auto-rearms on page reload
    - Floating "Guardian: ON/OFF" pill in bottom-right corner so driver always knows status
  - Admin: `/app/crash-events` page polls every 12 seconds, shows unack counter prominently, action buttons (Acknowledge / Resolve / Dismiss), Google Maps link from saved coordinates

**2. Roadside Assistance** (one-tap breakdown help from Slide 3)
  - Backend models: `RoadsideProviders` (vetted directory) + `RoadsideDispatch` (lifecycle: requested → confirmed → en_route → arrived → completed/cancelled)
  - Endpoints: `GET /api/roadside/providers` (with `?service_type=` filter), `POST /api/roadside/dispatch` (auto-picks fastest provider for service if not specified), `GET /api/roadside/dispatch` (driver-scoped), `GET /api/roadside/dispatch/{id}`, `PUT /api/roadside/dispatch/{id}/status` (drivers can only cancel; admins can transition all states)
  - Seeded with 6 vetted demo providers (Heartland 24/7, BigRig Roadside, Pilot Towing Network, Speedy Diesel Mechanics, Lockout Pros, Trucker Tire Express) — each has services list, ETA average, rating, region, typical cost, logo
  - **Co-Pilot integration**: new `dispatch_roadside` action — driver says *"Hey Co-Pilot, I blew a tire"* → AI auto-picks fastest tire provider (Trucker Tire Express @ 25min) → creates dispatch → speaks confirmation → optional auto-redirect to detail page
  - Driver UI: `/driver/roadside` service picker (7 service types with icons), provider list with ETA/rating/region, optional note, history of recent dispatches, prominent active-dispatch banner
  - Driver UI: `/driver/roadside/:id` real-time status timeline (5 steps), provider phone tap-to-call, status auto-polls every 8 seconds, cancel button
  - Admin UI: `/app/roadside` shows live dispatches table (search + status filter) plus the full vetted provider network grid
  - Auto-creates a `roadside_dispatch` alert visible in the fleet admin's alerts feed

**3. Wake-word discoverability**
  - First-run "Try saying 'Hey Co-Pilot'" hint card on Driver Home (dismissible, persists in localStorage)
  - Driver Home reorganized: HOS → Co-Pilot → DVIR → **Roadside** → Duty Status → Voice Command (priority order matches use frequency)
  - Tested: **94/94 backend tests passed (100%)**

### Phase 2B (DONE — May 3) ✅ — Mapbox Truck-Aware GPS
**Founder provided** a Mapbox public token (default scopes, no URL restrictions yet).

- Backend: `GET /api/mapbox/config` — returns the token + default style + `truck_route_supported` flag (follows same pattern as `/api/stripe/config`).
- Token stored in `backend/.env` as `MAPBOX_PUBLIC_TOKEN`. Public tokens are designed to be exposed to browsers; abuse mitigation is via Mapbox URL restrictions (founder can lock to `*.preview.emergentagent.com` later).
- Frontend: `mapbox-gl` 3.x installed via `yarn add mapbox-gl`.
- New reusable component `/app/frontend/src/components/MapboxMap.jsx`:
  - Lazy-loads token from `/api/mapbox/config` (single fetch, cached promise)
  - 3 base styles: dark (default), streets, satellite
  - Auto-fit bounds to markers + route
  - Live traffic overlay (Mapbox vector tiles) — green/amber/orange/red congestion
  - Pulsing-orb markers with HTML popups
  - Glowing route polyline rendering
  - `fetchTruckRoute()` helper: hits Mapbox Directions API with `driving-traffic` profile, returns geometry + miles + minutes
  - `geocodeAddress()` helper: address → `{lng, lat, place_name}`
- Updated pages with real Mapbox maps:
  1. **Admin Fleet Overview** — `FleetMap` rewritten to use Mapbox instead of Leaflet. Live driver positions with status-colored markers + traffic overlay.
  2. **Driver Trip Detail** (`/driver/trips/:id`) — geocodes origin + destination, plots truck-aware route line, displays calculated miles + ETA. Visible upgrade for trip-planning.
  3. **Driver Roadside Detail** (`/driver/roadside/:id`) — pin showing driver's saved location when geolocation was captured at dispatch.
- **Truck dimension routing note**: Mapbox's standard `driving-traffic` profile is used. Strict truck-dimension routing (avoid bridges < height, weight-restricted roads, hazmat-restricted) is in their **Optimization v2 / Truck Routing tier** — flagged as an upgrade path. UI labels routes as "truck-aware" with a disclaimer about this current limitation.

### Phase 2E (DONE — May 4) ✅ — Investor-grade demo data seeding
**Why this phase**: Empty cards across IFTA / DVIR history / crash events made the app feel hollow during walk-throughs. Investors and beta testers need to *feel* the app already operating a real fleet.

**What changed (in `_seed_demo`)**:
- **5 driver login accounts** (Diego, Marcus, Aaliyah, Tyler, Rosa) — every driver is now demo-loggable with the same shared password (was previously only Diego). Each driver has their own truck, home terminal, and current shift state — so investor demos can switch drivers and show the state machine reacting (driving / on_duty / sleeper / off_duty).
- **22 trips spanning 14 days** of history — 2 active right now, 2 planned (assigned but not started), 18 completed with realistic mileage, started_at/ended_at timestamps, and per-trip mileage broken down by state.
- **IFTA dashboard now shows real numbers**: 3,926 miles distributed across **13 states** (TX, AZ, NM, TN, OH, KY, GA, OK, IN, NC, AL, PA, SC) — pulls live via `/api/ifta/summary`.
- **140 HOS logs** — 7 days × 4 duty events × 5 drivers + current state — realistic 06:00 on_duty → 07:00 driving → 12:00 lunch → 13:00 driving → 19:00 off → 22:00 sleeper cycle with per-driver staggering.
- **17 certified DVIR inspections** — pre-trip + post-trip across last 5 working days for all drivers. Includes 2 inspections with real defects (trailer lights intermittent on Truck 101, drive tire tread shallow on Truck 105) which auto-show up as related alerts.
- **3 crash events with full lifecycle variety**: 1 false-positive (driver tapped "I'm OK" — pothole on I-30, dismissed), 1 real low-impact (yard rear-collision, resolved with insurance claim), 1 fresh confirmed-unack (high-G on Aaliyah's truck — appears in alerts feed and admin Crash Events page demanding action).
- **5 roadside dispatches** — 1 active (en_route tire fix for Aaliyah), 3 completed (with realistic 5-step timeline: requested → confirmed → en_route → arrived → completed), 1 cancelled (driver self-resolved a lockout).
- **8 maintenance records** — mix of overdue, upcoming, and historical completed. Critical items surface on Driver Home start-of-shift card for the right truck.
- **12 alerts** spread over last 7 days — varied severities (critical / warning / info), varied types (hos_violation, hard_brake, fuel_log, dvir_defect, idle_excessive, route_deviation, speeding, maintenance_due/completed, crash_detected). Older alerts pre-acknowledged so the current "unread" count is realistic (~5).
- **15 dashcam events** spread over last 7 days from 3 different vendors (Samsara, Lytx, Verizon Connect) — populates the safety dashboard convincingly.
- **6 vetted roadside providers** (unchanged from Phase 2A but kept).
- **12 waitlist signups** spanning last 30 days — fictional fleets ranging from 1-truck owner-ops to 210-truck enterprises with realistic emails/companies. Marketing site Waitlist Admin page now has data to display.

**New `/api/seed?force=true` endpoint**: wipes all demo collections and re-seeds without a container restart. Safer than the silent skip-if-users-exist behavior.

**Founder demo flow now works**:
1. Log in as `super_admin@highwaypilot.io` → see 5-driver fleet with active trips, fresh critical crash alert, 13-state IFTA summary populated.
2. Log out → log in as `aaliyah@highwaypilot.io` → driver state = driving, active Atlanta→Charlotte trip showing on Driver Home, HOS at 75 min remaining (warning state).
3. Log out → log in as `tyler@highwaypilot.io` → state = sleeper, sees rest screen.
4. Log out → log in as `marcus@highwaypilot.io` → state = on_duty, has a planned trip Memphis→St. Louis to start.

### Phase 2C.2 + 2C.3 (DONE — May 4) ✅ — Inbound SMS replies + Co-Pilot voice-to-SMS

**Phase 2C.2 — Inbound SMS** turns the SMS surface bidirectional. When a driver replies to any RoadBoss SMS, Twilio fires a webhook at our backend, we match the phone to a driver, log the message, create an admin alert, and surface it in the Notifications page with a violet INBOUND badge.

What was built:
- `POST /api/webhooks/twilio/sms-inbound` — public webhook target (form-data + TwiML response). Validates Twilio signature when present (warn-only mode to avoid retry storms). Mike still needs to point Twilio Console → Phone Numbers → +18889446859 → "A MESSAGE COMES IN" at this URL to enable production inbound.
- `POST /api/test/sms-inbound` — admin-only simulator so we can demo the inbound flow without configuring the webhook.
- Compliance keywords: `STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT` set `driver.sms_opted_out=true` and skip alert creation. `START / YES / UNSTOP` clear the flag (TCPA compliance).
- Severity escalation: bodies containing `HELP / EMERGENCY / 911 / CRASH / BROKE / FUEL OUT / STUCK` create `severity=warning` alerts; all others are `info`.
- New `notification_logs` channel: `sms_inbound` (vs outbound `sms`).
- Frontend: 5-card stat row (Total / SMS Out / **Replies In** / Email / Failed), 5 filter tabs (All / SMS Out / **Replies In** / Email / Failed), inbound rows render with violet INBOUND badge + "from" address instead of "to".

**Phase 2C.3 — Co-Pilot voice-to-SMS** completes the safety story: drivers can dispatch SMS hands-free.

Driver says: *"Hey Co-Pilot, text dispatch I'm 30 minutes late hitting Memphis"*

Pipeline:
1. Co-Pilot recognizes the intent, replies naturally: *"Copy that, texting dispatch now that you're running 30 minutes late to Memphis."*
2. Emits `<<<ACTION:{"type":"send_sms","args":{"recipient":"dispatch","message":"Running 30 minutes late hitting Memphis"}}>>>`
3. Action handler resolves `recipient`:
   - Keywords `dispatch / admin / fleet_admin` → first user with role in [fleet_admin, dispatcher, super_admin] AND a phone on file
   - Names like `Sarah` / `Mike` → fuzzy-match against fleet user names
4. Calls `notify.send_sms()` — real Twilio API call, returns SID + status
5. Drops in-app alert (`type=voice_sms`) so admin sees the message instantly even before SMS lands
6. Audit-logged with `event_type=copilot_voice_sms`

Admin user records (super_admin Mike + fleet_admin Sarah) now have phones populated in the seed (`+17654808889` for Mike, `+12145550110` for Sarah) so Co-Pilot can reach them.

**Test results**: 22 new tests + 27 regression = **49/49 PASS (100%)**. Real Twilio API confirmed: 2 real SMS sent during testing to Mike's verified phone, status=queued, both delivered to his iPhone. SendGrid: still 100% green.

**Production-blocking action item for Mike**: Configure the Twilio inbound webhook (5 min, in Twilio Console — covered in main agent's hand-off message).
**Why this phase**: Mike provided real Twilio + SendGrid credentials. The voice-first command center needed an SMS surface (drivers without smartphones, dispatch comms while moving, crash escalation) and a transactional email surface (auth flows, fleet onboarding, FMCSA paper trail).

**Architecture**:
- New module `/app/backend/notifications.py` — single source of truth for all outbound SMS + email. Both providers wrapped with the same pattern: best-effort, fully audit-logged to `notification_logs` MongoDB collection, never throws back to the caller.
- E.164 phone normalization (`normalize_phone`) handles +1-prefixed, 10-digit US, and parenthesized formats.
- Email templates are inline branded HTML f-strings (`build_password_reset_email`, `build_welcome_email`, `build_fleet_invite_email`, `build_dvir_signed_email`) + a shared `email_layout()` shell with RoadBoss dark-mode branding.
- Lazy SDK init means missing creds don't crash startup — sends just log `status='skipped'`.

**SMS surface (4 use cases — all wired live)**:
1. **Crash auto-text** — `POST /api/crash-events` with `confirmed=true` now fires SMS to env-var `NOTIFY_CRASH_CONTACTS` plus any admin user with a `phone` on profile. Body includes severity, g-force, speed, and a Google Maps link to the crash GPS.
2. **Admin dispatch SMS** — new `POST /api/dispatch/sms` endpoint (admin/dispatcher only). Looks up driver by id, validates phone, sends formatted message with sender's name, also drops an in-app alert.
3. **Roadside provider auto-text** — `POST /api/roadside/dispatch` now SMS's the dispatched provider with driver name, truck id, location (Maps link), and quoted price.
4. **HOS warning SMS** — new `POST /api/notifications/hos-warning` endpoint. Texts both the driver AND admin team when minutes-remaining gets low. Manual trigger today; automated wired-in next phase.

**Email surface (4 use cases — all wired live)**:
1. **Password reset** — `POST /api/auth/forgot` now sends a SendGrid email with a branded reset link. Falls back to `dev_token` in response only if email send fails.
2. **Welcome email** — fires automatically on `POST /api/auth/register` with a quick-start guide ("say Hey Co-Pilot", run pre-trip, enable Crash Guardian).
3. **Fleet invitation** — new `POST /api/admin/invite` endpoint creates a 7-day-expiring invite token + sends a branded invite email with one-click accept link. Also new `GET /api/admin/invites` for the admin UI list view.
4. **DVIR signed copy** — `POST /api/inspections/{id}/certify` now auto-emails the certified inspection (with defect summary + signature + FMCSA citation) to all fleet_admin/super_admin users.

**Admin UI**:
- New page `/app/notifications` (sidebar entry "Notifications" with MessageSquare icon) — full audit log with stat cards (total/sms/email/failed), filter tabs (all/sms/email/failed), search across recipient/subject/body/event_type, and per-row metadata (status badge, message-id, error message, timestamp).

**Configuration discovery**:
- New `GET /api/notifications/status` exposes provider configuration so the UI can render "Toll-Free Verification Required" banners and provide a deep-link to Twilio's verification form.

**Test results**: Backend testing agent — **27/27 PASS (100%)**. Real Twilio API queues SMS to fictional NANP 555-01XX numbers. Real SendGrid accepts emails (HTTP 202). Audit log captures every send with full structure (id, channel, event_type, status, to, subject/body, provider_message_id, http_status, error).

**Known production caveats (NOT bugs — known constraints)**:
- Toll-free number `+18889446859` is **unverified** — production-grade SMS to non-verified destinations may be carrier-filtered. Verification form deep-link surfaced in `/api/notifications/status` for Mike to submit.
- `NOTIFY_CRASH_CONTACTS` env var is unset — crash SMS only fires to admin users with phone-on-profile. Mike should add his phone to his super_admin user record (or set the env var) to receive crash alerts.

### Phase 2F.1 (DONE — May 4) ✅ — Server.py refactor: extract seed module
**Why this phase**: `server.py` had grown to 2,549 lines — a fragile monolith that would make landing Twilio + SendGrid risky once Mike's keys arrive. Big-bang refactors mid-flight are dangerous, so we're peeling modules off incrementally.

**What changed**:
- New file `/app/backend/seed_data.py` (~430 lines) — pure module, zero `server.py` imports. Holds the rich investor-grade seed function (`seed_demo`) and the wipe helper (`wipe_demo_collections`).
- Dependency injection pattern: `seed_demo(db, now_utc, hash_password, build_blank_items, logger)` — shared utilities are passed in as kwargs, eliminating circular-import risk.
- `server.py` now contains only thin wrapper functions (`_seed_demo`, `_wipe_demo_collections`) and the `/api/seed` route handler — total ~30 lines for the seed surface.
- **server.py shrunk from 2,549 → 2,076 lines (−467, −18%)**.
- Identical behavior verified: force-reseed via `/api/seed?force=true` produces the exact same 22 trips, 17 DVIRs, 13-state IFTA, 3 crash events, 5 roadside dispatches, 12 alerts, 15 dashcam, 12 waitlist as before. Zero regressions.

### Phase 2F.2+ (BACKLOG — refactor remaining modules incrementally)
Remaining bloat in `server.py` (in priority order for future extraction):
- **routers/copilot.py** (~430 lines) — system prompt + chat endpoints + action parser. Will extract when we add the Twilio "speak SMS replies aloud" feature.
- **routers/dvir.py** (~235 lines) — DVIR templates + lifecycle endpoints. Extract when SendGrid ships the email-the-signed-DVIR feature.
- **routers/roadside.py** (~130 lines) — providers + dispatch lifecycle. Extract when Twilio sends provider SMS.
- **routers/crash.py** (~70 lines) — small footprint, lower priority.
- **routers/stripe.py** + **routers/google_oauth.py** — leave for now; both are stable and will rarely change.

**Refactoring discipline**: Each future extraction follows the same pattern as 2F.1 (own module file, dependency injection, thin server.py wrappers, zero behavior change verified by re-running backend testing agent).

### Phase 2D (DONE — May 4) ✅ — Driver Home Surgery (shift-flow state machine)
**Why this phase**: Founder rated app usability 7.5/10 and called the Driver Home a "wall of cards" — drivers had to scan 6 buttons to figure out what to do next. Truckers don't think in features; they think in shift stages.

**What changed**:
- New `useDriverShift` hook (`/app/frontend/src/hooks/useDriverShift.js`) computes the driver's actual shift state from live data (trips, certified inspections today, duty status, maintenance reminders).
- 6 explicit shift states modeling a real trucker's day:
  1. `start_of_shift` — no pre-trip today → primary card = **PRE-TRIP**
  2. `waiting_dispatch` — pre-trip done, no load assigned → primary = **Watching for dispatch**
  3. `ready_to_roll` — planned trip exists → primary = **START THIS TRIP**
  4. `driving` — active trip → primary = **HOS countdown + active trip card** (everything else collapses)
  5. `needs_post_trip` — trip just ended, no post-trip yet → primary = **POST-TRIP**
  6. `off_duty` — day complete → primary = **rest screen**
- DriverHome.jsx rewritten (453 lines): renders ONE primary action card front and center based on state, plus a small set of relevant secondary cards. Cards that don't belong to the current state (e.g. roadside while parked off-duty) are hidden — not just deprioritized.
- Driving state collapses everything except the active trip, voice button, roadside, and HOS — eliminates eye-distraction while moving.
- Maintenance criticals surface as a small inline warning in the start-of-shift card (not a separate card competing for attention).
- Wake-word bar + Crash Guardian remain mounted at DriverShell so they're untouched by the state machine.
- Voice flows still work identically — Co-Pilot actions still emit the right side-effects regardless of which Driver Home state is showing.

**Outcome**: Driver Home now answers the only question a trucker has: *"What do I do next?"* Pending live user verification — founder will eyeball it after he finishes setting up Twilio + SendGrid accounts.

### Phase 2C (BLOCKED — pending Mike's keys)
- **Twilio** — SMS dispatch alerts. Needs Account SID / Auth Token / from-number.
- **SendGrid** — transactional email (password resets, billing receipts, fleet invitations). Needs API key.
- **Samsara / Lytx / Verizon Connect** — dashcam adapters (mock interfaces ready to swap to real APIs).
- **QuickBooks Online** — OAuth flow for IFTA mileage export. Needs Intuit dev keys.

## Stage 4 — Differentiators (backlog)
1. CB Talker network — geo-aware WebRTC voice rooms.
2. Crash event ingestion API for future native iOS app.
3. Roadside assistance dispatch (provider directory + ETA).
4. Fleet billing + white-label.

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
- Frontend: React 19 + react-router 7 + Tailwind + shadcn/ui + Framer Motion + Leaflet + Sonner + Web Speech API (STT/TTS).
- Single-file backend `server.py` ~1,440 lines — slated for modularization in Stage 3 Phase 2 (one router file per integration).

## Decisions Locked (do not change without Mike's OK)
- **Pricing**: $29.99 Pro / $19.99 per-truck Fleet (matches Pitch Deck).
- **AI persona**: Co-Pilot Buddy (friendly trucker tone). Picked by Mike.
- **AI model**: Claude Sonnet 4.5 via Emergent universal key.
- **Safety mandate**: Never instruct a driver to interact with screen while driving — voice-first always.
- **Investor deck source of truth**: `/app/memory/pitch_deck.md`.

## Reference Files
- `/app/backend/server.py` — single-file API (1,440+ lines).
- `/app/backend/.env` — Stripe test keys, Google OAuth, EMERGENT_LLM_KEY (do not overwrite).
- `/app/frontend/src/pages/Pricing.jsx` — deck-aligned pricing UI.
- `/app/frontend/src/pages/driver/Copilot.jsx` — voice-first AI chat page.
- `/app/memory/pitch_deck.md` — full investor deck (source of truth for messaging/pricing).
- `/app/memory/test_credentials.md` — demo accounts.
- `/app/test_reports/iteration_4.json` — Stage 3 Phase 1 test report (33/33 ✅).
