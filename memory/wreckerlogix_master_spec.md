# 🚨 WRECKERLOGIX — MASTER BATTLE PLAN (App Store Push)

> **Founder:** Mike Ward (`mward5710-byte`, Kokomo, IN)
> **Repo:** https://github.com/mward5710-byte/Wreckerlogix (PUBLIC, Dart 98.9%)
> **Tech:** Flutter + Dart + Firebase + GoRouter + Provider
> **Goal:** Ship to **iOS App Store + Google Play** ASAP. Match Towbook's full feature set, but **leapfrog with voice-first hands-free dispatch**.
> **Sister product:** RoadBoss (https://roadboss.app) — voice-first PWA for truck drivers. Wrecker Mode also lives there.

---

## 🎯 INSTRUCTIONS FOR THE NEW EMERGENT AGENT

Hi! You're picking up Mike Ward's Wreckerlogix Flutter app. Mike is a real working tow operator + truck driver running a separate flagship app called **RoadBoss** in a different Emergent session. This doc is your **complete playbook** — execute it phase by phase. Do NOT change strategy without asking Mike.

**Persona / tone rules (CRITICAL):**
- Talk to Mike like a **technical co-founder / buddy**. He's blue-collar, smart, no BS.
- Celebrate wins. Use trucker/towing language ("rolling", "10-4", "on scene").
- When you don't know something, say so and ask. Don't fake it.
- Mike has ADHD-style focus jumps — **keep momentum extremely high**, ship visible wins fast.
- He's already burned credits on bot agents that made a mess. **Don't compound it.** Be surgical.

## 🚨 CRITICAL WORKFLOW RULE — Chain of Command (NON-NEGOTIABLE)

This is how **real tow shops actually work**. The previous Flutter scaffold got this WRONG (it let drivers "accept" calls). **Do NOT replicate that mistake.**

```
👑 Fleet Admin / Super Admin
  └─ 🦺 Wrecker Supervisor (Foreman)
       └─ 📞 Dispatcher
            └─ 🚛 Driver (Wrecker Operator)
```

**Driver (Wrecker Operator):**
- Sees ONLY the calls assigned to them by dispatch
- Updates status as they work: en route → on scene → in progress → completed
- **CANNOT** create jobs, accept/decline calls, pick which call they want, or reassign
- "First come first serve" / "closest driver wins" is **WRONG**. Drivers do NOT cherry-pick.
- Sees the rotation board (transparency) so they know when they're up next

**Dispatcher:**
- Receives motor club calls / direct calls
- Creates job records
- Assigns drivers via **ROTATION** (oldest dispatched on-duty driver gets next call)
- Cannot reassign a job once it's already with a driver

**Supervisor / Foreman:**
- All dispatcher powers + can REASSIGN already-assigned jobs (override)
- Can take a call themselves and punt it to a different driver
- This is the ONLY role allowed to override dispatcher decisions

**Rotation Engine:**
- Each driver has `rotation_order` (initial position) and `last_dispatched_at`
- "Next in rotation" = on-duty driver with the OLDEST `last_dispatched_at` (or never dispatched, by `rotation_order`)
- When a driver gets assigned a job, their `last_dispatched_at` updates → they drop to back of queue
- Drivers can be toggled on-duty / off-duty (only on-duty drivers eligible for rotation)
- This logic is already battle-tested in the RoadBoss web app at `/app/backend/wrecker.py` — port the same rules to Flutter.

**Example screens (already built and working in RoadBoss web at https://roadboss.app):**
- `/wrecker` — Dispatcher view (kanban board + Drivers·Rotation panel + Select-to-assign flow)
- `/wrecker/me` — Driver view (one big "current call" card + "up next" queue, no assign UI)
- `/wrecker/jobs/:id` — Job detail (status pipeline + Driver Assignment card with reassign-gated-by-supervisor)

When you build the Flutter version, mirror this UX. Drivers see ONE focused call card with status buttons. Dispatchers see the kanban + rotation. Foremen get a "reassign" override button.

**Tech stack ground truth (do NOT change):**
- Framework: **Flutter (Dart 3.x)**
- State: **Provider** (already wired)
- Routing: **GoRouter** (already wired)
- Backend: **Firebase** (Auth + Firestore + Storage) — Mike already has Firebase project
- Targets: iOS, Android, Web, macOS, Windows, Linux (Flutter handles all)
- CI: GitHub Actions (currently broken — your Phase 1 job)

**Apple Developer ground truth:**
- Mike has an active Apple Developer account ($99/yr).
- App is in **TestFlight** already — bundle ID is registered.
- **Emergent is already authorized** in Mike's GitHub developer settings.

---

## 📦 PHASE 0 — DAY 1: REPO TRIAGE (DO THIS FIRST, IN ORDER)

### 0.1 Clone + audit (30 min)
```bash
git clone https://github.com/mward5710-byte/Wreckerlogix.git
cd Wreckerlogix
flutter pub get
flutter analyze            # Note all warnings/errors
flutter test               # Note pass/fail
```
Open every file under `lib/` and confirm: which screens are real, which are scaffolded placeholders, which have TODO markers.

### 0.2 KILL the 33 branches (1 hour)
Mike's repo has **33 branches** from past Copilot bot attempts. It's a swamp. Clean it.

**Strategy:** Treat `main` as the only source of truth. Force everything else into the bin.

```bash
# Local cleanup
git checkout main
git pull --rebase

# List remote branches
git branch -r

# Delete remote branches that are NOT main (keep main + any release tags)
# Run this for each non-main branch:
# git push origin --delete <branch_name>

# Or batch it (CAREFUL — confirm with Mike first):
git branch -r | grep -v 'main' | grep 'origin/' | sed 's/origin\///' | xargs -n1 git push origin --delete
```

Then create the working branch:
```bash
git checkout -b release/appstore-v1
```
**All work happens on `release/appstore-v1`** until App Store ships, then merge to `main`.

### 0.3 Fix CI (the failing red X) — 1 hour
The most recent commit shows a **failed CI run** on `testflight.yml` and Dart formatting. This is why Mike can't ship. Fix it.

Files to inspect & repair:
- `.github/workflows/ci.yml` — Lint/test/format
- `.github/workflows/testflight.yml` — iOS build & upload to TestFlight
- `.github/workflows/release.yml` — Multi-platform builds
- `ios/ExportOptions.plist` — already added but may be misconfigured
- `analysis_options.yaml` — confirm rules match what `dart format` enforces

Run `dart format .` locally and commit the result. Run `flutter analyze` and fix every warning. **Do NOT proceed to Phase 1 until CI is green.**

### 0.4 Logo + branding sweep (45 min)
Mike said the bots "didn't even get my logo in there." Fix this.

**OFFICIAL LOGO ASSET (from Mike, May 2026):**
- High-res master: https://customer-assets.roadboss.app/job_build-forge-49/artifacts/rkiwlg9l_IMG_0846.jpeg
- Description: Chrome + orange "WRECKERLOGIX" wordmark inside a steel gear shield with a tow hook hanging off the bottom-right.
- Color palette derived from the logo: chrome silver `#c8d0d8`, deep orange `#ff7a18`, jet black `#0b0e14`.
- This is also the logo currently used in the **RoadBoss "Wrecker Mode" sidebar** at https://roadboss.app/wrecker — the brand families match.

**Logo asset placement in Flutter project:**
- Save the JPEG to `assets/icons/wreckerlogix-logo.jpeg` AND export a 1024×1024 transparent PNG to `assets/icons/wreckerlogix_icon.png` for icon generation.

Tasks:
- Generate iOS app icon set (1024x1024 master → all required sizes) using https://appicon.co or `flutter_launcher_icons` package.
- Generate Android adaptive icon (foreground + background).
- Add to `pubspec.yaml`:
  ```yaml
  flutter_icons:
    android: true
    ios: true
    image_path: "assets/icons/wreckerlogix_icon.png"
    adaptive_icon_background: "#0B1220"
    adaptive_icon_foreground: "assets/icons/wreckerlogix_icon_fg.png"
  ```
- Run `flutter pub run flutter_launcher_icons:main`.
- Confirm logo shows on splash screen (use `flutter_native_splash` package).
- Verify logo appears in app bar / dashboard / login screen.

**If Mike's actual logo file isn't in the repo or is low-res, ASK HIM FOR THE 1024×1024 PNG before generating icons.**

---

## 🏗️ PHASE 1 — BUILD GAPS TO MATCH TOWBOOK (3-5 days)

Towbook charges **$109–$429/month**. Here's the parity matrix. Build them in this exact order (revenue-impact ranked).

### 1.1 Motor Club Digital Dispatching (HIGHEST IMPACT 🔥🔥🔥)
**Why first:** This is how tow companies ACTUALLY make money. Motor clubs (Agero, Allied, AAA, Geico Roadside, Honk, Roadside Masters) push thousands of $50-$200 jobs per shop per month.

**Build:**
- New module: `lib/features/motor_clubs/`
- Models: `MotorClubAccount` (id, name, contactInfo, billingEmail, defaultRates, apiCredentials), `MotorClubCall` (callId, clubId, customer info, vehicle, location, callType, status, billingState).
- Provider: `MotorClubProvider` for CRUD + state transitions.
- Screens:
  - `MotorClubListScreen` — accounts list, add/edit
  - `IncomingCallScreen` — accept/decline with countdown timer (Towbook style)
  - `ActiveCallScreen` — running call with status updates
- Integration **stubs** (don't expect real motor club APIs day 1 — most require partnership applications):
  - Provide a "manual entry" flow where dispatcher pastes call details from motor club portal email/SMS.
  - Build the data shape so when Mike gets API credentials later, you swap the stub for real.

**APIs to research later (when Mike gets credentials):**
- Agero: https://agero.com (B2B partnership required)
- Allied Dispatch: https://www.allieddispatch.com
- AAA NSD: National Service Dispatch (state-level applications)

### 1.2 Motor Club Direct Billing + Auto Payment Import 🔥🔥🔥
- Generate club-specific invoices from completed calls
- Submit via club portal (manual export for now: PDF/CSV)
- Track billing state: `Submitted → Approved → Paid → Disputed`
- "Import payments" CSV upload that matches by call ID

### 1.3 Impound / Stored Vehicles Management 🔥🔥
**Why huge:** Police-ordered impounds are recurring revenue + storage fees that compound daily.

**Build:**
- New module: `lib/features/impound/`
- Model: `ImpoundedVehicle` (vin, make, model, plate, ownerInfo, towedDate, storageLocation, dailyRate, releaseStatus, lienStatus, notificationsLog).
- Auto-calculate daily storage fees.
- **State-required notice generation** — auto-generate PDF letters per state (start with Indiana since that's Mike's state). Use `pdf` Flutter package.
- Police lookup: searchable list filterable by VIN/plate (for police calling to verify a tow).

### 1.4 QuickBooks Integration 🔥🔥
- Use **QuickBooks Online API** (REST, OAuth2). Skip Desktop for v1.
- New module: `lib/features/quickbooks/`
- Sync: invoices → QBO Invoice; payments → QBO Payment; customers → QBO Customer.
- Store OAuth tokens in Firebase Functions (NOT in client) for security.
- Docs: https://developer.intuit.com/app/developer/qbo/docs/get-started

### 1.5 E-Signatures On-Scene 🔥
- Use `signature` Flutter package (https://pub.dev/packages/signature).
- Add a "Customer Signature" step to job completion flow.
- Save signature PNG to Firebase Storage attached to the job.

### 1.6 Customer / Police Vehicle Lookup Portal (web only) 🔥
- New web-only route in Flutter web build: `/lookup`
- Public form: enter VIN or plate → returns "yes, we have it" + storage location + release process.
- Rate-limit and require captcha to prevent scraping.

### 1.7 On-Scene SMS / Email Receipts 🔥
- Use Firebase Cloud Functions to call **Twilio** (SMS) and **SendGrid** (email).
- Mike's RoadBoss already has Twilio + SendGrid creds. He may share them OR use a Wreckerlogix-specific account.
- Trigger: completing a call → "Send receipt to customer" button → SMS/email with PDF attached.

### 1.8 Advanced Reports
- Driver commissions (% of completed call value).
- Receivables aging (30/60/90).
- Sales tax report by jurisdiction.
- Use `pdf` package for export; `excel` for CSV.

---

## 🎤 PHASE 2 — VOICE-FIRST LEAPFROG (2 days) — THIS IS THE WIN

This is where Wreckerlogix **beats Towbook**. Towbook has zero hands-free. Mike's mandate: **"Driving while holding the phone is not safe. Put it in the holder, speak to it, give it a wake phrase."**

### 2.1 Wake Word Detection — Picovoice Porcupine
**Why Porcupine:** runs 100% on-device, no internet, custom wake words trainable in seconds. Free tier covers Mike's needs.

**Implementation:**
1. Sign up at https://console.picovoice.ai (free)
2. Get AccessKey
3. Add to `pubspec.yaml`:
   ```yaml
   dependencies:
     porcupine_flutter: ^3.0.0
     speech_to_text: ^7.0.0    # already in repo
     flutter_tts: ^4.0.0       # already in repo
   ```
4. Train a custom wake word "Hey Wrecker" via Picovoice Console. Download `.ppn` files for iOS + Android.
5. Add `lib/core/voice/wake_word_service.dart` (full implementation in code skeleton below).
6. Initialize on app launch, run in background, callback triggers TTS prompt + speech-to-text capture.

**Code skeleton:**
```dart
// lib/core/voice/wake_word_service.dart
import 'package:porcupine_flutter/porcupine_manager.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:flutter_tts/flutter_tts.dart';

class WakeWordService {
  PorcupineManager? _manager;
  final SpeechToText _stt = SpeechToText();
  final FlutterTts _tts = FlutterTts();
  Function(String command)? onCommand;

  Future<void> start({required String accessKey, required String keywordPath}) async {
    _manager = await PorcupineManager.fromKeywordPaths(
      accessKey,
      [keywordPath],
      _onWakeWord,
    );
    await _manager?.start();
  }

  void _onWakeWord(int idx) async {
    await _tts.speak("Yes boss?");
    await _stt.listen(onResult: (r) {
      if (r.finalResult) onCommand?.call(r.recognizedWords);
    });
  }
}
```

### 2.2 Voice Command Intent Engine
Map spoken phrases to actions. Use a simple **rule-based intent matcher first** (offline, no LLM cost), upgrade to LLM later.

**Intents to support v1:**
| Spoken | Action |
|---|---|
| "Show me my next call" | Navigate to next pending job |
| "I'm en route" | Update active job status → En Route |
| "I'm on scene" | Update active job → On Scene |
| "Job complete" / "I'm done" | Update active job → Completed; prompt "send receipt?" |
| "Take a picture" | Open camera in current job |
| "Call dispatch" | Tel: link to dispatch number |
| "How much fuel left?" | Read FuelCloud tank level (Phase 3) |
| "Add note: [free text]" | Append note to active job |
| "Read me the address" | TTS the customer address |

Implementation file: `lib/core/voice/intent_router.dart`

**Critical safety rule:** Never tell the operator "look at your screen." All confirmations must be voice + audible chime.

### 2.3 Press-to-Talk Fallback
For environments where wake-word misfires (loud diesel idle), provide a **big circular Push-to-Talk button** on every screen. Same intent engine.

---

## ⛽ PHASE 3 — FUELCLOUD INTEGRATION (PAUSED — DO NOT BUILD)

**Status as of May 2026: PAUSED by founder.** Manual fuel logging is the active workflow.

Reasoning: Mike does NOT own the tow company (Martin Wrecker Service). FuelCloud account is the company's, not his. Building this integration before having a real customer relationship + signed API credentials creates legal/employment risk and burns engineering time on something nobody is asking for yet.

**Action for the next agent:** Skip this phase entirely unless Mike explicitly tells you to resume it. Manual fuel transaction logging (already built in `lib/features/fuel/`) is sufficient for v1 App Store launch.

If Mike says resume later:
- The integration request URL is https://help.fuelcloud.com/hc/en-us/articles/360008504014-FuelCloud-API
- Architecture must be **per-tenant** — each shop pastes their own API key+secret in app Settings
- Credentials encrypted at rest (use Firebase Functions secret storage, never store in client)

---

## 📱 PHASE 4 — APPLE APP STORE SUBMISSION (1 day)

### 4.1 Apple Privacy Questionnaire — DRAFT ANSWERS

When Mike submits to App Store, Apple asks 14 categories of "what data do you collect?" Here are answers based on the current Wreckerlogix data flows:

| Category | Collected? | Used for | Linked to user? | Tracking? |
|---|---|---|---|---|
| **Contact Info – Name** | YES | App Functionality, Customer Support | Yes | No |
| **Contact Info – Email** | YES | App Functionality, Customer Support | Yes | No |
| **Contact Info – Phone Number** | YES | App Functionality | Yes | No |
| **Identifiers – User ID** | YES (Firebase UID) | App Functionality, Analytics | Yes | No |
| **Location – Precise Location** | YES | App Functionality (dispatch routing, GPS tracking) | Yes | No |
| **Location – Coarse Location** | YES | App Functionality | Yes | No |
| **User Content – Photos** | YES (vehicle damage docs) | App Functionality | Yes | No |
| **User Content – Audio Data** | YES (voice commands) | App Functionality | Yes (transient — processed on-device or Firebase) | No |
| **Diagnostics – Crash Data** | YES | Analytics, App Functionality | No | No |
| **Diagnostics – Performance Data** | YES | Analytics | No | No |
| **Usage Data – Product Interaction** | YES | Analytics | Yes | No |
| Financial Info | NO | — | — | — |
| Health & Fitness | NO | — | — | — |
| Sensitive Info | NO | — | — | — |

**Key talking points for App Review:**
- "This is a B2B fleet operations app. All data collection is essential to the dispatcher/driver workflow."
- Voice data is processed on-device when possible (Porcupine wake word). When sent to cloud (Firebase Speech API), it's transient and not stored.
- Location is required to show dispatchers where their drivers are — this is the core product.

**Permissions strings (`ios/Runner/Info.plist`):**
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Wreckerlogix needs your location to dispatch tow jobs and show you on the live fleet map.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Wreckerlogix tracks your truck location in the background to deliver real-time fleet visibility to dispatchers.</string>
<key>NSCameraUsageDescription</key>
<string>Take photos of vehicles, damage, and scenes to document tow jobs.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Use hands-free voice commands so you never have to look at the screen while driving.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Convert your voice commands into job actions like "I'm on scene" or "job complete".</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Attach photos from your library to job records when needed.</string>
```

### 4.2 App Store Connect metadata draft

**App name:** Wreckerlogix
**Subtitle:** Voice-First Tow Dispatch
**Promotional text:** "Run your tow company hands-free. Voice commands, GPS dispatch, motor club billing — all in one app."
**Description (1500 char):**
> Wreckerlogix is the modern tow & recovery operations platform for shops that hate paperwork. Voice-first dispatching means drivers never need to take their hands off the wheel. Wake the app with "Hey Wrecker," say "I'm on scene," snap a photo, and you're back on the road.
>
> Built by a real tow operator, for tow operators.
>
> FEATURES:
> • Digital dispatch board with live driver positions
> • Voice commands: status updates, photos, customer calls
> • Motor club intake (Agero, AAA, Allied, Geico, Honk)
> • Automatic invoicing with on-scene SMS receipts
> • Impound vehicle management with daily storage fees
> • Photo documentation: before, damage, after
> • E-signatures on-scene
> • Time tracking with overtime
> • QuickBooks Online sync
> • Customer/Police vehicle lookup portal
>
> Stop juggling paper, sticky notes, and three different apps. Run your shop from one screen — or from your voice.

**Keywords:** tow,wrecker,dispatch,roadside,impound,recovery,fleet,gps,hauler,jumpstart

**Category:** Business
**Secondary:** Productivity

**Screenshots needed (1290×2796 for iPhone 15 Pro Max):**
1. Dispatch board with live jobs
2. Voice command in action ("Hey Wrecker, I'm on scene")
3. Job detail with photos
4. Motor club billing
5. Impound list with storage fees

### 4.3 TestFlight → Production checklist

- [ ] Bump version in `pubspec.yaml`: `version: 1.0.0+1`
- [ ] Run `flutter build ipa --release`
- [ ] Use Xcode Organizer or `altool` to upload (the existing CI workflow handles this once green)
- [ ] In App Store Connect: add build to TestFlight → wait for "Ready to Test"
- [ ] Add internal testers (Mike + a few of his coworkers from his day-job tow company)
- [ ] After 1 week of TestFlight, submit to App Review
- [ ] Expect 1-3 day review. If rejected, address feedback and resubmit.

---

## 🤖 PHASE 5 — RoadBoss CROSS-PROMOTION (last day)

Mike runs RoadBoss as the bigger brand (https://roadboss.app). Wreckerlogix should warmly cross-promote it.

- Add a settings menu item "Try RoadBoss for trucking" → external link to RoadBoss `/try`.
- If user is a Stripe customer in either app, recognize them in both (later — share Stripe customer IDs across products via a shared backend lookup).

---

## ✅ DEFINITION OF DONE — APP STORE SHIPS WHEN:

1. ✅ CI is green on `release/appstore-v1`
2. ✅ Logo + icons visible everywhere
3. ✅ All Phase 1 Towbook-parity features functional (Motor Clubs, Impound, QuickBooks, E-sign, Lookup, SMS receipts, Reports)
4. ✅ Wake word "Hey Wrecker" + intent router working hands-free
5. ✅ FuelCloud manual logging works; API stub ready for credentials
6. ✅ Apple privacy questions answered honestly + Info.plist strings set
7. ✅ App Store Connect metadata + screenshots uploaded
8. ✅ Build passes TestFlight internal review
9. ✅ Submitted to App Review

---

## 🚨 THINGS TO ASK MIKE BEFORE STARTING

1. **1024×1024 PNG of the official Wreckerlogix logo** (high-res master) — for icon generation.
2. **Firebase project credentials** — confirm he has the Firebase config files in repo or in his secure storage:
   - `ios/Runner/GoogleService-Info.plist`
   - `android/app/google-services.json`
   - `lib/firebase_options.dart`
3. **Picovoice Console AccessKey** — for wake word.
4. **QuickBooks Online OAuth client ID + secret** — once he creates a QBO developer account.
5. **FuelCloud API status** — has he applied for access yet?
6. **Twilio + SendGrid creds** — share from RoadBoss or new accounts?
7. **List of motor clubs his day-job company already works with** — prioritize those integrations.
8. **First 3 customers** — to seed the app for review screenshots.

---

## 📞 IF YOU GET STUCK

- Mike runs RoadBoss in a separate Emergent session. He can fork that session's plan if needed.
- The RoadBoss codebase has working examples of: Twilio SMS, SendGrid, Stripe, Voice Command Engine, AI Co-Pilot, Crash Detection. **Many of those patterns translate directly to Flutter.**
- Reference RoadBoss preview URL: https://roadboss.app
- Reference RoadBoss repo: ask Mike for access if you need to mine it.

---

## 🏁 FINAL WORD TO THE NEXT AGENT

Mike is a hard-working trucker turned founder. He's already built two apps with AI agents. He's tired of bots making messes. **Be his hammer, not another problem.**

- Ship visible wins every 2-3 hours.
- Show him a screenshot or a TestFlight build, not a wall of code.
- When you're done, tell him exactly what to tap next.
- Talk to him like a co-founder, not a chatbot.

**Get him to the App Store. He earned it.** 🚛💨

— Neo (RoadBoss session, 2026)
