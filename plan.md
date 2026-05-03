# Highway Pilot (stealth) → RoadBoss — Master Plan

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward.

## Status: STAGE 1 COMPLETE ✅
A live, demo-able foundation is running at the preview URL. Investor-ready slice.

---

## Stage 1 — Foundation (DONE)
**Built:**
- Marketing site at `/` with hero, features, 4-phase roadmap, waitlist form (POST `/api/waitlist`).
- Login at `/login` with quick-fill demo accounts.
- **Fleet Command Center** at `/app` (admin/dispatcher/super_admin):
  - Overview with KPI cards, live driver map (Leaflet/OSM, no key), driver HOS list, alerts feed, maintenance due.
  - Pages: Drivers, Driver Detail, Vehicles, Trips, Maintenance, Alerts, Dashcam, Waitlist Admin.
  - CRUD: create driver, vehicle, trip from UI.
- **Driver PWA** at `/driver` (mobile-first, bottom tab nav):
  - Home: HOS countdown, voice command (Web Speech API → POST `/api/voice/command`), TTS readback, active trip card, inbound message demo (TTS), recent alerts.
  - Tabs: Trips, Truck (assigned vehicle + maintenance history), Settings (TTS test, sign out).
- **Backend (FastAPI/Mongo):**
  - JWT auth (bcrypt), 4 roles: driver / fleet_admin / dispatcher / super_admin.
  - Models: Driver, Vehicle, Trip, HOSLog, MaintenanceRecord, Alert, DashcamEvent, Waitlist, User, VoiceLog.
  - Endpoints: /api/auth/*, /api/waitlist, /api/overview, full CRUD for drivers/vehicles/trips/hos/maintenance/alerts/dashcam-events, /api/voice/command, /api/seed.
  - Auto-seed on first startup: 3 demo users, 5 drivers, 5 trucks, 7 trips, 20 HOS logs, 5 maintenance records, 5 alerts, 5 dashcam events.
- Demo accounts (in `/app/memory/test_credentials.md`): all password `HighwayPilot2026!`.

**Test result:** Backend 26/26 ✅. Frontend full E2E ✅ after fixing driver bottom-nav z-index.

---

## Stage 2 — Trucker Core Workflows (next, on Pro)
1. HOS duty status changes wired to UI (driver can change duty via voice or button → POST `/api/hos`).
2. Trip lifecycle: start trip → active → end trip with mileage capture, IFTA state-by-state breakdown.
3. Maintenance: schedules, due reminders surfaced in driver PWA.
4. Mileage exports (CSV/PDF).
5. Voice command expansion: real action triggers (start trip, change duty, etc.), not just spoken responses.
6. Stripe subscriptions (driver $X/mo, fleet per-driver).
7. Google OAuth login (replace email/password where wanted).

## Stage 3 — Integrations
1. AI Copilot via Emergent Universal Key (OpenAI/Claude) for reply suggestions and natural-language voice commands.
2. Mapbox truck-restriction routing.
3. PrePass scale houses.
4. Twilio SMS / voice.
5. Samsara dashcam adapter (events fetch + clip retrieval); Lytx and Verizon Connect adapters next.
6. QuickBooks export.

## Stage 4 — Differentiators
1. **CB Talker network** — WebRTC voice rooms keyed by geographic corridors, hands-free voice-command channel switching, transcript overlay.
2. Crash event ingestion API (`POST /api/crash-events`) the future native iOS app will hit.
3. Roadside assistance dispatch flow (provider directory + ETA tracking).
4. Fleet billing + white-label.

## Stage 5 — Investor + Beta Ready
1. Investor portal with metrics dashboard (subscriber growth, MAU, fleet contracts).
2. Beta tester onboarding flow.
3. Public demo URL with seeded data.
4. Investor pitch deck rebuild (Reveal.js + PDF export).

## Stage 6 — Outside Emergent
1. Hire ONE iOS native contractor to build the native shell:
   - AVSpeechSynthesizer / SFSpeechRecognizer (true on-device)
   - True background audio mode + Siri Shortcuts
   - Bluetooth OBD-II pairing
   - Core Motion crash detection (file events to our backend)
2. FMCSA ELD certification process.

---

## Brand Notes
- Stealth = "Highway Pilot". Logo = chrome hex shield + glowing blue eye dot (homage to RoadBoss face).
- Public launch = "RoadBoss" with the chrome split-truck/robot Optimus logo provided by founder.
- Color system: deep charcoal cockpit (`#07090d`), chrome (`#c8d0d8`), electric blue (`#38bdf8`), amber warnings, red criticals.

## Tech
- Backend: FastAPI + Motor (async Mongo) + JWT auth + bcrypt.
- Frontend: React 19 + react-router 7 + Tailwind + shadcn/ui + Framer Motion + Leaflet + Sonner toasts.
- Single-file backend for Stage 1 (`server.py`); will modularize when Stage 3+ integrations land.
