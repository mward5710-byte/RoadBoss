# 📧 Email Provider Decision — AWS SES vs SendGrid (next session)

You picked AWS SES on the call last time. The integration agent came back with SendGrid as the verified playbook. Here's the honest comparison so you can lock the choice in 30 seconds when we resume.

---

## TL;DR Cost Comparison (50,000 emails/month)

| Provider | Setup time | Monthly cost | Sandbox out | Domain verify |
|---|---:|---:|---|---|
| **AWS SES** | ~3 hrs (sandbox→prod approval) | ~$5 | Manual review request | Cloudflare DNS + DKIM |
| **SendGrid** | ~30 min | ~$20 (Essentials plan) | Instant | Cloudflare DNS + DKIM |
| **Resend** | ~20 min | ~$20 | Instant | Cloudflare DNS + DKIM |

**Verdict at your scale (under 50k/mo):** They're a wash on price for the first year. **Setup speed matters more for you right now** than the $15/mo cost difference, since you have a deployed product needing email *now*.

---

## My Recommendation Going Forward

**Start with SendGrid.** Reasons:
1. **Plays well with Cloudflare DNS** (your wrecker-logix.com is on Cloudflare) — DKIM/SPF setup is 4 records, copy-paste from their UI
2. **No sandbox bottleneck** — AWS SES requires you to email AWS support to leave sandbox, and they sometimes ask follow-up questions. Could take 24-48 hours.
3. **One vendor, one bill** — SendGrid sends, captures bounces, shows opens/clicks all in one dashboard
4. **Easy to swap to SES later** — the abstraction we'll write isolates the provider

**Switch to AWS SES at ~250k+ emails/month** (the math finally favors SES at 5-10x your initial volume).

If you DISAGREE and want SES anyway, no problem — just costs a couple extra credits to follow the AWS playbook instead. Both are <300 credits to wire up.

---

## What You'll Need to Provide (whichever you pick)

### SendGrid path (recommended)
1. **SendGrid account** — sign up at sendgrid.com (free 100/day forever, $20/mo after)
2. **API Key** — Settings → API Keys → "Full Access" → copy the key (starts with `SG.`)
3. **Domain to send from** — `wrecker-logix.com` (you already own it on Cloudflare)
4. **5 DNS records** — SendGrid will show them; you paste into Cloudflare DNS

### AWS SES path
1. **AWS account** — pay-as-you-go, requires a card on file
2. **IAM user with SES policy**:
   - User: `wreckerlogix-email`
   - Policy: `AmazonSESFullAccess` (we'll tighten later)
   - Generate access key + secret
3. **Domain verification** — same as SendGrid, but more DNS records (8 instead of 5)
4. **SES production access** — file the "out of sandbox" request in the AWS console (the form takes 5 min, approval takes ~24 hours)

---

## What We'll Build (Either Path)

When you're back with credits + keys:

```python
# backend/email_service.py — provider-agnostic abstraction
class EmailService:
    def send(self, to, subject, html, text=None, from_address=None):
        ...

# Concrete impls
class SendGridEmailService(EmailService):  # or SESEmailService
    ...

# Use everywhere:
email = get_email_service()  # auto-picks based on env vars
email.send(to="customer@example.com", subject="Your quote", html="...")
```

This means we wire it ONCE, then everything that needs to send mail just calls `email.send()`:

- ✅ Password reset emails
- ✅ Signup welcome emails
- ✅ Quote PDF send (Quote Detail page already has the trigger)
- ✅ Trial-ending-soon reminders (3 days before)
- ✅ Daily fleet digest (RoadBoss admin)
- ✅ Crash alerts (CrashGuardian)
- ✅ Invoice receipts after Square payment

All of those endpoints already exist or are stubbed — we just plumb in the email_service everywhere it's needed (it's a single-shot 200-300 credit job).

---

## Credit Budget for Email Work (estimate)

| Task | Credits |
|---|---:|
| SendGrid wire-up + reset password flow | ~150 |
| Signup welcome email + trial reminder cron | ~80 |
| Wire email-quote endpoint to actually send | ~50 |
| Daily digest cron + template | ~100 |
| **Total** | **~380** |

Same total for AWS SES, just split differently (more on setup, less on code).

---

## Next-Session Kickoff Checklist

When you're back with credits:

1. Tell me which provider (SendGrid or SES)
2. Hand over:
   - **SendGrid:** API key (starts with `SG.`)
   - **SES:** AWS access key + secret + region (e.g. `us-east-1`)
3. Confirm `wrecker-logix.com` is the from-domain (or pick a subdomain like `mail.wrecker-logix.com` to keep transactional separate from marketing)

I'll have everything wired in one focused session. ⚡

— Neo
