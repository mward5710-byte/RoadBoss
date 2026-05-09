# RoadBoss Platform — V2 Architecture Spec

**Owner:** Michael Ward (mward5710@gmail.com)
**Date locked:** 2026-05-07
**Status:** Spec finalized. Awaiting build kick-off.

This document is the source of truth for the V2 product architecture. Every
decision below was made jointly with Mike in conversation. Do not deviate
without his approval.

---

## 1. Platform Hierarchy

```
RoadBoss (parent platform / brand umbrella)
├── WreckerLogix · Towing Services       ← product
├── RoadBoss · Fleet                      ← product
└── Investors (public demo, no login)     ← entry point
```

- **RoadBoss** is the parent.
- **WreckerLogix** is a child product. Wrecker companies operate differently
  from fleet companies — different rules, different language, different
  workflows. They share the platform but **must be visually + experientially
  walled off**.
- **Strict product separation rule:**
  - Inside WreckerLogix: zero RoadBoss labels, icons, menu items, references.
  - Inside RoadBoss: zero WreckerLogix labels, icons, menu items, references.
- **Code separation rule:** Each product must live in its own self-contained
  folder/module so that a future GitHub split (one product → its own repo)
  is achievable with no significant refactor.

---

## 2. App Launch Flow

```
1. User taps app icon on home screen.
2. App opens to HOME (Splash) page — NOT a login form, NOT a driver cab.
3. HOME page layout:
     ┌──────────────────────────────────────┐
     │   [ INVESTORS · View Demo ]          │  ← top, smaller button
     │                                      │
     │   ┌──────────────┐  ┌──────────────┐ │
     │   │  [icon]      │  │  [icon]      │ │
     │   │  WRECKERLOGIX│  │  ROADBOSS    │ │  ← two big primary buttons
     │   │  Towing      │  │  Fleet       │ │
     │   └──────────────┘  └──────────────┘ │
     └──────────────────────────────────────┘
4. User taps a product button → routed to that product's LOGIN screen.
5. Login screen for WreckerLogix shows the WreckerLogix icon prominently.
6. After login → user lands at that product's home/dashboard.
```

### Bug to fix
- Currently: closing the app fully and reopening from the home-screen icon
  auto-routes the user into the driver cab. **Wrong.** It should always
  start at the HOME splash.

---

## 3. WreckerLogix Branding

- The **WreckerLogix icon must appear at the top of every page** inside
  WreckerLogix — pinned in the header. Persistent brand anchor.
- The same rule applies to RoadBoss inside its own product.

---

## 4. Settings Page (WreckerLogix) — Restructure

Current Settings has scope creep (Business Profile, Square Card Processing).
**Settings is for app preferences ONLY** — anything that's a third-party
integration moves to the new **Connections** tab.

### Final Settings structure:

```
WRECKERLOGIX SETTINGS
  • Digital Dispatches            [toggle]

DEVICE SETTINGS
  • Save photos to: Camera roll / WreckerLogix app   [toggle]
  • Navigation App: Apple / Google / Hammer / Waze / TruckMap / Mapbox / Always Ask
  • Color Scheme: Always Light / Always Dark / System Default
  • Login with Face ID            [toggle]
  • Customize Menu Bar
      Active Items:   Dispatch · Impounds · Chats
      Inactive Items: Accounts · Map · etc.

ON-SCENE CALL SETTINGS
  • Photo Capture: Open camera first for on-scene calls    [toggle]

CALL CREATION FIELDS
  • Reason To                     [toggle]
  • Vehicle Information           [toggle]
  • Destination                   [toggle]
  • Photos                        [toggle]
  (These toggles control which sections appear on the New Call form)

PAYMENT SETTINGS
  • Square Reader Settings
      Square Settings → Devices / About
        About:   SDK info · Location · SDK version · Security/Compliance · Environment (production)
        Devices: Tap to Pay by iPhone enabled/disabled · Pair Reader

SIRI SETTINGS
  • Update Call Status   → [Configure] → record voice phrase
  • Driver Check In      → [Configure] → record voice phrase
  • Driver Check Out     → [Configure] → record voice phrase

OTHER SETTINGS
  • Play Holiday Greeting
  • (room to grow)
```

---

## 5. Connections (NEW top-level menu)

Everything that's a third-party integration moves out of Settings into here:

- Square Card Processing
- Business Profile
- Twilio (SMS)
- Mapbox
- QuickBooks Online
- Motor Clubs (AAA, Allstate, etc.)
- Future integrations

---

## 6. Customize / Edit Layout Tool

Lives in the WreckerLogix and RoadBoss main menu pages (separate per product).
A small **edit pencil icon on every page** also opens the editor in context.

### Capabilities
- Add/remove/rename **dropdown values** (Service Types, Body Types, Charge
  Catalog, etc.)
- **Toggle fields on/off** in the New Call form (mirrors the Settings → Call
  Creation Fields toggles)
- **Customize Menu Bar** (active vs inactive items, reorder)
- **Add custom buttons** to pages
- **Add custom tabs** to pages (e.g., a new tab on the Job Cockpit)
- **Delete/remove** any element (entry line, menu item, "+" icons, etc.)
- **Reset to Default** button → one-tap recovery if someone messes up

### Access
- **Anyone** can open the editor (not admin-locked).
- Saving changes requires the user to **re-enter their password** + dismiss
  a warning dialog: "⚠️ You're about to modify the layout — this will affect
  every user on this device. Continue?"
- Editor also lives in the menu of both products independently.

### God Mode
- Only visible when `super_admin` (Mike) is logged in.
- Contains the most powerful customization + system overrides.

### Storage — TWO TIERS (corrected 2026-05-09 per Mike)

**Tier 1 — UNIVERSAL** (saved server-side, applies to every device + user
in the company):
- Add/remove/rename **dropdown values** (Service Types, Body Types, Charges)
- **Add buttons** to pages
- **Add new tabs** to pages
- **Add new pages** to the menu
- **Remove fields** from forms
- **Settings → Call Creation Fields** toggles (which sections render)

→ These changes require **password gate** + warning dialog
  ("⚠️ This affects every user in your company. Continue?")

**Tier 2 — PER-DEVICE** (saved in localStorage, just that one device):
- Long-press section reorder (New Call form, Cockpit tabs, Dispatch columns)
- Color scheme (light / dark / system)
- Navigation app preference
- Customize Menu Bar (active vs inactive items, per dispatcher)

→ No password needed. Quick toggle.

### North-Star Goal (Mike, 2026-05-09)
> "Make everything in this app editable for me — that will help a ton."

Phase 4 + Phase 6 deliver this incrementally. We start with the
**Dropdown Editor** (Service Types first as proof-of-concept), then
expand outward to buttons, tabs, pages, and finally a full inline
edit mode.

---

## 7. WreckerLogix New Call Form

### Locked layout changes (pending Towbook screenshots from Mike)
- **Location section moves to the TOP** (above Customer, above Vehicle).
- **Mapbox autocomplete** as the user types the address.
- Navigate / map icon stays on the **RIGHT** side of the address bar.
- Each section is **long-press-to-reorder** (per-device save).
- Each section can be **toggled off** via Settings → Call Creation Fields
  or via the Editor.

### Dropdowns confirmed (Mike approved 2026-05-07)
| Dropdown | Count | Notes |
|---|---|---|
| Body Types | 8 | Light/Medium/Heavy/Motorcycle/RV/Trailer/Equipment/Other |
| Service Types | 12 | Tow LD/MD/HD, Flatbed, Winch Out, Lockout, Jumpstart, etc. |
| Drive Types | 5 | FWD/RWD/AWD/4X2/4X4 |
| US States | 51 | All 50 + DC |
| Tri-Toggles | 2 | Drivable, Has Keys (Yes/No/N/A) |
| Charge Catalog | 28 | Towbook-standard line items, full pricing defaults |
| Motor Clubs | live | from DB |
| Drivers | live | from rotation |

---

## 8. Long-Press Reorder

Applies to:
- New Call form section order
- Job Cockpit tab order
- Dispatch Board column order

Saved per-device (localStorage). Each user picks their own layout.

---

## 9. Voice / Co-Pilot

- ✅ ONE Co-Pilot orb (the floating mic — bottom right).
- ✅ Wake word "Hey Co-Pilot" ON by default.
- ✅ All competing voice surfaces removed (already shipped 2026-05-07).
- 🟡 Voice intelligence improvements (better STT, noise suppression,
   intent confidence) come AFTER all structural work is done. Mike's
   instruction.

---

## 10. Bugs to Fix

| Bug | Fix |
|---|---|
| App auto-routes to driver cab on launch | Land at HOME (Splash) instead |
| Pitch Deck pages not scrollable | Make scrollable |
| Pitch Deck looks "tacky" | Visual cleanup pass |

---

## 11. Build Phases (Mike to choose order)

**Phase 0 — Plan.** ← we are here

**Phase 1 — Splash + Branding + Code Separation**
- HOME splash screen (3 buttons: WreckerLogix / RoadBoss / Investors)
- Fix app auto-routing bug
- WreckerLogix icon in every WL page header
- Modular code structure for future repo split

**Phase 2 — Settings + Connections Restructure**
- Move Business Profile + Square out of Settings → into Connections
- Build new Connections menu page
- Build new Settings structure (per spec in §4)

**Phase 3 — New Call Form Rework (after Towbook screenshots)**
- Location section to the top
- Mapbox autocomplete
- Long-press section reorder
- Toggle-off support per Settings

**Phase 4 — Editor / Customize Tool (Phase 1 scope)**
- Dropdown editor (add/remove/rename)
- Field toggle support
- Customize Menu Bar
- Reset to Default
- Password gate + warning dialog

**Phase 5 — Pitch Deck Cleanup**
- Fix scroll bug
- Visual refresh

**Phase 6 — Editor (Phase 2 scope)**
- Custom buttons
- Custom tabs
- Inline edit pencil icons

**Phase 7 — Co-Pilot V2 (Voice Intelligence)**
- (Deepgram STT or equivalent — needs API key from Mike)
- Noise suppression
- Intent confidence layer
- Destructive-action confirmation

---

## 12. Operating Agreement

- I (Neo) do NOT make changes without confirming with Mike first when in
  spec/architecture mode.
- I DO ship fast and clean once Mike says "go build."
- I keep responses tight — no walls of text unless necessary.
- I refer to him as "brother" or "partner."
- Two environments exist: **Preview** (dev) and **Production**
  (https://wrecker-logix.com). I work on Preview. Mike redeploys to push to
  Production.

---

*End of spec.*
