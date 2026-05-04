"""
notifications.py — RoadBoss / Highway Pilot SMS + Email dispatch (Phase 2C).

Central abstraction over Twilio SMS and SendGrid email. All sends are:
  - Best-effort (never crash the triggering request)
  - Audit-logged to MongoDB collection `notification_logs`
  - Tagged with event_type + event_ref_id so we can trace SMS back to the
    domain event that triggered it (crash_event_id, trip_id, etc.)

Public functions:
  send_sms(db, to, body, event_type, event_ref_id=None, driver_id=None) -> dict
  send_email(db, to, subject, html, plain_text, event_type, event_ref_id=None, user_id=None) -> dict
  normalize_phone(raw) -> Optional[str]   # E.164
  is_twilio_configured() -> bool
  is_sendgrid_configured() -> bool

Design notes:
  - Twilio + SendGrid SDK calls are sync (blocking) — we wrap them in
    asyncio.to_thread to avoid blocking the FastAPI event loop.
  - Phone normalization assumes US numbers if no country code present.
  - Failures log a row with status='failed' but never raise back to caller.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------- Lazy SDK initialization (so import doesn't blow up if creds missing) ----------

_twilio_client = None
_sendgrid_client = None


def is_twilio_configured() -> bool:
    return all([
        os.environ.get('TWILIO_ACCOUNT_SID'),
        os.environ.get('TWILIO_AUTH_TOKEN'),
        os.environ.get('TWILIO_FROM_NUMBER'),
    ])


def is_sendgrid_configured() -> bool:
    return all([
        os.environ.get('SENDGRID_API_KEY'),
        os.environ.get('SENDGRID_FROM_EMAIL'),
    ])


def _twilio() -> Any:
    global _twilio_client
    if _twilio_client is None and is_twilio_configured():
        from twilio.rest import Client
        _twilio_client = Client(
            os.environ['TWILIO_ACCOUNT_SID'],
            os.environ['TWILIO_AUTH_TOKEN'],
        )
    return _twilio_client


def _sendgrid() -> Any:
    global _sendgrid_client
    if _sendgrid_client is None and is_sendgrid_configured():
        from sendgrid import SendGridAPIClient
        _sendgrid_client = SendGridAPIClient(os.environ['SENDGRID_API_KEY'])
    return _sendgrid_client


# ---------- Helpers ----------

E164_RE = re.compile(r'^\+\d{10,15}$')


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """Convert various phone formats to E.164. Returns None if unparseable.

    Examples:
      '+1-555-0101' -> '+15550101' (warning: too short, will return None)
      '(555) 555-0101' -> '+15555550101'
      '5555550101' -> '+15555550101'
      '+15555550101' -> '+15555550101'
    """
    if not raw:
        return None
    s = str(raw).strip()
    # Strip everything except digits and leading +
    has_plus = s.startswith('+')
    digits = re.sub(r'\D', '', s)
    if not digits:
        return None
    # If no plus and 10 digits, assume US
    if not has_plus and len(digits) == 10:
        digits = '1' + digits
    candidate = '+' + digits
    if E164_RE.match(candidate):
        return candidate
    return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _log_notification(db, payload: Dict[str, Any]) -> None:
    """Persist an audit log entry. Failures are swallowed (logging-only)."""
    try:
        doc = {
            'id': str(uuid.uuid4()),
            'created_at': _now().isoformat(),
            **payload,
        }
        await db.notification_logs.insert_one(doc)
    except Exception as e:
        logger.warning(f'notification_log insert failed: {e}')


# ---------- SMS ----------

async def send_sms(
    db,
    to: str,
    body: str,
    event_type: str,
    event_ref_id: Optional[str] = None,
    driver_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Send an SMS. Always returns a result dict — never raises.

    Returns:
      {'ok': True,  'sid': 'SM...', 'status': 'queued'}
      {'ok': False, 'error': 'reason', 'error_code': '...'}
    """
    e164 = normalize_phone(to)
    if not e164:
        result = {'ok': False, 'error': f'invalid_phone:{to!r}'}
        await _log_notification(db, {
            'channel': 'sms', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'driver_id': driver_id, 'to': to, 'body': body,
            'status': 'failed', 'error': result['error'],
        })
        return result

    if not is_twilio_configured():
        result = {'ok': False, 'error': 'twilio_not_configured'}
        await _log_notification(db, {
            'channel': 'sms', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'driver_id': driver_id, 'to': e164, 'body': body,
            'status': 'skipped', 'error': result['error'],
        })
        return result

    from_number = os.environ['TWILIO_FROM_NUMBER']
    truncated_body = body if len(body) <= 1500 else body[:1497] + '...'

    def _send():
        return _twilio().messages.create(body=truncated_body, from_=from_number, to=e164)

    try:
        msg = await asyncio.to_thread(_send)
        await _log_notification(db, {
            'channel': 'sms', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'driver_id': driver_id, 'to': e164, 'body': truncated_body,
            'status': msg.status or 'queued',
            'provider_message_id': msg.sid,
            'price': msg.price,
            'price_unit': msg.price_unit,
        })
        return {'ok': True, 'sid': msg.sid, 'status': msg.status, 'to': e164}
    except Exception as e:
        err_code = getattr(e, 'code', None)
        err_msg = getattr(e, 'msg', None) or str(e)
        logger.warning(f'twilio send failed: code={err_code} msg={err_msg}')
        await _log_notification(db, {
            'channel': 'sms', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'driver_id': driver_id, 'to': e164, 'body': truncated_body,
            'status': 'failed', 'error': err_msg, 'error_code': str(err_code) if err_code else None,
        })
        return {'ok': False, 'error': err_msg, 'error_code': err_code}


# ---------- Email ----------

def email_layout(title: str, content_html: str, cta_text: Optional[str] = None, cta_url: Optional[str] = None) -> str:
    """Wrap content in a branded RoadBoss email shell. Returns full HTML doc.

    Inline styles only (most email clients strip <style> blocks).
    Dark-mode-friendly defaults.
    """
    brand = os.environ.get('NOTIFY_BRAND_NAME', 'RoadBoss')
    base_url = os.environ.get('NOTIFY_BASE_URL', '')
    cta_block = ''
    if cta_text and cta_url:
        cta_block = f'''
        <tr><td style="padding: 24px 32px 8px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr><td bgcolor="#38bdf8" style="border-radius: 8px;">
              <a href="{cta_url}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #07090d; text-decoration: none;">
                {cta_text}
              </a>
            </td></tr>
          </table>
        </td></tr>'''
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding: 0; background-color: #07090d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #c8d0d8;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #07090d;">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #0f1419; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden;">
        <tr><td style="padding: 24px 32px 0 32px;">
          <div style="font-size: 11px; letter-spacing: 2px; color: #38bdf8; text-transform: uppercase; font-weight: 600;">{brand}</div>
          <h1 style="margin: 8px 0 0 0; font-size: 22px; line-height: 28px; color: #ffffff; font-weight: 700;">{title}</h1>
        </td></tr>
        <tr><td style="padding: 16px 32px; font-size: 15px; line-height: 22px; color: #c8d0d8;">
          {content_html}
        </td></tr>
        {cta_block}
        <tr><td style="padding: 24px 32px 32px 32px; border-top: 1px solid #1f2937; margin-top: 24px;">
          <p style="margin: 16px 0 4px 0; font-size: 12px; color: #6b7280;">{brand} &mdash; One app. Every mile. Hands free.</p>
          <p style="margin: 0; font-size: 11px; color: #4b5563;">
            <a href="{base_url}" style="color: #6b7280; text-decoration: underline;">{base_url}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def send_email(
    db,
    to: str,
    subject: str,
    html: str,
    plain_text: Optional[str] = None,
    event_type: str = 'transactional',
    event_ref_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Send transactional email via SendGrid. Always returns a result dict."""
    if not to or '@' not in str(to):
        result = {'ok': False, 'error': f'invalid_email:{to!r}'}
        await _log_notification(db, {
            'channel': 'email', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'user_id': user_id, 'to': to, 'subject': subject,
            'status': 'failed', 'error': result['error'],
        })
        return result

    if not is_sendgrid_configured():
        result = {'ok': False, 'error': 'sendgrid_not_configured'}
        await _log_notification(db, {
            'channel': 'email', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'user_id': user_id, 'to': to, 'subject': subject,
            'status': 'skipped', 'error': result['error'],
        })
        return result

    from_email = os.environ['SENDGRID_FROM_EMAIL']
    from_name = os.environ.get('SENDGRID_FROM_NAME', 'RoadBoss')
    plain = plain_text or re.sub(r'<[^>]+>', '', html)  # crude HTML-to-text fallback

    def _send():
        from sendgrid.helpers.mail import Mail, Email, To, Content
        message = Mail(
            from_email=Email(from_email, from_name),
            to_emails=To(to),
            subject=subject,
            plain_text_content=Content('text/plain', plain),
            html_content=Content('text/html', html),
        )
        if event_type:
            message.custom_arg = {'event_type': event_type}
            if event_ref_id:
                message.add_custom_arg = {'event_ref_id': event_ref_id}
        return _sendgrid().send(message)

    try:
        resp = await asyncio.to_thread(_send)
        message_id = None
        try:
            message_id = resp.headers.get('X-Message-Id')
        except Exception:
            pass
        await _log_notification(db, {
            'channel': 'email', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'user_id': user_id, 'to': to, 'subject': subject,
            'status': 'queued' if 200 <= resp.status_code < 300 else 'failed',
            'provider_message_id': message_id,
            'http_status': resp.status_code,
        })
        return {
            'ok': 200 <= resp.status_code < 300,
            'message_id': message_id,
            'http_status': resp.status_code,
        }
    except Exception as e:
        err_msg = str(e)
        logger.warning(f'sendgrid send failed: {err_msg[:300]}')
        await _log_notification(db, {
            'channel': 'email', 'event_type': event_type, 'event_ref_id': event_ref_id,
            'user_id': user_id, 'to': to, 'subject': subject,
            'status': 'failed', 'error': err_msg[:500],
        })
        return {'ok': False, 'error': err_msg}


# ---------- Email template builders (RoadBoss-branded) ----------

def build_password_reset_email(name: str, reset_url: str) -> Dict[str, str]:
    body = f'''<p>Hey {name or 'there'},</p>
      <p>Someone requested a password reset for your RoadBoss account. If that was you, click the button below to set a new password. This link expires in 1 hour.</p>
      <p>If it wasn't you, just ignore this email &mdash; your password stays the same.</p>'''
    html = email_layout('Reset your password', body, cta_text='Reset password', cta_url=reset_url)
    plain = f'Hey {name},\n\nReset your RoadBoss password: {reset_url}\n\nThis link expires in 1 hour. If you did not request this, ignore.'
    return {'html': html, 'plain': plain, 'subject': 'Reset your RoadBoss password'}


def build_welcome_email(name: str, login_url: str) -> Dict[str, str]:
    body = f'''<p>Welcome to RoadBoss, {name or 'driver'} &mdash; you are officially in.</p>
      <p>RoadBoss is the voice-first command center built by truckers, for truckers. Talk to Co-Pilot, log inspections without taking your eyes off the road, and let our crash detection have your back 24/7.</p>
      <p><strong>Quick start:</strong></p>
      <ul style="padding-left: 20px;">
        <li>Say <em>"Hey Co-Pilot"</em> to wake the assistant</li>
        <li>Run a Pre-Trip from the home screen before your first trip</li>
        <li>Turn on Crash Guardian in Settings (one-tap, browser permission)</li>
      </ul>
      <p>Stay safe out there. We are with you every mile.</p>'''
    html = email_layout('Welcome to RoadBoss', body, cta_text='Log in', cta_url=login_url)
    plain = f'Welcome to RoadBoss, {name}!\n\nLog in here: {login_url}\n\nSay "Hey Co-Pilot" to wake the voice assistant. Stay safe out there.'
    return {'html': html, 'plain': plain, 'subject': 'Welcome to RoadBoss \u2014 you are in'}


def build_fleet_invite_email(inviter_name: str, fleet_name: str, accept_url: str, role: str = 'driver') -> Dict[str, str]:
    body = f'''<p><strong>{inviter_name}</strong> invited you to join <strong>{fleet_name}</strong> on RoadBoss as a <strong>{role}</strong>.</p>
      <p>Click below to accept the invite, set your password, and start running loads with hands-free voice control, FMCSA-compliant DVIRs, and 24/7 crash protection.</p>
      <p style="font-size: 13px; color: #6b7280;">This invite expires in 7 days.</p>'''
    html = email_layout(f'You are invited to {fleet_name}', body, cta_text='Accept invite', cta_url=accept_url)
    plain = f'{inviter_name} invited you to join {fleet_name} on RoadBoss as a {role}.\n\nAccept here: {accept_url}\n\nExpires in 7 days.'
    return {'html': html, 'plain': plain, 'subject': f'{inviter_name} invited you to {fleet_name} on RoadBoss'}


def build_dvir_signed_email(driver_name: str, vehicle_name: str, inspection_type: str, defects: list, signature: str, certified_at: str, view_url: str) -> Dict[str, str]:
    insp_label = 'Pre-Trip' if inspection_type == 'pre_trip' else 'Post-Trip'
    em_dash = ' \u2014 '
    if defects:
        defect_items = []
        for d in defects:
            label = d.get('label', d.get('key', ''))
            note = d.get('note')
            note_html = (em_dash + note) if note else ''
            defect_items.append(f'<li><strong>{label}</strong>{note_html}</li>')
        defect_html = '<ul style="padding-left: 20px;">' + ''.join(defect_items) + '</ul>'
        warn_icon = '\u26a0'
        defect_summary = f'<p style="color: #f59e0b;"><strong>{warn_icon} {len(defects)} defect(s) reported:</strong></p>{defect_html}'
    else:
        defect_summary = '<p style="color: #10b981;"><strong>\u2705 No defects \u2014 vehicle satisfactory.</strong></p>'
    body = f'''<p><strong>{driver_name}</strong> certified a {insp_label} inspection on <strong>{vehicle_name}</strong>.</p>
      {defect_summary}
      <p style="margin-top: 24px; padding: 12px; background-color: #1f2937; border-left: 3px solid #38bdf8; font-size: 13px;">
        <strong>Certified at:</strong> {certified_at}<br>
        <strong>Driver signature:</strong> {signature}
      </p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">FMCSA 49 CFR \u00a7 396.11/396.13 compliant. Full report retained for 90 days minimum.</p>'''
    html = email_layout(f'DVIR Certified \u2014 {vehicle_name}', body, cta_text='View full report', cta_url=view_url)
    plain = f'{driver_name} certified a {insp_label} on {vehicle_name}.\n\nDefects: {len(defects)}\nCertified at: {certified_at}\nSignature: {signature}\n\nView: {view_url}'
    return {'html': html, 'plain': plain, 'subject': f'DVIR \u2014 {driver_name} certified {insp_label} on {vehicle_name}'}
