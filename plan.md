# Highway Pilot — Plan (MVP → Demoable V1 → Integrations)

## 1) Objectives
- Deliver a **demoable v1** of *Highway Pilot* (stealth brand) that a non-technical founder can show to investors/beta users via a **live URL**.
- Build a stable **backend + Fleet Command Center (web) + Driver PWA** with **seeded demo data** and clear “demo vs real” labeling.
- Keep scope MVP-focused: **no risky vendor integrations in Stage 1**; prove the **core voice + TTS flow** works in-browser.
- Establish a clean foundation for later: AI Copilot, Stripe, Twilio, Mapbox/PrePass, dashcam vendors, CB Talker, and eventual native iOS shell.

## 2) Implementation Steps

### Phase 1 — Core POC (Isolation) (prove the most failure-prone workflow)
**Core to prove:** in-browser **Voice Command → NLP-ish routing → TTS readback** (Web Speech API) + basic API round-trip.

**POC Steps**
1. Web research: confirm current best-practice usage/limitations for **Web Speech API** (speech recognition + speech synthesis) across Chrome/Safari iOS.
2. Build a minimal `/poc-voice` page:
   - Button: Start/Stop listening
   - Capture transcript
   - Local command router (regex/keywords) for 5 commands (e.g., “check hos”, “start trip”, “show alerts”, “read message”, “help”).
   - TTS speaks back confirmation + mock result.
3. Add a minimal backend endpoint: `POST /api/poc/echo` to validate network + JSON handling.
4. Validate on: desktop Chrome + iPhone Safari/Chrome.
5. Iterate until: reliable start/stop, transcript shown, and TTS response audible.

**Phase 1 User Stories**
1. As a driver, I can tap one button to start/stop voice capture so I can stay hands-free.
2. As a driver, I can see the recognized transcript so I can trust what the system heard.
3. As a driver, I can say “help” and hear a list of supported commands.
4. As a driver, I can say “check HOS” and hear a spoken status response.
5. As the founder, I can verify the voice POC works on iPhone before building the full app around it.

---

### Phase 2 — V1 App Development (MVP build in one cohesive pass)
**Deliverables:** Marketing site + Backend (FastAPI/Mongo) + Fleet Dashboard (web) + Driver PWA + seed data + test creds.

**Frontend (React + Vite + Tailwind + shadcn/ui)**
1. Global design system:
   - Theme: deep charcoal cockpit, chrome/steel borders, electric blue glow accents, amber/orange warning highlights.
   - Branding: **Highway Pilot** wordmark (clean modern); reserve RoadBoss logo usage for later.
2. Marketing site (`/`): hero, problem/solution, features, 4-phase roadmap visual, waitlist form, founder/contact.
3. Fleet Command Center (`/app`):
   - Login screen (email/password)
   - Overview with KPI cards (drivers active, HOS at-risk, alerts last 24h, maintenance due)
   - Map view (Leaflet + OSM tiles) with mock driver markers
   - Drivers list + driver detail (trips, HOS logs, vehicle, maintenance)
   - Alerts feed + Dashcam events feed (clearly labeled “Demo Data”)
   - CRUD modals for Driver/Vehicle/Trip (MVP forms)
4. Driver PWA (`/driver`):
   - Today view (HOS countdown, current trip card)
   - Voice command button (from Phase 1 POC) wired to app navigation/actions
   - “Read demo message” TTS button
   - Trips list, Vehicle profile, Settings
5. Docs page or footer links: Privacy/Terms placeholders.

**Backend (FastAPI + MongoDB)**
1. API structure: `/api` prefix, CORS configured.
2. Auth (JWT + bcrypt):
   - Register (optional), Login, Me
   - Roles: `driver`, `fleet_admin`, `dispatcher`, `super_admin`
3. Data models + CRUD endpoints:
   - Driver, Vehicle, Trip, HOSLog, MaintenanceRecord, Alert, DashcamEvent, Waitlist
4. Seed script:
   - Creates demo fleet with 5 drivers/5 vehicles/trips/HOS logs/alerts/dashcam events
   - Creates demo users:
     - `fleet_admin@highwaypilot.io` / `HighwayPilot2026!`
     - `driver@highwaypilot.io` / `HighwayPilot2026!`
     - `super_admin@highwaypilot.io` / `HighwayPilot2026!`
5. `docs/test_credentials.md` generated in-repo.

**Phase 2 User Stories**
1. As a visitor, I can join the waitlist so I can get early access.
2. As a fleet admin, I can log in and see a fleet overview (map, KPIs, alerts) in one screen.
3. As a fleet admin, I can click a driver and see trips, HOS logs, and maintenance history.
4. As a driver, I can log in and see my HOS countdown and current trip instantly.
5. As the founder (super_admin), I can view waitlist signups from the dashboard.

**End-of-Phase Testing**
- Run 1 full e2e pass: marketing → waitlist → login (admin/driver) → CRUD create driver/vehicle/trip → verify map markers → verify voice demo + TTS.

---

### Phase 3 — Add “Real MVP” Features (no heavy vendor deps yet)
1. Expand CRUD + workflows:
   - HOS duty status changes
   - Trip creation + mileage capture + state-by-state IFTA breakdown (manual entry first)
   - Maintenance schedules + reminders (in-app; email/SMS later)
2. Voice command expansion:
   - Commands trigger real app actions (create trip, change duty, read alerts)
3. Data exports:
   - CSV/PDF export for trips/HOS/mileage/maintenance (MVP quality)

**Phase 3 User Stories**
1. As a driver, I can change duty status so my HOS stays accurate.
2. As a driver, I can start/end a trip and record mileage so I can track IFTA.
3. As a fleet admin, I can see which vehicles are due for maintenance so I can prevent breakdowns.
4. As a fleet admin, I can export logs to CSV so I can share with accounting/compliance.
5. As a driver, I can use voice to log key actions so I don’t need to type while driving.

**End-of-Phase Testing**
- e2e: create trip → duty change → verify dashboard aggregates → export → verify voice-triggered actions.

---

### Phase 4 — Integration POCs (before full integration build)
Run isolated POCs per integration (don’t merge until validated):
1. AI Copilot (Emergent Universal Key): single call endpoint `POST /api/ai/suggest-reply`.
2. Stripe subscriptions: create checkout session + webhook receipt.
3. Twilio SMS: send test SMS + webhook receive.
4. Mapbox routing: route request + restrictions (or mock adapter if keys pending).
5. Dashcam vendor: start with Samsara adapter (events list fetch).

**Phase 4 User Stories**
1. As a driver, I can request an AI-suggested reply so I can respond faster.
2. As a customer, I can subscribe and see my plan status.
3. As a fleet admin, I can send an SMS to a driver from the dashboard.
4. As a fleet admin, I can view dashcam events pulled from a vendor feed.
5. As a fleet admin, I can generate a route that avoids truck restrictions.

---

## 3) Next Actions (immediate)
1. Confirm domain choice for stealth: `highwaypilot.io` vs placeholder.
2. Confirm whether to include **Google OAuth** now (recommended later; email/password first for testability).
3. Start Phase 1 POC: implement `/poc-voice` and validate on iPhone.
4. After POC passes, execute Phase 2 in one cohesive build pass and deploy live.

## 4) Success Criteria
- Phase 1: Voice POC works on iPhone (transcript + TTS + command routing) reliably.
- Phase 2: Live URL demo includes marketing + waitlist + seeded fleet dashboard + driver PWA; demo creds documented in `docs/test_credentials.md`.
- Phase 3: Core trucking workflows (trip, HOS, mileage, maintenance) work end-to-end with exports.
- Phase 4: Each integration has a passing isolated POC before being merged into the main app.
