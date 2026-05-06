# Highway Pilot (stealth) → RoadBoss — Master Plan (UPDATED)

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward (mward5710-byte, Kokomo, IN).
> Tagline (locked from investor deck): **"One app. Every mile. Hands free."**
> Mission: eliminate the 4,000+ distracted-driving fatalities/yr involving commercial vehicles.

---

## Status: STAGE 3 — PHASE 3B v2 (ENTERING “TOWBOOK PARITY SPRINT” — DRIVER COCKPIT + FORMS + BILLING)
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
- Stage 3 Phase 2G (Onboarding, Push, Settings, Mock dashcam, etc.): ✅ Done
- Stage 3 Phase 2H (Investor demo + growth surfaces): ✅ Done
- **Stage 3 Phase 3A (Wreckerlogix Flutter Master Spec Doc): ✅ Done**
- **Stage 3 Phase 3B v1 (Wrecker Mode in RoadBoss — web/PWA cockpit): ✅ Done**
- **Stage 3 Phase 3B v2(a) (Wrecker Voice Intents via Co-Pilot actions): ✅ Done**
- **Stage 3 Phase 3B v2(b/c/d) (Towbook parity sprint): 🚧 IN PROGRESS**

**New reality / decisions from today (locked):**
- **Build focus remains RoadBoss web/PWA** to onboard initial wrecker companies + impress investors.
- **Photos must NOT save to camera roll**; we will offer a **toggle with default OFF**.
- App Store submission is NOT part of this repo/session; native shipping is handled in the Flutter session per `/app/memory/wreckerlogix_master_spec.md`.
- Master spec for Towbook parity is captured in **`/app/memory/wrecker_mode_spec.md`**.
- Monetization: **Path B** (free during beta). Stripe exists but **no paywalls**.

**External integration status notes (operational reality):**
- Twilio toll-free verification submitted (1–3 weeks typical). Until approved, sends to verified destinations work best; non-verified may be carrier-filtered.
- Twilio inbound SMS webhook works when Twilio Console “A MESSAGE COMES IN” points at our preview/prod URL; if the preview URL changes, it must be updated.
- FuelCloud API: access is request-only. Manual logging exists; API wiring begins after approval.

---

## Stage 1 — Foundation (DONE)
- Marketing site at `/` (hero, roadmap, waitlist).
- Login + 4 roles (driver / fleet_admin / dispatcher / super_admin) with JWT + bcrypt.
- Fleet Command Center at `/app`.
- Driver PWA at `/driver`.
- Auto-seeded demo data on startup.
- Test result: Backend ✅. Frontend E2E ✅.

## Stage 2 — Trucker Core Workflows (DONE)
- HOS duty status changes wired.
- Trip lifecycle.
- IFTA exports.
- Maintenance reminders.
- Voice command expansion.
- Stripe subscriptions.
- Google OAuth.
- Test result: Backend ✅, Frontend E2E ✅.

---

## Stage 3 — Integrations (active)

### Phase 1 (DONE — May 3) ✅
**1. Stripe pricing realigned** (Free/Pro/Fleet/Enterprise) + UI rebuild.

**2. AI Copilot — "Co-Pilot Buddy"**
- Backend: `/api/copilot/*`
- Model: Claude Sonnet 4.5
- Persona + safety rules
- Context injection

### Phase 1.5 (DONE — May 3) ✅ — Co-Pilot ACTIONS + FMCSA DVIR
- Action markers + whitelisted execution
- DVIR template/lifecycle + certification lock

### Phase 1.6 (DONE — May 3) ✅ — Wake-Word + mic UX

### Phase 2A (DONE — May 3) ✅ — Crash Detection + Roadside

### Phase 2B (DONE — May 3) ✅ — Mapbox truck-aware GPS

### Phase 2D (DONE — May 4) ✅ — Driver Home Surgery

### Phase 2E (DONE — May 4) ✅ — Investor-grade demo data seeding

### Phase 2C.2 + 2C.3 (DONE — May 4) ✅ — Bidirectional SMS + voice-to-SMS

### Phase 2F.1 (DONE — May 4) ✅ — Extract seed module

---

## Stage 3 — Phase 3 (ACTIVE) — Two-Front Battle Plan: Wreckerlogix + RoadBoss “Wrecker Mode”

### Phase 3A (DONE ✅) — Wreckerlogix Master Spec Doc (Flutter)
Deliverable: `/app/memory/wreckerlogix_master_spec.md`
- CI/TestFlight workflow repair steps
- App Store Connect metadata + privacy answers
- Towbook parity matrix + roadmap

**Definition of done:** ✅ Complete.

**Next execution step (outside this repo):** New Emergent session on Flutter repo.

---

### Phase 3B v1 (DONE ✅) — Wrecker Mode inside RoadBoss (web/PWA cockpit)
**Shipped (v1):**
- Backend module: `/app/backend/wrecker.py`
  - Tow jobs, impounds, motor clubs, fuel tanks, fuel tx
  - Role rules: driver view-only own jobs; dispatch assigns; supervisor reassign
- Frontend under `/app/frontend/src/pages/wrecker/*`
- Role-gated routes in `App.js`

**Definition of done (v1):** ✅ Complete.

---

### Phase 3B v2(a) (DONE ✅) — Wrecker Voice Intents (hands-free)
- Co-Pilot supports wrecker_operator actions:
  - `tow_job_status`, `tow_job_next`, `fuel_check`, `impound_quick`

**Definition of done:** ✅ Complete.

---

## Stage 3 — Phase 3B v2 (NOW) — Towbook Parity Sprint (Phases 1–3)

> Objective: Ship a **working driver job cockpit** (Towbook-style) that supports running a tow end-to-end:
> status timeline + photos + damage/waiver signatures + charges/payments + SMS/email receipts.

### NEW: Driver DVIR Hands-Free Walkthrough (P0 Demo Feature) — ✅ SHIPPED
**Why:** This is the core “wow” demo: a driver can complete DVIR without touching the screen.

**Shipped (frontend):**
- New page: `InspectionVoice.jsx` → `/driver/inspection/:id/voice`
  - Reads each item aloud: “Item N of 69 — <label>. Say pass, fail, or skip.”
  - STT loop with command classifier: pass/fail/skip + repeat/back/pause/resume/done
  - iOS support: gesture unlock + `speechSynthesis.resume()` + 25s auto-reset
  - Manual fallback buttons (PASS/FAIL/N/A) when mic unavailable (e.g., preview iframe)
  - Save confirmation chip: “Last: X · PASS”
  - End summary + CTA to Sign
- Added header CTA on the standard inspection form: **Voice (mic)** button next to Sign.

**Shipped (backend):**
- Co-Pilot `start_inspection` action supports `voice_mode: true|false`
  - When `voice_mode=true`, redirect routes directly to `/driver/inspection/:id/voice`
- LLM system prompt updated with `voice_mode` rules + examples.

**Definition of done:** ✅ Complete.

**Remaining follow-up (NEXT SESSION P0):**
- End-to-end testing sweep (voice page + normal inspection form + sign flow) to ensure no regressions.

---

### NEW: Marketing Asset Hub (P0 Growth Surface) — ✅ SHIPPED
**Why:** Mike needs one place to grab “attention seekers” (logos, hooks, captions, QR) for TikTok/social.

**Shipped:**
- `/media` route → **Media Hub** (brand assets, videos, links, captions, QR)

**Definition of done:** ✅ Complete.

---

### Phase 3B v2(b) — Phase 1: 7-stage status flow + photos by stage + extended vehicle details (🚧 Next)
**Why:** This is the core “field usability” layer: driver can progress a job, document condition, and keep dispatch informed.

**Implementation steps (backend):**
1. **Status model update**
   - Update `JOB_STATUSES` to: `pending, assigned, en_route, on_scene, towing, dest_arrival, completed, cancelled`
   - Migrate existing `in_progress` values → `towing` (backfill on read or run a one-time migration).
2. **Tow job schema extensions**
   - Vehicle: `has_keys` (bool), `key_location` (string), `drivable` (bool), `drive_type` (enum: FWD/RWD/AWD/4X4)
   - Photos: `photos: [{id, stage, data_url, taken_at, taken_by}]` with `stage in (on_scene, towing, dest_arrival, other)`
3. **Photo upload endpoint**
   - `POST /api/wrecker/jobs/{id}/photo` accepts base64 data_url + stage
   - Store in MongoDB (base64) and return photo id
   - **Do not save to camera roll** (frontend uses in-memory capture)
4. **Permissions**
   - Drivers can add photos only to their assigned jobs.

**Implementation steps (frontend):**
1. Update `WreckerJobDetail.jsx` to match Towbook cockpit sections:
   - Status timeline with timestamps
   - Vehicle details panel (keys/drivable/drive type + VIN)
   - Pickup/Destination cards with “directions” deep links
2. Add **Photos & Videos tab**
   - Stage-filtered gallery + count badge
   - “Add Photo/Video” button using existing `openCameraAsDataUrl()` behavior
3. Add **Settings toggle**: “Save photos to camera roll”
   - Default OFF
   - If ON, optionally `canvas.toBlob` + prompt save (future; safe to stub now)

**Definition of done:**
- Driver can update job through 7 stages.
- Driver can capture photos for On Scene / Towing / Destination.
- Photos remain inside app by default.

---

### Phase 3B v2(c) — Phase 2: Damage Form (4-view SVG) + liability waiver + signatures (🚧 Next)
**Why:** This is the “legal protection” and proof-of-condition piece Towbook nails.

**Implementation steps (backend):**
1. Collections:
   - `damage_forms`: `{id, job_id, marks[], signed_by_name, signature_data_url, signed_at}`
   - `waivers`: `{id, job_id, waiver_text_snapshot, accepted_by_name, signature_data_url, accepted_at}`
   - `fleet_waiver_templates`: per-fleet editable template
2. Endpoints:
   - `GET/PUT /api/wrecker/waiver/template`
   - `POST /api/wrecker/jobs/{id}/waiver/accept`
   - `POST /api/wrecker/jobs/{id}/damage-form`

**Implementation steps (frontend):**
1. New pages/components:
   - `WreckerDamageForm.jsx` — interactive 4-view SVG + marks + notes + sign
   - `WreckerWaiver.jsx` — long text + signature canvas + accept checkbox
2. Hook into Job Detail action row.

**Definition of done:**
- Driver can complete waiver + signature.
- Driver can mark damage on diagram + sign.

---

### Phase 3B v2(d) — Phase 3: Charges (rate×qty) + payments + email/SMS receipts (🚧 Next)
**Why:** Turns completion into clean books and faster payment.

**Implementation steps (backend):**
1. Rate sheet:
   - `fleet_rate_sheets`: `{fleet_id, items[{key,label,rate,unit}]}`
2. Tow job billing fields:
   - `charges[]` line items
   - `payments[]` records
   - computed totals: subtotal, tax, total, balance_due
3. Receipt sending:
   - `POST /api/wrecker/jobs/{id}/receipt/email` (SendGrid)
   - `POST /api/wrecker/jobs/{id}/receipt/sms` (Twilio)
   - Receipt toggles: hide charges/discounts/photos, include payment link
   - Log to `notification_logs` (`event_type='tow_receipt'`)

**Implementation steps (frontend):**
1. Charges editor UI (Towbook-style list)
2. Payments screen (invoice total, balance due, list of payments)
3. Email Receipt screen with toggles + attachments + message

**Definition of done:**
- Dispatcher/supervisor can send receipt.
- Completion can optionally prompt/send receipt.

---

## Next Session Priorities (RoadBoss)
- **P0: Testing sweep** — voice DVIR walkthrough + standard DVIR form + signing flow (no regressions)
- **P1: Square Web Payments SDK add-ons** — Google Pay + ACH
- **P2: Public vehicle lookup** — `/lookup` for police/customers to check impound inventory by VIN/Plate

---

## Deferred / Future (explicitly NOT tonight)
### Phase 3B v3 — Impounds + Accounts + Dispatcher Ops + Payroll + Square POS
- Phase 4: Impounds module expansion (lot inventory, release workflow, certified mail)
- Phase 5: Accounts CRM (types, search/filter, per-account reasons like AAA)
- Phase 6: Dispatcher tools (rotation override reasons, clock-in/out/lunch)
- Phase 7: Maintenance/Expenses/Payroll auto-fill + exports
- Phase 8: Square POS (requires keys; Web Payments SDK + reader pairing)

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

## Brand Notes
- Stealth = "Highway Pilot".
- Public launch = "RoadBoss".
- Color system: deep charcoal cockpit (`#07090d`), chrome (`#c8d0d8`), electric blue (`#38bdf8`), amber warnings, red criticals.
- Tone: blue-collar founder voice — plainspoken, respectful, confident.

## Tech
- Backend: FastAPI + Motor (async Mongo) + JWT (bcrypt) + Stripe + httpx + emergentintegrations (Claude Sonnet 4.5).
- Frontend: React + react-router + Tailwind + shadcn/ui + Framer Motion + Sonner + Web Speech API.
- Map: Mapbox GL JS.
- Notifications: Twilio SMS + SendGrid Email + `notification_logs` audit trail.

## Decisions Locked (do not change without Mike's OK)
- Pricing: $29.99 Pro / $19.99 per-truck Fleet.
- AI persona: Co-Pilot Buddy.
- AI model: Claude Sonnet 4.5.
- Safety mandate: Never instruct a driver to interact with screen while driving.
- Photos default behavior: **do not save to camera roll**.
- Flutter/iOS App Store deployment handled in separate Emergent session (see `/app/memory/wreckerlogix_master_spec.md`).

## Reference Files
- `/app/backend/server.py` — single-file API (large; incremental refactor backlog).
- `/app/backend/wrecker.py` — Wrecker Mode backend module.
- `/app/backend/notifications.py` — Twilio + SendGrid wrapper + audit logging.
- `/app/backend/seed_data.py` — investor-grade demo seed.
- `/app/frontend/src/pages/wrecker/*` — Wrecker Mode UI.
- `/app/frontend/src/pages/driver/Copilot.jsx` — shared Co-Pilot voice UI.
- `/app/frontend/src/pages/driver/InspectionVoice.jsx` — hands-free DVIR walkthrough.
- `/app/frontend/src/pages/MediaHub.jsx` — marketing assets hub.
- `/app/memory/test_credentials.md` — demo accounts.
- `/app/memory/wreckerlogix_master_spec.md` — Flutter rescue + App Store shipping plan.
- `/app/memory/wrecker_mode_spec.md` — Towbook parity sprint master spec (new, source of truth).
