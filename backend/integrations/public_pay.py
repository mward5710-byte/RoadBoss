"""
Public (no-auth) customer payment endpoints.

When a tow operator sends a receipt with `include_payment_link=true`, our
backend mints a token-based URL like:

    https://wreckerlogix.com/pay/{token}

The customer taps it from their SMS / email, hits this PUBLIC endpoint to
fetch the pay-page details, then taps Pay → Square Web Payments SDK
tokenizes the card → POST back to /charge with the source_id → we charge
that tenant's connected Square account.

Tokens are random 24-byte URL-safe strings (32 chars), single-job-scoped,
auto-expire 30 days after creation.  No PII leaks to anonymous visitors —
we only return amount, vehicle, masked job id, and the merchant's public
Square config (application_id + location_id) so the SDK can mount.
"""
from __future__ import annotations

import logging
import os
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc)


class PublicChargeIn(BaseModel):
    source_id: str
    verification_token: Optional[str] = None
    payer_name: Optional[str] = None
    payer_email: Optional[str] = None


def build_public_pay_router(db) -> APIRouter:
    """Returns a router mounted at /api/wrecker/pay (NO auth required)."""
    router = APIRouter(prefix="/wrecker/pay", tags=["public:pay"])

    async def _resolve_link(token: str) -> Dict[str, Any]:
        link = await db.tow_pay_links.find_one({'token': token})
        if not link:
            raise HTTPException(404, "Payment link not found or expired")
        if link.get('voided'):
            raise HTTPException(410, "This payment link has been canceled")
        expires_at = link.get('expires_at')
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < _now():
                raise HTTPException(410, "This payment link has expired")
        return link

    @router.get("/{token}")
    async def get_pay_page(token: str):
        """Returns the data the public pay page needs to render + charge.
        Includes the merchant's public Square config (app_id, location_id)
        so the customer's browser can mount the Square SDK directly.
        """
        link = await _resolve_link(token)
        job = await db.tow_jobs.find_one({'id': link['job_id']}, {'_id': 0})
        if not job:
            raise HTTPException(404, "Job not found")

        # Recompute live balance — operator may have applied additional payments
        charges = job.get('charges') or []
        subtotal = sum(float(c.get('subtotal') or 0) for c in charges)
        tax = float(job.get('tax') or 0)
        invoice_total = float(job.get('invoice_total') or (subtotal + tax))
        amount_paid = float(job.get('amount_paid') or sum(
            float(p.get('amount') or 0) for p in (job.get('payments') or [])
        ))
        balance_due = max(0.0, invoice_total - amount_paid)

        # Pull the tenant's Square OAuth credentials (no secrets returned!)
        creds = None
        try:
            from integrations.square_oauth import get_tenant_square_credentials
            creds = await get_tenant_square_credentials(
                db, link.get('tenant_id') or 'default'
            )
        except Exception as e:
            logger.warning("Failed to load tenant Square creds: %s", e)

        # Fetch company name from waiver template
        tpl = await db.fleet_waiver_templates.find_one({'fleet_id': 'default'})
        company_name = (tpl or {}).get('company_name') or 'Wrecker Service'

        v = job.get('vehicle') or {}
        veh_label = ' '.join(
            str(x) for x in [v.get('year'), v.get('color'), v.get('make'), v.get('model')] if x
        ) or 'Vehicle'

        # If balance is already settled, return paid state without Square config
        if balance_due <= 0:
            return {
                'token': token,
                'job_short_id': link['job_id'][:8].upper(),
                'company_name': company_name,
                'vehicle_label': veh_label,
                'plate': v.get('plate'),
                'invoice_total': invoice_total,
                'amount_paid': amount_paid,
                'balance_due': 0,
                'status': 'paid',
                'square': None,
            }

        if not creds or not creds.get('location_id'):
            return {
                'token': token,
                'job_short_id': link['job_id'][:8].upper(),
                'company_name': company_name,
                'vehicle_label': veh_label,
                'plate': v.get('plate'),
                'invoice_total': invoice_total,
                'amount_paid': amount_paid,
                'balance_due': balance_due,
                'status': 'unconfigured',
                'square': None,
            }

        return {
            'token': token,
            'job_short_id': link['job_id'][:8].upper(),
            'company_name': company_name,
            'vehicle_label': veh_label,
            'plate': v.get('plate'),
            'invoice_total': invoice_total,
            'amount_paid': amount_paid,
            'balance_due': balance_due,
            'status': 'open',
            'square': {
                'application_id': os.environ.get('SQUARE_OAUTH_APPLICATION_ID'),
                'location_id': creds['location_id'],
                'environment': creds.get('environment', 'sandbox'),
                'merchant_name': creds.get('merchant_name'),
            },
        }

    @router.post("/{token}/charge")
    async def public_charge(token: str, body: PublicChargeIn):
        """Customer tokenizes card on Square's iframe → posts source_id here.
        We charge using the merchant's encrypted access token. Wreckerlogix
        never sees the card number.
        """
        from integrations.square_oauth import get_tenant_square_credentials, _square_base_urls

        link = await _resolve_link(token)
        job = await db.tow_jobs.find_one({'id': link['job_id']}, {'_id': 0})
        if not job:
            raise HTTPException(404, "Job not found")

        # Compute live balance to charge (don't trust client)
        charges = job.get('charges') or []
        subtotal = sum(float(c.get('subtotal') or 0) for c in charges)
        tax = float(job.get('tax') or 0)
        invoice_total = float(job.get('invoice_total') or (subtotal + tax))
        amount_paid = float(job.get('amount_paid') or sum(
            float(p.get('amount') or 0) for p in (job.get('payments') or [])
        ))
        balance_due = max(0.0, invoice_total - amount_paid)
        if balance_due <= 0:
            raise HTTPException(400, "This invoice is already paid in full")

        creds = await get_tenant_square_credentials(
            db, link.get('tenant_id') or 'default'
        )
        if not creds or not creds.get('location_id'):
            raise HTTPException(503, "Square is not configured for this merchant")

        amount_cents = int(round(balance_due * 100))
        urls = _square_base_urls(
            creds.get('environment')
            or os.environ.get('SQUARE_OAUTH_ENVIRONMENT', 'sandbox')
        )
        idempotency_key = str(_uuid.uuid4())

        payload = {
            'source_id': body.source_id,
            'idempotency_key': idempotency_key,
            'amount_money': {'amount': amount_cents, 'currency': 'USD'},
            'autocomplete': True,
            'location_id': creds['location_id'],
            'reference_id': link['job_id'][:40],
            'note': f"Wreckerlogix Online Payment · Job #{link['job_id'][:8].upper()}",
        }
        if body.verification_token:
            payload['verification_token'] = body.verification_token
        if body.payer_email:
            payload['buyer_email_address'] = body.payer_email[:200]

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{urls['api']}/v2/payments",
                    headers={
                        'Authorization': f"Bearer {creds['access_token']}",
                        'Square-Version': '2024-12-18',
                        'Content-Type': 'application/json',
                    },
                    json=payload,
                )
        except Exception as e:
            raise HTTPException(502, f"Square API request failed: {e}")

        if resp.status_code >= 400:
            try:
                detail = (resp.json().get('errors') or [{}])[0].get('detail') or resp.text[:300]
            except Exception:
                detail = resp.text[:300]
            raise HTTPException(resp.status_code, f"Square: {detail}")

        data = resp.json()
        payment = data.get('payment') or {}
        sq_payment_id = payment.get('id')
        sq_status = payment.get('status')
        receipt_url = payment.get('receipt_url')
        card_details = payment.get('card_details') or {}
        card = card_details.get('card') or {}

        # Record payment on the job
        payment_record = {
            'id': str(_uuid.uuid4()),
            'amount': balance_due,
            'method': 'square_online',
            'reference': sq_payment_id,
            'note': "Online tap-to-pay · paid by customer",
            'at': _now(),
            'by': None,
            'by_name': body.payer_name or 'Customer (online)',
            'square': {
                'payment_id': sq_payment_id,
                'status': sq_status,
                'receipt_url': receipt_url,
                'card_brand': card.get('card_brand'),
                'last_4': card.get('last_4'),
                'entry_method': card_details.get('entry_method'),
                'environment': creds.get('environment'),
                'merchant_id': creds.get('merchant_id'),
                'location_id': creds.get('location_id'),
                'pay_link_token': token,
            },
        }
        new_amount_paid = round(amount_paid + balance_due, 2)
        await db.tow_jobs.update_one(
            {'id': link['job_id']},
            {
                '$push': {'payments': payment_record},
                '$set': {
                    'amount_paid': new_amount_paid,
                    'balance_due': 0,
                    'updated_at': _now(),
                },
            },
        )
        # Mark the pay link as used (still valid for status checks but no further charges)
        await db.tow_pay_links.update_one(
            {'token': token},
            {'$set': {'used_at': _now(), 'used_payment_id': payment_record['id']}},
        )
        return {
            'ok': True,
            'amount_paid': balance_due,
            'square_status': sq_status,
            'receipt_url': receipt_url,
            'card_brand': card.get('card_brand'),
            'last_4': card.get('last_4'),
        }

    return router
