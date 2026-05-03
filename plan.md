# Highway Pilot (stealth) → RoadBoss — Master Plan

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward (mward5710-byte, Kokomo, IN).
> Tagline (locked from investor deck): **"One app. Every mile. Hands free."**
> Mission: eliminate the 4,000+ distracted-driving fatalities/yr involving commercial vehicles.

---

## Status: STAGE 3 — PHASE 1.5 COMPLETE ✅
- Stage 1 (Foundation): ✅ Done
- Stage 2 (Workflows + Stripe + Google OAuth): ✅ Done
- Stage 3 Phase 1 (Pricing alignment + AI Copilot): ✅ Done
- **Stage 3 Phase 1.5 (Co-Pilot action execution + FMCSA DVIR): ✅ Done** ← latest
- Stage 3 Phase 2 (Mapbox / Twilio / SendGrid / Dashcam adapters / QuickBooks): 🔜 Next
- Stage 4 / 5: Backlog

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

### Phase 2 (NEXT — pending Mike's approval and any required keys)
- **Mapbox** — truck-restriction routing (height/weight/hazmat). Needs free Mapbox token.
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
