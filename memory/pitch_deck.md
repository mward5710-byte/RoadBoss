# RoadBoss — Investor Deck (Source of Truth)

**Author:** Mike Ward (mward5710-byte)
**Classification:** CONFIDENTIAL — Do Not Distribute Without Written Permission
**Last Updated:** April 2026
**Format:** 12 Slides with Speaker Notes

---

## TAGLINE
**"One app. Every mile. Hands free."**

## POSITIONING
RoadBoss — The AI-Powered Command Center for Every Truck Driver
Founder: Mike Ward | Kokomo, IN

---

## CORE PROBLEM (Slide 2)
- 3.5 million US truck drivers juggling 5–8 separate apps per shift
- 45+ minutes/day lost to app-switching
- $800–$1,500/year per truck in fragmented subscriptions
- $16,000 average ELD violation fine
- **4,000+ distracted driving deaths/year involving commercial vehicles**

## CORE SOLUTION (Slide 3)
Voice-first, AI-powered, always running. Single platform consolidating:
- TTS Hands-Free Messaging
- Truck-Specific GPS (weight/height/hazmat aware)
- ELD Compliance (FMCSA)
- Dash Cam Integration
- Crash Detection & Auto-Alert (OnStar for every truck)
- Per-Driver Mile Tracking + IFTA reports
- Maintenance Tracker / DVIR
- Roadside Assistance (vetted network)
- Copilot AI Brain — context-aware voice across the entire platform

**Differentiator:** All features run simultaneously in background. Driver can use Spotify, Apple Maps, take calls — RoadBoss never stops listening, logging, or protecting.

---

## PRICING — LOCKED FROM DECK (Slide 7)

| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0 | TTS hands-free messaging, basic GPS, voice commands |
| **Pro** | **$29.99/mo** | Everything: ELD, dash cam, crash detection, mile tracking, maintenance, roadside assistance |
| **Fleet** | **$19.99/truck/mo** | Pro features + fleet management dashboard, driver analytics, compliance reporting |
| **Enterprise** | Custom | White-label, API access, dedicated support, custom integrations |

### Additional Revenue Streams
- Roadside assistance referral fees: $15–25 per dispatch
- Dash cam hardware affiliate revenue share
- Fuel discount partnership programs
- Insurance partnership premium discounts
- Anonymized data analytics for logistics companies

### Unit Economics
- CAC: $25–$40
- LTV: $720+
- LTV:CAC: 18:1+

---

## MARKET (Slide 5)
- **TAM:** $15B+
- Owner-Operators: ~350,000 → Free → Pro $29.99
- Small Fleets (5–50 trucks): ~150,000 → Fleet $19.99/truck/mo
- Enterprise (50+): ~25,000 → Custom
- **Total US Truck Drivers:** 3.5 million

### Why Now?
- FMCSA ELD mandate fully enforced
- Distracted driving regulatory pressure mounting
- Fleet insurance premiums rising 15%/year

---

## COMPETITIVE EDGE (Slide 6)
Competitors charge $33–$35/truck/mo (Motive, Samsara) and *still* don't offer hands-free messaging or integrated roadside. RoadBoss starts at **free** and is the only voice-first all-in-one platform.

---

## FINANCIAL PROJECTIONS (Slide 10)
| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Registered Users | 10K | 50K | 200K |
| Pro Subscribers | 2,000 | 15,000 | 75,000 |
| Fleet Accounts | 50 | 300 | 1,500 |
| MRR | $60K | $450K | $2.25M |
| ARR | $720K | $5.4M | $27M |
| Gross Margin | 75% | 80% | 85% |

**Conservative assumptions:** 20% free-to-paid conversion, 24-month avg retention, 12 trucks per fleet account, ZERO enterprise revenue modeled (pure upside).

---

## THE ASK (Slide 11)
**Raising $500K Seed Round**

| Category | Allocation | % |
|----------|-----------|---|
| Engineering | $275,000 | 55% |
| Product & Design | $75,000 | 15% |
| Legal & IP | $50,000 | 10% |
| Marketing & Launch | $60,000 | 12% |
| Operations | $40,000 | 8% |

**What $500K buys:** MVP on App Store, FMCSA ELD certification started, 10,000 registered drivers, 2,000 paid Pro subscribers, $60K MRR, clear path to Series A.

---

## CLOSING MISSION STATEMENT (Slide 12)
> "Every year, 4,000 people die because truck drivers have to look at their phones. RoadBoss makes that unnecessary. That's not just a business — that's a mission."

— Mike Ward | mward5710-byte | Kokomo, IN

---

## ENGINEERING NOTES — How This Maps to The App We're Building

1. **All Stripe pricing in app MUST mirror this deck exactly.** Solo Driver = Pro $29.99/mo. Fleet = $19.99/truck/mo. Free tier exists. Enterprise = "Contact Sales".
2. **Voice-first is non-negotiable.** Every driver-facing feature must be operable hands-free. Screen-touch features are admin/desktop only.
3. **Background ops are the moat.** TTS message reading, ELD logging, crash detection, mile tracking — all "always-on" services in the PWA.
4. **Copilot AI is the unifier.** Stage 3 AI Copilot is the centerpiece — it ties messaging, navigation, ELD, and roadside into one voice interface.
5. **Brand voice:** Built by a blue-collar founder for blue-collar drivers. Plainspoken, respectful, confident. No corporate jargon.
