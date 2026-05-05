"""
Square OAuth integration for Wreckerlogix.

Multi-tenant pattern:
- Each wrecker company connects their OWN Square account via OAuth
- Their access_token is encrypted at rest (Fernet, key derived from JWT_SECRET)
- Payments processed through THAT tenant's token land in THEIR bank
- Wreckerlogix (the SaaS app) only acts as the OAuth client — never holds customer card data

Environment variables consumed:
- SQUARE_OAUTH_APPLICATION_ID       (Mike's Wreckerlogix dev app — public)
- SQUARE_OAUTH_APPLICATION_SECRET   (Mike's Wreckerlogix dev app — secret)
- SQUARE_OAUTH_ENVIRONMENT          ('sandbox' | 'production', default 'sandbox')
- PUBLIC_BASE_URL                   (used to build the OAuth redirect URL)
- JWT_SECRET                        (used to derive the token-at-rest encryption key)

Mongo collections written:
- square_oauth_states               (short-lived CSRF state tokens, TTL 10 min)
- tenant_integrations               (per-tenant connected integrations)
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# Constants
# -------------------------------------------------------------------

# Scopes we request from Square. Keep this minimal but enough for a tow shop:
# - take payments, read payments, write/read orders (line items per job),
# - read merchant profile (so we can show "Connected as: Mike's Towing"),
# - read locations (so we can let the user pick which Square location bills go to).
SQUARE_SCOPES = [
    "PAYMENTS_WRITE",
    "PAYMENTS_WRITE_IN_PERSON",
    "PAYMENTS_READ",
    "ORDERS_WRITE",
    "ORDERS_READ",
    "MERCHANT_PROFILE_READ",
    "CUSTOMERS_READ",
    "CUSTOMERS_WRITE",
]


def _square_base_urls(env: str) -> Dict[str, str]:
    """Return the right Square endpoints for sandbox vs production."""
    if (env or "").lower() == "production":
        return {
            "authorize": "https://connect.squareup.com/oauth2/authorize",
            "token": "https://connect.squareup.com/oauth2/token",
            "revoke": "https://connect.squareup.com/oauth2/revoke",
            "api": "https://connect.squareup.com",
        }
    return {
        "authorize": "https://connect.squareupsandbox.com/oauth2/authorize",
        "token": "https://connect.squareupsandbox.com/oauth2/token",
        "revoke": "https://connect.squareupsandbox.com/oauth2/revoke",
        "api": "https://connect.squareupsandbox.com",
    }


# -------------------------------------------------------------------
# Encryption helpers (Fernet symmetric encryption, key derived from JWT_SECRET)
# -------------------------------------------------------------------

def _fernet() -> Fernet:
    secret = os.environ.get("JWT_SECRET", "wrecker-default-secret-change-me")
    # Fernet expects a 32-byte url-safe base64 key
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(plain: str) -> str:
    if plain is None:
        return None
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> Optional[str]:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.exception("Failed to decrypt Square token — encryption key mismatch")
        return None


# -------------------------------------------------------------------
# Tenant resolver — for now we treat the whole install as a single tenant.
# When Mike adds true SaaS multi-tenancy, swap this for user['company_id'].
# -------------------------------------------------------------------

def resolve_tenant_id(user: Dict[str, Any]) -> str:
    return (
        user.get("company_id")
        or user.get("tenant_id")
        or user.get("organization_id")
        or "default"
    )


# -------------------------------------------------------------------
# Public helper used by the rest of the backend (e.g. when charging a card)
# -------------------------------------------------------------------

async def get_tenant_square_credentials(db, tenant_id: str) -> Optional[Dict[str, Any]]:
    """Returns {'access_token', 'merchant_id', 'environment', 'location_id', ...}
    for the given tenant, or None if not connected.

    The access_token is decrypted before returning. Caller is responsible for
    NOT logging it.
    """
    rec = await db.tenant_integrations.find_one(
        {"tenant_id": tenant_id, "provider": "square"}
    )
    if not rec:
        return None
    access_token = decrypt_secret(rec.get("access_token_encrypted"))
    refresh_token = decrypt_secret(rec.get("refresh_token_encrypted"))
    if not access_token:
        return None
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "merchant_id": rec.get("merchant_id"),
        "environment": rec.get("environment", "sandbox"),
        "location_id": rec.get("location_id"),
        "expires_at": rec.get("expires_at"),
        "connected_at": rec.get("connected_at"),
        "merchant_name": rec.get("merchant_name"),
    }


# -------------------------------------------------------------------
# Router factory
# -------------------------------------------------------------------

class SquareConnectStartResponse(BaseModel):
    authorize_url: str
    state: str


class SquareDisconnectResponse(BaseModel):
    ok: bool
    message: str


class SquareLocationIn(BaseModel):
    location_id: str


def build_square_router(db, get_current_user, require_role) -> APIRouter:
    router = APIRouter(prefix="/integrations/square", tags=["integrations:square"])

    require_admin = require_role(
        "wrecker_dispatcher",
        "wrecker_supervisor",
        "fleet_admin",
        "super_admin",
    )

    def _cfg() -> Dict[str, str]:
        return {
            "app_id": os.environ.get("SQUARE_OAUTH_APPLICATION_ID", ""),
            "app_secret": os.environ.get("SQUARE_OAUTH_APPLICATION_SECRET", ""),
            "env": os.environ.get("SQUARE_OAUTH_ENVIRONMENT", "sandbox"),
            "public_base_url": os.environ.get(
                "PUBLIC_BASE_URL", "https://build-forge-49.preview.emergentagent.com"
            ).rstrip("/"),
        }

    def _redirect_uri(cfg: Dict[str, str]) -> str:
        return f"{cfg['public_base_url']}/api/wrecker/integrations/square/callback"

    def _settings_redirect(cfg: Dict[str, str], status: str, msg: str = "") -> str:
        params = {"square": status}
        if msg:
            params["msg"] = msg
        return f"{cfg['public_base_url']}/wrecker/settings?{urlencode(params)}"

    # ------------------------------------------------------------
    # GET /status — is this tenant connected to Square?
    # ------------------------------------------------------------
    @router.get("/status")
    async def status(user=Depends(require_admin)):
        cfg = _cfg()
        tenant_id = resolve_tenant_id(user)
        rec = await db.tenant_integrations.find_one(
            {"tenant_id": tenant_id, "provider": "square"},
            {"_id": 0, "access_token_encrypted": 0, "refresh_token_encrypted": 0},
        )
        return {
            "configured": bool(cfg["app_id"] and cfg["app_secret"]),
            "environment": cfg["env"],
            "connected": bool(rec),
            "merchant_id": rec.get("merchant_id") if rec else None,
            "merchant_name": rec.get("merchant_name") if rec else None,
            "location_id": rec.get("location_id") if rec else None,
            "location_name": rec.get("location_name") if rec else None,
            "available_locations": rec.get("available_locations", []) if rec else [],
            "connected_at": (
                rec.get("connected_at").isoformat()
                if rec and isinstance(rec.get("connected_at"), datetime)
                else (rec.get("connected_at") if rec else None)
            ),
        }

    # ------------------------------------------------------------
    # GET /connect — kick off the OAuth flow.
    # Returns the authorize_url for the frontend to redirect/popup to.
    # ------------------------------------------------------------
    @router.get("/connect", response_model=SquareConnectStartResponse)
    async def connect(user=Depends(require_admin)):
        cfg = _cfg()
        if not cfg["app_id"] or not cfg["app_secret"]:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Square Developer App is not configured on this server. "
                    "The Wreckerlogix admin must set SQUARE_OAUTH_APPLICATION_ID "
                    "and SQUARE_OAUTH_APPLICATION_SECRET in the backend .env."
                ),
            )

        tenant_id = resolve_tenant_id(user)
        state = secrets.token_urlsafe(32)
        await db.square_oauth_states.insert_one(
            {
                "id": str(uuid.uuid4()),
                "state": state,
                "tenant_id": tenant_id,
                "user_id": user["id"],
                "created_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            }
        )

        urls = _square_base_urls(cfg["env"])
        params = {
            "client_id": cfg["app_id"],
            "scope": " ".join(SQUARE_SCOPES),
            "state": state,
            "session": "false",
            "redirect_uri": _redirect_uri(cfg),
        }
        return SquareConnectStartResponse(
            authorize_url=f"{urls['authorize']}?{urlencode(params)}",
            state=state,
        )

    # ------------------------------------------------------------
    # GET /callback — Square redirects the user's browser here.
    # We exchange the code for an access_token, store encrypted, and
    # bounce the user back to /wrecker/settings.
    # ------------------------------------------------------------
    @router.get("/callback")
    async def callback(
        code: Optional[str] = Query(None),
        state: Optional[str] = Query(None),
        error: Optional[str] = Query(None),
        error_description: Optional[str] = Query(None),
    ):
        cfg = _cfg()

        if error:
            logger.warning("Square OAuth returned error: %s — %s", error, error_description)
            return RedirectResponse(
                _settings_redirect(cfg, "error", error_description or error),
                status_code=302,
            )

        if not code or not state:
            return RedirectResponse(
                _settings_redirect(cfg, "error", "Missing code or state from Square"),
                status_code=302,
            )

        # Validate state token (single-use, 10 min expiry)
        state_doc = await db.square_oauth_states.find_one_and_delete({"state": state})
        if not state_doc:
            return RedirectResponse(
                _settings_redirect(cfg, "error", "OAuth state expired or invalid — please retry"),
                status_code=302,
            )
        expires_at = state_doc.get("expires_at")
        if isinstance(expires_at, datetime):
            # Mongo can return offset-naive datetimes — coerce to UTC for safe comparison
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                return RedirectResponse(
                    _settings_redirect(cfg, "error", "OAuth state expired — please retry"),
                    status_code=302,
                )

        tenant_id = state_doc["tenant_id"]
        user_id = state_doc.get("user_id")

        urls = _square_base_urls(cfg["env"])
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                token_resp = await client.post(
                    urls["token"],
                    json={
                        "client_id": cfg["app_id"],
                        "client_secret": cfg["app_secret"],
                        "code": code,
                        "grant_type": "authorization_code",
                        "redirect_uri": _redirect_uri(cfg),
                    },
                    headers={"Square-Version": "2024-12-18"},
                )
        except Exception as e:
            logger.exception("Square token exchange request failed")
            return RedirectResponse(
                _settings_redirect(cfg, "error", f"Token exchange network error: {e}"),
                status_code=302,
            )

        if token_resp.status_code != 200:
            logger.warning(
                "Square token exchange failed (%s): %s",
                token_resp.status_code,
                token_resp.text[:500],
            )
            return RedirectResponse(
                _settings_redirect(cfg, "error", "Square rejected the authorization code"),
                status_code=302,
            )

        td = token_resp.json()
        access_token = td.get("access_token")
        refresh_token = td.get("refresh_token")
        merchant_id = td.get("merchant_id")
        expires_at_raw = td.get("expires_at")
        if not access_token or not merchant_id:
            return RedirectResponse(
                _settings_redirect(cfg, "error", "Square did not return an access token"),
                status_code=302,
            )

        # Fetch merchant + locations for nice display
        merchant_name = None
        available_locations = []
        location_id = None
        location_name = None
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                m_resp = await client.get(
                    f"{urls['api']}/v2/merchants/{merchant_id}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Square-Version": "2024-12-18",
                    },
                )
                if m_resp.status_code == 200:
                    merchant_name = (
                        m_resp.json().get("merchant", {}).get("business_name")
                    )

                loc_resp = await client.get(
                    f"{urls['api']}/v2/locations",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Square-Version": "2024-12-18",
                    },
                )
                if loc_resp.status_code == 200:
                    raw_locs = loc_resp.json().get("locations", []) or []
                    available_locations = [
                        {
                            "id": loc.get("id"),
                            "name": loc.get("name"),
                            "status": loc.get("status"),
                            "address": (loc.get("address") or {}).get("locality"),
                        }
                        for loc in raw_locs
                    ]
                    # Pick the first ACTIVE location as default
                    active = [
                        loc for loc in raw_locs if loc.get("status") == "ACTIVE"
                    ] or raw_locs
                    if active:
                        location_id = active[0].get("id")
                        location_name = active[0].get("name")
        except Exception:
            logger.exception("Failed to fetch Square merchant/locations (non-fatal)")

        now = datetime.now(timezone.utc)
        doc = {
            "tenant_id": tenant_id,
            "provider": "square",
            "environment": cfg["env"],
            "merchant_id": merchant_id,
            "merchant_name": merchant_name,
            "location_id": location_id,
            "location_name": location_name,
            "available_locations": available_locations,
            "access_token_encrypted": encrypt_secret(access_token),
            "refresh_token_encrypted": encrypt_secret(refresh_token) if refresh_token else None,
            "expires_at": expires_at_raw,
            "connected_at": now,
            "connected_by_user_id": user_id,
            "updated_at": now,
        }

        await db.tenant_integrations.update_one(
            {"tenant_id": tenant_id, "provider": "square"},
            {"$set": doc},
            upsert=True,
        )
        logger.info(
            "Square connected for tenant=%s merchant=%s env=%s",
            tenant_id,
            merchant_id,
            cfg["env"],
        )
        return RedirectResponse(
            _settings_redirect(cfg, "connected"),
            status_code=302,
        )

    # ------------------------------------------------------------
    # POST /location — change the active billing location
    # ------------------------------------------------------------
    @router.post("/location")
    async def set_location(body: SquareLocationIn, user=Depends(require_admin)):
        tenant_id = resolve_tenant_id(user)
        rec = await db.tenant_integrations.find_one(
            {"tenant_id": tenant_id, "provider": "square"}
        )
        if not rec:
            raise HTTPException(404, "Square is not connected for this account")
        available = rec.get("available_locations", []) or []
        match = next((loc for loc in available if loc.get("id") == body.location_id), None)
        if not match:
            raise HTTPException(400, "Selected location is not available on this Square account")
        await db.tenant_integrations.update_one(
            {"tenant_id": tenant_id, "provider": "square"},
            {
                "$set": {
                    "location_id": match["id"],
                    "location_name": match.get("name"),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        return {"ok": True, "location_id": match["id"], "location_name": match.get("name")}

    # ------------------------------------------------------------
    # POST /disconnect — revoke + delete locally
    # ------------------------------------------------------------
    @router.post("/disconnect", response_model=SquareDisconnectResponse)
    async def disconnect(user=Depends(require_admin)):
        cfg = _cfg()
        tenant_id = resolve_tenant_id(user)
        rec = await db.tenant_integrations.find_one(
            {"tenant_id": tenant_id, "provider": "square"}
        )
        if not rec:
            return SquareDisconnectResponse(ok=True, message="Already disconnected")

        access_token = decrypt_secret(rec.get("access_token_encrypted"))
        merchant_id = rec.get("merchant_id")

        # Best-effort revoke at Square's side
        if access_token and cfg["app_id"] and cfg["app_secret"]:
            urls = _square_base_urls(rec.get("environment") or cfg["env"])
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    revoke_resp = await client.post(
                        urls["revoke"],
                        json={
                            "client_id": cfg["app_id"],
                            "access_token": access_token,
                            "merchant_id": merchant_id,
                            "revoke_only_access_token": False,
                        },
                        headers={
                            "Authorization": f"Client {cfg['app_secret']}",
                            "Square-Version": "2024-12-18",
                        },
                    )
                    if revoke_resp.status_code >= 400:
                        logger.warning(
                            "Square revoke returned %s: %s",
                            revoke_resp.status_code,
                            revoke_resp.text[:300],
                        )
            except Exception:
                logger.exception("Square revoke failed (non-fatal — deleting locally anyway)")

        await db.tenant_integrations.delete_one(
            {"tenant_id": tenant_id, "provider": "square"}
        )
        return SquareDisconnectResponse(
            ok=True, message="Square disconnected successfully"
        )

    # ------------------------------------------------------------
    # GET /webpayments-config — frontend needs the Square Web Payments SDK
    # to know which Application ID + Location ID to use. We expose ONLY the
    # safe, public values (never the access token).
    # ------------------------------------------------------------
    @router.get("/webpayments-config")
    async def webpayments_config(user=Depends(require_admin)):
        cfg = _cfg()
        tenant_id = resolve_tenant_id(user)
        rec = await db.tenant_integrations.find_one(
            {"tenant_id": tenant_id, "provider": "square"}
        )
        if not rec:
            raise HTTPException(
                404,
                "Square is not connected. Go to Settings → Payments and click 'Connect with Square'.",
            )
        return {
            "application_id": cfg["app_id"],
            "location_id": rec.get("location_id"),
            "environment": rec.get("environment", cfg["env"]),
            "merchant_name": rec.get("merchant_name"),
        }

    return router
