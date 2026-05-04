# Wrecker Mode (RoadBoss web/PWA) — Master Spec

> Built for Mike Ward / Martin Wrecker Service Inc.
> This doc captures EVERYTHING from the Towbook reference walk-through (IMG_0850–0869) so future agents can ship the missing pieces without re-asking.

## Scope clarification
- This is the **web + PWA** version of Wrecker Mode living *inside* RoadBoss (React + FastAPI + MongoDB).
- The native iOS Flutter app is a SEPARATE Emergent session driven by `/app/memory/wreckerlogix_master_spec.md`.
- Mike already holds a paid Apple Developer account.

## Phased build plan

### ✅ Phase 0 — already shipped (prior sessions)
- Wrecker dispatch board + role gates (driver / dispatcher / supervisor / admin)
- Rotation engine (`last_dispatched_at`)
- Voice-first AI Co-Pilot intents
- Driver Home (My Calls)
- Job Detail w/ basic status pipeline & assignment

### 🟢 Phase 1 — Driver Job Cockpit (TONIGHT)
- 7-stage Towbook-style status flow:
  `pending → assigned → en_route → on_scene → towing → dest_arrival → completed`
  *(rename existing `in_progress` → `towing`, add new `dest_arrival`)*
- Vehicle Details additions: `has_keys` (bool), `key_location` (str), `drivable` (bool), `drive_type` (FWD/RWD/AWD/4X4)
- Photos with stage tags: `on_scene | towing | dest_arrival | other` — base64 stored in MongoDB (camera-roll-isolated)
- Photo count badge
- Top action row: Photos / Chat / Signatures / Damage Form / Email Receipt / Print / Payments / Files
- Color-coded status timeline w/ timestamps
- Pickup/Destination cards with edit + directions

### 🟡 Phase 2 — Damage Form + Liability Waiver + Signatures (TONIGHT)
- Interactive 4-view vehicle SVG diagram (top, front, back, side wheels). Tap to mark damage spot → severity dropdown (Minor / Moderate / Major / Pre-existing)
- Per-fleet editable liability waiver text (default = Martin Wrecker boilerplate)
- Signature canvas (HTML5 Canvas → base64) for both customer & driver
- Stored in new collections: `damage_forms`, `waivers`

### 🟡 Phase 3 — Charges, Invoice & Receipts (TONIGHT)
- Rate sheet config (per-fleet defaults):
  - Tow/Hook Fee · Loaded Mileage · Unloaded Mileage · Admin Fee · Certified Mail · Title Search · Labor · Set Out · Daily Impound Rate · Fuel Surcharge
- Line-item editor (rate × qty math)
- Payment records: cash / check / card / Square / motor-club / other
- Email receipt via SendGrid (already wired) with toggles: Hide Charges, Hide Discounts, Hide Photos, Include Online Payment Link
- SMS receipt via Twilio (already wired)

### 🟠 Phase 4 — Impounds Module (NEXT SESSION)
- Top-level Impounds nav with stock #, days-held auto-counter, daily rate × days, lot inventory, release flow w/ ID capture, certified mail tracking

### 🟠 Phase 5 — Accounts CRM (NEXT SESSION)
- Customer/MC roster categorized by Type tag (Motor Club / Dealership / Fleet / Service Shop / Property Removal / Other)
- Searchable, filterable, FAB ➕ to add. Account picker auto-fills new tow jobs. Per-account custom reason dropdown (AAA = Tow / Lockout No-Key / Jumpstart / Tire Change / Extrication / Winch Out / Fuel Delivery / etc.)

### 🔵 Phase 6 — Dispatcher Tools (NEXT SESSION)
- Rotation override (manual driver pick + reason text)
- Dispatcher-managed Driver Clock In / Clock Out / Lunch tracking
- Custom reason dropdowns per Account

### 🔵 Phase 7 — Operations & Payroll (NEXT SESSION)
- Truck Maintenance tab (per-truck work orders + repair cost log + recurring service intervals)
- Truck Expenses (driver-side fuel/parts/repairs logging)
- Payroll auto-fill: clocked hours × pay rate + commission − deductions + reimbursements → CSV export

### 🟣 Phase 8 — Square POS (FUTURE — needs Mike's Square API key)
- Square Web Payments SDK (in-app card entry)
- Square Reader BT pairing (chip + tap)
- Online payment links in receipts

## Data model (Wrecker Mode)

```
tow_jobs                 # extended with: charges[], payments[], photos[{stage, data_url}], damage_form_id, waiver_id, has_keys, key_location, drivable, drive_type
damage_forms             # {job_id, marks: [{x, y, panel, severity, note}], signature_data_url, customer_name, signed_at}
waivers                  # {job_id, waiver_text_snapshot, signature_data_url, customer_name, accepted_at}
fleet_rate_sheet         # {fleet_id, items: [{key, label, rate, default_qty}]}
fleet_waiver_template    # {fleet_id, waiver_text}
accounts                 # {id, name, type, address, phone, default_rate_sheet_overrides, custom_reasons[]}
impounds                 # already exists — extend with certified_mail_records
truck_maintenance        # {truck_id, work_orders: [{description, status, cost, vendor, date}]}
truck_expenses           # {truck_id, driver_id, type, amount, photo_url, date}
clock_entries            # {driver_id, clocked_in_at, clocked_out_at, lunch_start, lunch_end, hours_total}
payroll_periods          # {fleet_id, start, end, drivers: [{driver_id, hours, gross, deductions, net}]}
```

## Default rate sheet (Martin Wrecker baseline — admin-editable)
- Tow/Hook Fee — $65
- Loaded Mileage — $4.50/mi
- Unloaded Mileage — $3.50/mi
- Admin Fee — $50
- Certified Mail — $100 (×1)
- Title Search — $100 (×1)
- Labor — $150/hr
- Set Out — $100
- Daily Impound Rate — $50/day
- Fuel Surcharge — $5

## Default Martin Wrecker liability waiver text
> The driver has been absolutely forbidden to push cars with his/her truck or drive in any type of grass area. UNDER ANY CIRCUMSTANCES WHATSOEVER! Please do not make his/her position difficult by requesting him/her to do so.
>
> If towing a vehicle does result in having to go onto the property/grass area the property owner understands that damage may result and will not hold {{ COMPANY_NAME }} responsible for any & all damages done to said property.
>
> I have been advised that servicing or removal of my car may result in unavoidable damage. I hereby authorize the servicing of my car and agree that I will not hold {{ COMPANY_NAME }} responsible for such unavoidable damage.
>
> I have been advised that leaving my car at an unattended location may result in unavoidable vandalism, theft or other damage. I hereby authorize the service to be provided and agree that I will not hold the service facility, its employees or {{ COMPANY_NAME }} responsible for such unavoidable vandalism, theft or other damage.
>
> I hereby agree to hold {{ COMPANY_NAME }} harmless for any previous damage on vehicle prior to time of service. I will not hold {{ COMPANY_NAME }} responsible for such pre-existing damage.
>
> I hereby acknowledge the probability the vehicle may have pre-existing damage or become damaged during the course of service and agree that I will not hold {{ COMPANY_NAME }} or its employees responsible for such damage. I also acknowledge that if my vehicle is 15 years old or older that I will not hold {{ COMPANY_NAME }} responsible for any structural damage to the under carriage of the vehicle.
>
> For Tire Services {{ COMPANY_NAME }} is not responsible for wearable maintenance items such as Lug Nuts &/or Lug Studs.

## Critical rules
- **Photos NEVER auto-save to camera roll.** Base64 in-memory upload only. Setting toggle exists but DEFAULT OFF.
- **Drivers NEVER cherry-pick calls.** Dispatcher assigns via rotation; supervisor can override.
- **Liability waiver text is per-fleet editable** (each company has different legal language).
- **All datetimes UTC + tz-aware.**
- **All IDs UUIDv4.**
