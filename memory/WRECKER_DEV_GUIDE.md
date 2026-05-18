# 🛠 WreckerLogix · Mike's Developer Cheat Sheet

> Brother — this is your "do it yourself in 2 minutes" guide. No agent needed for the tweaks below. Each section gives you the file, the line area, and a copy-paste-ready pattern. Anything more complex than what's here, ping me and I'll wire it.
>
> **Golden rule of every edit**: `yarn build` is NOT what you run. The dev server hot-reloads automatically as soon as you save the file. If something looks broken, check `tail -n 80 /var/log/supervisor/frontend.err.log`.

---

## TABLE OF CONTENTS

1. [Project map — where everything lives](#1-project-map)
2. [Editing through the in-app Customize page (NO CODE)](#2-customize-page)
3. [Adding a new dropdown option (code path)](#3-adding-a-dropdown-option)
4. [Renaming a button label](#4-renaming-a-button-label)
5. [Hiding a form field permanently](#5-hiding-a-form-field-permanently)
6. [Adding a new sidebar link](#6-adding-a-sidebar-link)
7. [Removing a driver / user](#7-removing-a-driver)
8. [Tweaking a color](#8-tweaking-a-color)
9. [Adding a new API endpoint](#9-adding-a-new-api-endpoint)
10. [Adding a new page](#10-adding-a-new-page)
11. [Common gotchas + how to recover](#11-gotchas)

---

## 1. PROJECT MAP

```
/app
├── backend/
│   ├── server.py            ← Auth, login, tokens, fleet stuff (RoadBoss)
│   ├── wrecker.py           ← Every WreckerLogix endpoint (towing, dispatch, charges, integrations)
│   ├── seed_data.py         ← Demo accounts + sample jobs
│   ├── notify.py            ← Email + push notifications
│   └── .env                 ← MONGO_URL, JWT_SECRET, MAPBOX_TOKEN — DO NOT touch
│
├── frontend/src/
│   ├── App.js               ← All routes (URL → page mapping)
│   ├── lib/api.js           ← API client + login session helpers
│   ├── components/
│   │   ├── ui/              ← Shadcn components (Button, Input, Dialog, etc.)
│   │   ├── WreckerLogixLogo.jsx
│   │   ├── Logo.jsx         ← RoadBoss logo
│   │   └── GlobalCopilotFAB.jsx ← The floating mic
│   ├── pages/
│   │   ├── Home.jsx         ← Splash with WreckerLogix · RoadBoss · Investors
│   │   ├── Login.jsx
│   │   └── wrecker/
│   │       ├── WreckerShell.jsx       ← Sidebar + layout for /wrecker/*
│   │       ├── WreckerDashboard.jsx   ← Dispatch board
│   │       ├── WreckerJobNew.jsx      ← New Call form (the big one)
│   │       ├── WreckerJobCockpit.jsx  ← Per-job control screen
│   │       ├── WreckerCustomize.jsx   ← The Editor (your mini app builder)
│   │       ├── WreckerConnections.jsx ← API key / OAuth slots
│   │       ├── WreckerSettings.jsx
│   │       └── …
│   └── pages/admin/         ← RoadBoss fleet pages (driver/vehicles/IFTA/etc.)
└── memory/
    ├── PRD.md
    ├── v2_architecture_spec.md
    └── WRECKER_DEV_GUIDE.md  ← (this file)
```

---

## 2. CUSTOMIZE PAGE (no code — fastest way)

**URL:** `/wrecker/customize` (sidebar → Office → Customize)

What you can change RIGHT NOW without touching code:

| Want to… | Section to use |
|---|---|
| Add/remove a Service Type (Tow — Light, Tow — Heavy, etc.) | **Service Types** |
| Add/remove a Body Type (Box Truck, Cube Van, etc.) | **Body Types** |
| Add/remove FWD/RWD/AWD/4×4 etc. | **Drive Types** |
| Add a new charge ("Heavy recovery — $400") | **Charge Catalog** |
| Hide entire sections of the New Call form (e.g. nobody uses Drivers section) | **New Call — Sections** (toggles) |
| Hide a sidebar item, rename it, or add a custom link | **Sidebar Menu** |
| Add a custom Quick Button to Dispatch | **Custom Quick Buttons** |
| Universally rename a label (e.g. change "Wrecker" → "Truck" everywhere) | **Universal Label Overrides** |
| Add or remove a driver | **Drivers Roster** → opens Dispatch Board's driver panel |

> Every save asks for your password (universal change safety latch). One-tap **Reset All** wipes every override back to defaults if you make a mess.

---

## 3. ADDING A DROPDOWN OPTION (code path)

You almost never need this — use the Customize page instead. But if you want to bake a new option into the *defaults* (so even tenants who Reset All see it), here's how.

**File:** `/app/frontend/src/pages/wrecker/WreckerJobNew.jsx`

Find the array near the top (lines ~39-66):

```js
const BODY_TYPES = [
  ['light', 'Light Duty'],
  ['medium', 'Medium Duty'],
  // ...
  ['other', 'Other'],
];
```

Add a new row in the format `['internal_key', 'Visible Label']`:

```js
const BODY_TYPES = [
  ['light', 'Light Duty'],
  ['box_truck', 'Box Truck'],   // ← NEW
  ['medium', 'Medium Duty'],
  // ...
];
```

Then update the **same list** in `/app/frontend/src/pages/wrecker/WreckerCustomize.jsx` (`DEFAULT_BODY_TYPES`) so the editor mirrors reality.

Save. Hot reload. Done.

---

## 4. RENAMING A BUTTON LABEL

**Want to rename "New Tow Job" to "New Call" in the sidebar?**

→ Use Customize → Sidebar Menu → click the label and type the new name. Save. Done.

**Want to rename a button that's hard-coded in a page (e.g. "Done" on the cockpit)?**

1. Open the file (e.g. `WreckerJobCockpit.jsx`)
2. Search for the exact button text
3. Replace the string between the `>` and `<` of the Button:

```jsx
<Button>Done</Button>          // ← old
<Button>Mark Complete</Button> // ← new
```

---

## 5. HIDING A FORM FIELD PERMANENTLY

**Easy way:** Customize page → New Call — Sections → toggle off.

**Code way (if you want to hide a single sub-field, not a whole section):**

In `/app/frontend/src/pages/wrecker/WreckerJobNew.jsx`, find the field (search for its `data-testid`, e.g. `data-testid="veh-vin"`). Comment it out by wrapping in `{false && (…)}`:

```jsx
{false && (
  <div>
    <Label>VIN</Label>
    <Input data-testid="veh-vin" … />
  </div>
)}
```

To bring it back: change `false` to `true` (or just delete the `{false && ()}` wrapper).

---

## 6. ADDING A SIDEBAR LINK

**Easy way:** Customize → Sidebar Menu → "Add custom link". Type label + URL. Save.

**Code way (for a permanent default item):**

`/app/frontend/src/pages/wrecker/WreckerShell.jsx` line ~16. Add a new row inside `NAV_GROUPS`:

```jsx
{
  key: 'reports',                          // ← unique slug
  to: '/wrecker/reports',                  // ← the URL
  icon: BarChart3,                         // ← lucide icon (already imported)
  label: 'Reports',
  roles: ['wrecker_dispatcher', 'fleet_admin', 'super_admin'],
},
```

Then add the route in `/app/frontend/src/App.js` and create the page file. (See section 10 for the page recipe.)

Also mirror the new key in `WreckerCustomize.jsx` `DEFAULT_NAV_ITEMS` so the editor sees it.

---

## 7. REMOVING A DRIVER

You don't do this in code — the driver list is in the database. Two ways:

1. **Easiest:** Dispatch Board → Drivers panel → click a driver → "Remove" (this fires a soft delete). 
2. **God-mode:** `/super` (super admin console) → Users tab → search for the driver → change role / delete. This is yours alone (`mward5710@gmail.com`).

**To never let a driver log in again** without deleting:

```bash
# Terminal in the container
mongosh mongodb://localhost:27017/wreckerlogix
> db.users.updateOne({email: "driver@example.com"}, {$set: {disabled: true}})
```

(Backend rejects logins for users with `disabled: true`.)

---

## 8. TWEAKING A COLOR

WreckerLogix uses **amber** as primary (Mike's color), **sky** for RoadBoss, **emerald** for "live/saved", **rose** for "danger/disconnect".

Color values are Tailwind utility classes — you don't dig into CSS variables.

**Rename or recolor a button:**

```jsx
// Before — amber primary
<Button className="bg-amber-500 text-slate-950 hover:bg-amber-400">Save</Button>

// After — sky primary
<Button className="bg-sky-500 text-slate-950 hover:bg-sky-400">Save</Button>
```

The `-500` is the base shade. `-300` lighter, `-700` darker. Stick to the existing palette per the design rules.

**The brand wall (don't break it):**
- WreckerLogix pages: `amber` accents
- RoadBoss pages: `sky` accents
- Never mix them on the same page.

---

## 9. ADDING A NEW API ENDPOINT

**File:** `/app/backend/wrecker.py` (or `server.py` if it's RoadBoss-side).

Pattern (copy-paste then customize):

```python
class MyNewIn(BaseModel):
    name: str
    something: Optional[int] = None

@router.get('/my-thing')
async def list_my_thing(user=Depends(require_wrecker)):
    tenant_id = user.get('tenant_id', 'default')
    rows = await db.my_things.find({'tenant_id': tenant_id}, {'_id': 0}).to_list(500)
    return rows

@router.post('/my-thing')
async def create_my_thing(body: MyNewIn, user=Depends(require_dispatcher)):
    doc = {
        'id': _new_id(),
        'tenant_id': user.get('tenant_id', 'default'),
        'name': body.name,
        'something': body.something,
        'created_at': _now(),
        'created_by': user.get('email'),
    }
    await db.my_things.insert_one(doc)
    return doc
```

**Rules:**
- ALL routes get the `/api` prefix automatically — don't write `/api` in your `@router` decorator.
- Always use `_new_id()` not Mongo `ObjectId`.
- Always use `_now()` (returns timezone-aware UTC).
- `require_wrecker` = any wrecker role can read; `require_dispatcher` = dispatcher+ can write.
- After saving file: backend hot-reloads. Test with `curl`:
  ```bash
  curl -X POST $REACT_APP_BACKEND_URL/api/wrecker/my-thing \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"test"}'
  ```

---

## 10. ADDING A NEW PAGE

**Recipe (3 files):**

1. **Create the page** at `/app/frontend/src/pages/wrecker/WreckerReports.jsx`:

```jsx
import React from 'react';
import { Card } from '@/components/ui/card';

export default function WreckerReports() {
  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="wrecker-reports">
      <h1 className="text-2xl font-bold text-white mb-4">Reports</h1>
      <Card className="bg-[#0a0e14] border-white/5 p-5">
        <p className="text-slate-400">Your reports go here.</p>
      </Card>
    </div>
  );
}
```

2. **Wire the route** in `/app/frontend/src/App.js`:

```jsx
import WreckerReports from '@/pages/wrecker/WreckerReports';

// inside the /wrecker block:
<Route path="reports" element={<WreckerReports />} />
```

3. **Add to sidebar** (see section 6).

Save → hot reload → `/wrecker/reports` is live.

---

## 11. GOTCHAS

| Symptom | Likely cause | Fix |
|---|---|---|
| Page is blank, "Cannot read property of undefined" | A required field is `null` and you didn't guard it | Wrap with `{thing && (…)}` or use `thing?.field` |
| Backend returns 401 on every request | Your token expired (shouldn't happen — they last 10 years) OR you logged out in another tab | Hit `/login` again |
| Login says "Invalid credentials" but you're SURE the password is right | Browser auto-fill stomping. Edge → Settings → Passwords → delete the saved one | Type manually next time |
| iPhone PWA goes straight into the cab instead of splash | Your installed icon was made BEFORE the splash work — its cached `start_url` is `/login` | Long-press icon → Remove App. Open Safari → `…roadboss.app/` → Share → Add to Home Screen |
| "service is not running" error | Frontend or backend died | `tail -n 80 /var/log/supervisor/frontend.err.log`, then `sudo supervisorctl restart frontend` |
| Customize page saves silently fail | Wrong password in the confirm dialog | Re-enter — this is the safety latch |
| Lost half a feature | You probably hot-saved a half-edit. Customize → "Reset All" gets you back to defaults. |

---

## TL;DR — THE THREE LEVERS

When in doubt, brother:

1. **Cosmetic / dropdown / hide-a-thing** → `/wrecker/customize` page. No code.
2. **New page or new endpoint** → Section 9 + 10 of this doc.
3. **Anything bigger** → DM the agent, link this file, and say "I want X — extend Y".

That keeps the brand wall safe and the architecture clean.

---

*Last updated: 2026 — Built for Mike Ward.*
