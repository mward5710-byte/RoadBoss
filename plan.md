# Highway Pilot (stealth) → RoadBoss — Master Plan (UPDATED)

> Stealth brand: **Highway Pilot**. Public launch brand: **RoadBoss**. Founder: Mike Ward.
> Tagline (locked from investor deck): **"One app. Every mile. Hands free."**
> Mission: eliminate the 4,000+ distracted-driving fatalities/yr involving commercial vehicles.

---

## Status: STAGE 3 — PHASE 3B v2 (ENTERING “TOW-INDUSTRY PARITY SPRINT” — DISPATCH + FORMS + BILLING)
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
- Stage 3 Phase 3A (WreckerLogix Flutter Master Spec Doc): ✅ Done
- Stage 3 Phase 3B v1 (Wrecker Mode in RoadBoss — web/PWA cockpit): ✅ Done
- Stage 3 Phase 3B v2(a) (Wrecker Voice Intents via Co-Pilot actions): ✅ Done
- **Stage 3 Phase 3B v2(b/c/d) (Tow-industry parity sprint): 🚧 ACTIVE**

**New reality / decisions from today (locked):**
- Build focus remains **RoadBoss web/PWA** for initial wrecker customers + investor demo.
- **Photos must NOT save to camera roll**; offer a toggle with default OFF.
- App Store submission is NOT part of this repo/session; native shipping handled in Flutter session.
- Founder wants **workflow parity** with industry leader UI/UX **without hardcoding competitor name in UI**.
- Monetization: Path B (free during beta). Stripe exists but **no paywalls**.

**External integration status notes (operational reality):**
- Twilio toll-free verification submitted (1–3 weeks typical).
- Twilio inbound SMS webhook works when Twilio Console webhook points at current preview/prod URL.
- FuelCloud API: access is request-only. Manual logging exists; API wiring begins after approval.
- QuickBooks Online: OAuth wiring is a P1 build item (UI slot is now present).

---

## Stage 1 — Foundation (DONE)
- Marketing site at `/`.
- Login + roles with JWT + bcrypt.
- Fleet Command Center at `/app`.
- Driver PWA at `/driver`.
- Auto-seeded demo data.

---

## Stage 2 — Trucker Core Workflows (DONE)
- HOS duty status changes.
- Trip lifecycle.
- IFTA exports.
- Maintenance reminders.
- Voice command expansion.
- Stripe subscriptions.
- Google OAuth.

---

## Stage 3 — Integrations (active)

### Phase 1 (DONE) ✅
**1. Stripe pricing realigned** (Free/Pro/Fleet/Enterprise) + UI rebuild.

**2. AI Copilot — "Co-Pilot Buddy"**
- Backend: `/api/copilot/*`
- Model: Claude Sonnet 4.5
- Persona + safety rules
- Context injection

### Phase 1.5 (DONE) ✅ — Co-Pilot ACTIONS + FMCSA DVIR
- Action markers + whitelisted execution
- DVIR template/lifecycle + certification lock

### Phase 1.6 (DONE) ✅ — Wake-Word + mic UX

### Phase 2A (DONE) ✅ — Crash Detection + Roadside

### Phase 2B (DONE) ✅ — Mapbox truck-aware GPS

### Phase 2D (DONE) ✅ — Driver Home Surgery

### Phase 2E (DONE) ✅ — Investor-grade demo data seeding

### Phase 2C.2 + 2C.3 (DONE) ✅ — Bidirectional SMS + voice-to-SMS

### Phase 2F.1 (DONE) ✅ — Extract seed module

---

## Stage 3 — Phase 3 (ACTIVE) — Two-Front Battle Plan: WreckerLogix + RoadBoss “Wrecker Mode”

### Phase 3A (DONE ✅) — WreckerLogix Master Spec Doc (Flutter)
Deliverable: `/app/memory/wreckerlogix_master_spec.md`

---

### Phase 3B v1 (DONE ✅) — Wrecker Mode inside RoadBoss (web/PWA cockpit)
**Shipped (v1):**
- Backend module: `/app/backend/wrecker.py`
- Frontend under `/app/frontend/src/pages/wrecker/*`
- Role-gated routes in `App.js`

---

### Phase 3B v2(a) (DONE ✅) — Wrecker Voice Intents (hands-free)
- Co-Pilot supports wrecker_operator actions.

---

## Stage 3 — Phase 3B v2 (NOW) — Tow-Industry Parity Sprint (Phases 1–3)

> Objective: Ship a **working tow workflow** that supports running a call end-to-end:
> Dispatch → New Call → Cockpit → Photos → Charges → Payments → Receipt → Accounting export.

### NEW: Login / PWA Entry Reliability Fixes (P0 Stability) — ✅ SHIPPED
**Why:** Mike was blocked by laptop login + iPhone PWA launching wrong product.

**Shipped (frontend):**
- `Login.jsx`: removed auto-redirect that skipped Home splash for authenticated users.
- `manifest.json`: set `id: '/'`, normalized name/short_name, ensured `start_url: '/'`.
- `sw.js`: bumped service worker version to force refresh on installed PWAs.

**Outcome:** Home splash becomes the stable entry point; reduces cross-product bleed (RoadBoss vs WreckerLogix).

---

### NEW: Universal Editor / Mini-App Builder (P0 Founder Control) — ✅ SHIPPED
**Why:** Mike needs to self-serve changes to avoid agent “crossed wires” and stop burning credits.

**Shipped (frontend):**
- `/wrecker/customize` rewritten with 9 modules (password-gated saves + Reset All):
  1) Service Types
  2) Body Types
  3) Drive Types
  4) Charge Catalog
  5) New Call section toggles
  6) Sidebar Menu overrides (hide/rename + custom links)
  7) Custom Quick Buttons (stored; dispatch render hook is a later step)
  8) Universal Label Overrides (stored; render hook is a later step)
  9) Drivers shortcut

**Shipped (wiring):**
- `WreckerJobNew.jsx`: reads `service_types`, `body_types`, `extras.drive_types`, `charges`, `call_form_fields` from `/api/wrecker/customizations`.
- `WreckerShell.jsx`: applies `menu_items` overrides (hide/rename) and renders custom links in a “Custom” group.

**Definition of done:** ✅ Founder can change dropdowns/charges/form sections/menu without code.

---

### NEW: Connections Portal Expansion (P0 Setup Surfaces) — ✅ SHIPPED (UI slots)
**Why:** Mike wants a single place to drop keys and see what’s wired.

**Shipped (frontend):**
- `/wrecker/connections` extended with reusable `PendingIntegrationCard` slots:
  - FuelCloud
  - Twilio
  - QuickBooks Online
  - Mapbox (status/info)

**Note:** Backend key storage/OAuth wiring for FuelCloud/Twilio/QBO is tracked below.

---

### Phase 3B v2(b) — Phase 1: Dispatch + New Call parity + pricing/charges workflow (🚧 NEXT)
**Why:** This is the core operator workflow and the biggest demo unlock.

**Implementation steps (frontend):**
1. Dispatch Board overhaul
   - Align columns, tabs, filters, and card density to towing-industry workflow.
   - Ensure strict product wall (no RoadBoss bleed).
2. New Call Form
   - Continue Tow-industry section layout standardization.
   - Ensure customizations drive all dropdowns/toggles (already wired).
3. Charges
   - Ensure Charge Catalog edits (Customize) flow through to:
     - New Call picker
     - Cockpit charges list
     - Receipt totals

**Implementation steps (backend):**
- Ensure `charges` line items and totals are consistent across create/update/receipt.

**Definition of done:**
- Dispatchers can create/dispatch/manage calls with a familiar towing workflow.

---

### Phase 3B v2(c) — Phase 2: Quote Detail Page Overhaul (P0) (🚧 NEXT)
**Why:** Quotes are the sales funnel; must look/feel like towing industry standard.

**Implementation steps (frontend):**
- New page: `/wrecker/quotes/:id`
  - Header: Back, Quote #, status pill
  - Map area (Mapbox)
  - Photos panel
  - Collapsible pickup/destination blocks
  - Charges list (search + add)
  - Email quote
  - **CONVERT** button (quote → pending job)

**Backend:**
- Endpoint for converting quote to job (if not already present).

**Definition of done:**
- Quote can be reviewed, priced, and converted to a job in one flow.

---

### Phase 3B v2(d) — Phase 3: QuickBooks Online Integration (P1) (🚧 NEXT)
**Why:** Required for real distribution + bookkeeping.

**Implementation steps (backend):**
1. QBO OAuth connect flow
   - `/api/wrecker/integrations/quickbooks/connect`
   - `/api/wrecker/integrations/quickbooks/callback`
   - Store tokens per tenant.
2. Invoice push
   - On job close or “Send to QuickBooks” action
   - Create invoice + line items + tax
3. Payment push
   - Sync Square payments into QBO payment records

**Frontend:**
- Connections page already has a QuickBooks slot; update it to show connected status once backend is live.

**Definition of done:**
- Closed job produces matching QBO invoice (with charges and payment if paid).

---

## Next Session Priorities (RoadBoss / WreckerLogix)
**P0 (must):**
1. Quote Detail Page Overhaul (`/wrecker/quotes/:id`).
2. Dispatch Board + New Call + Charges workflow parity cleanup.

**P1 (should):**
1. QuickBooks Online OAuth wiring + invoice push.
2. Setup Wizard / Tenant Onboarding Flow.

**P2 (later):**
- Stripe SaaS subscription billing.
- Data Export / Backup tool.

---

## Recent UX Wins / Releases (Latest)
- **Login/PWA reliability:** splash no longer bypassed; installed PWAs refresh cleanly.
- **Mini-app builder:** `/wrecker/customize` now controls dropdowns, charges, form section toggles, sidebar.
- **New Call dynamic config:** body types, drive types, charges, toggles now driven from customizations.
- **Connections expanded:** FuelCloud/Twilio/QBO/Mapbox slots present.
- **Dev guide shipped:** `/app/memory/WRECKER_DEV_GUIDE.md`.

---

## Deferred / Future (explicitly NOT tonight)
### Phase 3B v3 — Impounds + Accounts + Dispatcher Ops + Payroll + Square POS
- Impounds module expansion
- Accounts CRM
- Dispatcher tools
- Maintenance/Expenses/Payroll exports
- Square POS reader pairing

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

---

## Tech
- Backend: FastAPI + Motor (async Mongo) + JWT (bcrypt) + Stripe + httpx.
- Frontend: React + react-router + Tailwind + shadcn/ui + Framer Motion + Sonner.
- Map: Mapbox.
- Notifications: Twilio + SendGrid + `notification_logs`.

---

## Decisions Locked (do not change without Mike's OK)
- Safety mandate: Never instruct a driver to interact with screen while driving.
- Photos default behavior: **do not save to camera roll**.
- Flutter/iOS App Store deployment handled separately.
- Strict product wall: WreckerLogix workflows must not bleed into RoadBoss.
- Do not hardcode competitor product name in UI.

---

## Reference Files
- `/app/backend/server.py` — single-file API (large; incremental refactor backlog).
- `/app/backend/wrecker.py` — WreckerLogix backend module.
- `/app/frontend/src/pages/wrecker/*` — WreckerLogix UI.
- `/app/frontend/src/pages/driver/Copilot.jsx` — shared Co-Pilot voice UI.
- `/app/memory/test_credentials.md` — demo accounts.
- `/app/memory/wreckerlogix_master_spec.md` — Flutter rescue + App Store shipping plan.
- `/app/memory/wrecker_mode_spec.md` — tow-industry parity sprint source of truth.
- `/app/memory/WRECKER_DEV_GUIDE.md` — Mike’s do-it-yourself developer cheat sheet.
