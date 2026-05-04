"""
push_notifications.py — Web Push (VAPID) wrapper for RoadBoss PWA.

Subscriptions are persisted in MongoDB collection `push_subscriptions`.
Each subscription doc shape:
  {
    id: uuid,
    user_id: str,          # the owning user (driver or admin)
    endpoint: str,         # browser push endpoint (unique per device)
    keys: { p256dh, auth },
    user_agent: str,
    created_at: datetime,
    last_success_at: datetime | None,
    last_error_at: datetime | None,
    last_error: str | None,
  }

All outbound pushes are audit-logged into `notification_logs` with channel='push'.
"""
from __future__ import annotations

import os
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pywebpush import webpush, WebPushException  # type: ignore

logger = logging.getLogger("push_notifications")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def get_vapid_public_key() -> Optional[str]:
    key = (os.environ.get("VAPID_PUBLIC_KEY") or "").strip()
    return key or None


def get_vapid_private_key() -> Optional[str]:
    key = (os.environ.get("VAPID_PRIVATE_KEY") or "").strip()
    return key or None


def get_vapid_contact() -> str:
    return (os.environ.get("VAPID_CONTACT_EMAIL") or "mailto:support@roadboss.app").strip()


def is_push_configured() -> bool:
    return bool(get_vapid_public_key() and get_vapid_private_key())


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _log_notification(db, payload: Dict[str, Any]) -> None:
    """Best-effort audit log entry (channel='push')."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "channel": "push",
            "direction": "outbound",
            "created_at": _now(),
            **payload,
        }
        await db.notification_logs.insert_one(doc)
    except Exception as e:  # pragma: no cover - logging must never crash the caller
        logger.warning("push notification_logs write failed: %s", e)


# ---------------------------------------------------------------------------
# Subscription CRUD helpers
# ---------------------------------------------------------------------------
async def save_subscription(
    db,
    *,
    user_id: str,
    subscription: Dict[str, Any],
    user_agent: str = "",
) -> Dict[str, Any]:
    """Upsert a push subscription by its endpoint. Returns the stored doc."""
    endpoint = subscription.get("endpoint") or ""
    keys = subscription.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("Invalid push subscription payload")

    existing = await db.push_subscriptions.find_one({"endpoint": endpoint}, {"_id": 0})
    if existing:
        # Re-attach to current user in case the device was handed off.
        await db.push_subscriptions.update_one(
            {"endpoint": endpoint},
            {
                "$set": {
                    "user_id": user_id,
                    "keys": keys,
                    "user_agent": user_agent,
                    "updated_at": _now(),
                }
            },
        )
        existing.update({"user_id": user_id, "keys": keys, "user_agent": user_agent})
        return existing

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "endpoint": endpoint,
        "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]},
        "user_agent": user_agent,
        "created_at": _now(),
        "updated_at": _now(),
        "last_success_at": None,
        "last_error_at": None,
        "last_error": None,
    }
    await db.push_subscriptions.insert_one(dict(doc))
    return doc


async def remove_subscription(db, *, endpoint: str, user_id: Optional[str] = None) -> int:
    query: Dict[str, Any] = {"endpoint": endpoint}
    if user_id:
        query["user_id"] = user_id
    res = await db.push_subscriptions.delete_many(query)
    return res.deleted_count or 0


async def list_subscriptions_for_users(db, user_ids: List[str]) -> List[Dict[str, Any]]:
    if not user_ids:
        return []
    rows = await db.push_subscriptions.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0}
    ).to_list(5000)
    return rows


async def list_subscriptions_for_user(db, user_id: str) -> List[Dict[str, Any]]:
    return await list_subscriptions_for_users(db, [user_id])


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------
def _build_payload(
    title: str,
    body: str,
    *,
    url: Optional[str] = None,
    tag: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    severity: str = "info",
) -> str:
    payload: Dict[str, Any] = {
        "title": title[:120],
        "body": body[:280],
        "severity": severity,
        "url": url or "/",
        "tag": tag or "roadboss",
        "timestamp": int(_now().timestamp() * 1000),
    }
    if data:
        payload["data"] = data
    return json.dumps(payload)


async def _send_single(
    db,
    sub: Dict[str, Any],
    payload_json: str,
    *,
    event_type: str,
    event_ref_id: Optional[str] = None,
    ttl: int = 3600,
) -> Dict[str, Any]:
    priv = get_vapid_private_key()
    if not priv:
        return {"ok": False, "error": "push_not_configured", "skipped": True}

    vapid_claims = {"sub": get_vapid_contact()}
    sub_info = {"endpoint": sub["endpoint"], "keys": sub["keys"]}

    try:
        resp = webpush(
            subscription_info=sub_info,
            data=payload_json,
            vapid_private_key=priv,
            vapid_claims=vapid_claims,
            ttl=ttl,
        )
        await db.push_subscriptions.update_one(
            {"endpoint": sub["endpoint"]},
            {"$set": {"last_success_at": _now(), "last_error": None}},
        )
        await _log_notification(
            db,
            {
                "user_id": sub.get("user_id"),
                "recipient": sub["endpoint"][:80],
                "status": "sent",
                "event_type": event_type,
                "event_ref_id": event_ref_id,
                "metadata": {"payload": json.loads(payload_json)},
            },
        )
        return {"ok": True, "status": getattr(resp, "status_code", None)}
    except WebPushException as e:
        status = None
        try:
            status = e.response.status_code if e.response is not None else None  # type: ignore[union-attr]
        except Exception:
            status = None
        gone = status in (404, 410)
        if gone:
            # Subscription permanently invalid — clean it up.
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
        else:
            await db.push_subscriptions.update_one(
                {"endpoint": sub["endpoint"]},
                {"$set": {"last_error_at": _now(), "last_error": str(e)[:400]}},
            )
        await _log_notification(
            db,
            {
                "user_id": sub.get("user_id"),
                "recipient": sub["endpoint"][:80],
                "status": "failed",
                "event_type": event_type,
                "event_ref_id": event_ref_id,
                "metadata": {
                    "error": str(e)[:400],
                    "status_code": status,
                    "cleaned_up": gone,
                },
            },
        )
        return {"ok": False, "error": str(e)[:400], "status": status, "cleaned_up": gone}
    except Exception as e:
        await _log_notification(
            db,
            {
                "user_id": sub.get("user_id"),
                "recipient": sub["endpoint"][:80],
                "status": "failed",
                "event_type": event_type,
                "event_ref_id": event_ref_id,
                "metadata": {"error": str(e)[:400]},
            },
        )
        return {"ok": False, "error": str(e)[:400]}


async def send_push_to_users(
    db,
    user_ids: List[str],
    *,
    title: str,
    body: str,
    url: Optional[str] = None,
    tag: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    severity: str = "info",
    event_type: str = "generic",
    event_ref_id: Optional[str] = None,
    ttl: int = 3600,
) -> Dict[str, Any]:
    """Fan-out push to every active subscription for the given user ids."""
    if not is_push_configured():
        return {"ok": False, "skipped": True, "reason": "not_configured", "delivered": 0}
    subs = await list_subscriptions_for_users(db, user_ids)
    if not subs:
        return {"ok": True, "skipped": True, "reason": "no_subscriptions", "delivered": 0}
    payload_json = _build_payload(title, body, url=url, tag=tag, data=data, severity=severity)
    delivered = 0
    errors: List[str] = []
    for sub in subs:
        res = await _send_single(
            db, sub, payload_json, event_type=event_type, event_ref_id=event_ref_id, ttl=ttl
        )
        if res.get("ok"):
            delivered += 1
        elif res.get("error"):
            errors.append(res["error"])
    return {
        "ok": True,
        "delivered": delivered,
        "attempted": len(subs),
        "errors": errors[:3],
    }


async def send_push_to_admins(
    db,
    *,
    title: str,
    body: str,
    url: Optional[str] = None,
    tag: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    severity: str = "info",
    event_type: str = "generic",
    event_ref_id: Optional[str] = None,
) -> Dict[str, Any]:
    admins = await db.users.find(
        {"role": {"$in": ["fleet_admin", "super_admin", "dispatcher"]}},
        {"_id": 0, "id": 1},
    ).to_list(500)
    user_ids = [a["id"] for a in admins if a.get("id")]
    return await send_push_to_users(
        db,
        user_ids,
        title=title,
        body=body,
        url=url,
        tag=tag,
        data=data,
        severity=severity,
        event_type=event_type,
        event_ref_id=event_ref_id,
    )
