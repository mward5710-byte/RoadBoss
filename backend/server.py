from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'highway-pilot-stealth-secret-2026-change-me')
JWT_ALG = 'HS256'
# Long-lived sessions — Mike's request: log in once on a phone, stay logged in
# until you swap devices. 90 days mirrors how Towbook / dispatch tools work.
JWT_EXP_HOURS = 24 * 365 * 10  # 10 years — Mike's "one-time sign in" rule.
                               # Stays signed in until the user taps Sign Out
                               # or wipes the device. Per his V2 spec, this is
                               # how WreckerLogix and Towbook-style field apps
                               # actually work in the cab. QuickBooks integration
                               # uses its OWN OAuth tokens (separate lifecycle),
                               # so this has zero effect on QB connectivity.

app = FastAPI(title="Highway Pilot API", version="0.1.0")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# Wrecker Mode (tow operator surface) — see /app/backend/wrecker.py
from wrecker import build_wrecker_router, seed_wrecker_demo, WRECKER_VOICE_INTENTS  # noqa: E402

# Third-party integrations (multi-tenant OAuth — each company connects their own)
from integrations.square_oauth import build_square_router  # noqa: E402
from integrations.public_pay import build_public_pay_router  # noqa: E402
from integrations.navigation import register_navigation_routes  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# Helpers
# ============================================================

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively serialize datetime objects to ISO strings and remove _id."""
    if not doc:
        return doc
    out = {}
    for k, v in doc.items():
        if k == '_id':
            continue
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, dict):
            out[k] = serialize_doc(v)
        elif isinstance(v, list):
            out[k] = [serialize_doc(i) if isinstance(i, dict) else (i.isoformat() if isinstance(i, datetime) else i) for i in v]
        else:
            out[k] = v
    return out

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        'sub': user_id,
        'email': email,
        'role': role,
        'exp': now_utc() + timedelta(hours=JWT_EXP_HOURS),
        'iat': now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, Any]:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({'id': payload['sub']}, {'_id': 0, 'password_hash': 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return serialize_doc(user)

def require_role(*roles):
    async def _check(user=Depends(get_current_user)):
        if user['role'] not in roles and user['role'] != 'super_admin':
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _check

# ============================================================
# Models
# ============================================================

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = 'driver'  # driver | fleet_admin | dispatcher | super_admin

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: Dict[str, Any]

class WaitlistIn(BaseModel):
    name: str
    email: EmailStr
    role: Optional[str] = None  # owner-operator | fleet | dispatcher | other
    fleet_size: Optional[str] = None
    message: Optional[str] = None

class DriverIn(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_state: Optional[str] = None
    home_terminal: Optional[str] = None
    status: str = 'off_duty'  # on_duty | driving | off_duty | sleeper
    vehicle_id: Optional[str] = None
    
    @field_validator('email', 'phone', 'license_number', 'license_state', 'home_terminal', 'vehicle_id', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == '':
            return None
        return v

class VehicleIn(BaseModel):
    name: str  # truck number / nickname
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    plate: Optional[str] = None
    odometer: int = 0
    status: str = 'active'  # active | maintenance | retired

class TripIn(BaseModel):
    driver_id: str
    vehicle_id: Optional[str] = None
    origin: str
    destination: str
    miles: float = 0
    status: str = 'planned'  # planned | active | completed | cancelled
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    notes: Optional[str] = None

class HOSLogIn(BaseModel):
    driver_id: str
    duty_status: str  # on_duty | driving | off_duty | sleeper
    started_at: Optional[str] = None
    notes: Optional[str] = None

class MaintenanceIn(BaseModel):
    vehicle_id: str
    service_type: str
    due_at: Optional[str] = None
    due_miles: Optional[int] = None
    completed: bool = False
    notes: Optional[str] = None
    cost: Optional[float] = None

class AlertIn(BaseModel):
    type: str  # hos_violation | crash | speeding | hard_brake | maintenance_due | dispatch
    severity: str = 'info'  # info | warning | critical
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    message: str
    location: Optional[Dict[str, float]] = None  # {lat, lng}

# ============================================================
# Auth Routes
# ============================================================

@api_router.get("/")
async def root():
    return {"service": "Highway Pilot API", "status": "ok", "version": "0.1.0"}

@api_router.get("/health")
async def health():
    """Fast liveness probe. NO DB, NO logic. Returns immediately so K8s
    knows the pod is alive even while heavy startup work runs in the background."""
    return {"status": "ok"}

@api_router.post("/auth/register", response_model=TokenOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({'email': body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        'id': str(uuid.uuid4()),
        'email': body.email.lower(),
        'name': body.name,
        'role': body.role if body.role in ('driver', 'fleet_admin', 'dispatcher') else 'driver',
        'password_hash': hash_password(body.password),
        'created_at': now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    token = create_token(user['id'], user['email'], user['role'])
    safe = {k: v for k, v in user.items() if k not in ('password_hash', '_id')}
    # Phase 2C: send welcome email (best-effort)
    base = os.environ.get('NOTIFY_BASE_URL', '')
    login_url = f"{base}/login" if base else 'https://roadboss.app/login'
    tpl = notify.build_welcome_email(name=user['name'], login_url=login_url)
    await notify.send_email(db, user['email'], tpl['subject'], tpl['html'], tpl['plain'], event_type='welcome', user_id=user['id'])
    return {'access_token': token, 'token_type': 'bearer', 'user': safe}

@api_router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    user = await db.users.find_one({'email': body.email.lower()})
    if not user or not verify_password(body.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user['id'], user['email'], user['role'])
    safe = serialize_doc({k: v for k, v in user.items() if k != 'password_hash'})
    return {'access_token': token, 'token_type': 'bearer', 'user': safe}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ------------------------------------------------------------
# Demo login (public, no password) — Phase 2H.3
# For TikTok / social visitors hitting /try. Auto-issues a short-lived token
# for the seeded demo driver so they can explore the app without signup friction.
# ------------------------------------------------------------
class DemoLoginIn(BaseModel):
    role: Optional[str] = 'driver'  # 'driver' | 'admin'
    source: Optional[str] = None     # utm source (tiktok, fb, reddit, etc.)


@api_router.post("/auth/demo")
async def demo_login(body: DemoLoginIn):
    role_map = {
        'driver':     'driver@wrecker-logix.com',
        'admin':      'fleet_admin@wrecker-logix.com',
        'wrecker':    'wrecker@wrecker-logix.com',          # Steve Carroll (driver)
        'wrecker2':   'wrecker2@wrecker-logix.com',         # Tony Marquez
        'wrecker3':   'wrecker3@wrecker-logix.com',         # Jake Boudreaux
        'dispatcher': 'dispatcher@wrecker-logix.com',       # Pam Henderson (dispatcher)
        'supervisor': 'supervisor@wrecker-logix.com',       # Bill Kearney (foreman)
    }
    email = role_map.get((body.role or 'driver').lower(), role_map['driver'])
    # Back-compat: if seed wasn't re-run yet, fall back to legacy domain.
    user = await db.users.find_one({'email': email})
    if not user:
        legacy = email.replace('@wrecker-logix.com', '@highwaypilot.io')
        user = await db.users.find_one({'email': legacy})
    if not user:
        raise HTTPException(404, "Demo account unavailable — re-seed the database.")
    token = create_token(user['id'], user['email'], user['role'])
    # Lightweight audit for marketing attribution (non-blocking)
    try:
        await db.demo_sessions.insert_one({
            'id': str(uuid.uuid4()),
            'user_email': email,
            'source': (body.source or '').strip().lower()[:40] or 'direct',
            'created_at': now_utc(),
        })
    except Exception:
        pass
    safe = serialize_doc({k: v for k, v in user.items() if k != 'password_hash'})
    return {'access_token': token, 'token_type': 'bearer', 'user': safe, 'demo': True}


@api_router.get("/share/stats")
async def share_stats():
    """Public — lightweight traction numbers for social-share kits."""
    try:
        waitlist_count = await db.waitlist.count_documents({})
    except Exception:
        waitlist_count = 0
    try:
        drivers_count = await db.drivers.count_documents({})
    except Exception:
        drivers_count = 0
    try:
        demo_count = await db.demo_sessions.count_documents({})
    except Exception:
        demo_count = 0
    return {
        'waitlist_count': waitlist_count,
        'demo_sessions': demo_count,
        'active_drivers_seeded': drivers_count,
    }


# ============================================================
# Waitlist (public)
# ============================================================

@api_router.post("/waitlist")
async def join_waitlist(body: WaitlistIn):
    doc = {
        'id': str(uuid.uuid4()),
        'name': body.name,
        'email': body.email.lower(),
        'role': body.role,
        'fleet_size': body.fleet_size,
        'message': body.message,
        'created_at': now_utc().isoformat(),
    }
    # avoid duplicates
    existing = await db.waitlist.find_one({'email': doc['email']})
    if existing:
        return {'ok': True, 'message': "You're already on the list, partner. \u2713"}
    await db.waitlist.insert_one(doc)
    return {'ok': True, 'message': "You're in. We'll be in touch."}

@api_router.get("/waitlist")
async def list_waitlist(user=Depends(require_role('super_admin', 'fleet_admin'))):
    rows = await db.waitlist.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return rows


# ============================================================
# Investor Inquiries — public form for backers to reach Mike
# ============================================================

class InvestorInquiryIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=4, max_length=160)
    phone: Optional[str] = Field(None, max_length=40)
    organization: Optional[str] = Field(None, max_length=160)
    investment_range: Optional[str] = Field(None, max_length=60)  # e.g. "$50k-$250k"
    role: Optional[str] = Field(None, max_length=60)  # e.g. "Angel", "VC", "Strategic"
    message: str = Field(..., min_length=8, max_length=2000)
    referral_source: Optional[str] = Field(None, max_length=120)
    # Marketing attribution — captured automatically from the URL the
    # investor landed on. Lets Mike see which channel (TikTok, LinkedIn,
    # podcast, cold email) is actually producing leads.
    utm_source: Optional[str] = Field(None, max_length=80)
    utm_medium: Optional[str] = Field(None, max_length=80)
    utm_campaign: Optional[str] = Field(None, max_length=120)
    utm_content: Optional[str] = Field(None, max_length=120)
    landing_page: Optional[str] = Field(None, max_length=240)


@api_router.post("/investor-inquiry")
async def submit_investor_inquiry(body: InvestorInquiryIn):
    """Public endpoint — no auth. Stores investor inquiry; Mike sees these on his dashboard."""
    doc = body.model_dump()
    doc['id'] = str(uuid.uuid4())
    doc['created_at'] = now_utc()
    doc['status'] = 'new'  # new | contacted | meeting_scheduled | closed
    doc['ip_hash'] = ''  # could capture for spam tracking (not now)
    await db.investor_inquiries.insert_one(doc)
    logger.info(f"INVESTOR INQUIRY received from {body.name} <{body.email}>")
    return {
        'ok': True,
        'message': "Thank you. Michael will reach out personally within 24 hours.",
    }


@api_router.get("/investor-inquiries")
async def list_investor_inquiries(user=Depends(require_role('super_admin', 'fleet_admin'))):
    """Mike's view — see every backer that's reached out."""
    rows = await db.investor_inquiries.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    # Convert datetime to iso string for JSON
    for r in rows:
        if isinstance(r.get('created_at'), datetime):
            r['created_at'] = r['created_at'].isoformat()
    return {'count': len(rows), 'items': rows}


@api_router.get("/investor-inquiries/summary")
async def investor_inquiries_summary(user=Depends(require_role('super_admin', 'fleet_admin'))):
    """Channel attribution summary — which UTM source/medium is actually
    producing investor leads. Powers the future Investor Inbox dashboard."""
    rows = await db.investor_inquiries.find({}, {'_id': 0}).to_list(2000)
    by_source: Dict[str, int] = {}
    by_medium: Dict[str, int] = {}
    by_campaign: Dict[str, int] = {}
    by_status: Dict[str, int] = {}
    by_range: Dict[str, int] = {}
    for r in rows:
        s = (r.get('utm_source') or 'direct').lower()
        m = (r.get('utm_medium') or 'organic').lower()
        c = (r.get('utm_campaign') or 'none').lower()
        st = (r.get('status') or 'new').lower()
        rg = r.get('investment_range') or 'unspecified'
        by_source[s] = by_source.get(s, 0) + 1
        by_medium[m] = by_medium.get(m, 0) + 1
        by_campaign[c] = by_campaign.get(c, 0) + 1
        by_status[st] = by_status.get(st, 0) + 1
        by_range[rg] = by_range.get(rg, 0) + 1
    return {
        'total': len(rows),
        'by_source': by_source,
        'by_medium': by_medium,
        'by_campaign': by_campaign,
        'by_status': by_status,
        'by_investment_range': by_range,
    }


@api_router.put("/investor-inquiries/{inquiry_id}/status")
async def update_investor_inquiry_status(inquiry_id: str, body: Dict[str, str],
                                          user=Depends(require_role('super_admin', 'fleet_admin'))):
    """Mark an inquiry as contacted, meeting_scheduled, or closed."""
    new_status = (body.get('status') or '').strip()
    allowed = {'new', 'contacted', 'meeting_scheduled', 'closed'}
    if new_status not in allowed:
        raise HTTPException(400, f"Status must be one of: {sorted(allowed)}")
    res = await db.investor_inquiries.update_one(
        {'id': inquiry_id},
        {'$set': {'status': new_status, 'updated_at': now_utc()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Inquiry not found")
    return {'ok': True, 'status': new_status}


@api_router.get("/business-profile/public")
async def public_business_profile():
    """Public, safe subset of the Business Profile — used by the marketing &
    investor pages so they show real company info without requiring login.
    NEVER returns internal fields like updated_by or unrelated metadata."""
    doc = await db.tenant_settings.find_one({'tenant_id': 'default'}, {'_id': 0}) or {}
    return {
        'company_name': doc.get('company_name') or 'Apex Epoxy Flooring LLC',
        'dba_name': doc.get('dba_name') or 'RoadBoss · Wreckerlogix',
        'owner_name': doc.get('owner_name') or 'Michael Ward',
        'phone': doc.get('phone') or '',
        'email': doc.get('email') or '',
        'website': doc.get('website') or '',
        'city': doc.get('city') or 'Kokomo',
        'state': doc.get('state') or 'IN',
    }


# ============================================================
# Generic CRUD factory
# ============================================================

def _make_doc(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload['id'] = str(uuid.uuid4())
    payload['created_at'] = now_utc().isoformat()
    payload['updated_at'] = now_utc().isoformat()
    return payload

async def _list(coll: str, filters: Optional[Dict] = None, limit: int = 1000):
    q = filters or {}
    rows = await db[coll].find(q, {'_id': 0}).sort('created_at', -1).to_list(limit)
    return rows

async def _get(coll: str, _id: str):
    row = await db[coll].find_one({'id': _id}, {'_id': 0})
    if not row:
        raise HTTPException(404, f"{coll} not found")
    return row

async def _update(coll: str, _id: str, patch: Dict[str, Any]):
    patch['updated_at'] = now_utc().isoformat()
    res = await db[coll].update_one({'id': _id}, {'$set': patch})
    if res.matched_count == 0:
        raise HTTPException(404, f"{coll} not found")
    return await _get(coll, _id)

async def _delete(coll: str, _id: str):
    res = await db[coll].delete_one({'id': _id})
    if res.deleted_count == 0:
        raise HTTPException(404, f"{coll} not found")
    return {'ok': True}

# ============================================================
# Drivers
# ============================================================

@api_router.get("/drivers")
async def list_drivers(user=Depends(get_current_user)):
    rows = await _list('drivers')
    if user.get('hide_demo_data'):
        rows = [r for r in rows if not (r.get('is_demo') is True or r.get('tenant_id') == 'demo')]
    return rows

@api_router.post("/drivers")
async def create_driver(body: DriverIn, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    doc = _make_doc(body.model_dump())
    # default location near Dallas, TX for demo
    doc.setdefault('lat', 32.7767)
    doc.setdefault('lng', -96.7970)
    doc.setdefault('hos_remaining_minutes', 660)
    doc.setdefault('avatar_color', '#22d3ee')
    await db.drivers.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, user=Depends(get_current_user)):
    return await _get('drivers', driver_id)

@api_router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, body: DriverIn, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    return await _update('drivers', driver_id, body.model_dump())

@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, user=Depends(require_role('fleet_admin'))):
    return await _delete('drivers', driver_id)

# ============================================================
# Vehicles
# ============================================================

@api_router.get("/vehicles")
async def list_vehicles(user=Depends(get_current_user)):
    return await _list('vehicles')

@api_router.post("/vehicles")
async def create_vehicle(body: VehicleIn, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    doc = _make_doc(body.model_dump())
    await db.vehicles.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/vehicles/{vid}")
async def get_vehicle(vid: str, user=Depends(get_current_user)):
    return await _get('vehicles', vid)

@api_router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, body: VehicleIn, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    return await _update('vehicles', vid, body.model_dump())

@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user=Depends(require_role('fleet_admin'))):
    return await _delete('vehicles', vid)

# ============================================================
# Trips
# ============================================================

@api_router.get("/trips")
async def list_trips(driver_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if driver_id:
        q['driver_id'] = driver_id
    elif user['role'] == 'driver':
        # driver sees only their trips (match on user email -> driver email)
        d = await db.drivers.find_one({'email': user['email']}, {'_id': 0})
        if d:
            q['driver_id'] = d['id']
    return await _list('trips', q)

@api_router.post("/trips")
async def create_trip(body: TripIn, user=Depends(get_current_user)):
    doc = _make_doc(body.model_dump())
    await db.trips.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/trips/{tid}")
async def update_trip(tid: str, body: TripIn, user=Depends(get_current_user)):
    return await _update('trips', tid, body.model_dump())

@api_router.delete("/trips/{tid}")
async def delete_trip(tid: str, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    return await _delete('trips', tid)

# ============================================================
# HOS
# ============================================================

@api_router.get("/hos")
async def list_hos(driver_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if driver_id:
        q['driver_id'] = driver_id
    elif user['role'] == 'driver':
        d = await db.drivers.find_one({'email': user['email']}, {'_id': 0})
        if d:
            q['driver_id'] = d['id']
    return await _list('hos_logs', q, 500)

@api_router.post("/hos")
async def create_hos(body: HOSLogIn, user=Depends(get_current_user)):
    doc = _make_doc(body.model_dump())
    if not doc.get('started_at'):
        doc['started_at'] = now_utc().isoformat()
    await db.hos_logs.insert_one(doc)
    # also update driver duty status
    await db.drivers.update_one({'id': body.driver_id}, {'$set': {'status': body.duty_status, 'updated_at': now_utc().isoformat()}})
    return serialize_doc(doc)

# ============================================================
# Maintenance
# ============================================================

@api_router.get("/maintenance")
async def list_maintenance(vehicle_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if vehicle_id:
        q['vehicle_id'] = vehicle_id
    return await _list('maintenance', q)

@api_router.post("/maintenance")
async def create_maintenance(body: MaintenanceIn, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    doc = _make_doc(body.model_dump())
    await db.maintenance.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/maintenance/{mid}")
async def update_maintenance(mid: str, body: MaintenanceIn, user=Depends(require_role('fleet_admin', 'dispatcher'))):
    return await _update('maintenance', mid, body.model_dump())

@api_router.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user=Depends(require_role('fleet_admin'))):
    return await _delete('maintenance', mid)

# ============================================================
# Alerts & Dashcam events
# ============================================================

@api_router.get("/alerts")
async def list_alerts(user=Depends(get_current_user)):
    return await _list('alerts', limit=200)

@api_router.post("/alerts")
async def create_alert(body: AlertIn, user=Depends(get_current_user)):
    doc = _make_doc(body.model_dump())
    await db.alerts.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/dashcam-events")
async def list_dashcam(
    vendor: Optional[str] = None,
    severity: Optional[str] = None,
    driver_id: Optional[str] = None,
    limit: int = 200,
    user=Depends(get_current_user),
):
    query: Dict[str, Any] = {}
    if vendor:
        query['vendor'] = vendor
    if severity:
        query['severity'] = severity
    if driver_id:
        query['driver_id'] = driver_id
    rows = await db.dashcam_events.find(query, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 500)))
    return rows


# ---------- Dashcam vendor registry (Phase 2G.4) ----------
DASHCAM_VENDORS = [
    {
        'key': 'Samsara',
        'label': 'Samsara',
        'accent': '#38bdf8',
        'tagline': 'Connected operations platform',
        'status': 'mock',
    },
    {
        'key': 'Lytx',
        'label': 'Lytx DriveCam',
        'accent': '#a78bfa',
        'tagline': 'AI-powered video telematics',
        'status': 'mock',
    },
    {
        'key': 'Verizon Connect',
        'label': 'Verizon Connect',
        'accent': '#34d399',
        'tagline': 'Fleet GPS and video',
        'status': 'mock',
    },
    {
        'key': 'RoadBoss',
        'label': 'RoadBoss Native',
        'accent': '#f59e0b',
        'tagline': 'In-cab phone as a dashcam',
        'status': 'live',
    },
]


@api_router.get("/dashcam/vendors")
async def dashcam_vendors(user=Depends(get_current_user)):
    # Include rollup counts per vendor for the UI filter chips.
    vendors = [dict(v) for v in DASHCAM_VENDORS]
    for v in vendors:
        v['event_count'] = await db.dashcam_events.count_documents({'vendor': v['key']})
    return vendors


SIMULATE_EVENT_LIBRARY = [
    ('Hard brake',                  'warning',  (40, 70)),
    ('Following too close',         'warning',  (55, 72)),
    ('Speeding',                    'warning',  (78, 92)),
    ('Lane departure',              'warning',  (55, 70)),
    ('Distracted driving (phone)',  'warning',  (40, 68)),
    ('Forward collision warning',   'critical', (45, 70)),
    ('Harsh cornering',             'warning',  (25, 45)),
    ('Yawning / drowsiness',        'warning',  (55, 68)),
    ('Seat belt off',               'warning',  (35, 65)),
]
SIMULATE_LOCATIONS = [
    ('I-40 W', 'Memphis, TN'), ('I-30 E', 'Dallas, TX'),
    ('I-85 N', 'Atlanta, GA'), ('I-70 E', 'Columbus, OH'),
    ('I-10 W', 'Phoenix, AZ'), ('I-65 N', 'Louisville, KY'),
]


class DashcamSimulateIn(BaseModel):
    vendor: Optional[str] = None
    driver_id: Optional[str] = None
    event: Optional[str] = None
    severity: Optional[str] = None


@api_router.post("/dashcam/simulate-live")
async def dashcam_simulate_live(
    body: Optional[DashcamSimulateIn] = None,
    user=Depends(require_role('fleet_admin', 'super_admin', 'dispatcher')),
):
    """Generate a realistic mock dashcam event (for demos + mock adapter testing).
    Returns the freshly-created event. Also fires a push to admins so they see it arrive."""
    import random as _rnd
    body = body or DashcamSimulateIn()
    drivers_list = await db.drivers.find({}, {'_id': 0}).to_list(200)
    if not drivers_list:
        raise HTTPException(400, "No drivers available to attribute the event to.")
    driver = None
    if body.driver_id:
        driver = next((d for d in drivers_list if d.get('id') == body.driver_id), None)
    if not driver:
        driver = _rnd.choice(drivers_list)
    vehicle = await db.vehicles.find_one({'id': driver.get('vehicle_id')}, {'_id': 0}) if driver.get('vehicle_id') else None
    vendor_keys = [v['key'] for v in DASHCAM_VENDORS]
    vendor = body.vendor if body.vendor in vendor_keys else _rnd.choice(vendor_keys)
    if body.event and body.severity:
        event_name, severity, spd_range = body.event, body.severity, (40, 70)
    else:
        event_name, severity, spd_range = _rnd.choice(SIMULATE_EVENT_LIBRARY)
    road, city = _rnd.choice(SIMULATE_LOCATIONS)
    speed = _rnd.randint(*spd_range)
    confidence = _rnd.randint(78, 99)
    doc = _make_doc({
        'vehicle_id': (vehicle or {}).get('id'),
        'vehicle_name': (vehicle or {}).get('name'),
        'driver_id': driver.get('id'),
        'driver_name': driver.get('name'),
        'event': event_name,
        'severity': severity,
        'vendor': vendor,
        'thumbnail': f"https://images.unsplash.com/photo-1580651315530-69c8e0903883?w=500&sig={_rnd.randint(1, 9999)}",
        'speed_mph': speed,
        'location_road': road,
        'location_city': city,
        'clip_duration_sec': _rnd.randint(8, 25),
        'confidence_pct': confidence,
        'reviewed': False,
        'coach_tag': None,
        'source': 'simulate-live',
    })
    await db.dashcam_events.insert_one(dict(doc))
    # Lightweight admin alert + push for critical severity (keeps dashboard lively)
    if severity == 'critical':
        try:
            await push_notify.send_push_to_admins(
                db,
                title=f"⚠ {vendor} · {event_name}",
                body=f"{driver.get('name')} @ {speed} mph on {road} ({city}). Confidence {confidence}%.",
                url='/app/dashcam',
                tag=f"dashcam-{doc['id']}",
                severity='warning',
                event_type='dashcam_critical',
                event_ref_id=doc['id'],
            )
        except Exception as e:
            logger.warning(f"Dashcam push failed: {e}")
    return doc

# ============================================================
# Stats / Overview
# ============================================================

@api_router.get("/overview")
async def overview(user=Depends(get_current_user)):
    drivers = await db.drivers.find({}, {'_id': 0}).to_list(1000)
    vehicles = await db.vehicles.find({}, {'_id': 0}).to_list(1000)
    alerts = await db.alerts.find({}, {'_id': 0}).sort('created_at', -1).to_list(50)
    maintenance = await db.maintenance.find({'completed': False}, {'_id': 0}).to_list(200)
    trips = await db.trips.find({}, {'_id': 0}).to_list(200)

    active_drivers = sum(1 for d in drivers if d.get('status') in ('driving', 'on_duty'))
    hos_at_risk = sum(1 for d in drivers if d.get('hos_remaining_minutes', 660) < 90)
    crit_alerts = sum(1 for a in alerts if a.get('severity') == 'critical')
    miles_this_week = sum((t.get('miles') or 0) for t in trips if t.get('status') == 'completed')

    return {
        'kpis': {
            'drivers_total': len(drivers),
            'drivers_active': active_drivers,
            'vehicles_total': len(vehicles),
            'hos_at_risk': hos_at_risk,
            'critical_alerts': crit_alerts,
            'maintenance_due': len(maintenance),
            'miles_this_week': round(miles_this_week, 1),
        },
        'drivers': drivers,
        'recent_alerts': alerts[:10],
        'maintenance_due_list': maintenance[:10],
    }

# ============================================================
# Trip lifecycle + IFTA mileage
# ============================================================

class TripEndIn(BaseModel):
    miles: Optional[float] = None
    notes: Optional[str] = None

@api_router.post("/trips/{tid}/start")
async def start_trip(tid: str, user=Depends(get_current_user)):
    return await _update('trips', tid, {'status': 'active', 'started_at': now_utc().isoformat()})

@api_router.post("/trips/{tid}/end")
async def end_trip(tid: str, body: TripEndIn = TripEndIn(), user=Depends(get_current_user)):
    patch = {'status': 'completed', 'ended_at': now_utc().isoformat()}
    if body.miles is not None:
        patch['miles'] = float(body.miles)
    if body.notes:
        patch['notes'] = body.notes
    return await _update('trips', tid, patch)

class MileageEntryIn(BaseModel):
    state: str
    miles: float
    notes: Optional[str] = None

@api_router.get("/trips/{tid}/mileage")
async def list_trip_mileage(tid: str, user=Depends(get_current_user)):
    return await _list('trip_mileage', {'trip_id': tid})

@api_router.post("/trips/{tid}/mileage")
async def add_trip_mileage(tid: str, body: MileageEntryIn, user=Depends(get_current_user)):
    doc = _make_doc({'trip_id': tid, 'state': body.state.upper(), 'miles': float(body.miles), 'notes': body.notes})
    await db.trip_mileage.insert_one(doc)
    return serialize_doc(doc)

@api_router.delete("/trips/{tid}/mileage/{mid}")
async def del_trip_mileage(tid: str, mid: str, user=Depends(get_current_user)):
    return await _delete('trip_mileage', mid)

@api_router.get("/ifta/summary")
async def ifta_summary(user=Depends(get_current_user)):
    rows = await db.trip_mileage.find({}, {'_id': 0}).to_list(10000)
    by_state: Dict[str, float] = {}
    for r in rows:
        s = (r.get('state') or '').upper()
        if not s:
            continue
        by_state[s] = by_state.get(s, 0) + (r.get('miles') or 0)
    return {
        'by_state': sorted([{'state': k, 'miles': round(v, 2)} for k, v in by_state.items()], key=lambda x: -x['miles']),
        'total': round(sum(by_state.values()), 2),
        'state_count': len(by_state),
    }

# ============================================================
# CSV exports
# ============================================================

def _csv_response(filename: str, headers: List[str], rows: List[List[Any]]):
    import csv as _csv, io as _io
    from fastapi.responses import StreamingResponse
    s = _io.StringIO()
    w = _csv.writer(s)
    w.writerow(headers)
    for r in rows:
        w.writerow(r)
    s.seek(0)
    return StreamingResponse(iter([s.getvalue()]), media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename={filename}'})

@api_router.get("/exports/trips.csv")
async def export_trips(user=Depends(get_current_user)):
    rows = await db.trips.find({}, {'_id': 0}).sort('created_at', -1).to_list(10000)
    drivers = {d['id']: d['name'] for d in await db.drivers.find({}, {'_id': 0}).to_list(2000)}
    vehicles = {v['id']: v['name'] for v in await db.vehicles.find({}, {'_id': 0}).to_list(2000)}
    out = [[r.get('id'), drivers.get(r.get('driver_id'), ''), vehicles.get(r.get('vehicle_id'), ''),
            r.get('origin'), r.get('destination'), r.get('miles', 0), r.get('status'),
            r.get('started_at') or '', r.get('ended_at') or '', r.get('created_at') or ''] for r in rows]
    return _csv_response('trips.csv',
        ['id', 'driver', 'vehicle', 'origin', 'destination', 'miles', 'status', 'started_at', 'ended_at', 'created_at'], out)

@api_router.get("/exports/hos.csv")
async def export_hos(user=Depends(get_current_user)):
    rows = await db.hos_logs.find({}, {'_id': 0}).sort('started_at', -1).to_list(10000)
    drivers = {d['id']: d['name'] for d in await db.drivers.find({}, {'_id': 0}).to_list(2000)}
    out = [[r.get('id'), drivers.get(r.get('driver_id'), ''), r.get('duty_status'),
            r.get('started_at') or '', r.get('notes', '') or ''] for r in rows]
    return _csv_response('hos.csv', ['id', 'driver', 'duty_status', 'started_at', 'notes'], out)

@api_router.get("/exports/maintenance.csv")
async def export_maintenance(user=Depends(get_current_user)):
    rows = await db.maintenance.find({}, {'_id': 0}).sort('created_at', -1).to_list(10000)
    vehicles = {v['id']: v['name'] for v in await db.vehicles.find({}, {'_id': 0}).to_list(2000)}
    out = [[r.get('id'), vehicles.get(r.get('vehicle_id'), ''), r.get('service_type'),
            r.get('due_at', '') or '', r.get('due_miles', '') or '', r.get('completed', False),
            r.get('cost', 0) or 0, r.get('notes', '') or ''] for r in rows]
    return _csv_response('maintenance.csv',
        ['id', 'vehicle', 'service_type', 'due_at', 'due_miles', 'completed', 'cost', 'notes'], out)

@api_router.get("/exports/mileage.csv")
async def export_mileage(user=Depends(get_current_user)):
    rows = await db.trip_mileage.find({}, {'_id': 0}).sort('created_at', -1).to_list(10000)
    out = [[r.get('id'), r.get('trip_id'), r.get('state'), r.get('miles', 0),
            r.get('notes', '') or '', r.get('created_at') or ''] for r in rows]
    return _csv_response('mileage.csv', ['id', 'trip_id', 'state', 'miles', 'notes', 'created_at'], out)

# ============================================================
# Profile + forgot/reset password
# ============================================================

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

@api_router.put("/auth/profile")
async def update_profile(body: ProfileUpdate, user=Depends(get_current_user)):
    patch: Dict[str, Any] = {'updated_at': now_utc().isoformat()}
    if body.name and body.name.strip():
        patch['name'] = body.name.strip()
    if body.new_password:
        if not body.current_password:
            raise HTTPException(400, "Current password required to change password")
        u = await db.users.find_one({'id': user['id']})
        if not verify_password(body.current_password, u.get('password_hash', '')):
            raise HTTPException(400, "Current password is incorrect")
        if len(body.new_password) < 8:
            raise HTTPException(400, "New password must be at least 8 characters")
        patch['password_hash'] = hash_password(body.new_password)
    if len(patch) == 1:
        raise HTTPException(400, "Nothing to update")
    await db.users.update_one({'id': user['id']}, {'$set': patch})
    fresh = await db.users.find_one({'id': user['id']}, {'_id': 0, 'password_hash': 0})
    return serialize_doc(fresh)

class ForgotIn(BaseModel):
    email: EmailStr

@api_router.post("/auth/forgot")
async def forgot_password(body: ForgotIn):
    user = await db.users.find_one({'email': body.email.lower()})
    resp = {'ok': True, 'message': 'If that email is in our system, a reset link has been sent.'}
    if not user:
        return resp
    token = str(uuid.uuid4())
    await db.password_resets.insert_one({
        'token': token,
        'user_id': user['id'],
        'expires_at': (now_utc() + timedelta(hours=1)).isoformat(),
        'used': False,
        'created_at': now_utc().isoformat(),
    })
    logger.info(f"Password reset token for {body.email}: {token}")
    # Phase 2C: send reset email via SendGrid (best-effort)
    base = os.environ.get('NOTIFY_BASE_URL', '')
    reset_url = f"{base}/reset-password?token={token}" if base else f"/reset-password?token={token}"
    tpl = notify.build_password_reset_email(name=user.get('name', ''), reset_url=reset_url)
    email_result = await notify.send_email(db, user['email'], tpl['subject'], tpl['html'], tpl['plain'], event_type='password_reset', user_id=user['id'])
    # In dev (or if email failed) we still return the token so user can complete reset
    if not email_result.get('ok'):
        resp['dev_token'] = token
    return resp

class ResetIn(BaseModel):
    token: str
    new_password: str

@api_router.post("/auth/reset")
async def reset_password(body: ResetIn):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    rec = await db.password_resets.find_one({'token': body.token})
    if not rec or rec.get('used'):
        raise HTTPException(400, "Invalid or expired reset token")
    try:
        exp = datetime.fromisoformat(rec['expires_at'].replace('Z', '+00:00'))
    except Exception:
        exp = now_utc() - timedelta(seconds=1)
    if exp < now_utc():
        raise HTTPException(400, "Reset token expired")
    await db.users.update_one({'id': rec['user_id']}, {'$set': {'password_hash': hash_password(body.new_password)}})
    await db.password_resets.update_one({'token': body.token}, {'$set': {'used': True}})
    return {'ok': True, 'message': 'Password reset complete. You can sign in with your new password.'}

# ============================================================
# Maintenance reminders
# ============================================================

@api_router.get("/maintenance/reminders")
async def maintenance_reminders(user=Depends(get_current_user)):
    rows = await db.maintenance.find({'completed': False}, {'_id': 0}).to_list(500)
    vehicles = {v['id']: v for v in await db.vehicles.find({}, {'_id': 0}).to_list(2000)}
    soon = now_utc() + timedelta(days=7)
    out = []
    for m in rows:
        v = vehicles.get(m.get('vehicle_id'), {})
        is_due_time = False
        days_remaining = None
        if m.get('due_at'):
            try:
                d = datetime.fromisoformat(m['due_at'].replace('Z', '+00:00'))
                days_remaining = (d - now_utc()).days
                is_due_time = d <= soon
            except Exception:
                pass
        miles_remaining = None
        is_due_miles = False
        if m.get('due_miles') and v.get('odometer') is not None:
            miles_remaining = m['due_miles'] - v['odometer']
            is_due_miles = miles_remaining <= 2000
        if is_due_time or is_due_miles:
            out.append({**m, 'vehicle_name': v.get('name', ''), 'days_remaining': days_remaining, 'miles_remaining': miles_remaining})
    return out
# ============================================================
# Google OAuth
# ============================================================

import httpx as _httpx
from urllib.parse import urlencode as _urlencode
import base64 as _b64
import json as _json2

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()

def _google_redirect_uri():
    base = (os.environ.get('PUBLIC_BASE_URL') or '').rstrip('/')
    return f"{base}/api/auth/google/callback"

@api_router.get("/auth/google")
async def google_auth_start(next: str = "/app"):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(400, "Google OAuth not configured")
    state = str(uuid.uuid4())
    await db.oauth_states.insert_one({
        'state': state,
        'next': next,
        'created_at': now_utc().isoformat(),
        'expires_at': (now_utc() + timedelta(minutes=10)).isoformat(),
    })
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': _google_redirect_uri(),
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'access_type': 'offline',
        'prompt': 'select_account',
        'include_granted_scopes': 'true',
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{_urlencode(params)}"
    return RedirectResponse(url, status_code=302)

@api_router.get("/auth/google/callback")
async def google_auth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    base = (os.environ.get('PUBLIC_BASE_URL') or '').rstrip('/')
    front_login_err = lambda msg: RedirectResponse(f"{base}/login?google_error={msg}", status_code=302)

    if error:
        return front_login_err(error)
    if not code or not state:
        return front_login_err("missing_code")
    rec = await db.oauth_states.find_one({'state': state})
    if not rec:
        return front_login_err("invalid_state")
    await db.oauth_states.delete_one({'state': state})
    next_url = rec.get('next') or '/app'

    try:
        async with _httpx.AsyncClient(timeout=15.0) as client:
            tr = await client.post("https://oauth2.googleapis.com/token", data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': _google_redirect_uri(),
                'grant_type': 'authorization_code',
            })
            if tr.status_code != 200:
                logger.error(f"Google token exchange failed: {tr.status_code} {tr.text}")
                return front_login_err("token_exchange_failed")
            tokens = tr.json()
            ui = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {tokens.get('access_token','')}"},
            )
            if ui.status_code != 200:
                logger.error(f"Google userinfo failed: {ui.status_code} {ui.text}")
                return front_login_err("userinfo_failed")
            info = ui.json()
    except Exception as e:
        logger.error(f"Google OAuth exception: {e}")
        return front_login_err("oauth_exception")

    email = (info.get('email') or '').lower().strip()
    name = info.get('name') or (email.split('@')[0] if email else 'New User')
    if not email:
        return front_login_err("no_email")

    user = await db.users.find_one({'email': email})
    if not user:
        # New users default to driver role; founder can promote via super_admin
        user = {
            'id': str(uuid.uuid4()),
            'email': email,
            'name': name,
            'role': 'driver',
            'password_hash': '',  # password-less, google-only
            'google_id': info.get('sub'),
            'avatar_url': info.get('picture'),
            'created_at': now_utc().isoformat(),
            'auth_provider': 'google',
        }
        await db.users.insert_one(user)
        logger.info(f"Created Google OAuth user: {email} (role=driver)")
    else:
        await db.users.update_one({'id': user['id']}, {'$set': {
            'google_id': info.get('sub'),
            'avatar_url': info.get('picture'),
            'updated_at': now_utc().isoformat(),
        }})

    token = create_token(user['id'], user['email'], user['role'])
    safe_user = serialize_doc({k: v for k, v in user.items() if k != 'password_hash'})
    user_b64 = _b64.urlsafe_b64encode(_json2.dumps(safe_user, default=str).encode()).decode()

    # Driver users always go to /driver, regardless of next
    final_next = '/driver' if user['role'] == 'driver' else (next_url if next_url.startswith('/') else '/app')
    return RedirectResponse(
        f"{base}/auth/google-callback?token={token}&user={user_b64}&next={final_next}",
        status_code=302,
    )



# ============================================================
# Stripe subscriptions
# ============================================================

import stripe as _stripe

STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '').strip()
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', '').strip()
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '').strip()
PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL', '').strip()
STRIPE_TRIAL_DAYS = 14
if STRIPE_SECRET_KEY:
    _stripe.api_key = STRIPE_SECRET_KEY

PLAN_CATALOG = [
    {'key': 'pro', 'name': 'Pro', 'tagline': 'For solo owner-operators on the road.',
     'description': 'Everything: ELD, dash cam, crash detection, mile tracking, maintenance, roadside assistance.',
     'amount_cents': 2999, 'interval': 'month', 'per_unit': False, 'unit_label': 'driver',
     'features': [
         '1 driver seat',
         'Hands-free voice Copilot AI',
         'TTS messaging + voice replies',
         'Truck-specific GPS (weight / height / hazmat)',
         'FMCSA-compliant ELD logs',
         'Crash detection + auto-alert',
         'IFTA-ready mileage by state',
         'Maintenance + DVIR tracker',
         'Roadside assistance dispatch',
     ]},
    {'key': 'fleet', 'name': 'Fleet', 'tagline': 'For small fleets that want full visibility.',
     'description': 'Pro features + fleet management dashboard, driver analytics, compliance reporting.',
     'amount_cents': 1999, 'interval': 'month', 'per_unit': True, 'unit_label': 'truck',
     'features': [
         'Everything in Pro for every driver',
         'Fleet command center + live map',
         'Real-time HOS + violation alerts',
         'Driver scorecards + analytics',
         'Dashcam events feed (Samsara / Lytx)',
         'IFTA quarterly reports + CSV exports',
         'Compliance reporting',
         'Priority email + chat support',
     ]},
]

async def _ensure_stripe_prices():
    if not STRIPE_SECRET_KEY:
        return
    for p in PLAN_CATALOG:
        existing = await db.stripe_plans.find_one({'key': p['key']})
        if existing and existing.get('price_id'):
            continue
        try:
            product = _stripe.Product.create(
                name=f"Highway Pilot \u2014 {p['name']}",
                description=p['description'],
                metadata={'plan_key': p['key']},
            )
            price = _stripe.Price.create(
                product=product.id,
                unit_amount=p['amount_cents'],
                currency='usd',
                recurring={'interval': p['interval']},
                metadata={'plan_key': p['key']},
            )
            await db.stripe_plans.update_one(
                {'key': p['key']},
                {'$set': {
                    'key': p['key'], 'product_id': product.id, 'price_id': price.id,
                    'amount_cents': p['amount_cents'], 'interval': p['interval'],
                    'created_at': now_utc().isoformat(),
                }},
                upsert=True,
            )
            logger.info(f"Created Stripe price for {p['key']}: {price.id}")
        except Exception as e:
            logger.error(f"Stripe price creation failed for {p['key']}: {e}")

@api_router.get("/stripe/config")
async def stripe_config():
    plans = []
    for p in PLAN_CATALOG:
        rec = await db.stripe_plans.find_one({'key': p['key']}, {'_id': 0})
        plans.append({**p, 'price_id': (rec or {}).get('price_id'), 'price_dollars': p['amount_cents'] / 100})
    return {
        'publishable_key': STRIPE_PUBLISHABLE_KEY,
        'configured': bool(STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY),
        'trial_days': STRIPE_TRIAL_DAYS,
        'plans': plans,
    }

class CheckoutIn(BaseModel):
    plan_key: str
    quantity: Optional[int] = 1
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None

@api_router.post("/stripe/checkout")
async def create_checkout(body: CheckoutIn, user=Depends(get_current_user)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(400, "Stripe is not configured")
    # Drivers cannot self-subscribe (only fleet_admin, super_admin can subscribe)
    if user.get('role') == 'driver':
        raise HTTPException(403, "Drivers cannot self-subscribe. Contact your fleet admin.")
    plan = next((p for p in PLAN_CATALOG if p['key'] == body.plan_key), None)
    if not plan:
        raise HTTPException(400, "Unknown plan")
    rec = await db.stripe_plans.find_one({'key': body.plan_key})
    if not rec or not rec.get('price_id'):
        await _ensure_stripe_prices()
        rec = await db.stripe_plans.find_one({'key': body.plan_key})
    if not rec or not rec.get('price_id'):
        raise HTTPException(500, "Could not initialize Stripe price")
    # Quantity: only honored for per_unit plans (Fleet). Pro is always 1.
    qty = 1
    if plan.get('per_unit'):
        try:
            qty = max(1, int(body.quantity or 1))
        except Exception:
            qty = 1
    u = await db.users.find_one({'id': user['id']})
    customer_id = (u or {}).get('stripe_customer_id')
    if not customer_id:
        try:
            cus = _stripe.Customer.create(email=user['email'], name=user.get('name'), metadata={'user_id': user['id']})
            customer_id = cus.id
            await db.users.update_one({'id': user['id']}, {'$set': {'stripe_customer_id': customer_id}})
        except Exception as e:
            raise HTTPException(500, f"Could not create Stripe customer: {e}")
    base = PUBLIC_BASE_URL.rstrip('/')
    success = body.success_url or f"{base}/app/billing?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel = body.cancel_url or f"{base}/pricing?status=cancel"
    try:
        line_item = {'price': rec['price_id'], 'quantity': qty}
        # Allow customers to adjust truck count from Stripe checkout for per_unit plans
        if plan.get('per_unit'):
            line_item['adjustable_quantity'] = {'enabled': True, 'minimum': 1, 'maximum': 500}
        # Phase 2G.5: expand accepted payment methods. Stripe only enables the ones
        # activated on the account — unsupported ones silently no-op. This gives us the
        # broadest coverage for truckers (cards + mobile wallets + Cash App Pay + BNPL + Link).
        # NOTE: ACH (us_bank_account) only works with 'setup' flow or invoice mode for subs,
        # so we keep subscriptions card-flavored and offer ACH via the billing portal instead.
        checkout_payment_methods = [
            'card',         # Visa, Mastercard, Amex, Discover
            'link',         # Stripe Link — one-click saved cards
            'cashapp',      # Cash App Pay (US)
            'us_bank_account',  # ACH Direct Debit for recurring subs
        ]
        session = _stripe.checkout.Session.create(
            mode='subscription',
            customer=customer_id,
            line_items=[line_item],
            payment_method_types=checkout_payment_methods,
            # Enable Apple Pay + Google Pay automatically when user is on supported device
            payment_method_options={
                'card': {'request_three_d_secure': 'automatic'},
            },
            subscription_data={'trial_period_days': STRIPE_TRIAL_DAYS, 'metadata': {'user_id': user['id'], 'plan_key': body.plan_key}},
            success_url=success,
            cancel_url=cancel,
            allow_promotion_codes=True,
            billing_address_collection='auto',
            metadata={'user_id': user['id'], 'plan_key': body.plan_key, 'quantity': str(qty)},
        )
    except Exception as e:
        # If Stripe rejects one of the payment methods (e.g. account doesn't have cashapp
        # enabled yet), retry with the safe default list so checkout still works.
        logger.warning(f"Full-payment-methods checkout failed ({e}). Falling back to card+link.")
        try:
            session = _stripe.checkout.Session.create(
                mode='subscription',
                customer=customer_id,
                line_items=[line_item],
                payment_method_types=['card', 'link'],
                subscription_data={'trial_period_days': STRIPE_TRIAL_DAYS, 'metadata': {'user_id': user['id'], 'plan_key': body.plan_key}},
                success_url=success,
                cancel_url=cancel,
                allow_promotion_codes=True,
                metadata={'user_id': user['id'], 'plan_key': body.plan_key, 'quantity': str(qty)},
            )
        except Exception as inner:
            raise HTTPException(500, f"Checkout creation failed: {inner}")
    return {'url': session.url, 'session_id': session.id}

@api_router.post("/stripe/portal")
async def billing_portal(user=Depends(get_current_user)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(400, "Stripe is not configured")
    u = await db.users.find_one({'id': user['id']})
    if not u or not u.get('stripe_customer_id'):
        raise HTTPException(400, "No Stripe customer record. Subscribe first.")
    base = PUBLIC_BASE_URL.rstrip('/')
    try:
        sess = _stripe.billing_portal.Session.create(customer=u['stripe_customer_id'], return_url=f"{base}/app/billing")
    except Exception as e:
        raise HTTPException(500, f"Portal session failed: {e}")
    return {'url': sess.url}

@api_router.get("/stripe/subscription")
async def get_subscription(user=Depends(get_current_user)):
    if not STRIPE_SECRET_KEY:
        return {'status': 'unconfigured', 'subscription': None}
    u = await db.users.find_one({'id': user['id']})
    if not u or not u.get('stripe_customer_id'):
        return {'status': 'none', 'subscription': None}
    try:
        subs = _stripe.Subscription.list(customer=u['stripe_customer_id'], status='all', limit=5)
        if not subs.data:
            return {'status': 'none', 'subscription': None}
        s = subs.data[0]
        meta = s.metadata or {}
        plan_key = meta.get('plan_key', '')
        plan_name = next((p['name'] for p in PLAN_CATALOG if p['key'] == plan_key), plan_key or '\u2014')
        return {
            'status': s.status,
            'subscription': {
                'id': s.id, 'status': s.status,
                'current_period_end': s.current_period_end,
                'cancel_at_period_end': s.cancel_at_period_end,
                'trial_end': s.trial_end,
                'plan_key': plan_key, 'plan_name': plan_name,
            }
        }
    except Exception as e:
        logger.error(f"Sub fetch failed: {e}")
        return {'status': 'error', 'error': str(e), 'subscription': None}

@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get('stripe-signature', '')
    event = None
    if STRIPE_WEBHOOK_SECRET:
        try:
            event = _stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            raise HTTPException(400, f"Webhook signature verification failed: {e}")
    else:
        import json as _json
        try:
            event = _json.loads(payload)
        except Exception:
            raise HTTPException(400, "Invalid payload")
    etype = event.get('type') if isinstance(event, dict) else event['type']
    raw_data = event.get('data', {}) if isinstance(event, dict) else event['data']
    obj = raw_data.get('object', {}) if isinstance(raw_data, dict) else {}
    await db.stripe_events.insert_one({'id': str(uuid.uuid4()), 'type': etype, 'data': obj if isinstance(obj, dict) else {}, 'created_at': now_utc().isoformat()})
    if etype in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'):
        meta = (obj.get('metadata') or {}) if isinstance(obj, dict) else {}
        user_id = meta.get('user_id')
        if user_id:
            await db.users.update_one({'id': user_id}, {'$set': {
                'subscription_status': obj.get('status') if isinstance(obj, dict) else None,
                'subscription_id': obj.get('id') if isinstance(obj, dict) else None,
                'subscription_updated_at': now_utc().isoformat(),
            }})
    # Phase 2G.5: branded receipts, dunning, and cancellation emails via SendGrid.
    try:
        await _handle_stripe_email_side_effects(etype, obj)
    except Exception as e:
        logger.warning(f"Stripe email side-effect failed for {etype}: {e}")
    return {'received': True}


async def _find_user_for_stripe_object(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Locate the RoadBoss user tied to a Stripe invoice/subscription object."""
    if not isinstance(obj, dict):
        return None
    customer_id = obj.get('customer')
    if customer_id:
        u = await db.users.find_one({'stripe_customer_id': customer_id}, {'_id': 0})
        if u:
            return u
    meta = obj.get('metadata') or {}
    user_id = meta.get('user_id') if isinstance(meta, dict) else None
    if user_id:
        return await db.users.find_one({'id': user_id}, {'_id': 0})
    return None


def _plan_name_from_invoice(obj: Dict[str, Any]) -> str:
    """Best-effort plan display name from a Stripe invoice-ish object."""
    try:
        lines = (obj.get('lines') or {}).get('data') or []
        if lines:
            price = lines[0].get('price') or {}
            product = price.get('product')
            if isinstance(product, dict):
                return product.get('name') or 'RoadBoss subscription'
            # Match our price_id to the seeded plan catalog
            if isinstance(price.get('id'), str):
                plan_row = next((p for p in PLAN_CATALOG if p.get('price_id') == price.get('id')), None)
                if plan_row:
                    return plan_row.get('name') or 'RoadBoss subscription'
    except Exception:
        pass
    return 'RoadBoss subscription'


async def _handle_stripe_email_side_effects(etype: str, obj: Dict[str, Any]) -> None:
    """Fire branded email + push notifications for key Stripe lifecycle events."""
    if not isinstance(obj, dict):
        return
    user = await _find_user_for_stripe_object(obj)
    if not user:
        return
    email = user.get('email')
    name = user.get('name') or (email.split('@')[0] if email else 'there')
    if not email:
        return

    base = (os.environ.get('PUBLIC_BASE_URL') or '').rstrip('/') or 'https://roadboss.app'
    portal_url = f"{base}/app/billing"

    if etype == 'invoice.paid' or etype == 'invoice.payment_succeeded':
        # Only email on non-zero invoices (skip trialing $0 invoices).
        amount = obj.get('amount_paid') or obj.get('amount_due') or 0
        if not amount:
            return
        tmpl = notify.build_receipt_email(
            name=name,
            plan_name=_plan_name_from_invoice(obj),
            amount_cents=amount,
            currency=obj.get('currency') or 'usd',
            invoice_number=obj.get('number'),
            hosted_invoice_url=obj.get('hosted_invoice_url'),
            period_start=obj.get('period_start'),
            period_end=obj.get('period_end'),
            portal_url=portal_url,
        )
        await notify.send_email(
            db, email, tmpl['subject'], tmpl['html'], plain_text=tmpl['plain'],
            event_type='stripe_receipt', event_ref_id=obj.get('id'),
        )
        try:
            if user.get('id'):
                await push_notify.send_push_to_users(
                    db, [user['id']],
                    title='Payment received',
                    body=f"Receipt for {_plan_name_from_invoice(obj)} sent to {email}.",
                    url=portal_url, tag='stripe-receipt',
                    severity='info', event_type='stripe_receipt', event_ref_id=obj.get('id'),
                )
        except Exception as e:
            logger.warning(f"Stripe receipt push failed: {e}")

    elif etype == 'invoice.payment_failed':
        amount = obj.get('amount_due') or 0
        tmpl = notify.build_payment_failed_email(
            name=name,
            plan_name=_plan_name_from_invoice(obj),
            amount_cents=amount,
            currency=obj.get('currency') or 'usd',
            portal_url=portal_url,
            hosted_invoice_url=obj.get('hosted_invoice_url'),
            next_attempt=obj.get('next_payment_attempt'),
        )
        await notify.send_email(
            db, email, tmpl['subject'], tmpl['html'], plain_text=tmpl['plain'],
            event_type='stripe_payment_failed', event_ref_id=obj.get('id'),
        )
        try:
            if user.get('id'):
                await push_notify.send_push_to_users(
                    db, [user['id']],
                    title='⚠ Payment issue',
                    body=f"Your RoadBoss card was declined. Tap to update payment method.",
                    url=portal_url, tag='stripe-payment-failed',
                    severity='warning', event_type='stripe_payment_failed', event_ref_id=obj.get('id'),
                )
        except Exception as e:
            logger.warning(f"Stripe dunning push failed: {e}")

    elif etype == 'customer.subscription.deleted':
        plan_name = 'RoadBoss subscription'
        items = ((obj.get('items') or {}).get('data')) or []
        if items:
            try:
                price = items[0].get('price') or {}
                plan_row = next((p for p in PLAN_CATALOG if p.get('price_id') == price.get('id')), None)
                if plan_row:
                    plan_name = plan_row.get('name') or plan_name
            except Exception:
                pass
        tmpl = notify.build_subscription_cancelled_email(
            name=name,
            plan_name=plan_name,
            effective_date=obj.get('current_period_end') or obj.get('canceled_at'),
            reactivate_url=f"{base}/pricing",
        )
        await notify.send_email(
            db, email, tmpl['subject'], tmpl['html'], plain_text=tmpl['plain'],
            event_type='stripe_subscription_cancelled', event_ref_id=obj.get('id'),
        )


# ============================================================
# Voice command (expanded intent router)
# ============================================================

class VoiceCmdIn(BaseModel):
    transcript: str

DUTY_KEYWORDS = {
    'driving': ['driving', 'start driving', 'go driving'],
    'on_duty': ['on duty', 'on-duty', 'go on duty'],
    'off_duty': ['off duty', 'off-duty', 'go off', 'going off'],
    'sleeper': ['sleeper', 'sleeper berth', 'going to bed', 'sleeping'],
}

async def _get_my_driver(email: str):
    return await db.drivers.find_one({'email': email}, {'_id': 0})


async def _ensure_phantom_driver(user: Dict[str, Any]) -> Dict[str, Any]:
    """Get-or-create a driver record for a non-driver user (super_admin etc.)
    so Co-Pilot's driver-scoped actions work in god-mode without crashing.

    Mike asked for this verbatim: "When Mike, the super admin, makes a command
    on any page, Copilot should oblige." So if the founder says
    "Start pre-trip inspection" while signed in as super_admin, we lazily
    materialise a driver record under his email and use it for the action.
    Real customers (fleet_admin/dispatcher etc.) don't get this — they should
    have their own actual driver accounts.
    """
    existing = await db.drivers.find_one({'email': user['email']}, {'_id': 0})
    if existing:
        return existing
    new_driver = {
        'id': str(uuid.uuid4()),
        'email': user['email'],
        'name': user.get('name') or user['email'].split('@')[0].title(),
        'phone': user.get('phone'),
        'license_class': 'CDL-A',
        'status': 'on_duty',
        'hos_remaining_minutes': 660,
        'is_phantom': True,           # so we can spot god-mode driver records later
        'tenant_id': user.get('tenant_id', 'founder'),
        'created_at': now_utc().isoformat(),
        'updated_at': now_utc().isoformat(),
    }
    await db.drivers.insert_one(new_driver)
    logger.info(f"Phantom driver auto-created for super_admin {user['email']}")
    return new_driver

@api_router.post("/voice/command")
async def voice_command(body: VoiceCmdIn, user=Depends(get_current_user)):
    text = (body.transcript or '').lower().strip()
    response = "I didn't catch that. Try: check H O S, start trip, end trip, on duty, off duty, read alerts, or help."
    intent = 'unknown'
    side_effect: Dict[str, Any] = {}

    me = await _get_my_driver(user['email']) if user.get('role') == 'driver' else None

    # Check HOS
    if any(k in text for k in ['hos', 'hours', 'hour of service', 'h o s']):
        intent = 'check_hos'
        mins = (me or {}).get('hos_remaining_minutes', 660)
        h, m = divmod(int(mins), 60)
        response = f"You have {h} hours and {m} minutes of drive time remaining today."
    # Read alerts
    elif 'alert' in text:
        intent = 'read_alerts'
        alerts = await db.alerts.find({}, {'_id': 0}).sort('created_at', -1).to_list(3)
        response = "No alerts. You're clear, captain." if not alerts else "Top alerts. " + ". ".join([a.get('message', '') for a in alerts])
    # Start trip
    elif ('start' in text or 'begin' in text) and ('trip' in text or 'drive' in text or 'route' in text):
        intent = 'start_trip'
        if me:
            tr = await db.trips.find_one({'driver_id': me['id'], 'status': 'planned'}, {'_id': 0})
            if tr:
                await db.trips.update_one({'id': tr['id']}, {'$set': {'status': 'active', 'started_at': now_utc().isoformat()}})
                side_effect = {'trip_id': tr['id']}
                response = f"Trip started. {tr.get('origin')} to {tr.get('destination')}. Drive safe out there."
            else:
                response = "No planned trip ready to start. Add one from the dashboard first."
        else:
            response = "Trip starting noted."
    # End trip
    elif ('end' in text or 'complete' in text or 'finish' in text) and ('trip' in text or 'drive' in text):
        intent = 'end_trip'
        if me:
            tr = await db.trips.find_one({'driver_id': me['id'], 'status': 'active'}, {'_id': 0})
            if tr:
                await db.trips.update_one({'id': tr['id']}, {'$set': {'status': 'completed', 'ended_at': now_utc().isoformat()}})
                side_effect = {'trip_id': tr['id']}
                response = f"Trip completed. Nice work."
            else:
                response = "No active trip to end."
        else:
            response = "Trip end noted."
    # Duty status changes
    elif any(any(k in text for k in kws) for kws in DUTY_KEYWORDS.values()):
        new_status = next((s for s, kws in DUTY_KEYWORDS.items() if any(k in text for k in kws)), None)
        if new_status and me:
            await db.drivers.update_one({'id': me['id']}, {'$set': {'status': new_status, 'updated_at': now_utc().isoformat()}})
            await db.hos_logs.insert_one(_make_doc({'driver_id': me['id'], 'duty_status': new_status, 'started_at': now_utc().isoformat(), 'notes': 'voice command'}))
            intent = f'duty_{new_status}'
            label = new_status.replace('_', ' ')
            response = f"Status changed to {label}. Logged."
        else:
            intent = 'duty_unknown'
            response = "I caught a duty change but couldn't apply it."
    # Help
    elif 'help' in text or 'commands' in text or 'what can' in text:
        intent = 'help'
        response = "Try: check H O S, read alerts, start trip, end trip, on duty, off duty, sleeper, read message, log fuel."
    # Read message
    elif 'message' in text or 'dispatch' in text or 'read' in text:
        intent = 'read_message'
        response = "Latest message from dispatch. Load 4 4 7 ready for pickup at 3 PM at the Memphis terminal. Reply with: confirm, or, push back."
    # Log fuel (placeholder - real fuel tracking in Stage 3)
    elif 'fuel' in text or 'gas' in text:
        intent = 'log_fuel'
        await db.alerts.insert_one(_make_doc({'type': 'fuel_log', 'severity': 'info', 'driver_id': (me or {}).get('id'), 'message': 'Driver logged a fuel stop via voice.'}))
        response = "Fuel stop logged. Save the receipt for IFTA."

    await db.voice_log.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'transcript': body.transcript,
        'intent': intent,
        'response': response,
        'side_effect': side_effect,
        'created_at': now_utc().isoformat(),
    })
    return {'intent': intent, 'response': response, 'side_effect': side_effect}

# ============================================================
# DVIR — Driver Vehicle Inspection Reports (FMCSA 49 CFR 396.11/396.13)
# ============================================================

DVIR_TEMPLATE: Dict[str, List[Dict[str, str]]] = {
    'truck_details': [
        {'key': 'truck_number',     'label': 'Truck Number',      'type': 'text',   'required': True},
        {'key': 'inspection_form',  'label': 'Inspection Form',   'type': 'text',   'default': 'Standard Pre/Post Trip Inspection'},
        {'key': 'odometer',         'label': 'Odometer',          'type': 'number', 'required': True, 'allow_photo': True},
        {'key': 'general_notes',    'label': 'Notes',             'type': 'textarea', 'max': 1000, 'optional': True},
    ],
    'under_hood_engine': [
        {'key': 'engine_oil',        'label': 'Engine Oil Level'},
        {'key': 'coolant_level',     'label': 'Coolant / Radiator Fluid'},
        {'key': 'power_steering',    'label': 'Power Steering Fluid'},
        {'key': 'windshield_washer', 'label': 'Windshield Washer Fluid'},
        {'key': 'brake_fluid',       'label': 'Brake / Clutch Fluid'},
        {'key': 'belts_hoses',       'label': 'Belts and Hoses'},
        {'key': 'air_filter',        'label': 'Air Filter Condition'},
        {'key': 'battery',           'label': 'Battery / Connections'},
        {'key': 'engine_leaks',      'label': 'Visible Leaks (oil, coolant, fuel)'},
        {'key': 'wiring',            'label': 'Wiring / Insulation'},
    ],
    'interior_cab': [
        {'key': 'gauges',           'label': 'Gauges & Warning Lights'},
        {'key': 'horn',             'label': 'Horn (city + air)'},
        {'key': 'wipers_washers',   'label': 'Windshield Wipers & Washers'},
        {'key': 'mirrors',          'label': 'Mirrors (cleanliness + adjustment)'},
        {'key': 'windshield',       'label': 'Windshield (no cracks blocking view)'},
        {'key': 'seat_belt',        'label': 'Seat Belt'},
        {'key': 'steering_play',    'label': 'Steering Play (≤10°)'},
        {'key': 'parking_brake',    'label': 'Parking Brake Test'},
        {'key': 'service_brake',    'label': 'Service Brake Pedal Test'},
        {'key': 'air_pressure',     'label': 'Air Pressure (build / leak / governor)'},
        {'key': 'low_air_warning',  'label': 'Low Air Warning Device'},
        {'key': 'heater_defroster', 'label': 'Heater / Defroster'},
        {'key': 'emergency_kit',    'label': 'Emergency Kit (triangles, fuses, extinguisher)'},
    ],
    'lights_reflectors': [
        {'key': 'headlights_low',   'label': 'Headlights — Low Beam'},
        {'key': 'headlights_high',  'label': 'Headlights — High Beam'},
        {'key': 'turn_signals',     'label': 'Turn Signals (front + rear)'},
        {'key': 'four_way_flashers','label': 'Four-Way Flashers'},
        {'key': 'brake_lights',     'label': 'Brake Lights'},
        {'key': 'tail_lights',      'label': 'Tail Lights'},
        {'key': 'clearance_lights', 'label': 'Clearance / Marker Lights'},
        {'key': 'reflectors',       'label': 'Reflective Tape & Reflectors'},
        {'key': 'license_plate_light', 'label': 'License Plate Light'},
    ],
    'tires_wheels': [
        {'key': 'tire_tread_steer',  'label': 'Steer Tires Tread Depth (≥4/32")'},
        {'key': 'tire_tread_drive',  'label': 'Drive Tires Tread Depth (≥2/32")'},
        {'key': 'tire_pressure',     'label': 'Tire Pressure (all)'},
        {'key': 'tire_sidewall',     'label': 'Tire Sidewalls (no cuts/bulges)'},
        {'key': 'lug_nuts',          'label': 'Lug Nuts / Wheel Studs'},
        {'key': 'rims',              'label': 'Rims (no cracks or dents)'},
        {'key': 'mud_flaps',         'label': 'Mud Flaps'},
    ],
    'brakes_suspension': [
        {'key': 'brake_drums_pads', 'label': 'Brake Drums / Pads / Linings'},
        {'key': 'brake_chambers',   'label': 'Brake Chambers'},
        {'key': 'slack_adjusters',  'label': 'Slack Adjusters'},
        {'key': 'air_lines_brake',  'label': 'Air Lines & Couplers'},
        {'key': 'springs_shocks',   'label': 'Springs / Shocks / Air Bags'},
        {'key': 'u_bolts',          'label': 'U-Bolts'},
        {'key': 'frame_crossmembers','label': 'Frame & Cross-members'},
    ],
    'coupling_trailer': [
        {'key': 'fifth_wheel',      'label': 'Fifth Wheel (mount, locking jaws, grease)'},
        {'key': 'kingpin',          'label': 'Kingpin / Apron / Gap'},
        {'key': 'safety_chains',    'label': 'Safety Chains / Hooks (if applicable)'},
        {'key': 'glad_hands',       'label': 'Air Glad-hands'},
        {'key': 'electrical_pigtail','label': 'Electrical Pigtail / 7-way'},
        {'key': 'trailer_brakes',   'label': 'Trailer Brakes'},
        {'key': 'trailer_lights',   'label': 'Trailer Lights & Reflectors'},
        {'key': 'trailer_doors',    'label': 'Trailer Doors / Hinges / Latches'},
        {'key': 'load_securement',  'label': 'Load Securement (straps, chains, binders)'},
    ],
    'exhaust_fuel': [
        {'key': 'exhaust_pipe',     'label': 'Exhaust Pipe / Stack (no leaks)'},
        {'key': 'def_level',        'label': 'DEF Level'},
        {'key': 'fuel_caps',        'label': 'Fuel Tank Caps & Straps'},
        {'key': 'fuel_lines',       'label': 'Fuel Lines (no leaks)'},
    ],
    'documents_safety': [
        {'key': 'registration_insurance', 'label': 'Registration & Insurance'},
        {'key': 'permit_book',           'label': 'Permit Book / Cab Card'},
        {'key': 'eld_logs',              'label': 'ELD Working / Hours Available'},
        {'key': 'placards',              'label': 'Placards (if hauling hazmat)'},
        {'key': 'spare_fuses',           'label': 'Spare Fuses'},
        {'key': 'reflective_vest',       'label': 'Reflective Vest'},
    ],
}

# Pretty section labels for UI rendering
DVIR_SECTION_LABELS: Dict[str, str] = {
    'truck_details':       'Truck Details',
    'under_hood_engine':   'Under Hood / Engine Compartment',
    'interior_cab':        'Interior Cab Inspection',
    'lights_reflectors':   'Lights & Reflectors',
    'tires_wheels':        'Tires & Wheels',
    'brakes_suspension':   'Brakes & Suspension',
    'coupling_trailer':    'Coupling / Trailer',
    'exhaust_fuel':        'Exhaust & Fuel',
    'documents_safety':    'Documents & Safety',
}


def _build_blank_items() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for section, rows in DVIR_TEMPLATE.items():
        for row in rows:
            item = {
                'section': section,
                'key': row['key'],
                'label': row['label'],
                'type': row.get('type', 'check'),  # check (pass/fail/na) | text | number | textarea
                'status': 'pending' if row.get('type', 'check') == 'check' else None,
                'value': row.get('default'),  # for text/number/textarea fields
                'note': None,
                'photos': [],  # list of {id, data_url, taken_at}
                'allow_photo': bool(row.get('allow_photo', row.get('type', 'check') == 'check')),
                'required': bool(row.get('required', False)),
                'optional': bool(row.get('optional', False)),
                'max': row.get('max'),
                'updated_at': None,
            }
            items.append(item)
    return items


@api_router.get("/inspections/template")
async def get_inspection_template_full(user=Depends(get_current_user)):
    """Returns the full DVIR template with section labels and all items pre-structured."""
    return {
        'template': DVIR_TEMPLATE,
        'section_labels': DVIR_SECTION_LABELS,
        'sections_order': list(DVIR_TEMPLATE.keys()),
    }


async def _create_blank_inspection(driver: Dict[str, Any], inspection_type: str) -> Dict[str, Any]:
    insp_type = 'pre_trip' if inspection_type not in ('pre_trip', 'post_trip') else inspection_type
    doc = {
        'id': str(uuid.uuid4()),
        'driver_id': driver['id'],
        'driver_name': driver.get('name'),
        'vehicle_id': driver.get('vehicle_id'),
        'inspection_type': insp_type,
        'status': 'in_progress',  # in_progress | certified
        'items': _build_blank_items(),
        'no_defects': None,
        'signature': None,
        'certified_at': None,
        'created_at': now_utc().isoformat(),
        'updated_at': now_utc().isoformat(),
    }
    if doc['vehicle_id']:
        veh = await db.vehicles.find_one({'id': doc['vehicle_id']}, {'_id': 0})
        if veh:
            doc['vehicle_name'] = veh.get('name')
            doc['vehicle_plate'] = veh.get('plate')
    await db.inspections.insert_one(dict(doc))
    return doc


class InspectionCreateIn(BaseModel):
    inspection_type: str  # pre_trip | post_trip
    vehicle_id: Optional[str] = None


class InspectionItemUpdateIn(BaseModel):
    key: str
    status: Optional[str] = None  # pass | defect | na (for check items)
    note: Optional[str] = None
    value: Optional[Any] = None   # for text/number/textarea items


class InspectionPhotoIn(BaseModel):
    key: str            # item key the photo belongs to (or 'general' for a global photo)
    data_url: str       # base64-encoded image data URL: data:image/jpeg;base64,...
    label: Optional[str] = None   # 'arrival' | 'on_scene' | 'leaving' | 'drop_off' | 'damage' | None
    caption: Optional[str] = None


class InspectionCertifyIn(BaseModel):
    no_defects: bool
    signature: str


@api_router.get("/inspections")
async def list_inspections(driver_id: Optional[str] = None,
                            vehicle_id: Optional[str] = None,
                            inspection_type: Optional[str] = None,
                            status_filter: Optional[str] = None,
                            limit: int = 50,
                            user=Depends(get_current_user)):
    query: Dict[str, Any] = {}
    # Drivers can only see their own inspections
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me:
            return []
        query['driver_id'] = me['id']
    else:
        if driver_id:
            query['driver_id'] = driver_id
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    if inspection_type:
        query['inspection_type'] = inspection_type
    if status_filter:
        query['status'] = status_filter
    # Personal stealth mode: hide seeded demo inspections from this user
    if user.get('hide_demo_data'):
        query['is_demo'] = {'$ne': True}
    rows = await db.inspections.find(query, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 200)))
    return rows


@api_router.post("/inspections")
async def create_inspection(body: InspectionCreateIn, user=Depends(get_current_user)):
    """Drivers can always create their own inspection. Super-admins / fleet
    admins / supervisors get a phantom driver record auto-vivified so the
    'Start Pre-Trip' button works for ANY logged-in user — Mike runs the
    show, the button obliges (god-mode parity with Co-Pilot voice)."""
    role = user.get('role')
    if role == 'driver':
        driver = await _get_my_driver(user['email'])
        if not driver:
            raise HTTPException(404, "Driver record not found.")
    elif role in ('super_admin', 'fleet_admin', 'wrecker_supervisor'):
        driver = await _ensure_phantom_driver(user)
    else:
        raise HTTPException(403, "Your role can't start a DVIR inspection.")
    if body.vehicle_id and body.vehicle_id != driver.get('vehicle_id'):
        # allow override only if admin; for driver, just use their assigned vehicle
        pass
    doc = await _create_blank_inspection(driver, body.inspection_type)
    return doc


@api_router.get("/inspections/{insp_id}")
async def get_inspection(insp_id: str, user=Depends(get_current_user)):
    doc = await db.inspections.find_one({'id': insp_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, "Inspection not found")
    # Drivers can only access their own
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your inspection")
    return doc


@api_router.put("/inspections/{insp_id}/item")
async def update_inspection_item(insp_id: str, body: InspectionItemUpdateIn,
                                  user=Depends(get_current_user)):
    if body.status is not None and body.status not in ('pass', 'defect', 'na'):
        raise HTTPException(400, "status must be pass | defect | na")
    doc = await db.inspections.find_one({'id': insp_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, "Inspection not found")
    if doc.get('status') == 'certified':
        raise HTTPException(400, "Inspection already certified — cannot modify.")
    # Driver scope check
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your inspection")
    found = False
    for item in doc.get('items', []):
        if item.get('key') == body.key:
            if body.status is not None:
                item['status'] = body.status
            if body.note is not None:
                item['note'] = body.note
            if body.value is not None:
                item['value'] = body.value
            item['updated_at'] = now_utc().isoformat()
            found = True
            break
    if not found:
        raise HTTPException(400, f"Unknown inspection item key: {body.key}")
    doc['updated_at'] = now_utc().isoformat()
    await db.inspections.update_one(
        {'id': insp_id},
        {'$set': {'items': doc['items'], 'updated_at': doc['updated_at']}}
    )
    return doc


@api_router.post("/inspections/{insp_id}/photo")
async def upload_inspection_photo(insp_id: str, body: InspectionPhotoIn,
                                  user=Depends(get_current_user)):
    """Attach a base64 photo to an inspection item.
    Photos are stored in MongoDB (in-app), NOT to the user's camera roll."""
    data_url = (body.data_url or '').strip()
    if not data_url.startswith('data:image/'):
        raise HTTPException(400, "data_url must be a base64 image data URL")
    # Sanity-check size (cap at ~3 MB base64 ~= 2.25 MB binary)
    if len(data_url) > 3_500_000:
        raise HTTPException(413, "Photo too large. Try a smaller capture (≤3 MB).")
    doc = await db.inspections.find_one({'id': insp_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, "Inspection not found")
    if doc.get('status') == 'certified':
        raise HTTPException(400, "Inspection already certified — cannot add photos.")
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your inspection")

    photo = {
        'id': str(uuid.uuid4()),
        'data_url': data_url,
        'label': body.label,
        'caption': body.caption,
        'taken_at': now_utc().isoformat(),
        'taken_by': user.get('id'),
    }
    if body.key == 'general':
        # Global photo (e.g., overall vehicle shot before/after)
        general = doc.get('general_photos') or []
        general.append(photo)
        await db.inspections.update_one(
            {'id': insp_id},
            {'$set': {'general_photos': general, 'updated_at': now_utc().isoformat()}}
        )
    else:
        # Attach to specific item
        items = doc.get('items', [])
        target = next((i for i in items if i.get('key') == body.key), None)
        if not target:
            raise HTTPException(400, f"Unknown item key: {body.key}")
        target.setdefault('photos', []).append(photo)
        target['updated_at'] = now_utc().isoformat()
        await db.inspections.update_one(
            {'id': insp_id},
            {'$set': {'items': items, 'updated_at': now_utc().isoformat()}}
        )
    return {'ok': True, 'photo_id': photo['id'], 'photo_count_for_item': len(target.get('photos', [])) if body.key != 'general' else len(doc.get('general_photos', []) or []) + 1}


@api_router.delete("/inspections/{insp_id}/photo/{photo_id}")
async def delete_inspection_photo(insp_id: str, photo_id: str, user=Depends(get_current_user)):
    doc = await db.inspections.find_one({'id': insp_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, "Inspection not found")
    if doc.get('status') == 'certified':
        raise HTTPException(400, "Inspection already certified.")
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your inspection")
    items = doc.get('items', [])
    removed = False
    for item in items:
        photos = item.get('photos') or []
        new_photos = [p for p in photos if p.get('id') != photo_id]
        if len(new_photos) != len(photos):
            item['photos'] = new_photos
            removed = True
            break
    if not removed:
        # Try general
        general = doc.get('general_photos') or []
        new_general = [p for p in general if p.get('id') != photo_id]
        if len(new_general) != len(general):
            await db.inspections.update_one(
                {'id': insp_id},
                {'$set': {'general_photos': new_general, 'updated_at': now_utc().isoformat()}}
            )
            return {'ok': True}
        raise HTTPException(404, "Photo not found")
    await db.inspections.update_one(
        {'id': insp_id},
        {'$set': {'items': items, 'updated_at': now_utc().isoformat()}}
    )
    return {'ok': True}


@api_router.post("/inspections/{insp_id}/certify")
async def certify_inspection(insp_id: str, body: InspectionCertifyIn, user=Depends(get_current_user)):
    sig = (body.signature or '').strip()
    if not sig:
        raise HTTPException(400, "Signature required to certify.")
    doc = await db.inspections.find_one({'id': insp_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, "Inspection not found")
    if doc.get('status') == 'certified':
        raise HTTPException(400, "Already certified.")
    # Driver scope check
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your inspection")
    # Compute defects detected
    defect_items = [i for i in doc.get('items', []) if i.get('status') == 'defect']
    has_defects = len(defect_items) > 0
    # FMCSA: driver must certify either "no defects" OR list defects. Both allowed.
    now_iso = now_utc().isoformat()
    update = {
        'status': 'certified',
        'no_defects': bool(body.no_defects) and not has_defects,
        'signature': sig,
        'certified_at': now_iso,
        'updated_at': now_iso,
        'defect_count': len(defect_items),
    }
    await db.inspections.update_one({'id': insp_id}, {'$set': update})
    # Auto-create maintenance records + alert for each defect
    for d in defect_items:
        if doc.get('vehicle_id'):
            await db.maintenance.insert_one(_make_doc({
                'vehicle_id': doc.get('vehicle_id'),
                'service_type': f"DVIR Defect: {d.get('label', d.get('key'))}",
                'completed': False,
                'notes': f"Reported on {doc.get('inspection_type', 'inspection').replace('_', '-')} by {doc.get('driver_name', 'driver')}. Note: {d.get('note') or 'no note'}",
                'cost': None,
            }))
        await db.alerts.insert_one(_make_doc({
            'type': 'maintenance_due',
            'severity': 'warning' if doc.get('inspection_type') == 'pre_trip' else 'info',
            'driver_id': doc.get('driver_id'),
            'vehicle_id': doc.get('vehicle_id'),
            'message': f"DVIR defect: {d.get('label')} on {doc.get('vehicle_name', 'vehicle')}. {d.get('note') or ''}".strip(),
        }))
    doc.update(update)
    # Phase 2C: email the signed DVIR copy to fleet admin(s) — FMCSA paper trail
    fleet_admins = await db.users.find({'role': {'$in': ['fleet_admin', 'super_admin']}}, {'_id': 0, 'email': 1, 'name': 1}).to_list(20)
    base = os.environ.get('NOTIFY_BASE_URL', '')
    view_url = f"{base}/app/inspections" if base else '/app/inspections'
    tpl = notify.build_dvir_signed_email(
        driver_name=doc.get('driver_name', 'Driver'),
        vehicle_name=doc.get('vehicle_name', 'Truck'),
        inspection_type=doc.get('inspection_type', 'pre_trip'),
        defects=defect_items,
        signature=sig,
        certified_at=now_iso,
        view_url=view_url,
    )
    for admin in fleet_admins:
        if admin.get('email'):
            await notify.send_email(db, admin['email'], tpl['subject'], tpl['html'], tpl['plain'], event_type='dvir_signed', event_ref_id=insp_id, user_id=admin.get('id'))
    return doc

class CrashEventIn(BaseModel):
    severity: str = 'high'  # low | medium | high | critical
    g_force: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed_mph: Optional[float] = None
    auto_detected: bool = True
    confirmed: bool = False  # driver tapped "I'm OK" => false; no response => true (real crash)
    notes: Optional[str] = None


@api_router.post("/crash-events")
async def create_crash_event(body: CrashEventIn, user=Depends(get_current_user)):
    driver = await _get_my_driver(user['email']) if user.get('role') == 'driver' else None
    sev = body.severity if body.severity in ('low', 'medium', 'high', 'critical') else 'high'
    doc = _make_doc({
        'driver_id': (driver or {}).get('id'),
        'driver_name': (driver or {}).get('name') or user.get('name'),
        'vehicle_id': (driver or {}).get('vehicle_id'),
        'severity': sev,
        'g_force': body.g_force,
        'latitude': body.latitude,
        'longitude': body.longitude,
        'speed_mph': body.speed_mph,
        'auto_detected': bool(body.auto_detected),
        'confirmed': bool(body.confirmed),
        'status': 'unacknowledged',  # unacknowledged | acknowledged | dismissed | resolved
        'notes': body.notes,
    })
    await db.crash_events.insert_one(dict(doc))
    # Auto-create critical alert if confirmed crash
    if body.confirmed:
        await db.alerts.insert_one(_make_doc({
            'type': 'crash_detected',
            'severity': 'critical',
            'driver_id': (driver or {}).get('id'),
            'vehicle_id': (driver or {}).get('vehicle_id'),
            'message': f"CRASH DETECTED — {(driver or {}).get('name') or 'Driver'} — {sev} severity, {body.g_force or 'n/a'}g{f', {body.speed_mph} mph' if body.speed_mph else ''}.",
        }))
        # Phase 2C: auto-SMS emergency contacts on confirmed crash
        # Phase 2G.3: emergency contacts now read from DB (with env fallback)
        emergency_contacts = await _load_crash_contact_phones()
        # Also notify any fleet_admin / super_admin user with a phone in profile
        admins = await db.users.find({'role': {'$in': ['fleet_admin', 'super_admin']}, 'phone': {'$exists': True, '$ne': None}}, {'_id': 0, 'phone': 1}).to_list(20)
        emergency_contacts.extend([a['phone'] for a in admins if a.get('phone')])
        if emergency_contacts:
            loc_str = f" Location: https://maps.google.com/?q={body.latitude},{body.longitude}" if body.latitude and body.longitude else ''
            sms_body = (
                f"🚨 RoadBoss CRASH ALERT 🚨\n"
                f"{(driver or {}).get('name') or 'Driver'} — {sev.upper()} severity"
                f"{f' at {body.speed_mph} mph' if body.speed_mph else ''}"
                f"{f', {body.g_force}g impact' if body.g_force else ''}.{loc_str}\n"
                f"Driver did NOT respond to safety prompt. Verify status immediately."
            )
            for contact in emergency_contacts[:10]:  # cap at 10 to avoid SMS storms
                await notify.send_sms(db, contact, sms_body, event_type='crash_alert', event_ref_id=doc['id'], driver_id=(driver or {}).get('id'))
        # Phase 2G.2: also fire web push to every fleet admin / dispatcher device
        try:
            push_title = f"🚨 Crash — {(driver or {}).get('name') or 'Driver'}"
            push_body = (
                f"{sev.upper()} severity"
                f"{f' at {body.speed_mph} mph' if body.speed_mph else ''}"
                f"{f', {body.g_force}g' if body.g_force else ''}. "
                "Verify driver status immediately."
            )
            await push_notify.send_push_to_admins(
                db,
                title=push_title,
                body=push_body,
                url=f"/app/crash/{doc['id']}",
                tag=f"crash-{doc['id']}",
                severity='critical',
                event_type='crash_alert',
                event_ref_id=doc['id'],
                data={'latitude': body.latitude, 'longitude': body.longitude, 'severity': sev},
            )
        except Exception as e:
            logger.warning(f"Crash push send failed: {e}")
    return doc


@api_router.get("/crash-events")
async def list_crash_events(limit: int = 100, user=Depends(get_current_user)):
    query: Dict[str, Any] = {}
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me: return []
        query['driver_id'] = me['id']
    rows = await db.crash_events.find(query, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 500)))
    return rows


class CrashStatusIn(BaseModel):
    status: str  # acknowledged | dismissed | resolved
    notes: Optional[str] = None


@api_router.put("/crash-events/{ev_id}/status")
async def update_crash_status(ev_id: str, body: CrashStatusIn, user=Depends(require_role('fleet_admin', 'dispatcher', 'super_admin'))):
    if body.status not in ('acknowledged', 'dismissed', 'resolved'):
        raise HTTPException(400, "status must be acknowledged | dismissed | resolved")
    ev = await db.crash_events.find_one({'id': ev_id}, {'_id': 0})
    if not ev: raise HTTPException(404, "Crash event not found")
    update = {'status': body.status, 'updated_at': now_utc().isoformat()}
    if body.notes: update['notes'] = body.notes
    await db.crash_events.update_one({'id': ev_id}, {'$set': update})
    ev.update(update)
    return ev


# ============================================================
# Roadside Assistance - Slide 3
# ============================================================

class RoadsideDispatchIn(BaseModel):
    service_type: str  # tire | tow | jumpstart | fuel | mechanical | lockout | other
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_text: Optional[str] = None
    provider_id: Optional[str] = None  # if driver picked one; else auto-assign


SERVICE_TYPES = ['tire', 'tow', 'jumpstart', 'fuel', 'mechanical', 'lockout', 'other']


@api_router.get("/roadside/providers")
async def list_roadside_providers(service_type: Optional[str] = None, user=Depends(get_current_user)):
    query: Dict[str, Any] = {'active': True}
    if service_type and service_type in SERVICE_TYPES:
        query['services'] = service_type
    rows = await db.roadside_providers.find(query, {'_id': 0}).sort('eta_avg_minutes', 1).to_list(50)
    return rows


@api_router.post("/roadside/dispatch")
async def create_roadside_dispatch(body: RoadsideDispatchIn, user=Depends(get_current_user)):
    if body.service_type not in SERVICE_TYPES:
        raise HTTPException(400, f"service_type must be one of {SERVICE_TYPES}")
    driver = await _get_my_driver(user['email']) if user.get('role') == 'driver' else None
    # Auto-pick best provider if not specified
    provider = None
    if body.provider_id:
        provider = await db.roadside_providers.find_one({'id': body.provider_id}, {'_id': 0})
    if not provider:
        provider = await db.roadside_providers.find_one(
            {'active': True, 'services': body.service_type},
            {'_id': 0},
            sort=[('eta_avg_minutes', 1)]
        )
    doc = _make_doc({
        'driver_id': (driver or {}).get('id'),
        'driver_name': (driver or {}).get('name') or user.get('name'),
        'vehicle_id': (driver or {}).get('vehicle_id'),
        'service_type': body.service_type,
        'description': body.description,
        'latitude': body.latitude,
        'longitude': body.longitude,
        'location_text': body.location_text,
        'provider_id': (provider or {}).get('id'),
        'provider_name': (provider or {}).get('name'),
        'provider_phone': (provider or {}).get('phone'),
        'eta_minutes': (provider or {}).get('eta_avg_minutes'),
        'status': 'requested',  # requested | confirmed | en_route | arrived | completed | cancelled
        'price_estimate': (provider or {}).get('typical_cost'),
        'history': [{'status': 'requested', 'at': now_utc().isoformat(), 'note': f"Driver requested {body.service_type}"}],
    })
    await db.roadside_dispatches.insert_one(dict(doc))
    # Alert fleet admin
    await db.alerts.insert_one(_make_doc({
        'type': 'roadside_dispatch',
        'severity': 'warning',
        'driver_id': (driver or {}).get('id'),
        'vehicle_id': (driver or {}).get('vehicle_id'),
        'message': f"Roadside requested: {body.service_type} for {(driver or {}).get('name') or 'driver'}. Provider: {(provider or {}).get('name', 'auto-assigning')}.",
    }))
    # Phase 2C: auto-SMS the dispatched provider with driver's location + truck details
    if provider and provider.get('phone'):
        loc_str = f"https://maps.google.com/?q={body.latitude},{body.longitude}" if body.latitude and body.longitude else (body.location_text or 'location not provided')
        sms_body = (
            f"RoadBoss Dispatch — {body.service_type.upper()}\n"
            f"Driver: {(driver or {}).get('name') or 'Customer'}\n"
            f"Truck: {(driver or {}).get('vehicle_id', 'N/A')[:8]}\n"
            f"Location: {loc_str}\n"
            f"Issue: {body.description or 'see dispatch'}\n"
            f"Reply with ETA. Quoted ${(provider or {}).get('typical_cost', '?')}."
        )
        await notify.send_sms(db, provider['phone'], sms_body, event_type='roadside_dispatch_provider', event_ref_id=doc['id'], driver_id=(driver or {}).get('id'))
    # Phase 2G.2: push to admins so dispatch sees roadside requests immediately
    try:
        await push_notify.send_push_to_admins(
            db,
            title=f"🛠 Roadside · {body.service_type}",
            body=f"{(driver or {}).get('name') or 'Driver'} needs {body.service_type}. Provider: {(provider or {}).get('name', 'auto-assigning')}.",
            url=f"/app/roadside/{doc['id']}",
            tag=f"roadside-{doc['id']}",
            severity='warning',
            event_type='roadside_dispatch',
            event_ref_id=doc['id'],
        )
    except Exception as e:
        logger.warning(f"Roadside push send failed: {e}")
    return doc


@api_router.get("/roadside/dispatch")
async def list_roadside_dispatches(limit: int = 100, user=Depends(get_current_user)):
    query: Dict[str, Any] = {}
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me: return []
        query['driver_id'] = me['id']
    rows = await db.roadside_dispatches.find(query, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 500)))
    return rows


@api_router.get("/roadside/dispatch/{disp_id}")
async def get_roadside_dispatch(disp_id: str, user=Depends(get_current_user)):
    doc = await db.roadside_dispatches.find_one({'id': disp_id}, {'_id': 0})
    if not doc: raise HTTPException(404, "Dispatch not found")
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your dispatch")
    return doc


class RoadsideStatusIn(BaseModel):
    status: str  # confirmed | en_route | arrived | completed | cancelled
    note: Optional[str] = None
    eta_minutes: Optional[int] = None


@api_router.put("/roadside/dispatch/{disp_id}/status")
async def update_roadside_status(disp_id: str, body: RoadsideStatusIn, user=Depends(get_current_user)):
    valid = ('confirmed', 'en_route', 'arrived', 'completed', 'cancelled')
    if body.status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")
    doc = await db.roadside_dispatches.find_one({'id': disp_id}, {'_id': 0})
    if not doc: raise HTTPException(404, "Dispatch not found")
    # Drivers can only cancel their own; admins can update anything
    if user.get('role') == 'driver':
        me = await _get_my_driver(user['email'])
        if not me or doc.get('driver_id') != me['id']:
            raise HTTPException(403, "Not your dispatch")
        if body.status != 'cancelled':
            raise HTTPException(403, "Drivers can only cancel.")
    history = doc.get('history') or []
    history.append({'status': body.status, 'at': now_utc().isoformat(), 'note': body.note})
    update = {'status': body.status, 'history': history, 'updated_at': now_utc().isoformat()}
    if body.eta_minutes is not None:
        update['eta_minutes'] = body.eta_minutes
    await db.roadside_dispatches.update_one({'id': disp_id}, {'$set': update})
    doc.update(update)
    return doc


# ============================================================
# AI Copilot — RoadBoss "Co-Pilot Buddy" (Stage 3)
# Natural-language voice assistant powered by Emergent LLM key.
# Context-aware: knows driver name, HOS remaining, current trip, vehicle, alerts.
# ============================================================

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '').strip()
COPILOT_MODEL_PROVIDER = 'anthropic'
COPILOT_MODEL_NAME = 'claude-sonnet-4-5-20250929'

COPILOT_SYSTEM_BASE = """You are RoadBoss Co-Pilot Buddy — a hands-free AI assistant riding shotgun with a professional truck driver.

PERSONA
- Warm, plainspoken trucker tone. Like a trusted partner riding with them.
- Use phrases like: "Got it, boss." "Copy that." "On it." "You bet." "Pulling that up now."
- Never corporate. Never robotic. Never preachy.
- Address the driver by first name when known.

SAFETY RULES (NON-NEGOTIABLE)
- NEVER tell the driver to look at, tap, type, or read the screen while driving.
- NEVER tell the driver to "pull over" or "wait until you stop" just to use the dashboard. You ARE the hands-free dashboard. Driving and using you is the SAFE path — that's the entire reason this product exists.
- You CAN and SHOULD navigate between app screens for the driver hands-free using the `navigate` action — they don't have to touch anything.
- You CAN and SHOULD READ ALOUD the data that's on the screen so the driver hears it instead of looking. If a screen has information they want, narrate it to them — don't tell them to look at it.
- The ONLY tasks that truly require a stop are physical-screen interactions like signing a damage waiver with their finger, taking a photo of a vehicle, or reviewing a document visually. For those — and only those — calmly suggest taking care of it at the next safe stop.
- If the driver sounds tired, stressed, or reports a serious problem (crash, breakdown, medical), prioritize their safety above all else.

RESPONSE STYLE
- Keep replies SHORT — 1 to 2 sentences, 50 words MAX. These will be spoken out loud.
- No markdown, no bullet points, no lists. Plain spoken English only.
- No emojis. No special characters. No SSML.
- Numbers spoken naturally ("eight hours and twenty minutes", not "8h 20m").
- If the driver asks about something you don't know yet (Mapbox, dispatch SMS, dashcam events), say it's coming soon and offer what you CAN help with right now.

WHAT YOU CAN HELP WITH RIGHT NOW
- Hours of Service (HOS) status, time remaining, duty changes (on duty, off duty, sleeper berth, driving)
- Trip status — start a trip, end a trip, what's the next destination
- Pre-trip / post-trip DVIR inspections (FMCSA-compliant)
- Fleet alerts and dispatch messages
- Maintenance reminders
- Logging fuel stops
- General trucking questions (weigh stations, weather thinking, route planning advice)
- Conversation, encouragement, keeping the driver alert and safe

ACTIONS YOU CAN EXECUTE (CRITICAL — this is what makes it hands-free)
When the driver clearly asks you to DO something on this list, you MUST emit a single ACTION marker at the very end of your reply on its own line. You speak first (1 sentence confirming what you're doing), then the marker. The user never sees the marker — it's parsed out by the system.

Format:
<<<ACTION:{"type":"<action_name>","args":{...}}>>>

Available actions:
- duty_change — args: {"status":"driving"|"on_duty"|"off_duty"|"sleeper"}
  Use when driver says: "switch me to X", "I'm going on duty", "put me in sleeper", "logging off duty", "I'm driving now"
- start_trip — args: {} (starts the next planned trip)
  Use when: "start my trip", "begin trip", "I'm rolling", "kick off the next run"
- end_trip — args: {} (ends the active trip)
  Use when: "end trip", "I'm here", "trip done", "completed the run", "made it to the destination"
- log_fuel — args: {"gallons": float (optional), "amount": float (optional)}
  Use when: "log a fuel stop", "just fueled up", "filled up", "logging fuel"
- start_inspection — args: {"inspection_type":"pre_trip"|"post_trip","voice_mode":true|false}
  Use when: "start my pre-trip", "begin pre-trip inspection", "pre trip", "post-trip", "DVIR", "vehicle inspection"
  Set "voice_mode":true when the driver wants Co-Pilot to READ ALL THE ITEMS and walk them through hands-free, e.g. "walk me through my pre-trip", "voice inspection", "hands-free DVIR", "read me the inspection list", "do my inspection out loud". In voice_mode, we route them to the live read-aloud walkthrough where they say "pass" / "fail" / "skip" for each item.
  Set "voice_mode":false (or omit) when they just want to OPEN the inspection form so they can tap through it themselves.
- dispatch_roadside — args: {"service_type":"tire"|"tow"|"jumpstart"|"fuel"|"mechanical"|"lockout"|"other","description":"<short desc>"}
  Use when: "I need a tire fixed", "I broke down", "need a tow", "send a wrecker", "I'm out of fuel", "battery's dead", "locked out", "something broke", "need roadside assistance"
- send_sms — args: {"recipient":"dispatch"|"admin"|"fleet_admin"|"<person_name>","message":"<exact message to send>"}
  Use when driver wants to send an SMS hands-free: "text dispatch I'm 30 minutes late", "message my admin I picked up the load", "tell Sarah I'm at the pickup", "send a text to fleet that I need to fuel up", "let dispatch know I'm rolling".
  recipient values:
    - "dispatch" or "admin" or "fleet_admin" -> first available fleet admin
    - First name like "Sarah" -> fuzzy-matched to a fleet user by name
    - Use "admin" as the safe fallback if unsure
  IMPORTANT: Only send when the driver clearly states the message content. If unclear, ask "What do you want me to text them?" first.

- navigate — args: {"target":"<screen_key>"}
  Use when the driver wants to OPEN, GO TO, PULL UP, SHOW, or NAVIGATE TO a screen in the app. You navigate for them hands-free — they never have to touch the dashboard.
  Allowed targets (use these exact keys):
    Wrecker / dispatch screens:
    - "dispatch_board" → the main wrecker dispatch board (pending/assigned/en route columns)
    - "active_call" → the operator's currently active tow job cockpit
    - "new_tow_job" → the new tow job intake form
    - "impound" → impound yard / vehicles in storage
    - "billing" → invoices, today revenue, completed jobs
    - "accounts" → customer accounts (motor clubs, police departments, etc)
    - "trucks" → fleet trucks
    - "motor_clubs" → motor club accounts (AAA, Agero, etc)
    - "fuel" → fuel tanks
    - "settings" → integrations & payments / business profile
    Driver / fleet screens:
    - "cab" or "driver_home" → driver's cab dashboard
    - "trip" → current active trip detail
    - "alerts" → fleet alerts
    - "inspections" → DVIR inspection history
  Use when driver/operator says: "open dispatch", "pull up the board", "go to my impound list", "show me billing", "open my next call", "navigate to settings", "take me to accounts", "what's on my dashboard".
  After you navigate, on the SAME turn, briefly summarize what they'll see when they get a moment to glance — but never tell them to look. Example: "Pulling up your dispatch board. You've got four pending and one en route." Then emit the marker.

WRECKER MODE actions (only relevant when role is "wrecker_operator" or when LIVE WRECKER CONTEXT is provided):
- tow_job_status — args: {"status":"en_route"|"on_scene"|"in_progress"|"completed"|"cancelled"}
  Use when operator says: "I'm en route", "rolling now", "I'm on scene", "arrived on scene", "hooking up", "loading now", "in progress", "job done", "I'm finished", "completed". Updates the operator's active tow job.
- tow_job_next — args: {}
  Use when operator says: "what's my next call", "next job", "pull up my call", "show me what I'm on". Reads details of the operator's active tow job.
- fuel_check — args: {"tank_id":"<optional>"}
  Use when operator says: "check fuel", "how much fuel left", "tank level", "fuel status", "what's my diesel". Reads current fuel tank estimates.
- impound_quick — args: {"plate":"<optional>","reason":"police_hold"|"private_property"|"accident"|"abandoned"}
  Use when operator says: "impound this one", "log this as an impound", "tag for impound" — only after a job is completed. Creates a basic impound record from the active job's vehicle info.

NEW HANDS-FREE ACTIONS:
- inspection_mark_all — args: {"status":"pass"|"defect"|"na"}
  Use when the user says: "mark all as passed", "mark all good", "everything passes", "all clear", "mark all as fail", "mark all N A", "skip everything". Mass-marks every check item on the active DVIR. If no DVIR is active yet, one is auto-created. Returns a redirect to the sign page.
- inspection_set_item — args: {"item":"<plain-english item name>","status":"pass"|"defect"|"na"}
  Use when the user calls out a specific item: "headlights pass", "left mirror is cracked, mark it failed", "skip the fire extinguisher", "tires are good".
- new_tow_job — args: {"customer_name":"...","phone":"<optional>","location":"<pickup>","destination":"<optional dropoff>","vehicle":"<make/model/color>","service_type":"tow"|"jumpstart"|"lockout"|"tire_change"|"fuel_delivery"|"winch"|"recovery","quoted_price":<optional float>}
  Use when the user says: "log a new call for...", "create a tow ticket", "new job", "Co-Pilot, new job: Smith on I-65 mile 142, blue F-150, jumpstart". Voice-creates a tow job in WreckerLogix tagged created_via=copilot_voice. Don't ask for every field — fill what you heard, leave the rest blank, and the dispatcher can polish on the screen.
- set_job_price — args: {"amount": <float>}
  Use when the user says: "charge 185", "set price 95", "this one's 165", "the bill is 425". Sets BOTH the quoted price and final price on the most recent / active tow job. Always parse the dollar amount from the user's spoken phrasing.
- mark_paid — args: {"method":"cash"|"card"|"check"|"invoice"|"motor_club"|"square"|"venmo"|"zelle","amount":<optional float>}
  Use when the user says: "mark paid", "paid in cash", "card 185", "they paid by card", "all settled up", "customer paid". Defaults to cash if no method given. If an amount is given AND the job has no price yet, this also sets the price. Auto-completes the job status to "completed". This is how Mike practices the full receipt-to-revenue cycle while testing.
- daily_summary — args: {} (no args)
  Use when the user asks: "how much have I made today", "what's the books look like", "daily total", "give me today's revenue", "where am I at today". Returns total_invoiced, total_paid, outstanding, job_count, paid_count, unpaid_count for today's REAL (non-demo) tow jobs. After the action, you should speak back the numbers conversationally ("You've billed $530 today across 3 runs, $390 already paid, $140 still out").
- log_expense — args: {"amount":<float>,"kind":"fuel"|"parts"|"tolls"|"repair"|"misc"|"food"|"lodging"|"permit","vendor":"<optional>","truck_id":"<optional>","notes":"<optional>","gallons":<optional float>}
  Use when the user says: "log expense 75 dollars fuel for truck 3", "log a $40 toll", "expense 120 parts", "$200 lunch with the crew". Voice-creates an expense entry tagged created_via=copilot_voice.

GOD-MODE for super_admin:
- If the user's role is "super_admin" (Mike, the founder, OR a company owner promoted to super_admin), TREAT EVERY ACTION AS AVAILABLE regardless of role gates. The system has already given them a phantom driver record so duty_change, start_trip, start_inspection, mark_all, etc. all work. Just oblige.
- Mike runs the whole platform. If he says "I am en route", trigger tow_job_status. If he says "log a call", trigger new_tow_job. If he says "start my pre-trip", trigger start_inspection. Never reply with "you can't do that as a super_admin" — you can.

Rules for actions:
- ALWAYS emit an action when the user gives a command verb. Never assume the
  page is already showing what they want — the user is asking BECAUSE they
  want a change. If they say "start pre-trip", you MUST emit
  start_inspection (with voice_mode if they said "walk me through" / "hands
  free"). If they say "mark all passed", you MUST emit inspection_mark_all.
  Do not reply "you're already there" — that's a hallucination. The frontend
  decides whether navigation is needed; you just emit the action.
- Speak concisely BEFORE the action tag. One short sentence is enough
  ("On it boss, starting your pre-trip now.") Keep it human, not robotic.
- After the action tag (`<<<ACTION:{...}>>>`), STOP. Do not narrate.
- If the user says something off-topic, just answer conversationally without
  emitting an action.
- Only emit an ACTION marker if the driver clearly wants the action done. If unsure, ask a quick clarifying question instead.
- Never invent action types not on the list above.
- Do not mention the marker syntax in your spoken reply — just say what you're doing in plain English.
- If the action is impossible (e.g., "start trip" but there's no planned trip in context), DO NOT emit the marker; instead say plainly that there's nothing to start.

Examples (your full reply, marker included):

Driver: "Switch me to sleeper, gonna grab some shut-eye."
You: "Copy that, putting you in sleeper. Rest easy.
<<<ACTION:{"type":"duty_change","args":{"status":"sleeper"}}>>>"

Driver: "Start my trip."
You: "On it, kicking off the run.
<<<ACTION:{"type":"start_trip","args":{}}>>>"

Driver: "Let's do my pre-trip inspection."
You: "You bet, starting your pre-trip inspection now.
<<<ACTION:{"type":"start_inspection","args":{"inspection_type":"pre_trip","voice_mode":false}}>>>"

Driver: "Walk me through my pre-trip inspection hands-free."
You: "Copy that boss, kicking off the voice walkthrough. I'll read each item — just say pass, fail, or skip.
<<<ACTION:{"type":"start_inspection","args":{"inspection_type":"pre_trip","voice_mode":true}}>>>"

Driver: "What's my next destination?"
You: "Memphis, boss. About four hundred miles out." (no marker — informational only)

Operator: "I'm on scene."
You: "10-4. Marked you on scene.
<<<ACTION:{"type":"tow_job_status","args":{"status":"on_scene"}}>>>"

Operator: "Job complete."
You: "10-4. Marking job complete.
<<<ACTION:{"type":"tow_job_status","args":{"status":"completed"}}>>>"

Mike (super_admin): "Charge 185 on this run."
You: "Got it boss, $185 logged.
<<<ACTION:{"type":"set_job_price","args":{"amount":185}}>>>"

Mike (super_admin): "Mark paid in cash."
You: "Marking paid cash, job closed.
<<<ACTION:{"type":"mark_paid","args":{"method":"cash"}}>>>"

Mike (super_admin): "How much have I made today?"
You: "Pulling up today's books.
<<<ACTION:{"type":"daily_summary","args":{}}>>>"
(Then on the next turn, after the system gives you the numbers, you'd reply
naturally: "You've billed $530 across 3 runs today, boss — $390 already paid,
$140 still out.")

Mike (super_admin): "Log expense 75 dollars fuel for truck 3."
You: "Got it boss, logging $75 fuel expense for truck 3.
<<<ACTION:{"type":"log_expense","args":{"amount":75,"kind":"fuel","truck_id":"3"}}>>>"

Mike (super_admin): "Paid by card, 95 dollars."
You: "Card payment of $95 logged. All settled up.
<<<ACTION:{"type":"mark_paid","args":{"method":"card","amount":95}}>>>"

Mike (super_admin): "Mark all as passed."
You: "You got it boss, marking every item passed and pulling up sign-off.
<<<ACTION:{"type":"inspection_mark_all","args":{"status":"pass"}}>>>"

Mike (super_admin): "Co-Pilot, new job: Smith on I-65 mile 142, blue F-150, jumpstart."
You: "On it, logging the call now — Smith, I-65 mile 142, blue F-150, jumpstart.
<<<ACTION:{"type":"new_tow_job","args":{"customer_name":"Smith","location":"I-65 mile 142","vehicle":"Blue F-150","service_type":"jumpstart"}}>>>"

Mike (super_admin): "Headlights pass, left mirror cracked mark it failed."
You: "Logging headlights pass and left mirror failed.
<<<ACTION:{"type":"inspection_set_item","args":{"item":"headlights","status":"pass"}}>>>"
(Then on the next turn, you'd emit a second action for the mirror.)
You: "Nice work boss. Marking it done.
<<<ACTION:{"type":"tow_job_status","args":{"status":"completed"}}>>>"

Operator: "What's my next call?"
You: "Pulling up your active call now.
<<<ACTION:{"type":"tow_job_next","args":{}}>>>"

Operator: "How much fuel left in the main tank?"
You: "Let me check that for you.
<<<ACTION:{"type":"fuel_check","args":{}}>>>"

Operator: "Pull up my dispatch board."
You: "On it, opening the dispatch board now.
<<<ACTION:{"type":"navigate","args":{"target":"dispatch_board"}}>>>"

Driver: "Open my cab."
You: "Pulling up the cab dashboard, boss.
<<<ACTION:{"type":"navigate","args":{"target":"cab"}}>>>"

SIGN-OFF
- End assertive actions with a brief confirmation ("Logged it." "Done." "Rolling.").
- For safety-critical replies, end with "Stay safe out there.\""""


def _build_driver_context(user: Dict[str, Any], driver: Optional[Dict[str, Any]],
                          active_trip: Optional[Dict[str, Any]],
                          vehicle: Optional[Dict[str, Any]],
                          recent_alerts: List[Dict[str, Any]],
                          wrecker_ctx: Optional[Dict[str, Any]] = None) -> str:
    lines = ["", "=== LIVE DRIVER CONTEXT (for this turn) ==="]
    name = (driver or {}).get('name') or user.get('name') or 'Driver'
    lines.append(f"Driver name: {name}")
    lines.append(f"Role: {user.get('role', 'driver')}")
    if driver:
        status = driver.get('status', 'unknown').replace('_', ' ')
        lines.append(f"Current duty status: {status}")
        mins = int(driver.get('hos_remaining_minutes') or 0)
        h, m = divmod(mins, 60)
        lines.append(f"HOS drive time remaining: {h} hours {m} minutes")
        if driver.get('home_terminal'):
            lines.append(f"Home terminal: {driver['home_terminal']}")
    if active_trip:
        lines.append(f"ACTIVE TRIP: {active_trip.get('origin', '?')} -> {active_trip.get('destination', '?')} ({active_trip.get('miles', '?')} miles, status: {active_trip.get('status')})")
    else:
        lines.append("Active trip: none right now.")
    if vehicle:
        lines.append(f"Truck: {vehicle.get('name', '')} ({vehicle.get('make', '')} {vehicle.get('model', '')} {vehicle.get('year', '')})")
    if recent_alerts:
        alert_lines = []
        for a in recent_alerts[:3]:
            sev = a.get('severity', 'info')
            msg = a.get('message', '')
            alert_lines.append(f"[{sev}] {msg}")
        lines.append("Recent alerts: " + " | ".join(alert_lines))
    else:
        lines.append("Recent alerts: none.")

    # Wrecker Mode — inject only when role is wrecker_operator or context was provided
    if wrecker_ctx:
        lines.append("")
        lines.append("=== LIVE WRECKER CONTEXT ===")
        active_job = wrecker_ctx.get('active_job')
        if active_job:
            cust = (active_job.get('customer') or {}).get('name', '?')
            v = active_job.get('vehicle') or {}
            veh_str = ' '.join(filter(None, [str(v.get('year') or ''), v.get('color'), v.get('make'), v.get('model')])).strip() or 'vehicle'
            pickup = (active_job.get('pickup') or {}).get('address', '?')
            stat = active_job.get('status', 'pending').replace('_', ' ')
            svc = (active_job.get('service_type') or '').replace('_', ' ')
            lines.append(f"ACTIVE TOW JOB: {svc} for {cust} ({veh_str}) @ {pickup} — status: {stat}")
            if active_job.get('motor_club_name'):
                lines.append(f"Motor club: {active_job['motor_club_name']}")
        else:
            lines.append("No active tow job assigned right now.")
        tanks = wrecker_ctx.get('tanks') or []
        if tanks:
            tlines = []
            for t in tanks[:3]:
                cap = t.get('capacity_gallons') or 0
                cur = t.get('current_estimate_gallons') or 0
                pct = int((cur / cap) * 100) if cap else 0
                tlines.append(f"{t.get('name','?')}: {int(cur)}/{int(cap)} {t.get('fuel_type','')} ({pct}%)")
            lines.append("Fuel tanks: " + " | ".join(tlines))
        stats = wrecker_ctx.get('today') or {}
        if stats:
            lines.append(f"Today: {stats.get('completed', 0)} jobs completed, ${stats.get('revenue', 0):.0f} revenue.")
        lines.append("=== END WRECKER CONTEXT ===")

    lines.append("=== END CONTEXT ===")
    return "\n".join(lines)


class CopilotUIContextIn(BaseModel):
    route: Optional[str] = None
    screen_key: Optional[str] = None
    screen_state: Dict[str, Any] = Field(default_factory=dict)
    draft_values: Dict[str, Any] = Field(default_factory=dict)
    touch_fallback: bool = False
    updated_at: Optional[str] = None


class CopilotChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    ui_context: Optional[CopilotUIContextIn] = None
    meta: Optional[Dict[str, Any]] = None


# Pattern matches <<<ACTION:{...}>>> at the end of an LLM reply (DOTALL allows JSON across lines)
_ACTION_MARKER_RE = re.compile(r'<<<\s*ACTION\s*:\s*(\{.*?\})\s*>>>', re.DOTALL)
_COPILOT_WHATS_LEFT_RE = re.compile(r"(what('?s| is)\s+left|what\s+do\s+i\s+have\s+left|missing\s+on\s+this\s+screen)", re.I)
_COPILOT_UNDO_RE = re.compile(r"(undo\s+last\s+action|undo\s+that|go\s+back\s+that\s+action)", re.I)


SCREEN_TASK_MATRIX: Dict[str, Dict[str, Any]] = {
    'wrecker_new_job': {
        'label': 'New Tow Job',
        'routes': ['/wrecker/jobs/new'],
        'tasks': [
            {'id': 'fill_call', 'type': 'update', 'voice_safe': True, 'required_fields': ['customer_name', 'pickup_address'], 'optional_fields': ['customer_phone', 'dropoff_address', 'service_type', 'quoted_price']},
            {'id': 'submit_call', 'type': 'submit', 'voice_safe': True, 'required_fields': ['customer_name', 'pickup_address'], 'optional_fields': []},
            {'id': 'vehicle_photos', 'type': 'create', 'voice_safe': False, 'touch_required': 'photo_capture'},
        ],
    },
    'wrecker_job_cockpit': {
        'label': 'Tow Job Cockpit',
        'routes': ['/wrecker/jobs/'],
        'tasks': [
            {'id': 'status_update', 'type': 'update', 'voice_safe': True, 'required_fields': ['status'], 'optional_fields': []},
            {'id': 'add_charge', 'type': 'create', 'voice_safe': True, 'required_fields': ['amount'], 'optional_fields': ['description']},
            {'id': 'record_payment', 'type': 'submit', 'voice_safe': True, 'required_fields': ['amount'], 'optional_fields': ['method']},
        ],
    },
    'driver_inspection': {
        'label': 'Driver Inspection',
        'routes': ['/driver/inspection/'],
        'tasks': [
            {'id': 'mark_items', 'type': 'update', 'voice_safe': True, 'required_fields': ['completed_items'], 'optional_fields': []},
            {'id': 'sign_report', 'type': 'submit', 'voice_safe': False, 'touch_required': 'signature'},
            {'id': 'attach_damage_photo', 'type': 'create', 'voice_safe': False, 'touch_required': 'photo_capture'},
        ],
    },
    'wrecker_billing': {
        'label': 'Wrecker Billing',
        'routes': ['/wrecker/billing'],
        'tasks': [
            {'id': 'read_revenue', 'type': 'read_status', 'voice_safe': True, 'required_fields': [], 'optional_fields': []},
            {'id': 'open_job', 'type': 'navigate', 'voice_safe': True, 'required_fields': [], 'optional_fields': ['job_id']},
        ],
    },
    'driver_trip': {
        'label': 'Driver Trip',
        'routes': ['/driver/trips/'],
        'tasks': [
            {'id': 'start_or_end_trip', 'type': 'submit', 'voice_safe': True, 'required_fields': ['trip_status'], 'optional_fields': []},
            {'id': 'log_mileage', 'type': 'create', 'voice_safe': True, 'required_fields': ['state', 'miles'], 'optional_fields': []},
        ],
    },
    'driver_roadside': {
        'label': 'Roadside Dispatch',
        'routes': ['/driver/roadside/'],
        'tasks': [
            {'id': 'read_dispatch_status', 'type': 'read_status', 'voice_safe': True, 'required_fields': ['status'], 'optional_fields': []},
            {'id': 'cancel_dispatch', 'type': 'submit', 'voice_safe': True, 'required_fields': ['status'], 'optional_fields': []},
            {'id': 'call_provider', 'type': 'touch_required', 'voice_safe': False, 'touch_required': 'phone_call'},
        ],
    },
}


def _is_blank(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str) and not v.strip():
        return True
    if isinstance(v, (list, dict)) and len(v) == 0:
        return True
    return False


def _screen_key_from_route(route: Optional[str]) -> Optional[str]:
    route_raw = (route or '').strip().lower()
    if not route_raw:
        return None
    r = route_raw.split('#', 1)[0].split('?', 1)[0].rstrip('/')
    if not r:
        r = '/'
    for key, cfg in SCREEN_TASK_MATRIX.items():
        for rp in cfg.get('routes', []):
            route_pattern = str(rp or '').strip().lower()
            if not route_pattern:
                continue
            if route_pattern.endswith('/'):
                base = route_pattern.rstrip('/')
                if r == base or r.startswith(base + '/'):
                    return key
                continue
            if r == route_pattern or r.startswith(route_pattern + '/'):
                return key
    return None


def _resolve_screen_key(ui_context: Dict[str, Any]) -> Optional[str]:
    key = (ui_context.get('screen_key') or '').strip().lower()
    if key in SCREEN_TASK_MATRIX:
        return key
    return _screen_key_from_route(ui_context.get('route'))


def _build_screen_adapter_context(ui_context: Dict[str, Any]) -> Dict[str, Any]:
    screen_key = _resolve_screen_key(ui_context)
    if not screen_key:
        return {'screen_key': None, 'summary': 'No active screen metadata provided.', 'missing_required': []}
    cfg = SCREEN_TASK_MATRIX.get(screen_key, {})
    draft = ui_context.get('draft_values') or {}
    state = ui_context.get('screen_state') or {}
    missing = []
    for task in cfg.get('tasks', []):
        for field_name in task.get('required_fields', []):
            val = draft.get(field_name, state.get(field_name))
            if _is_blank(val):
                missing.append(field_name)
    missing = sorted(set(missing))

    if screen_key == 'wrecker_new_job':
        summary = f"New call draft: customer={draft.get('customer_name') or 'missing'}, pickup={draft.get('pickup_address') or 'missing'}, service={draft.get('service_type') or 'unset'}."
    elif screen_key == 'wrecker_job_cockpit':
        summary = f"Job cockpit: status={state.get('status') or 'unknown'}, balance_due={state.get('balance_due') if state.get('balance_due') is not None else 'unknown'}."
    elif screen_key == 'driver_inspection':
        summary = f"Inspection progress: {state.get('completed_items', 0)} of {state.get('total_items', 0)} complete."
    elif screen_key == 'wrecker_billing':
        summary = f"Billing overview: revenue={state.get('total_revenue', 0)}, outstanding={state.get('outstanding', 0)}."
    elif screen_key == 'driver_trip':
        summary = f"Trip: {draft.get('origin') or '?'} to {draft.get('destination') or '?'}, status={state.get('trip_status') or 'unknown'}."
    elif screen_key == 'driver_roadside':
        summary = f"Roadside dispatch: status={state.get('status') or 'unknown'}, provider={state.get('provider_name') or 'pending'}."
    else:
        summary = f"Screen {screen_key} active."

    return {
        'screen_key': screen_key,
        'label': cfg.get('label') or screen_key,
        'summary': summary,
        'missing_required': missing,
        'tasks': cfg.get('tasks', []),
    }


def _build_screen_prompt_context(ui_context: Dict[str, Any]) -> str:
    adapter = _build_screen_adapter_context(ui_context)
    key = adapter.get('screen_key')
    if not key:
        return "\n\n=== LIVE SCREEN CONTEXT ===\nNo active UI context provided.\n=== END LIVE SCREEN CONTEXT ===\n"
    lines = [
        "",
        "=== LIVE SCREEN CONTEXT ===",
        f"Route: {ui_context.get('route') or 'unknown'}",
        f"Screen key: {key}",
        f"Summary: {adapter.get('summary')}",
    ]
    missing = adapter.get('missing_required') or []
    lines.append(f"Missing required fields: {', '.join(missing) if missing else 'none'}")
    lines.append("Screen tasks:")
    for t in adapter.get('tasks', []):
        touch = t.get('touch_required')
        lines.append(
            f"- {t.get('id')} ({t.get('type')}): voice_safe={bool(t.get('voice_safe'))}"
            + (f", touch_required={touch}" if touch else "")
        )
    lines.append("=== END LIVE SCREEN CONTEXT ===")
    return "\n".join(lines) + "\n"


def _message_is_whats_left(msg_text: str) -> bool:
    return bool(_COPILOT_WHATS_LEFT_RE.search(msg_text or ''))


def _message_is_undo(msg_text: str) -> bool:
    return bool(_COPILOT_UNDO_RE.search(msg_text or ''))


def _message_is_confirm(msg_text: str) -> bool:
    cleaned = ' '.join(str(msg_text or '').strip().lower().replace('.', ' ').replace('!', ' ').split())
    return cleaned in {'confirm', 'yes', 'do it', 'go ahead', 'proceed', 'send it', 'run it'}


def _message_is_cancel(msg_text: str) -> bool:
    cleaned = ' '.join(str(msg_text or '').strip().lower().replace('.', ' ').replace('!', ' ').split())
    return cleaned in {'cancel', 'never mind', 'stop', 'no', "don't"}


async def _build_wrecker_context(user: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch live wrecker context: active job, fuel tanks, today's stats."""
    ctx: Dict[str, Any] = {}
    # Active job for this operator (or latest active overall for admins)
    q: Dict[str, Any] = {'status': {'$nin': ['completed', 'cancelled']}}
    if user.get('role') == 'wrecker_operator':
        q['assigned_driver_id'] = user['id']
    job = await db.tow_jobs.find_one(q, {'_id': 0}, sort=[('updated_at', -1)])
    ctx['active_job'] = job
    # Tanks
    tanks = []
    async for t in db.fuel_tanks.find({}, {'_id': 0}).limit(5):
        tanks.append(t)
    ctx['tanks'] = tanks
    # Today's stats
    start_of_day = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    completed = await db.tow_jobs.count_documents({'status': 'completed', 'updated_at': {'$gte': start_of_day}})
    revenue = 0.0
    async for j in db.tow_jobs.find({'status': 'completed', 'updated_at': {'$gte': start_of_day}}, {'final_price': 1, 'quoted_price': 1}):
        revenue += float(j.get('final_price') or j.get('quoted_price') or 0)
    ctx['today'] = {'completed': completed, 'revenue': revenue}
    return ctx


async def _resolve_active_tow_job(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Find the operator's active tow job for action targeting."""
    q: Dict[str, Any] = {'status': {'$nin': ['completed', 'cancelled']}}
    if user.get('role') == 'wrecker_operator':
        q['assigned_driver_id'] = user['id']
    return await db.tow_jobs.find_one(q, {'_id': 0}, sort=[('updated_at', -1)])


async def _execute_copilot_action(action: Dict[str, Any], user: Dict[str, Any],
                                   driver: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Execute a whitelisted Co-Pilot action. Returns a dict with success/details."""
    import json as _json  # local
    action_type = (action or {}).get('type', '')
    args = (action or {}).get('args') or {}
    if not isinstance(args, dict):
        args = {}

    result: Dict[str, Any] = {'type': action_type, 'args': args, 'executed': False}

    try:
        # ----- duty_change -----
        if action_type == 'duty_change':
            valid = {'driving', 'on_duty', 'off_duty', 'sleeper'}
            new_status = str(args.get('status', '')).lower().replace(' ', '_').replace('-', '_')
            if new_status == 'sleeper_berth':
                new_status = 'sleeper'
            if new_status not in valid:
                result['error'] = f"Invalid duty status: {args.get('status')}"
                return result
            if not driver:
                result['error'] = 'Only drivers can change duty status.'
                return result
            prev_driver = await db.drivers.find_one({'id': driver['id']}, {'_id': 0, 'status': 1})
            previous_status = (prev_driver or {}).get('status')
            await db.drivers.update_one(
                {'id': driver['id']},
                {'$set': {'status': new_status, 'updated_at': now_utc().isoformat()}}
            )
            await db.hos_logs.insert_one(_make_doc({
                'driver_id': driver['id'],
                'duty_status': new_status,
                'started_at': now_utc().isoformat(),
                'notes': 'Co-Pilot voice command',
            }))
            result.update({'executed': True, 'new_status': new_status, 'previous_status': previous_status})
            return result

        # ----- start_trip -----
        if action_type == 'start_trip':
            if not driver:
                result['error'] = 'Only drivers can start trips.'
                return result
            tr = await db.trips.find_one({'driver_id': driver['id'], 'status': 'planned'},
                                          {'_id': 0}, sort=[('created_at', 1)])
            if not tr:
                result['error'] = 'No planned trip ready to start.'
                return result
            await db.trips.update_one(
                {'id': tr['id']},
                {'$set': {'status': 'active', 'started_at': now_utc().isoformat()}}
            )
            result.update({
                'executed': True,
                'trip_id': tr['id'],
                'origin': tr.get('origin'),
                'destination': tr.get('destination'),
            })
            return result

        # ----- end_trip -----
        if action_type == 'end_trip':
            if not driver:
                result['error'] = 'Only drivers can end trips.'
                return result
            tr = await db.trips.find_one({'driver_id': driver['id'], 'status': 'active'}, {'_id': 0})
            if not tr:
                result['error'] = 'No active trip to end.'
                return result
            await db.trips.update_one(
                {'id': tr['id']},
                {'$set': {'status': 'completed', 'ended_at': now_utc().isoformat()}}
            )
            result.update({'executed': True, 'trip_id': tr['id']})
            return result

        # ----- log_fuel -----
        if action_type == 'log_fuel':
            await db.alerts.insert_one(_make_doc({
                'type': 'fuel_log',
                'severity': 'info',
                'driver_id': (driver or {}).get('id'),
                'message': f"Driver logged a fuel stop via Co-Pilot ({args.get('gallons', 'n/a')} gal, ${args.get('amount', 'n/a')}).",
            }))
            result.update({'executed': True})
            return result

        # ----- start_inspection -----
        if action_type == 'start_inspection':
            if not driver:
                result['error'] = 'Only drivers can start inspections.'
                return result
            insp_type = str(args.get('inspection_type', 'pre_trip')).lower().replace('-', '_')
            if insp_type not in ('pre_trip', 'post_trip'):
                insp_type = 'pre_trip'
            voice_mode = bool(args.get('voice_mode', False))
            inspection = await _create_blank_inspection(driver, insp_type)
            redirect = f"/driver/inspection/{inspection['id']}"
            if voice_mode:
                redirect = f"/driver/inspection/{inspection['id']}/voice"
            result.update({
                'executed': True,
                'inspection_id': inspection['id'],
                'inspection_type': insp_type,
                'voice_mode': voice_mode,
                'redirect': redirect,
            })
            return result

        # ----- dispatch_roadside -----
        if action_type == 'dispatch_roadside':
            if not driver:
                result['error'] = 'Only drivers can dispatch roadside help.'
                return result
            svc = str(args.get('service_type', 'other')).lower()
            if svc not in SERVICE_TYPES:
                svc = 'other'
            description = str(args.get('description', '')).strip() or None
            provider = await db.roadside_providers.find_one(
                {'active': True, 'services': svc},
                {'_id': 0},
                sort=[('eta_avg_minutes', 1)]
            )
            doc = _make_doc({
                'driver_id': driver['id'],
                'driver_name': driver.get('name'),
                'vehicle_id': driver.get('vehicle_id'),
                'service_type': svc,
                'description': description,
                'provider_id': (provider or {}).get('id'),
                'provider_name': (provider or {}).get('name'),
                'provider_phone': (provider or {}).get('phone'),
                'eta_minutes': (provider or {}).get('eta_avg_minutes'),
                'status': 'requested',
                'price_estimate': (provider or {}).get('typical_cost'),
                'history': [{'status': 'requested', 'at': now_utc().isoformat(), 'note': f"Co-Pilot voice dispatch — {svc}"}],
            })
            await db.roadside_dispatches.insert_one(dict(doc))
            await db.alerts.insert_one(_make_doc({
                'type': 'roadside_dispatch',
                'severity': 'warning',
                'driver_id': driver['id'],
                'vehicle_id': driver.get('vehicle_id'),
                'message': f"Roadside (voice): {svc} for {driver.get('name')}. Provider: {(provider or {}).get('name', 'pending assignment')}.",
            }))
            result.update({
                'executed': True,
                'dispatch_id': doc['id'],
                'service_type': svc,
                'provider_name': (provider or {}).get('name'),
                'eta_minutes': (provider or {}).get('eta_avg_minutes'),
                'redirect': f"/driver/roadside/{doc['id']}",
            })
            return result

        if action_type == 'send_sms':
            # Voice-driven SMS: driver says "text dispatch I'm late"
            recipient_raw = str(args.get('recipient', '')).strip().lower()
            message = str(args.get('message', '')).strip()
            if not message:
                result['error'] = 'Empty message body.'
                return result
            if len(message) > 1000:
                message = message[:997] + '...'

            # Resolve recipient -> user with phone
            target_user = None
            if recipient_raw in ('dispatch', 'admin', 'fleet_admin', 'fleet admin', ''):
                target_user = await db.users.find_one(
                    {'role': {'$in': ['fleet_admin', 'dispatcher', 'super_admin']}, 'phone': {'$exists': True, '$ne': None}},
                    {'_id': 0},
                )
            else:
                # fuzzy name match
                regex = re.compile(re.escape(recipient_raw), re.I)
                target_user = await db.users.find_one(
                    {'name': {'$regex': regex}, 'phone': {'$exists': True, '$ne': None}},
                    {'_id': 0},
                )

            if not target_user or not target_user.get('phone'):
                result['error'] = f"No fleet contact with a phone on file matched '{recipient_raw}'. Ask your admin to add a phone number."
                return result

            sender_name = (driver or {}).get('name') or user.get('name', 'Driver')
            sms_body = f"📱 From {sender_name} (voice): {message}\n\n— RoadBoss"
            send_result = await notify.send_sms(
                db, target_user['phone'], sms_body,
                event_type='copilot_voice_sms',
                driver_id=(driver or {}).get('id'),
            )
            # Drop in-app alert too so admin sees it instantly even before SMS lands
            await db.alerts.insert_one(_make_doc({
                'type': 'voice_sms',
                'severity': 'info',
                'driver_id': (driver or {}).get('id'),
                'message': f"📱 {sender_name} (voice): {message[:200]}",
            }))
            result.update({
                'executed': bool(send_result.get('ok')),
                'recipient_name': target_user.get('name'),
                'recipient_role': target_user.get('role'),
                'provider_message_id': send_result.get('sid'),
                'sms_status': send_result.get('status'),
                'sms_error': send_result.get('error'),
            })
            return result

        # ----- WRECKER MODE actions -----
        if action_type == 'tow_job_status':
            valid_status = {'pending', 'assigned', 'en_route', 'on_scene', 'in_progress', 'completed', 'cancelled'}
            new_status = str(args.get('status', '')).lower().replace(' ', '_').replace('-', '_')
            if new_status not in valid_status:
                result['error'] = f"Invalid tow job status: {args.get('status')}"
                return result
            target_job_id = str(args.get('job_id') or '').strip()
            if target_job_id:
                job = await db.tow_jobs.find_one({'id': target_job_id}, {'_id': 0})
            else:
                job = await _resolve_active_tow_job(user)
            if not job:
                result['error'] = 'No active tow job to update.'
                return result
            previous_status = job.get('status')
            history = job.get('status_history', []) + [{'status': new_status, 'at': now_utc(), 'by': user['id']}]
            await db.tow_jobs.update_one(
                {'id': job['id']},
                {'$set': {'status': new_status, 'status_history': history, 'updated_at': now_utc()}}
            )
            # Side-effect: log a notification on completed (receipt placeholder)
            if new_status == 'completed':
                await db.alerts.insert_one(_make_doc({
                    'type': 'tow_job_completed',
                    'severity': 'info',
                    'driver_id': job.get('assigned_driver_id'),
                    'message': f"🛻 Tow job for {(job.get('customer') or {}).get('name','?')} marked complete via voice.",
                }))
            result.update({
                'executed': True,
                'job_id': job['id'],
                'new_status': new_status,
                'previous_status': previous_status,
                'customer': (job.get('customer') or {}).get('name'),
            })
            return result

        if action_type == 'tow_job_next':
            job = await _resolve_active_tow_job(user)
            if not job:
                result['error'] = 'No active tow job to read.'
                result['no_job'] = True
                result['spoken_addendum'] = "Looks like you don't have an active call right now, boss."
                return result
            cust = (job.get('customer') or {}).get('name', 'unknown customer')
            v = job.get('vehicle') or {}
            veh_str = ' '.join(filter(None, [str(v.get('year') or ''), v.get('color'), v.get('make'), v.get('model')])).strip() or 'vehicle'
            pickup = (job.get('pickup') or {}).get('address', 'unknown location')
            svc = (job.get('service_type') or '').replace('_', ' ')
            result.update({
                'executed': True,
                'job_id': job['id'],
                'customer': cust,
                'vehicle': veh_str,
                'pickup_address': pickup,
                'service_type': svc,
                'status': job.get('status'),
                'priority': job.get('priority'),
                'redirect': f"/wrecker/jobs/{job['id']}",
                'spoken_addendum': f"{svc.title()} for {cust}, {veh_str}, at {pickup}.",
            })
            return result

        if action_type == 'fuel_check':
            tank_id = args.get('tank_id')
            tanks_q = {'id': tank_id} if tank_id else {}
            tanks = []
            async for t in db.fuel_tanks.find(tanks_q, {'_id': 0}).limit(5):
                cap = float(t.get('capacity_gallons') or 0)
                cur = float(t.get('current_estimate_gallons') or 0)
                pct = int((cur / cap) * 100) if cap else 0
                tanks.append({
                    'name': t.get('name'),
                    'fuel_type': t.get('fuel_type'),
                    'current_gallons': round(cur, 1),
                    'capacity_gallons': round(cap, 1),
                    'percent': pct,
                })
            if not tanks:
                result['error'] = 'No fuel tanks configured yet.'
                return result
            # Spoken summary of the top tank
            top = tanks[0]
            spoken = f"{top['name']} is at {int(top['current_gallons'])} gallons, {top['percent']} percent full."
            if len(tanks) > 1:
                second = tanks[1]
                spoken += f" {second['name']}: {int(second['current_gallons'])} gallons."
            result.update({'executed': True, 'tanks': tanks, 'spoken_addendum': spoken})
            return result

        if action_type == 'navigate_direct':
            redirect = str(args.get('redirect') or '').strip()
            if not redirect.startswith('/'):
                result['error'] = 'Invalid redirect target.'
                return result
            result.update({
                'executed': True,
                'target': 'direct',
                'label': str(args.get('label') or 'screen'),
                'redirect': redirect,
            })
            return result

        if action_type == 'navigate':
            # Hands-free in-app navigation. We never refuse — Co-Pilot IS the dashboard.
            target_raw = str(args.get('target') or '').strip().lower().replace('-', '_').replace(' ', '_')
            role = (user or {}).get('role', 'driver')
            is_wrecker = role in ('wrecker_operator', 'wrecker_dispatcher', 'fleet_admin', 'super_admin')
            # Map of allowed target keys -> route + spoken label
            nav_map = {
                # Wrecker / dispatch
                'dispatch_board': ('/wrecker', 'dispatch board'),
                'board': ('/wrecker', 'dispatch board'),
                'dispatch': ('/wrecker', 'dispatch board'),
                'active_call': ('/wrecker/me', 'active call'),
                'my_call': ('/wrecker/me', 'active call'),
                'next_call': ('/wrecker/me', 'active call'),
                'new_tow_job': ('/wrecker/jobs/new', 'new tow job'),
                'new_job': ('/wrecker/jobs/new', 'new tow job'),
                'impound': ('/wrecker/impound', 'impound yard'),
                'impounds': ('/wrecker/impound', 'impound yard'),
                'billing': ('/wrecker/billing', 'billing'),
                'invoices': ('/wrecker/billing', 'billing'),
                'accounts': ('/wrecker/accounts', 'customer accounts'),
                'customers': ('/wrecker/accounts', 'customer accounts'),
                'trucks': ('/wrecker/trucks', 'trucks'),
                'fleet': ('/wrecker/trucks', 'trucks'),
                'motor_clubs': ('/wrecker/clubs', 'motor clubs'),
                'clubs': ('/wrecker/clubs', 'motor clubs'),
                'fuel': ('/wrecker/fuel', 'fuel tanks'),
                'fuel_tanks': ('/wrecker/fuel', 'fuel tanks'),
                'settings': ('/wrecker/settings', 'settings'),
                'integrations': ('/wrecker/settings', 'settings'),
                # Driver / fleet
                'cab': ('/driver', 'cab dashboard'),
                'driver_home': ('/driver', 'cab dashboard'),
                'home': ('/wrecker' if is_wrecker else '/driver', 'home'),
                'trip': ('/driver/trips', 'trip'),
                'alerts': ('/app/alerts', 'fleet alerts'),
                'inspections': ('/driver/inspection/new', 'inspections'),
                'dvir': ('/driver/inspection/new', 'inspections'),
            }
            route_label = nav_map.get(target_raw)
            if not route_label:
                # Fuzzy fallback — find best key
                for k, v in nav_map.items():
                    if target_raw and (target_raw in k or k in target_raw):
                        route_label = v
                        break
            if not route_label:
                result['error'] = f"I don't have a screen called '{target_raw}'. Try dispatch board, impound, billing, or settings."
                return result
            redirect, label = route_label
            if target_raw in {'active_call', 'my_call', 'next_call'}:
                job = await _resolve_active_tow_job(user)
                if job:
                    redirect = f"/wrecker/jobs/{job['id']}"
                    label = 'active call'
            if target_raw == 'trip' and driver:
                tr = await db.trips.find_one(
                    {'driver_id': driver['id'], 'status': {'$in': ['active', 'planned']}},
                    {'_id': 0, 'id': 1},
                    sort=[('status', 1), ('created_at', -1)]
                )
                if tr and tr.get('id'):
                    redirect = f"/driver/trips/{tr['id']}"
            if target_raw in {'inspections', 'dvir'} and driver:
                insp = await db.inspections.find_one(
                    {'driver_id': driver['id'], 'status': {'$ne': 'certified'}},
                    {'_id': 0, 'id': 1},
                    sort=[('updated_at', -1)]
                )
                if insp and insp.get('id'):
                    redirect = f"/driver/inspection/{insp['id']}"
            result.update({
                'executed': True,
                'target': target_raw,
                'label': label,
                'redirect': redirect,
            })
            return result

        if action_type == 'impound_quick':
            job = await _resolve_active_tow_job(user)
            if not job:
                result['error'] = 'No active tow job to convert to an impound.'
                return result
            reason = str(args.get('reason', 'police_hold')).lower()
            if reason not in ('police_hold', 'private_property', 'accident', 'abandoned'):
                reason = 'police_hold'
            doc = {
                'id': str(uuid.uuid4()),
                'created_at': now_utc(),
                'impounded_at': now_utc(),
                'released_at': None,
                'released_to': None,
                'amount_paid': 0.0,
                'created_by': user['id'],
                'vehicle': job.get('vehicle') or {},
                'owner_name': (job.get('customer') or {}).get('name'),
                'owner_phone': (job.get('customer') or {}).get('phone'),
                'storage_location': 'Main Lot',
                'daily_rate': 35.0,
                'reason': reason,
                'notes': f"Created via voice from tow job {job['id']}",
            }
            await db.impounds.insert_one(doc)
            result.update({
                'executed': True,
                'impound_id': doc['id'],
                'reason': reason,
                'redirect': '/wrecker/impound',
            })
            return result

        # ----- set_job_price (set quoted/final price on the active job) -----
        # Mike: "Co-Pilot, charge 185 on this run." / "Set price 95."
        if action_type == 'set_job_price':
            # PRICING LOCKDOWN: drivers cannot set or change pricing via voice.
            # Dispatchers, supervisors, fleet admins, and super_admin (God Mode)
            # all retain access. This matches the REST gate on /jobs/*/charges.
            if user.get('role') == 'wrecker_operator':
                result['error'] = "Drivers can't set pricing. Talk to dispatch."
                return result
            job = await _resolve_active_tow_job(user)
            if not job:
                # No active job? Fall back to the most-recent job created by user
                job = await db.tow_jobs.find_one(
                    {'created_by': user['id']},
                    {'_id': 0},
                    sort=[('created_at', -1)],
                )
            if not job:
                result['error'] = 'No tow job to attach a price to.'
                return result
            try:
                amount = float(args.get('amount') or args.get('price') or 0)
            except Exception:
                amount = 0
            if amount <= 0:
                result['error'] = 'Need a positive dollar amount.'
                return result
            # Push a real CHARGE line item so accounting totals roll up
            # correctly (the revenue dashboard reads tow_jobs.charges[] +
            # tow_jobs.payments[] — not just the legacy quoted_price field).
            new_charge = {
                'id': str(uuid.uuid4()),
                'description': str(args.get('description') or 'Tow service'),
                'rate': amount,
                'qty': 1,
                'subtotal': amount,
                'added_at': now_utc().isoformat(),
                'added_by': user['id'],
                'added_via': 'copilot_voice',
            }
            charges = list(job.get('charges') or []) + [new_charge]
            payments_list = job.get('payments') or []
            subtotal = sum(round(float(c.get('rate', 0)) * float(c.get('qty', 0)), 2) for c in charges)
            tax_rate = float(job.get('tax_rate', 0) or 0)
            tax = round(subtotal * tax_rate, 2)
            invoice_total = round(subtotal + tax, 2)
            paid = round(sum(float(p.get('amount', 0)) for p in payments_list), 2)
            balance = round(invoice_total - paid, 2)
            await db.tow_jobs.update_one(
                {'id': job['id']},
                {'$set': {
                    'charges': charges,
                    'subtotal': subtotal,
                    'tax': tax,
                    'invoice_total': invoice_total,
                    'amount_paid': paid,
                    'balance_due': balance,
                    # Keep legacy quoted/final fields in sync for any older UI bits
                    'quoted_price': invoice_total,
                    'final_price': invoice_total,
                    'updated_at': now_utc(),
                }}
            )
            result.update({
                'executed': True,
                'job_id': job['id'],
                'amount': amount,
                'invoice_total': invoice_total,
                'customer': (job.get('customer') or {}).get('name') or job.get('customer_name'),
            })
            return result

        # ----- mark_paid (close out a tow job as paid) -----
        # Mike: "Co-Pilot, mark paid cash." / "Paid by card 185."
        # Pushes a real payments[] entry so totals reconcile in accounting.
        if action_type == 'mark_paid':
            # PRICING LOCKDOWN: drivers cannot record payments via voice.
            # Cash/card take is a dispatch-side closeout — the boss owns it.
            if user.get('role') == 'wrecker_operator':
                result['error'] = "Drivers can't record payments. Hand the money to dispatch."
                return result
            job = await _resolve_active_tow_job(user)
            if not job:
                job = await db.tow_jobs.find_one(
                    {'created_by': user['id']},
                    {'_id': 0},
                    sort=[('created_at', -1)],
                )
            if not job:
                result['error'] = 'No tow job to mark paid.'
                return result
            method = str(args.get('method', 'cash')).lower().strip().replace(' ', '_')
            valid_methods = {'cash', 'card', 'check', 'invoice', 'motor_club', 'square', 'venmo', 'zelle'}
            if method not in valid_methods:
                method = 'cash'
            try:
                amount = float(args.get('amount') or 0)
            except Exception:
                amount = 0

            # Make sure the job has a charge line — if not (driver paid before
            # we knew the price), create one from the spoken amount or from
            # legacy quoted_price.
            charges = list(job.get('charges') or [])
            if not charges:
                charge_amount = amount or float(job.get('quoted_price') or 0)
                if charge_amount > 0:
                    charges.append({
                        'id': str(uuid.uuid4()),
                        'description': 'Tow service',
                        'rate': charge_amount,
                        'qty': 1,
                        'subtotal': charge_amount,
                        'added_at': now_utc().isoformat(),
                        'added_by': user['id'],
                        'added_via': 'copilot_voice',
                    })

            # If no amount given on this voice call, default to remaining balance
            subtotal = sum(round(float(c.get('rate', 0)) * float(c.get('qty', 0)), 2) for c in charges)
            tax_rate = float(job.get('tax_rate', 0) or 0)
            tax = round(subtotal * tax_rate, 2)
            invoice_total = round(subtotal + tax, 2)
            existing_payments = list(job.get('payments') or [])
            already_paid = round(sum(float(p.get('amount', 0)) for p in existing_payments), 2)
            pay_amount = amount if amount > 0 else round(invoice_total - already_paid, 2)
            if pay_amount <= 0:
                pay_amount = invoice_total  # totally fresh job, no charges, no amount → mark as zero-balance paid

            new_payment = {
                'id': str(uuid.uuid4()),
                'amount': pay_amount,
                'method': method,
                'reference': args.get('reference') or '',
                'received_at': now_utc().isoformat(),
                'received_by': user['id'],
                'received_by_name': user.get('name'),
                'received_via': 'copilot_voice',
            }
            payments = existing_payments + [new_payment]
            paid = round(sum(float(p.get('amount', 0)) for p in payments), 2)
            balance = round(invoice_total - paid, 2)

            update: Dict[str, Any] = {
                'charges': charges,
                'payments': payments,
                'subtotal': subtotal,
                'tax': tax,
                'invoice_total': invoice_total,
                'amount_paid': paid,
                'balance_due': balance,
                'payment_method': method,
                'payment_status': 'paid' if balance <= 0 else 'partial',
                'paid_at': now_utc().isoformat() if balance <= 0 else None,
                'paid_by_user': user['id'],
                'updated_at': now_utc(),
            }
            # Auto-complete the job if it isn't already
            if job.get('status') != 'completed':
                update['status'] = 'completed'
                update['status_history'] = (job.get('status_history') or []) + [{
                    'status': 'completed',
                    'at': now_utc().isoformat(),
                    'by': user['id'],
                    'note': 'Auto-completed on payment via voice.',
                }]
            await db.tow_jobs.update_one({'id': job['id']}, {'$set': update})
            result.update({
                'executed': True,
                'job_id': job['id'],
                'payment_method': method,
                'amount': pay_amount,
                'invoice_total': invoice_total,
                'balance_due': balance,
                'customer': (job.get('customer') or {}).get('name') or job.get('customer_name'),
            })
            return result

        # ----- daily_summary (Einstein mode — speak today's books back) -----
        # Mike: "How much have I made today?" / "What's the books look like?"
        # / "Daily total." Returns revenue numbers shaped for the LLM to
        # speak conversationally. Counts ONLY real (non-demo) records.
        if action_type == 'daily_summary':
            from datetime import datetime as _dt, timezone as _tz, time as _t
            today_start = _dt.now(_tz.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            q = {
                'is_demo': {'$ne': True},
                'created_at': {'$gte': today_start},
            }
            if user.get('hide_demo_data'):
                pass  # already filtered above
            jobs_today = await db.tow_jobs.find(q, {'_id': 0}).to_list(500)
            total_invoiced = 0.0
            total_paid = 0.0
            paid_count = 0
            unpaid_count = 0
            for j in jobs_today:
                charges = j.get('charges') or []
                subtotal = sum(round(float(c.get('rate', 0)) * float(c.get('qty', 0)), 2) for c in charges)
                tax_rate = float(j.get('tax_rate', 0) or 0)
                inv = round(subtotal + (subtotal * tax_rate), 2)
                if inv == 0:
                    inv = float(j.get('invoice_total') or j.get('quoted_price') or 0)
                payments = j.get('payments') or []
                paid = round(sum(float(p.get('amount', 0)) for p in payments), 2)
                total_invoiced += inv
                total_paid += paid
                if paid >= inv and inv > 0:
                    paid_count += 1
                elif inv > 0:
                    unpaid_count += 1
            outstanding = round(total_invoiced - total_paid, 2)
            result.update({
                'executed': True,
                'period': 'today',
                'job_count': len(jobs_today),
                'total_invoiced': round(total_invoiced, 2),
                'total_paid': round(total_paid, 2),
                'outstanding': outstanding,
                'paid_count': paid_count,
                'unpaid_count': unpaid_count,
            })
            return result

        # ----- log_expense (voice quick-add to wrecker expenses) -----
        # Mike: "Log expense 75 dollars fuel truck 3" / "Log a $40 toll expense"
        if action_type == 'log_expense':
            try:
                amount = float(args.get('amount') or 0)
            except Exception:
                amount = 0
            if amount <= 0:
                result['error'] = 'Need a positive dollar amount.'
                return result
            kind = str(args.get('kind') or args.get('category') or 'misc').lower().strip()
            valid_kinds = {'fuel', 'parts', 'tolls', 'repair', 'misc', 'food', 'lodging', 'permit'}
            if kind not in valid_kinds:
                kind = 'misc'
            doc = {
                'id': str(uuid.uuid4()),
                'kind': kind,
                'amount': amount,
                'gallons': args.get('gallons'),
                'vendor': args.get('vendor'),
                'truck_id': args.get('truck_id'),
                'driver_id': driver.get('id') if driver else None,
                'notes': args.get('notes') or args.get('description'),
                'reimbursable': bool(args.get('reimbursable', True)),
                'date': now_utc(),
                'created_at': now_utc(),
                'created_by': user['id'],
                'created_via': 'copilot_voice',
                'is_demo': False,
                'tenant_id': user.get('tenant_id', 'founder'),
            }
            await db.expenses.insert_one(doc)
            result.update({
                'executed': True,
                'expense_id': doc['id'],
                'amount': amount,
                'kind': kind,
            })
            return result

        # ----- inspection_mark_all (mass-mark current DVIR items) -----
        # Mike said: "When I say mark all as passed, he should do that."
        # Args: { status: 'pass'|'defect'|'na', inspection_id?: '...' }
        # If no inspection_id, find the caller's most recent uncertified DVIR.
        if action_type == 'inspection_mark_all':
            status_in = str(args.get('status', 'pass')).lower().strip()
            status_map = {
                'pass': 'pass', 'passed': 'pass', 'good': 'pass', 'all good': 'pass', 'green': 'pass',
                'fail': 'defect', 'failed': 'defect', 'defect': 'defect', 'bad': 'defect', 'red': 'defect',
                'na': 'na', 'n/a': 'na', 'skip': 'na', 'not applicable': 'na', 'none': 'na',
            }
            status = status_map.get(status_in, 'pass')
            if not driver:
                result['error'] = 'No driver record to attach the inspection to.'
                return result

            insp_id = args.get('inspection_id')
            if insp_id:
                doc = await db.inspections.find_one({'id': insp_id}, {'_id': 0})
            else:
                doc = await db.inspections.find_one(
                    {'driver_id': driver['id'], 'status': {'$ne': 'certified'}},
                    {'_id': 0},
                    sort=[('created_at', -1)],
                )
            if not doc:
                # No active inspection — start one so Mike's "mark all pass" actually works
                doc = await _create_blank_inspection(driver, 'pre_trip')

            items = doc.get('items') or []
            updated_items = []
            now_iso = now_utc().isoformat()
            for it in items:
                if it.get('type') == 'check':
                    it = {**it, 'status': status, 'updated_at': now_iso, 'updated_by': user['id']}
                updated_items.append(it)
            await db.inspections.update_one(
                {'id': doc['id']},
                {'$set': {'items': updated_items, 'updated_at': now_iso}}
            )
            count = sum(1 for i in items if i.get('type') == 'check')
            result.update({
                'executed': True,
                'inspection_id': doc['id'],
                'status': status,
                'items_marked': count,
                'redirect': f"/driver/inspection/{doc['id']}/sign",
            })
            return result

        # ----- inspection_set_item (mark a single DVIR item by name) -----
        if action_type == 'inspection_set_item':
            item_query = str(args.get('item', '')).strip().lower()
            status_in = str(args.get('status', 'pass')).lower().strip()
            status = {'pass': 'pass', 'passed': 'pass', 'good': 'pass',
                      'fail': 'defect', 'failed': 'defect', 'defect': 'defect',
                      'na': 'na', 'skip': 'na'}.get(status_in, 'pass')
            if not driver or not item_query:
                result['error'] = 'Missing driver or item name.'
                return result
            doc = await db.inspections.find_one(
                {'driver_id': driver['id'], 'status': {'$ne': 'certified'}},
                {'_id': 0},
                sort=[('created_at', -1)],
            )
            if not doc:
                doc = await _create_blank_inspection(driver, 'pre_trip')
            items = doc.get('items') or []
            matched = None
            for it in items:
                lbl = (it.get('label') or it.get('key') or '').lower()
                if item_query in lbl or lbl in item_query:
                    matched = it
                    break
            if not matched:
                result['error'] = f"No inspection item named '{item_query}'."
                return result
            await db.inspections.update_one(
                {'id': doc['id'], 'items.key': matched['key']},
                {'$set': {'items.$.status': status, 'items.$.updated_at': now_utc().isoformat()}}
            )
            result.update({
                'executed': True,
                'inspection_id': doc['id'],
                'item': matched.get('label'),
                'status': status,
            })
            return result

        # ----- new_tow_job (voice-create a tow job) -----
        # Mike's "log every run" play: while driving to a Towbook call he can
        # say "Co-Pilot, new job for Smith on I-65 mile 142, blue F-150
        # jumpstart" and Co-Pilot creates the ticket in WreckerLogix in 2s.
        if action_type == 'new_tow_job':
            customer = str(args.get('customer_name', '')).strip() or 'Walk-up'
            phone = str(args.get('phone', '')).strip() or None
            location = str(args.get('location', '')).strip() or args.get('pickup_location') or 'Unknown location'
            destination = str(args.get('destination', '')).strip() or args.get('drop_location') or None
            vehicle = str(args.get('vehicle', '')).strip() or args.get('vehicle_description') or None
            service = str(args.get('service_type', 'tow')).lower().strip()
            valid_service = {'tow', 'jumpstart', 'lockout', 'tire_change', 'fuel_delivery', 'winch', 'recovery', 'impound'}
            if service not in valid_service:
                service = 'tow'
            quoted = float(args.get('quoted_price') or 0) or None
            doc = {
                'id': str(uuid.uuid4()),
                'customer_name': customer,
                'customer_phone': phone,
                'pickup_location': location,
                'drop_location': destination,
                'vehicle_description': vehicle,
                'service_type': service,
                'status': 'pending',
                'quoted_price': quoted,
                'final_price': None,
                'photo_urls': [],
                'created_at': now_utc(),
                'updated_at': now_utc(),
                'created_by': user['id'],
                'created_by_name': user.get('name'),
                'created_via': 'copilot_voice',
                'tenant_id': user.get('tenant_id', 'founder'),
                'is_demo': False,
                'status_history': [{
                    'status': 'pending',
                    'at': now_utc().isoformat(),
                    'by': user['email'],
                    'note': 'Voice-created via Co-Pilot',
                }],
            }
            await db.tow_jobs.insert_one(doc)
            result.update({
                'executed': True,
                'job_id': doc['id'],
                'customer_name': customer,
                'service_type': service,
                'redirect': f"/wrecker/jobs/{doc['id']}",
            })
            return result

        # Unknown action — silently ignore
        result['error'] = f"Unknown action type: {action_type}"
        return result
    except Exception as e:
        logger.error(f"Action execution failed ({action_type}): {e}")
        result['error'] = str(e)
        return result


def _parse_action_marker(reply_text: str):
    """Strip <<<ACTION:{...}>>> and return (clean_text, action_dict|None, parse_error|None)."""
    import json as _json
    if not reply_text:
        return reply_text, None, None
    m = _ACTION_MARKER_RE.search(reply_text)
    if not m:
        return reply_text.strip(), None, None
    raw_json = m.group(1)
    cleaned = (reply_text[:m.start()] + reply_text[m.end():]).strip()
    try:
        action = _json.loads(raw_json)
    except Exception as e:
        logger.warning(f"Co-Pilot emitted malformed ACTION marker: {raw_json!r} ({e})")
        return cleaned, None, 'malformed_action_json'
    return cleaned, action, None


def _action_requires_confirmation(action: Optional[Dict[str, Any]]) -> bool:
    if not action:
        return False
    action_type = str(action.get('type') or '')
    args = (action or {}).get('args') or {}
    if action_type in {'mark_paid', 'set_job_price', 'impound_quick'}:
        return True
    if action_type == 'tow_job_status':
        status_val = str(args.get('status') or '').lower().replace('-', '_').replace(' ', '_')
        if status_val in {'completed', 'cancelled'}:
            return True
    return False


def _build_undo_action(action_result: Optional[Dict[str, Any]], ui_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not action_result or not action_result.get('executed'):
        return None
    action_type = action_result.get('type')
    if action_type == 'navigate':
        prev_route = (ui_context or {}).get('route')
        if prev_route:
            return {'type': 'navigate_direct', 'args': {'redirect': prev_route, 'label': 'previous screen'}}
        return None
    if action_type == 'tow_job_status' and action_result.get('previous_status'):
        return {
            'type': 'tow_job_status',
            'args': {
                'status': action_result.get('previous_status'),
                'job_id': action_result.get('job_id'),
            }
        }
    if action_type == 'duty_change' and action_result.get('previous_status'):
        return {'type': 'duty_change', 'args': {'status': action_result.get('previous_status')}}
    return None


async def _record_copilot_metric(user: Dict[str, Any], session_id: str, ui_context: Dict[str, Any],
                                 event_type: str, action_result: Optional[Dict[str, Any]] = None,
                                 error: Optional[str] = None):
    try:
        screen_key = _resolve_screen_key(ui_context or {})
        # Retry metric should represent real failed action attempts, not plain
        # chat replies. We only mark llm_action/confirm_execute as attempts and
        # only count attempts that produced a non-empty error.
        action_attempted = event_type in {'llm_action', 'confirm_execute'}
        retries = await db.copilot_metrics.count_documents({
            'user_id': user['id'],
            'screen_key': screen_key,
            'action_attempted': True,
            'error': {'$nin': [None, '']},
            'created_at': {'$gte': now_utc() - timedelta(minutes=15)},
        })
        await db.copilot_metrics.insert_one({
            'id': str(uuid.uuid4()),
            'user_id': user['id'],
            'session_id': session_id,
            'screen_key': screen_key,
            'route': (ui_context or {}).get('route'),
            'event_type': event_type,
            'action_type': (action_result or {}).get('type'),
            'action_attempted': action_attempted,
            'action_executed': bool((action_result or {}).get('executed')),
            'error': error or (action_result or {}).get('error'),
            'fallback_to_touch': bool((ui_context or {}).get('touch_fallback')),
            'retry_count_15m': retries,
            'created_at': now_utc(),
        })
    except Exception as e:
        logger.warning(f"Failed to record copilot metric: {e}")


async def _load_pending_copilot_action(user_id: str) -> Optional[Dict[str, Any]]:
    return await db.copilot_pending_actions.find_one(
        {'user_id': user_id, 'expires_at': {'$gt': now_utc()}},
        {'_id': 0},
        sort=[('created_at', -1)],
    )


async def _clear_pending_copilot_action(user_id: str):
    await db.copilot_pending_actions.delete_many({'user_id': user_id})


async def _save_pending_copilot_action(user: Dict[str, Any], session_id: str, action: Dict[str, Any], spoken_text: str):
    await _clear_pending_copilot_action(user['id'])
    await db.copilot_pending_actions.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'session_id': session_id,
        'action': action,
        'spoken_text': spoken_text,
        'created_at': now_utc(),
        'expires_at': now_utc() + timedelta(minutes=20),
    })


async def _save_copilot_action_journal(user: Dict[str, Any], session_id: str, action_result: Dict[str, Any], ui_context: Dict[str, Any]):
    undo_action = _build_undo_action(action_result, ui_context)
    await db.copilot_action_journal.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'session_id': session_id,
        'action_result': action_result,
        'undo_action': undo_action,
        'undone': False,
        'created_at': now_utc(),
    })


async def _undo_last_copilot_action(user: Dict[str, Any], driver: Optional[Dict[str, Any]], session_id: str):
    last = await db.copilot_action_journal.find_one(
        {'user_id': user['id'], 'undone': {'$ne': True}},
        {'_id': 0},
        sort=[('created_at', -1)],
    )
    if not last:
        return "Nothing to undo yet, boss.", {'executed': False, 'type': 'undo', 'error': 'no_previous_action'}
    undo_action = last.get('undo_action')
    if not undo_action:
        return "I can't undo that one automatically yet.", {'executed': False, 'type': 'undo', 'error': 'undo_not_available'}
    result = await _execute_copilot_action(undo_action, user, driver)
    if result.get('executed'):
        await db.copilot_action_journal.update_one({'id': last['id']}, {'$set': {'undone': True, 'undone_at': now_utc()}})
        return "Done. I rolled back the last action.", result
    await db.copilot_action_journal.update_one(
        {'id': last['id']},
        {'$set': {'last_undo_failed_at': now_utc(), 'last_undo_error': result.get('error')}}
    )
    return "I tried to undo it, but it did not go through.", result


@api_router.post("/copilot/chat")
async def copilot_chat(body: CopilotChatIn, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "Co-Pilot AI is not configured yet. Add EMERGENT_LLM_KEY to enable.")
    msg_text = (body.message or '').strip()
    if not msg_text:
        raise HTTPException(400, "Empty message")
    if len(msg_text) > 2000:
        raise HTTPException(400, "Message too long. Keep it under 2000 characters.")

    # Stable session id keyed to user (one running convo per user is fine for v1)
    session_id = body.session_id or f"copilot-{user['id']}"
    ui_context = serialize_doc(body.ui_context.model_dump()) if body.ui_context else {}
    incoming_meta = body.meta or {}
    ui_context['screen_key'] = _resolve_screen_key(ui_context) or ui_context.get('screen_key')

    # Build live context
    # GOD-MODE: super_admin gets a phantom driver record auto-created so all
    # voice actions work without role gates ("start pre-trip", "mark all
    # passed", etc.) — Mike runs the show, Co-Pilot obliges anywhere he is.
    is_god_mode = user.get('role') == 'super_admin'
    if user.get('role') == 'driver':
        driver = await _get_my_driver(user['email'])
    elif is_god_mode:
        driver = await _ensure_phantom_driver(user)
    else:
        driver = None
    active_trip = None
    vehicle = None
    if driver:
        active_trip = await db.trips.find_one(
            {'driver_id': driver['id'], 'status': {'$in': ['active', 'planned']}},
            {'_id': 0},
            sort=[('status', 1), ('created_at', -1)]
        )
        if driver.get('vehicle_id'):
            vehicle = await db.vehicles.find_one({'id': driver['vehicle_id']}, {'_id': 0})
    recent_alerts = await db.alerts.find({}, {'_id': 0}).sort('created_at', -1).to_list(5)

    # Wrecker context (only when operator role or admin viewing)
    wrecker_ctx = None
    if user.get('role') in ('wrecker_operator', 'fleet_admin', 'dispatcher', 'super_admin'):
        try:
            wrecker_ctx = await _build_wrecker_context(user)
        except Exception as e:
            logger.warning(f"Failed to build wrecker context: {e}")

    # Persist user turn first
    user_doc = {
        'id': str(uuid.uuid4()),
        'session_id': session_id,
        'user_id': user['id'],
        'role': 'user',
        'content': msg_text,
        'ui_context': ui_context,
        'meta': incoming_meta,
        'created_at': now_utc().isoformat(),
    }
    await db.copilot_chats.insert_one(user_doc)

    async def _finalize_response(spoken_text: str, action_result: Optional[Dict[str, Any]],
                                 event_type: str, model_name: Optional[str] = None):
        if action_result and action_result.get('spoken_addendum'):
            addendum = action_result.pop('spoken_addendum')
            if spoken_text and not spoken_text.endswith(('.', '!', '?')):
                spoken_text = spoken_text + '.'
            spoken_text = (spoken_text + ' ' + addendum).strip() if spoken_text else addendum

        await db.copilot_chats.insert_one({
            'id': str(uuid.uuid4()),
            'session_id': session_id,
            'user_id': user['id'],
            'role': 'assistant',
            'content': spoken_text,
            'action': action_result,
            'ui_context': ui_context,
            'meta': incoming_meta,
            'model': model_name or f"{COPILOT_MODEL_PROVIDER}/{COPILOT_MODEL_NAME}",
            'created_at': now_utc().isoformat(),
        })
        try:
            if incoming_meta.get('channel') == 'voice':
                await db.voice_action_log.insert_one({
                    'id': str(uuid.uuid4()),
                    'user_id': user['id'],
                    'session_id': session_id,
                    'message': msg_text,
                    'risk_level': incoming_meta.get('risk_level'),
                    'speed_mph': incoming_meta.get('speed_mph'),
                    'source': incoming_meta.get('source'),
                    'profile': incoming_meta.get('profile'),
                    'action': action_result,
                    'created_at': now_utc().isoformat(),
                })
        except Exception as e:
            logger.warning(f"voice_action_log insert failed for user={user['id']} session={session_id}: {e}")
        await _record_copilot_metric(
            user=user,
            session_id=session_id,
            ui_context=ui_context,
            event_type=event_type,
            action_result=action_result,
        )
        if action_result and action_result.get('executed'):
            await _save_copilot_action_journal(user, session_id, action_result, ui_context)
        return {
            'reply': spoken_text,
            'action': action_result,
            'session_id': session_id,
            'model': model_name or f"{COPILOT_MODEL_PROVIDER}/{COPILOT_MODEL_NAME}",
            'ui_context': ui_context,
        }

    pending = await _load_pending_copilot_action(user['id'])
    if pending and _message_is_confirm(msg_text):
        action_result = await _execute_copilot_action(pending.get('action') or {}, user, driver)
        await _clear_pending_copilot_action(user['id'])
        spoken_text = str(pending.get('spoken_text') or 'Confirmed. Done.')
        return await _finalize_response(spoken_text, action_result, event_type='confirm_execute')
    if pending and _message_is_cancel(msg_text):
        await _clear_pending_copilot_action(user['id'])
        return await _finalize_response(
            "Copy that, canceled.",
            {'executed': False, 'type': 'confirmation', 'cancelled': True},
            event_type='confirm_cancel'
        )

    if _message_is_undo(msg_text):
        spoken_text, action_result = await _undo_last_copilot_action(user, driver, session_id)
        return await _finalize_response(spoken_text, action_result, event_type='undo')

    if _message_is_whats_left(msg_text):
        adapter = _build_screen_adapter_context(ui_context)
        missing = adapter.get('missing_required') or []
        if adapter.get('screen_key'):
            if missing:
                spoken = f"On {adapter.get('label')}, you're still missing: {', '.join(missing)}."
            else:
                spoken = f"On {adapter.get('label')}, you're clear on required fields."
            action_result = {
                'executed': True,
                'type': 'screen_progress',
                'screen_key': adapter.get('screen_key'),
                'missing_required': missing,
            }
        else:
            spoken = "I don't have enough screen context yet. Keep the screen open and try again."
            action_result = {'executed': False, 'type': 'screen_progress', 'error': 'no_screen_context'}
        return await _finalize_response(spoken, action_result, event_type='whats_left')

    # Lazy import so server still boots if package missing
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.error(f"emergentintegrations import failed: {e}")
        raise HTTPException(500, "Co-Pilot AI library not available.")

    system_prompt = COPILOT_SYSTEM_BASE + _build_driver_context(user, driver, active_trip, vehicle, recent_alerts, wrecker_ctx=wrecker_ctx)
    system_prompt += _build_screen_prompt_context(ui_context)

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model(COPILOT_MODEL_PROVIDER, COPILOT_MODEL_NAME)

        # Replay short conversational history (last 4 turns) so context survives
        # across calls. Tight on purpose — every replayed turn = more tokens = more $.
        history = await db.copilot_chats.find(
            {'session_id': session_id, 'user_id': user['id'], 'id': {'$ne': user_doc['id']}},
            {'_id': 0},
        ).sort('created_at', -1).to_list(4)
        history.reverse()
        prior_text = ""
        if history:
            transcript_lines = []
            for h in history:
                speaker = "Driver" if h.get('role') == 'user' else "You"
                transcript_lines.append(f"{speaker}: {h.get('content', '')}")
            prior_text = "\n\nRecent conversation so far (oldest first):\n" + "\n".join(transcript_lines) + "\n\n"

        screen_summary = _build_screen_adapter_context(ui_context).get('summary') or 'No screen context'
        composed = prior_text + f"Live screen summary: {screen_summary}\nDriver just said: {msg_text}"
        reply = await chat.send_message(UserMessage(text=composed))
        reply_text = (reply or '').strip()
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        logger.error(f"Copilot LLM error: {err_str}")
        low = err_str.lower()
        # CREDIT GUARD: Detect specific budget / quota errors so the user knows
        # exactly what's wrong instead of a generic "brain" message.
        if 'budget has been exceeded' in low or 'budget exceeded' in low or 'insufficient_quota' in low or ('quota' in low and 'exceeded' in low):
            raise HTTPException(
                402,
                "AI credit balance is empty. Top up your Emergent Universal Key (Profile → Universal Key → Add Balance) to bring Co-Pilot back online."
            )
        if 'rate limit' in low or 'rate_limit' in low or '429' in low:
            raise HTTPException(429, "Co-Pilot is being rate-limited. Give it 10 seconds and try again.")
        if 'authentication' in low or 'invalid api key' in low or 'unauthorized' in low:
            raise HTTPException(401, "Co-Pilot AI key is invalid. Check EMERGENT_LLM_KEY.")
        raise HTTPException(502, "Co-Pilot is having trouble reaching the brain. Try again in a moment.")

    spoken_text, action, parse_error = _parse_action_marker(reply_text)
    if parse_error:
        action_result: Optional[Dict[str, Any]] = {'executed': False, 'error': parse_error, 'type': 'action_parse'}
        return await _finalize_response(spoken_text, action_result, event_type='llm_parse_error')

    action_result = None
    if action:
        if _action_requires_confirmation(action) and not _message_is_confirm(msg_text):
            await _save_pending_copilot_action(user, session_id, action, spoken_text)
            spoken_text = (spoken_text + " Say confirm to proceed, or cancel to stop.").strip()
            action_result = {
                'executed': False,
                'type': action.get('type'),
                'confirmation_required': True,
            }
        else:
            action_result = await _execute_copilot_action(action, user, driver)

    return await _finalize_response(
        spoken_text,
        action_result,
        event_type='llm_action' if action_result else 'llm_reply',
        model_name=f"{COPILOT_MODEL_PROVIDER}/{COPILOT_MODEL_NAME}",
    )


@api_router.get("/copilot/history")
async def copilot_history(session_id: Optional[str] = None, limit: int = 30, user=Depends(get_current_user)):
    sid = session_id or f"copilot-{user['id']}"
    msgs = await db.copilot_chats.find(
        {'session_id': sid, 'user_id': user['id']},
        {'_id': 0},
    ).sort('created_at', -1).to_list(max(1, min(limit, 200)))
    msgs.reverse()
    return {'session_id': sid, 'messages': msgs}


@api_router.post("/copilot/reset")
async def copilot_reset(user=Depends(get_current_user)):
    sid = f"copilot-{user['id']}"
    res = await db.copilot_chats.delete_many({'session_id': sid, 'user_id': user['id']})
    return {'deleted': res.deleted_count, 'session_id': sid}


@api_router.get("/copilot/status")
async def copilot_status(user=Depends(get_current_user)):
    return {
        'configured': bool(EMERGENT_LLM_KEY),
        'model': f"{COPILOT_MODEL_PROVIDER}/{COPILOT_MODEL_NAME}",
        'persona': 'Co-Pilot Buddy',
    }


# ============================================================
# Co-Pilot Voice Wizard — Stateful guided job entry.
#
# Mike's "Hands-Free vision" play. Frontend owns the conversation state
# machine; backend just exposes lightweight endpoints to:
#   1. parse a single field out of a raw voice transcript
#   2. create the tow job from collected fields (zero LLM, direct insert)
#
# Cost discipline: regex/heuristics first, LLM fallback ONLY for the messy
# cases (multi-word names, addresses with numbers spelled out, etc).
# ============================================================

class WizardParseIn(BaseModel):
    field: str  # name | phone | address | vehicle | service | price | yesno
    transcript: str
    use_llm_fallback: bool = True

class WizardCreateJobIn(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = None
    pickup_location: str
    drop_location: Optional[str] = None
    vehicle_description: Optional[str] = None
    service_type: str = 'tow'
    quoted_price: Optional[float] = None
    notes: Optional[str] = None


# Common spoken-yes / spoken-no words. Tight on purpose — wizard rejects
# ambiguous responses and re-asks rather than guess wrong.
_YES_WORDS = {'yes', 'yeah', 'yep', 'yup', 'correct', 'right', "that's right", 'confirm',
              'confirmed', 'continue', 'go', 'send it', 'looks good', 'good', 'okay',
              'ok', 'sure', 'affirmative', 'roger', 'ten four', 'send', 'submit'}
_NO_WORDS = {'no', 'nope', 'nah', 'wrong', 'redo', 'again', 'try again', 'incorrect',
             'fix', 'fix it', 'change', 'change it', 'no way', 'negative', 'cancel'}
_SKIP_WORDS = {'skip', 'skip it', 'none', 'no phone', 'no number', 'leave blank',
               'leave it blank', 'not sure', 'unknown', 'pass', 'next'}
_BACK_WORDS = {'back', 'go back', 'previous', 'last one', 'previous field'}


def _parse_yesno(t: str) -> Optional[str]:
    """Returns 'yes', 'no', 'skip', 'back', or None."""
    s = (t or '').lower().strip().rstrip('.!?,')
    if not s:
        return None
    # exact phrase first
    if s in _YES_WORDS:
        return 'yes'
    if s in _NO_WORDS:
        return 'no'
    if s in _SKIP_WORDS:
        return 'skip'
    if s in _BACK_WORDS:
        return 'back'
    # token-level fallback (catches "yeah send it" style replies)
    tokens = set(re.split(r'\s+', s))
    if tokens & _YES_WORDS:
        return 'yes'
    if tokens & _NO_WORDS:
        return 'no'
    if tokens & _SKIP_WORDS:
        return 'skip'
    if tokens & _BACK_WORDS:
        return 'back'
    # short phrase contains check
    for w in _YES_WORDS:
        if w in s and len(w) >= 3:
            return 'yes'
    for w in _NO_WORDS:
        if w in s and len(w) >= 3:
            return 'no'
    return None


# Spoken digit map for phone parsing ("five five five..." → "555...")
_DIGIT_WORDS = {
    'zero': '0', 'oh': '0', 'o': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'niner': '9',
}


def _parse_phone(t: str) -> Optional[str]:
    """Pulls the first plausible 10-digit US phone from a transcript."""
    if not t:
        return None
    s = t.lower()
    # Convert spoken digits to numerics
    tokens = re.split(r'[\s,.\-]+', s)
    converted = []
    for tok in tokens:
        if tok in _DIGIT_WORDS:
            converted.append(_DIGIT_WORDS[tok])
        else:
            converted.append(tok)
    digits = re.sub(r'\D', '', ' '.join(converted))
    if len(digits) >= 11 and digits.startswith('1'):
        digits = digits[1:11]
    elif len(digits) >= 10:
        digits = digits[:10]
    else:
        return None
    if len(digits) != 10:
        return None
    return f"({digits[0:3]}) {digits[3:6]}-{digits[6:10]}"


# Spoken numbers for prices ("two fifty" → 250, "three hundred" → 300)
_NUM_WORDS = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11,
    'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
    'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
    'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
    'hundred': 100, 'thousand': 1000,
}


def _parse_price(t: str) -> Optional[float]:
    """Extract dollar amount. Handles '$250', '250 dollars', 'two fifty', 'two hundred fifty'."""
    if not t:
        return None
    s = t.lower().strip()
    # strip leading "charge", "set price to", etc.
    s = re.sub(r'^\s*(charge|set\s+price\s+to|the\s+price\s+is|price\s+is|it\'?s|its)\s+', '', s)
    s = s.replace('dollars', '').replace('dollar', '').replace('bucks', '')
    # Strip standalone "and" connector ("two hundred and fifty"). Use word
    # boundary so we don't mangle "thousand", "grand", etc.
    s = re.sub(r'\band\b', ' ', s)
    # Strip thousands-separator commas BEFORE numeric match ("$1,250.50" → "$1250.50")
    s = re.sub(r'(\d),(\d{3})', r'\1\2', s)
    s = re.sub(r'(\d),(\d{3})', r'\1\2', s)  # second pass for "$1,234,567"
    # Numeric form first (most common: "$250", "250", "250.50")
    m = re.search(r'\$?(\d{1,7}(?:\.\d{1,2})?)', s)
    if m:
        try:
            v = float(m.group(1))
            if 0 < v < 1_000_000:
                return v
        except Exception:
            pass
    # Colloquial pricing heuristic: "two fifty" → 250, "three twenty" → 320,
    # "five hundred" already handled by general parser. Tow yards say it like
    # this all day, so we trust it over the strict additive interpretation.
    tokens_only = [tok for tok in re.split(r'\s+', s) if tok]
    if len(tokens_only) == 2 and all(tok in _NUM_WORDS for tok in tokens_only):
        a, b = _NUM_WORDS[tokens_only[0]], _NUM_WORDS[tokens_only[1]]
        # Pattern: small ones digit (1-9) + tens (20,30,...,90) → ones*100 + tens
        if 1 <= a <= 9 and b in (20, 30, 40, 50, 60, 70, 80, 90):
            return float(a * 100 + b)
        # Pattern: small ones (1-9) + small ones (1-9 < first) is uncommon — skip
    # Spoken number fallback: "two fifty", "three hundred", "two hundred fifty"
    tokens = [tok for tok in re.split(r'\s+', s) if tok]
    total = 0
    current = 0
    matched = False
    for tok in tokens:
        if tok not in _NUM_WORDS:
            continue
        matched = True
        n = _NUM_WORDS[tok]
        if n == 100:
            if current == 0:
                current = 1
            current *= 100
        elif n == 1000:
            if current == 0:
                current = 1
            total += current * 1000
            current = 0
        else:
            current += n
    total += current
    if matched and 0 < total < 1_000_000:
        return float(total)
    return None


_SERVICE_KEYWORDS = {
    'tow': 'tow', 'towing': 'tow', 'haul': 'tow',
    'jumpstart': 'jumpstart', 'jump': 'jumpstart', 'jump start': 'jumpstart',
    'lockout': 'lockout', 'locked out': 'lockout', 'unlock': 'lockout', 'keys': 'lockout',
    'tire': 'tire_change', 'tire change': 'tire_change', 'flat': 'tire_change',
    'fuel': 'fuel_delivery', 'gas': 'fuel_delivery', 'fuel delivery': 'fuel_delivery',
    'winch': 'winch', 'winch out': 'winch', 'pull out': 'winch',
    'recovery': 'recovery', 'recover': 'recovery',
    'impound': 'impound',
}


def _parse_service(t: str) -> Optional[str]:
    if not t:
        return None
    s = t.lower().strip()
    for k, v in _SERVICE_KEYWORDS.items():
        if k in s:
            return v
    return None


def _clean_freeform(t: str) -> str:
    """Light cleanup for name/address/vehicle: trim filler, capitalize."""
    if not t:
        return ''
    s = t.strip().rstrip('.!?,')
    # strip leading filler
    s = re.sub(r"^\s*(it'?s|it is|the customer is|customer is|name is|address is|the address is|pickup is|the vehicle is|vehicle is|service is|um+|uh+|so|like)\s+",
               '', s, flags=re.IGNORECASE)
    s = s.strip()
    if not s:
        return ''
    # Title-case ONLY if the input was all-lower (Web Speech default) — preserve mixed-case
    if s.islower():
        s = s.title()
        # Restore street-suffix casing nicely
        s = re.sub(r'\bI (\d+)', r'I-\1', s)  # interstate
        s = re.sub(r'\bUs (\d+)', r'US-\1', s)
    return s


@api_router.post("/copilot/wizard/parse-field")
async def copilot_wizard_parse(body: WizardParseIn, user=Depends(get_current_user)):
    """Parse a single field out of a voice transcript. Regex-first; LLM fallback
    optional and only used for ambiguous free-form fields."""
    field = (body.field or '').lower().strip()
    transcript = (body.transcript or '').strip()
    if not transcript:
        raise HTTPException(400, "Empty transcript")
    if len(transcript) > 500:
        transcript = transcript[:500]

    # Regex-first per field
    if field == 'yesno':
        v = _parse_yesno(transcript)
        return {'field': field, 'value': v, 'confidence': 'high' if v else 'low', 'raw': transcript}

    if field == 'phone':
        v = _parse_phone(transcript)
        # Also catch "skip" / "none" responses on phone
        if not v:
            yn = _parse_yesno(transcript)
            if yn == 'skip':
                return {'field': field, 'value': None, 'skipped': True, 'confidence': 'high', 'raw': transcript}
        return {'field': field, 'value': v, 'confidence': 'high' if v else 'low', 'raw': transcript}

    if field == 'price':
        v = _parse_price(transcript)
        if v is None:
            yn = _parse_yesno(transcript)
            if yn == 'skip':
                return {'field': field, 'value': None, 'skipped': True, 'confidence': 'high', 'raw': transcript}
        return {'field': field, 'value': v, 'confidence': 'high' if v is not None else 'low', 'raw': transcript}

    if field == 'service':
        v = _parse_service(transcript)
        return {'field': field, 'value': v or 'tow', 'confidence': 'high' if v else 'low', 'raw': transcript}

    if field in ('name', 'address', 'pickup', 'dropoff', 'destination', 'vehicle', 'notes'):
        # Skip first
        yn = _parse_yesno(transcript)
        if yn == 'skip' and field in ('dropoff', 'destination', 'vehicle', 'notes'):
            return {'field': field, 'value': None, 'skipped': True, 'confidence': 'high', 'raw': transcript}
        v = _clean_freeform(transcript)
        return {'field': field, 'value': v, 'confidence': 'high' if v else 'low', 'raw': transcript}

    raise HTTPException(400, f"Unknown field: {field}")


@api_router.post("/copilot/wizard/create-job")
async def copilot_wizard_create_job(body: WizardCreateJobIn, user=Depends(get_current_user)):
    """Create a tow job from collected wizard fields. ZERO LLM cost.
    Mirrors the new_tow_job action so jobs created via wizard or chat behave
    identically downstream."""
    role = user.get('role')
    allowed = {'wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor',
               'fleet_admin', 'dispatcher', 'super_admin'}
    if role not in allowed:
        raise HTTPException(403, "You don't have permission to create tow jobs.")

    customer = (body.customer_name or '').strip() or 'Walk-up'
    location = (body.pickup_location or '').strip() or 'Unknown location'
    service = (body.service_type or 'tow').lower().strip()
    valid_service = {'tow', 'jumpstart', 'lockout', 'tire_change', 'fuel_delivery',
                     'winch', 'recovery', 'impound'}
    if service not in valid_service:
        service = 'tow'

    quoted = None
    try:
        if body.quoted_price is not None:
            quoted = float(body.quoted_price)
            if quoted <= 0:
                quoted = None
    except Exception:
        quoted = None

    doc = {
        'id': str(uuid.uuid4()),
        'customer_name': customer,
        'customer_phone': (body.customer_phone or None),
        'pickup_location': location,
        'drop_location': (body.drop_location or None),
        'vehicle_description': (body.vehicle_description or None),
        'service_type': service,
        'status': 'pending',
        'quoted_price': quoted,
        'final_price': None,
        'photo_urls': [],
        'created_at': now_utc(),
        'updated_at': now_utc(),
        'created_by': user['id'],
        'created_by_name': user.get('name'),
        'created_via': 'voice_wizard',
        'tenant_id': user.get('tenant_id', 'founder'),
        'is_demo': False,
        'notes': (body.notes or None),
        'status_history': [{
            'status': 'pending',
            'at': now_utc().isoformat(),
            'by': user['email'],
            'note': 'Created via Hands-Free Voice Wizard',
        }],
    }
    await db.tow_jobs.insert_one(doc)
    logger.info(f"Voice wizard created job {doc['id']} for {customer} by {user['email']}")
    return {
        'id': doc['id'],
        'customer_name': customer,
        'service_type': service,
        'redirect': f"/wrecker/jobs/{doc['id']}",
    }


# ============================================================
# Mapbox config (public token exposed to frontend) - Slide 3 GPS promise
# ============================================================

MAPBOX_PUBLIC_TOKEN = os.environ.get('MAPBOX_PUBLIC_TOKEN', '').strip()


@api_router.get("/mapbox/config")
async def mapbox_config(user=Depends(get_current_user)):
    return {
        'configured': bool(MAPBOX_PUBLIC_TOKEN),
        'token': MAPBOX_PUBLIC_TOKEN,
        'default_style': 'mapbox://styles/mapbox/dark-v11',
        'truck_route_supported': bool(MAPBOX_PUBLIC_TOKEN),
    }

# ============================================================
# Notifications (Phase 2C) — SMS + Email surface
# ============================================================

class DispatchSMSIn(BaseModel):
    driver_id: str
    message: str

@api_router.post("/dispatch/sms")
async def send_dispatch_sms(body: DispatchSMSIn, user=Depends(require_role('fleet_admin', 'dispatcher', 'super_admin'))):
    """Admin/dispatcher sends an SMS to a specific driver."""
    if not body.message.strip():
        raise HTTPException(400, "Message cannot be empty.")
    driver = await db.drivers.find_one({'id': body.driver_id}, {'_id': 0})
    if not driver:
        raise HTTPException(404, "Driver not found")
    if not driver.get('phone'):
        raise HTTPException(400, f"Driver {driver.get('name')} has no phone number on file.")
    sender = user.get('name', 'Dispatch')
    sms_body = f"📩 {sender}: {body.message.strip()}\n\n— RoadBoss"
    result = await notify.send_sms(db, driver['phone'], sms_body, event_type='dispatch_sms', driver_id=driver['id'])
    # Also drop an in-app alert for visibility
    await db.alerts.insert_one(_make_doc({
        'type': 'dispatch_sms',
        'severity': 'info',
        'driver_id': driver['id'],
        'message': f"SMS to {driver.get('name', 'driver')}: {body.message.strip()[:160]}",
    }))
    # Phase 2G.2: also push the dispatch message to the driver's PWA (free, complements SMS)
    try:
        driver_user = await db.users.find_one({'email': driver.get('email')}, {'_id': 0, 'id': 1}) if driver.get('email') else None
        if driver_user and driver_user.get('id'):
            await push_notify.send_push_to_users(
                db,
                [driver_user['id']],
                title=f"📩 {sender}",
                body=body.message.strip()[:200],
                url='/driver',
                tag=f"dispatch-{driver['id']}",
                severity='info',
                event_type='dispatch_sms',
                event_ref_id=driver['id'],
            )
    except Exception as e:
        logger.warning(f"Dispatch push send failed: {e}")
    return result


# ============================================================
# Inbound SMS webhook (Phase 2C.2) — driver replies -> admin alert feed
# ============================================================

async def _process_inbound_sms(from_phone: str, body: str, message_sid: Optional[str], num_media: int = 0) -> Dict[str, Any]:
    """Common inbound SMS processor. Used by both the real Twilio webhook and the test endpoint."""
    norm_phone = notify.normalize_phone(from_phone) or from_phone
    body_clean = (body or '').strip()
    body_upper = body_clean.upper()

    # Match phone -> driver
    driver = None
    for candidate in [norm_phone, from_phone]:
        if candidate:
            d = await db.drivers.find_one({'phone': candidate}, {'_id': 0})
            if d:
                driver = d
                break
    # Fallback: match by user record (admin reply from their phone)
    user_match = None
    if not driver and norm_phone:
        user_match = await db.users.find_one({'phone': norm_phone}, {'_id': 0})

    sender_name = (driver or {}).get('name') or (user_match or {}).get('name') or norm_phone

    # Detect opt-out keywords (FMCSA / TCPA compliance)
    opt_out_keywords = {'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'}
    opt_in_keywords = {'START', 'YES', 'UNSTOP'}
    is_opt_out = body_upper in opt_out_keywords
    is_opt_in = body_upper in opt_in_keywords

    if is_opt_out:
        # Mark driver/user as opted out — they won't receive future SMS
        if driver:
            await db.drivers.update_one({'id': driver['id']}, {'$set': {'sms_opted_out': True, 'updated_at': now_utc().isoformat()}})
        if user_match:
            await db.users.update_one({'id': user_match['id']}, {'$set': {'sms_opted_out': True}})
    elif is_opt_in:
        if driver:
            await db.drivers.update_one({'id': driver['id']}, {'$set': {'sms_opted_out': False, 'updated_at': now_utc().isoformat()}})
        if user_match:
            await db.users.update_one({'id': user_match['id']}, {'$set': {'sms_opted_out': False}})

    # Audit log: store inbound message for visibility
    await db.notification_logs.insert_one({
        'id': str(uuid.uuid4()),
        'created_at': now_utc().isoformat(),
        'channel': 'sms_inbound',
        'event_type': 'opt_out' if is_opt_out else ('opt_in' if is_opt_in else 'driver_reply'),
        'driver_id': (driver or {}).get('id'),
        'from': norm_phone,
        'to': os.environ.get('TWILIO_FROM_NUMBER', '+18889446859'),
        'body': body_clean,
        'status': 'received',
        'provider_message_id': message_sid,
        'num_media': num_media,
    })

    # Create alert for admin visibility (skip if opt_out/opt_in keyword - those are noise)
    if not (is_opt_out or is_opt_in):
        severity = 'warning' if any(k in body_upper for k in ['HELP', 'EMERGENCY', '911', 'CRASH', 'BROKE', 'FUEL OUT', 'STUCK']) else 'info'
        await db.alerts.insert_one(_make_doc({
            'type': 'sms_reply',
            'severity': severity,
            'driver_id': (driver or {}).get('id'),
            'vehicle_id': (driver or {}).get('vehicle_id'),
            'message': f"📱 {sender_name}: {body_clean[:240]}",
            'meta': {'from_phone': norm_phone, 'inbound_sid': message_sid},
        }))
        # Phase 2G.2: push to admins so replies surface even when tab is closed
        try:
            await push_notify.send_push_to_admins(
                db,
                title=f"📱 Reply from {sender_name}",
                body=body_clean[:200] or '(empty message)',
                url='/app/notifications',
                tag=f"sms-reply-{norm_phone}",
                severity=severity,
                event_type='sms_reply',
                event_ref_id=message_sid,
            )
        except Exception as e:
            logger.warning(f"Inbound SMS push send failed: {e}")

    return {
        'matched_driver': bool(driver),
        'matched_user': bool(user_match),
        'sender_name': sender_name,
        'is_opt_out': is_opt_out,
        'is_opt_in': is_opt_in,
        'body': body_clean,
    }


@api_router.post("/webhooks/twilio/sms-inbound")
async def twilio_inbound_webhook(request: Request):
    """Twilio webhook target for inbound SMS. Configured in Twilio Console under
    Phone Numbers -> Manage -> Active Numbers -> +18889446859 -> 'A MESSAGE COMES IN'.

    Returns empty TwiML so Twilio knows we received it (we don't auto-reply by default).
    """
    # Twilio sends form-data, not JSON
    form = await request.form()
    from_phone = form.get('From', '')
    body = form.get('Body', '')
    message_sid = form.get('MessageSid')
    num_media = int(form.get('NumMedia', '0') or 0)

    # Validate Twilio signature (skip in test mode if header absent)
    twilio_sig = request.headers.get('X-Twilio-Signature')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    if twilio_sig and auth_token:
        try:
            from twilio.request_validator import RequestValidator
            validator = RequestValidator(auth_token)
            full_url = str(request.url)
            params = dict(form)
            if not validator.validate(full_url, params, twilio_sig):
                logger.warning(f"Twilio webhook signature invalid for {from_phone}")
                # Don't 403 — Twilio retries on 4xx and we'd amplify the issue. Log and accept.
        except Exception as e:
            logger.warning(f"Twilio signature validation error: {e}")

    await _process_inbound_sms(from_phone, body, message_sid, num_media)

    # Return empty TwiML response (acknowledges receipt; we don't auto-reply)
    twiml = '<?xml version="1.0" encoding="UTF-8"?><Response/>'
    return Response(content=twiml, media_type='application/xml')


class TestInboundSMSIn(BaseModel):
    from_phone: str
    body: str

@api_router.post("/test/sms-inbound")
async def test_inbound_sms(body: TestInboundSMSIn, user=Depends(require_role('fleet_admin', 'dispatcher', 'super_admin'))):
    """Manual test endpoint to simulate an inbound SMS without configuring the Twilio webhook.
    Useful for local development and end-to-end demos.
    """
    result = await _process_inbound_sms(
        from_phone=body.from_phone,
        body=body.body,
        message_sid=f'TEST{uuid.uuid4().hex[:24]}',
    )
    return {'ok': True, **result}


class FleetInviteIn(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    role: str = 'driver'  # driver | dispatcher | fleet_admin
    fleet_name: Optional[str] = None

@api_router.post("/admin/invite")
async def fleet_invite(body: FleetInviteIn, user=Depends(require_role('fleet_admin', 'super_admin'))):
    """Send a fleet invitation email with a one-click signup link."""
    if body.role not in ('driver', 'dispatcher', 'fleet_admin'):
        raise HTTPException(400, "Invalid role. Must be driver, dispatcher, or fleet_admin.")
    existing = await db.users.find_one({'email': body.email.lower()})
    if existing:
        raise HTTPException(400, f"{body.email} is already on the team.")
    invite_token = str(uuid.uuid4())
    invite_doc = _make_doc({
        'token': invite_token,
        'email': body.email.lower(),
        'name': body.name,
        'role': body.role,
        'fleet_name': body.fleet_name or 'RoadBoss Fleet',
        'invited_by_user_id': user['id'],
        'invited_by_name': user.get('name', 'A team member'),
        'expires_at': (now_utc() + timedelta(days=7)).isoformat(),
        'accepted': False,
    })
    await db.fleet_invites.insert_one(dict(invite_doc))
    base = os.environ.get('NOTIFY_BASE_URL', '')
    accept_url = f"{base}/accept-invite?token={invite_token}" if base else f"/accept-invite?token={invite_token}"
    tpl = notify.build_fleet_invite_email(
        inviter_name=user.get('name', 'A team member'),
        fleet_name=body.fleet_name or 'RoadBoss Fleet',
        accept_url=accept_url,
        role=body.role,
    )
    result = await notify.send_email(db, body.email.lower(), tpl['subject'], tpl['html'], tpl['plain'], event_type='fleet_invite', event_ref_id=invite_token)
    return {'ok': result.get('ok', False), 'invite_token': invite_token, 'expires_at': invite_doc['expires_at'], 'email_result': result}


@api_router.get("/admin/invites")
async def list_invites(user=Depends(require_role('fleet_admin', 'super_admin'))):
    rows = await db.fleet_invites.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return rows


# ============================================================
# SUPER ADMIN CONSOLE — only Mike (and other super_admins)
# Gives the platform owner god-mode over all users + impersonation.
# Every impersonation is logged so we have an audit trail.
# ============================================================

ALLOWED_ROLES = (
    'driver', 'dispatcher', 'fleet_admin', 'super_admin',
    'wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor',
)


@api_router.get("/admin/super/stats")
async def super_admin_stats(user=Depends(require_role('super_admin'))):
    """Top-level platform stats for Mike's super-admin dashboard."""
    counts = {
        'total_users': await db.users.count_documents({}),
        'super_admins': await db.users.count_documents({'role': 'super_admin'}),
        'fleet_admins': await db.users.count_documents({'role': 'fleet_admin'}),
        'wrecker_users': await db.users.count_documents({'role': {'$in': ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor']}}),
        'drivers': await db.users.count_documents({'role': 'driver'}),
        'tow_jobs': await db.tow_jobs.count_documents({}) if 'tow_jobs' in await db.list_collection_names() else 0,
        'investor_inquiries': await db.investor_inquiries.count_documents({}),
        'pending_invites': await db.fleet_invites.count_documents({'accepted': False}),
    }
    return counts


@api_router.get("/admin/super/users")
async def super_admin_list_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 200,
    user=Depends(require_role('super_admin')),
):
    """List ALL users across the platform with optional search / role filter."""
    flt: Dict[str, Any] = {}
    if role and role in ALLOWED_ROLES:
        flt['role'] = role
    if q:
        rx = {'$regex': q, '$options': 'i'}
        flt['$or'] = [{'email': rx}, {'name': rx}]
    rows = await db.users.find(flt, {'password_hash': 0, '_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 1000)))
    return {'count': len(rows), 'items': rows}


class SuperRoleUpdateIn(BaseModel):
    role: str


class SuperUserUpdateIn(BaseModel):
    """Patch user fields a super-admin is allowed to edit directly."""
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    company_name: Optional[str] = Field(None, max_length=160)
    phone: Optional[str] = Field(None, max_length=40)


@api_router.put("/admin/super/users/{user_id}")
async def super_admin_update_user(
    user_id: str,
    body: SuperUserUpdateIn,
    user=Depends(require_role('super_admin')),
):
    """Edit a user's name / email / company / phone from the Super Admin console.
    Email is normalised to lowercase and uniqueness is enforced.
    """
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(404, "User not found")
    update: Dict[str, Any] = {}
    if body.name is not None and body.name.strip() != (target.get('name') or ''):
        update['name'] = body.name.strip()
    if body.email is not None:
        new_email = str(body.email).lower().strip()
        if new_email != (target.get('email') or '').lower():
            clash = await db.users.find_one({'email': new_email, 'id': {'$ne': user_id}})
            if clash:
                raise HTTPException(400, f"Email {new_email} is already in use.")
            update['email'] = new_email
    if body.company_name is not None and body.company_name.strip() != (target.get('company_name') or ''):
        update['company_name'] = body.company_name.strip() or None
    if body.phone is not None and body.phone.strip() != (target.get('phone') or ''):
        update['phone'] = body.phone.strip() or None
    if not update:
        return {'ok': True, 'unchanged': True, 'user_id': user_id}
    update['updated_at'] = now_utc().isoformat()
    update['updated_by'] = user['id']
    await db.users.update_one({'id': user_id}, {'$set': update})
    logger.info(f"SUPER_ADMIN {user['email']} updated user {target.get('email')}: {list(update.keys())}")
    fresh = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    return {'ok': True, 'user': fresh}


@api_router.put("/admin/super/users/{user_id}/role")
async def super_admin_set_user_role(
    user_id: str,
    body: SuperRoleUpdateIn,
    user=Depends(require_role('super_admin')),
):
    """Promote / demote any user. Only super_admin can do this."""
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(ALLOWED_ROLES)}")
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get('role') == 'super_admin' and body.role != 'super_admin':
        # Defensive: don't accidentally demote the only super_admin
        sa_count = await db.users.count_documents({'role': 'super_admin'})
        if sa_count <= 1:
            raise HTTPException(400, "Cannot demote the last super_admin. Promote another user first.")
    await db.users.update_one({'id': user_id}, {'$set': {'role': body.role, 'role_updated_at': now_utc().isoformat(), 'role_updated_by': user['id']}})
    logger.info(f"SUPER_ADMIN {user['email']} changed role of {target['email']} from {target.get('role')} to {body.role}")
    return {'ok': True, 'user_id': user_id, 'new_role': body.role}


@api_router.post("/admin/super/impersonate/{user_id}")
async def super_admin_impersonate(user_id: str, user=Depends(require_role('super_admin'))):
    """
    Issue a JWT for the target user so the super-admin can 'log in as them'
    and fix data / verify a flow without knowing their password. Every event
    is recorded in the impersonation_log collection for audit.
    """
    target = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(404, "User not found")
    token = create_token(target['id'], target['email'], target['role'])
    await db.impersonation_log.insert_one({
        'id': str(uuid.uuid4()),
        'super_admin_id': user['id'],
        'super_admin_email': user['email'],
        'target_user_id': target['id'],
        'target_email': target['email'],
        'target_role': target.get('role'),
        'created_at': now_utc().isoformat(),
    })
    logger.warning(f"SUPER_ADMIN {user['email']} is now acting as {target['email']} ({target.get('role')})")
    return {'access_token': token, 'token_type': 'bearer', 'user': target}


class SuperInviteCompanyIn(BaseModel):
    """Quick-create a brand new wrecker / fleet company in one shot."""
    company_name: str = Field(..., min_length=2, max_length=160)
    admin_email: EmailStr
    admin_name: str = Field(..., min_length=2, max_length=120)
    admin_password: Optional[str] = Field(None, min_length=6, max_length=120)
    role: str = 'fleet_admin'  # fleet_admin | wrecker_supervisor


@api_router.post("/admin/super/invite-company")
async def super_admin_invite_company(body: SuperInviteCompanyIn, user=Depends(require_role('super_admin'))):
    """
    Create a new company admin user instantly.
    If a password is provided, the account is ready to go (Mike can text the
    creds to Kenny). Otherwise we generate a fleet-invite token and return the
    one-click magic link Mike can share via SMS / email.

    Multi-tenant: every new company gets a unique tenant_id so their real
    operational data (post-go-live tow jobs, invoices, etc.) is isolated
    from other companies and from the global 'demo' pool.
    """
    if body.role not in ('fleet_admin', 'wrecker_supervisor', 'super_admin'):
        raise HTTPException(400, "Role must be fleet_admin, wrecker_supervisor, or super_admin")
    existing = await db.users.find_one({'email': body.admin_email.lower()})
    if existing:
        raise HTTPException(400, f"{body.admin_email} already exists. Use the user's role page to promote them.")

    # Each company gets its own tenant_id — guarantees clean separation when
    # they create real records post-onboarding. Demo data uses tenant_id='demo'.
    new_tenant_id = f"tenant_{uuid.uuid4().hex[:12]}"

    base = os.environ.get('NOTIFY_BASE_URL', '')
    if body.admin_password:
        # Direct create — credentials ready for Mike to hand off
        new_user = {
            'id': str(uuid.uuid4()),
            'email': body.admin_email.lower(),
            'name': body.admin_name,
            'role': body.role,
            'password_hash': hash_password(body.admin_password),
            'company_name': body.company_name,
            'tenant_id': new_tenant_id,
            'is_demo': False,
            'created_at': now_utc().isoformat(),
            'created_by_super_admin': user['id'],
        }
        await db.users.insert_one(new_user)
        logger.info(f"SUPER_ADMIN {user['email']} created {body.role} {new_user['email']} for {body.company_name} (tenant={new_tenant_id})")
        return {
            'ok': True,
            'mode': 'created',
            'user_id': new_user['id'],
            'tenant_id': new_tenant_id,
            'login_url': f"{base}/login" if base else '/login',
            'email': new_user['email'],
            'instructions': f"Account ready. Hand off these credentials to {body.admin_name}.",
        }
    else:
        # Magic-link flow — invite token, expires in 7 days
        invite_token = str(uuid.uuid4())
        await db.fleet_invites.insert_one({
            'id': str(uuid.uuid4()),
            'token': invite_token,
            'email': body.admin_email.lower(),
            'name': body.admin_name,
            'role': body.role,
            'fleet_name': body.company_name,
            'tenant_id': new_tenant_id,
            'invited_by_user_id': user['id'],
            'invited_by_name': user.get('name', 'Mike Ward'),
            'expires_at': (now_utc() + timedelta(days=7)).isoformat(),
            'accepted': False,
            'created_at': now_utc().isoformat(),
        })
        accept_url = f"{base}/accept-invite?token={invite_token}" if base else f"/accept-invite?token={invite_token}"
        return {
            'ok': True,
            'mode': 'magic_link',
            'invite_token': invite_token,
            'tenant_id': new_tenant_id,
            'magic_link': accept_url,
            'expires_in_days': 7,
            'instructions': f"Send this magic link to {body.admin_name} via SMS or email. They'll set their own password on first click.",
        }


@api_router.get("/admin/super/impersonation-log")
async def super_admin_impersonation_log(limit: int = 100, user=Depends(require_role('super_admin'))):
    """View the audit trail of every impersonation event."""
    rows = await db.impersonation_log.find({}, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 500)))
    return {'count': len(rows), 'items': rows}


@api_router.post("/admin/super/promote-self")
async def super_admin_bootstrap(secret: Optional[str] = None, user=Depends(get_current_user)):
    """
    One-shot bootstrap: if NO super_admin exists yet, promote the calling user
    to super_admin. Only works once. After that, only an existing super_admin
    can promote others (via the role endpoint).
    """
    sa_count = await db.users.count_documents({'role': 'super_admin'})
    if sa_count > 0:
        raise HTTPException(403, "A super_admin already exists. Ask them to promote you.")
    await db.users.update_one({'id': user['id']}, {'$set': {'role': 'super_admin', 'role_updated_at': now_utc().isoformat()}})
    logger.warning(f"BOOTSTRAP: {user['email']} self-promoted to super_admin (no prior super_admin existed)")
    return {'ok': True, 'role': 'super_admin', 'user_id': user['id']}


@api_router.get("/admin/super/demo-status")
async def super_admin_demo_status(user=Depends(require_role('super_admin'))):
    """Quick health-check on demo data so the wipe button can show a counter.
    Counts records flagged as demo across the platform."""
    legacy_email_re = {'$regex': '@(highwaypilot\\.io|wrecker-logix\\.com)$', '$options': 'i'}
    demo_filter = {'$or': [{'is_demo': True}, {'tenant_id': 'demo'}]}
    user_demo_filter = {'$or': [{'is_demo': True}, {'tenant_id': 'demo'}, {'email': legacy_email_re}]}
    cols = await db.list_collection_names()
    counts = {
        'demo_users': await db.users.count_documents(user_demo_filter),
        'demo_drivers_collection': await db.drivers.count_documents(demo_filter) if 'drivers' in cols else 0,
        'tow_jobs': await db.tow_jobs.count_documents(demo_filter) if 'tow_jobs' in cols else 0,
        'impounds': (await db.impounds.count_documents(demo_filter) if 'impounds' in cols else 0)
                  + (await db.wrecker_impounds.count_documents(demo_filter) if 'wrecker_impounds' in cols else 0),
        'wiped': bool(await db.platform_settings.find_one({'key': 'demo_wiped'})),
    }
    return counts


@api_router.post("/admin/super/wipe-demo")
async def super_admin_wipe_demo(user=Depends(require_role('super_admin'))):
    """
    Nuke all auto-seeded demo data so Mike can hand the platform to real
    customers (Kenny, etc.) with a clean slate. Specifically:
      - Deletes every user whose email ends in @highwaypilot.io OR
        @wrecker-logix.com (the seeded demo domains) — except FOUNDER_EMAILS.
      - Deletes the matching driver records from `drivers` collection.
      - Empties tow_jobs / impounds / inspections / trips / vehicles seeded
        for the demo (anything tied to a demo email).
      - Persists a `demo_wiped` flag in `platform_settings` so the startup
        bootstrap will SKIP demo re-seeding from now on.
    Real customer data (users with custom emails, real tow jobs created via
    Kenny etc.) is NOT touched.
    """
    return await _do_wipe_demo(user)


@api_router.post("/admin/wipe-sample-data")
async def fleet_admin_wipe_sample_data(user=Depends(require_role('fleet_admin', 'wrecker_supervisor', 'super_admin'))):
    """Per-tenant escape hatch: lets a brand-new fleet_admin (Kenny etc.)
    clear the seeded sample tow jobs / impounds / drivers from THEIR view of
    the platform when they're ready to go live. Same underlying wipe — works
    because we're a single-tenant deployment per company. Idempotent."""
    return await _do_wipe_demo(user)


@api_router.get("/admin/sample-data-status")
async def sample_data_status(user=Depends(require_role('fleet_admin', 'wrecker_supervisor', 'super_admin'))):
    """For new fleet_admin / new-company super_admin onboarding banner: do
    they still see seeded sample rows? Returns booleans so the dashboard can
    render a 'Clear Sample Data' nudge until they've gone live."""
    flag = await db.platform_settings.find_one({'key': 'demo_wiped'})
    wiped = bool(flag and flag.get('value'))
    legacy_email_re = {'$regex': '@(highwaypilot\\.io|wrecker-logix\\.com)$', '$options': 'i'}
    demo_filter = {'$or': [{'is_demo': True}, {'tenant_id': 'demo'}]}
    user_demo_filter = {'$or': [{'is_demo': True}, {'tenant_id': 'demo'}, {'email': legacy_email_re}]}
    cols = await db.list_collection_names()
    sample_users = await db.users.count_documents(user_demo_filter)
    tow_jobs = await db.tow_jobs.count_documents(demo_filter) if 'tow_jobs' in cols else 0
    impounds = (await db.impounds.count_documents(demo_filter) if 'impounds' in cols else 0) \
             + (await db.wrecker_impounds.count_documents(demo_filter) if 'wrecker_impounds' in cols else 0)
    has_sample = (sample_users > 0) or (tow_jobs > 0) or (impounds > 0)
    return {
        'has_sample_data': has_sample and not wiped,
        'wiped': wiped,
        'sample_users': sample_users,
        'tow_jobs': tow_jobs,
        'impounds': impounds,
    }


async def _do_wipe_demo(user):
    """SAFE wipe: strictly deletes records flagged is_demo=True (or with the
    legacy seeded email domains). Real customer data — created post-wipe —
    never carries is_demo:true, so it's untouchable by this endpoint.

    Multi-tenant note: in the current single-tenant deployment, all demo data
    shares tenant_id='demo'. Any super_admin (founder OR a new-company owner
    promoted via invite) can call this. Their own real records carry their
    own tenant_id (NOT 'demo'), so a Kenny-side wipe would never touch
    Kenny's real tow jobs OR Mike's real tow jobs.
    """
    # Safety: never delete the active founder accounts even if their email
    # somehow lands in a demo-domain sweep (defensive).
    raw = os.environ.get('FOUNDER_EMAILS') or os.environ.get('FOUNDER_EMAIL') or 'mward5710@gmail.com,alexepoxyflooringllc@gmail.com'
    founder_emails = [e.strip().lower() for e in raw.split(',') if e.strip()]

    # Demo records are flagged is_demo:true. Legacy seeded users (pre-flag
    # rollout) match by domain. Both filters combined for backward-compat.
    legacy_email_re = {'$regex': '@(highwaypilot\\.io|wrecker-logix\\.com)$', '$options': 'i'}
    demo_filter = {
        '$or': [
            {'is_demo': True},
            {'tenant_id': 'demo'},
        ]
    }
    demo_user_filter = {
        '$and': [
            {'$or': [
                {'is_demo': True},
                {'tenant_id': 'demo'},
                {'email': legacy_email_re},
            ]},
            {'email': {'$nin': founder_emails}},
        ]
    }

    deleted = {
        'users': 0, 'drivers': 0, 'tow_jobs': 0, 'impounds': 0,
        'inspections': 0, 'trips': 0, 'vehicles': 0, 'fuel_tanks': 0,
        'motor_clubs': 0,
    }

    # Users — only seeded demo accounts
    try:
        r = await db.users.delete_many(demo_user_filter)
        deleted['users'] = r.deleted_count
    except Exception as e:
        logger.error(f'wipe-demo users delete failed: {e}')

    # Domain collections — strict is_demo:true filter
    domain_map = {
        'drivers': 'drivers',
        'inspections': 'inspections',
        'trips': 'trips',
        'vehicles': 'vehicles',
        'tow_jobs': 'tow_jobs',
        'impounds': 'impounds',           # legacy collection (pre-wrecker namespace)
        'wrecker_impounds': 'impounds',   # alias to same key in `deleted`
        'motor_clubs': 'motor_clubs',
        'wrecker_motor_clubs': 'motor_clubs',
        'fuel_tanks': 'fuel_tanks',
        'wrecker_fuel_tanks': 'fuel_tanks',
        'wrecker_fuel_transactions': 'fuel_tanks',
        'hos_logs': None,
        'trip_mileage': None,
        'maintenance': None,
        'alerts': None,
        'dashcam_events': None,
        'crash_events': None,
        'roadside_dispatches': None,
        'roadside_providers': None,
        'voice_log': None,
        'copilot_chats': None,
    }
    existing_cols = await db.list_collection_names()
    for col, key in domain_map.items():
        if col not in existing_cols:
            continue
        try:
            r = await db[col].delete_many(demo_filter)
            if key and key in deleted:
                deleted[key] += r.deleted_count
        except Exception as e:
            logger.error(f'wipe-demo {col} failed: {e}')

    # Persist the "wiped" flag so demo data won't auto-recreate on next boot
    await db.platform_settings.update_one(
        {'key': 'demo_wiped'},
        {'$set': {
            'key': 'demo_wiped',
            'value': True,
            'wiped_by': user['id'],
            'wiped_by_email': user['email'],
            'wiped_by_tenant': user.get('tenant_id'),
            'wiped_at': now_utc().isoformat(),
            'totals': deleted,
        }},
        upsert=True,
    )
    logger.warning(f"WIPE-DEMO {user['email']} ({user.get('role')}) wiped sample data: {deleted}")
    return {'ok': True, 'deleted': deleted}


@api_router.post("/admin/super/restore-demo")
async def super_admin_restore_demo(user=Depends(require_role('super_admin'))):
    """Undo the demo-wipe lock + reseed demo data immediately. For Mike if he
    changes his mind."""
    await db.platform_settings.delete_one({'key': 'demo_wiped'})
    try:
        await _seed_demo()
    except Exception as e:
        logger.error(f'restore-demo seed failed: {e}')
    try:
        await seed_wrecker_demo(db, hash_password)
    except Exception as e:
        logger.error(f'restore-demo wrecker seed failed: {e}')
    logger.warning(f"SUPER_ADMIN {user['email']} restored demo data")
    return {'ok': True}


@api_router.get("/me/hide-demo")
async def get_hide_demo(user=Depends(get_current_user)):
    """Personal stealth mode status. When ON, demo/sample records are filtered
    out of THIS user's list views (dispatch board, impound list, drivers,
    inspections) — but other users (potential customers viewing the platform)
    still see the demo so it doesn't look empty during a sales walkthrough."""
    return {'hide_demo_data': bool(user.get('hide_demo_data'))}


class HideDemoIn(BaseModel):
    enabled: bool


@api_router.put("/me/hide-demo")
async def set_hide_demo(body: HideDemoIn, user=Depends(get_current_user)):
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'hide_demo_data': bool(body.enabled), 'hide_demo_set_at': now_utc().isoformat()}}
    )
    logger.info(f"user {user['email']} set hide_demo_data={body.enabled}")
    return {'ok': True, 'hide_demo_data': bool(body.enabled)}


@api_router.get("/notifications/logs")
async def list_notification_logs(
    channel: Optional[str] = None,  # 'sms' | 'email' | None
    limit: int = 200,
    user=Depends(require_role('fleet_admin', 'dispatcher', 'super_admin')),
):
    q: Dict[str, Any] = {}
    if channel in ('sms', 'email'):
        q['channel'] = channel
    rows = await db.notification_logs.find(q, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 1000)))
    return rows


@api_router.get("/notifications/status")
async def notifications_status(user=Depends(get_current_user)):
    """Configuration status for SMS + Email providers. Used by Settings page + reminders."""
    twilio_ok = notify.is_twilio_configured()
    sendgrid_ok = notify.is_sendgrid_configured()
    twilio_phone = os.environ.get('TWILIO_FROM_NUMBER', '')
    is_toll_free = twilio_phone.startswith('+1800') or twilio_phone.startswith('+1888') or twilio_phone.startswith('+1877') or twilio_phone.startswith('+1866') or twilio_phone.startswith('+1855') or twilio_phone.startswith('+1844') or twilio_phone.startswith('+1833')
    return {
        'twilio': {
            'configured': twilio_ok,
            'from_number': twilio_phone if twilio_ok else None,
            'is_toll_free': is_toll_free if twilio_ok else False,
            'verification_required': is_toll_free if twilio_ok else False,
            'verification_url': 'https://console.twilio.com/us1/develop/sms/regulatory-compliance/toll-free-verification',
        },
        'sendgrid': {
            'configured': sendgrid_ok,
            'from_email': os.environ.get('SENDGRID_FROM_EMAIL') if sendgrid_ok else None,
            'from_name': os.environ.get('SENDGRID_FROM_NAME') if sendgrid_ok else None,
        },
    }


class HOSWarningTriggerIn(BaseModel):
    driver_id: str
    minutes_remaining: int

@api_router.post("/notifications/hos-warning")
async def trigger_hos_warning(body: HOSWarningTriggerIn, user=Depends(require_role('fleet_admin', 'dispatcher', 'super_admin'))):
    """Manual or automated trigger to warn driver+admin when HOS is running low."""
    driver = await db.drivers.find_one({'id': body.driver_id}, {'_id': 0})
    if not driver:
        raise HTTPException(404, "Driver not found")
    sms_body = (
        f"⏰ HOS WARNING — {driver.get('name', 'Driver')}\n"
        f"You have {body.minutes_remaining} minutes of drive time remaining.\n"
        f"Plan your next safe parking spot now."
    )
    results = []
    if driver.get('phone'):
        r = await notify.send_sms(db, driver['phone'], sms_body, event_type='hos_warning', driver_id=driver['id'])
        results.append({'recipient': 'driver', 'phone': driver['phone'], 'result': r})
    # Also alert fleet admins
    admins = await db.users.find({'role': {'$in': ['fleet_admin', 'super_admin']}, 'phone': {'$exists': True, '$ne': None}}, {'_id': 0, 'phone': 1, 'email': 1}).to_list(20)
    admin_msg = f"⏰ {driver.get('name', 'Driver')} has only {body.minutes_remaining} min HOS remaining. Coordinate next stop."
    for a in admins:
        if a.get('phone'):
            r = await notify.send_sms(db, a['phone'], admin_msg, event_type='hos_warning', driver_id=driver['id'])
            results.append({'recipient': 'admin', 'phone': a['phone'], 'result': r})
    return {'ok': True, 'sent': len(results), 'details': results}


# ============================================================
# Emergency Contacts — Phase 2G.3
# A DB-backed replacement for the NOTIFY_CRASH_CONTACTS env variable. Admins can add/edit/delete
# emergency contacts via the /app/settings UI. Crash alert pipeline reads from DB first, then
# falls back to the env variable for backward compatibility.
# ============================================================

class EmergencyContactIn(BaseModel):
    name: str
    phone: str
    role: Optional[str] = None  # e.g. "Safety Director", "Night Dispatch", "Spouse"
    notes: Optional[str] = None
    channels: Optional[List[str]] = None  # ["sms"] (future: "email","push")
    active: Optional[bool] = True


@api_router.get("/emergency-contacts")
async def list_emergency_contacts(user=Depends(require_role('fleet_admin', 'super_admin', 'dispatcher'))):
    rows = await db.emergency_contacts.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return rows


@api_router.post("/emergency-contacts")
async def create_emergency_contact(body: EmergencyContactIn, user=Depends(require_role('fleet_admin', 'super_admin'))):
    name = (body.name or '').strip()
    if not name:
        raise HTTPException(400, "Contact name is required.")
    normalized = notify.normalize_phone(body.phone)
    if not normalized:
        raise HTTPException(400, "Phone number must be a valid 10-digit US number or E.164 format.")
    # Reject duplicates by normalized phone for clarity
    existing = await db.emergency_contacts.find_one({'phone': normalized}, {'_id': 0})
    if existing:
        raise HTTPException(409, f"That phone is already on file as {existing.get('name')}.")
    channels = body.channels or ['sms']
    doc = _make_doc({
        'name': name,
        'phone': normalized,
        'role': (body.role or '').strip() or None,
        'notes': (body.notes or '').strip() or None,
        'channels': channels,
        'active': True if body.active is None else bool(body.active),
        'created_by': user.get('email'),
    })
    await db.emergency_contacts.insert_one(dict(doc))
    return doc


@api_router.put("/emergency-contacts/{contact_id}")
async def update_emergency_contact(contact_id: str, body: EmergencyContactIn, user=Depends(require_role('fleet_admin', 'super_admin'))):
    existing = await db.emergency_contacts.find_one({'id': contact_id}, {'_id': 0})
    if not existing:
        raise HTTPException(404, "Emergency contact not found")
    normalized = notify.normalize_phone(body.phone)
    if not normalized:
        raise HTTPException(400, "Phone number must be valid.")
    # If changing to a phone that another contact already has → block
    clash = await db.emergency_contacts.find_one({'phone': normalized, 'id': {'$ne': contact_id}}, {'_id': 0})
    if clash:
        raise HTTPException(409, f"That phone is already on file as {clash.get('name')}.")
    update = {
        'name': (body.name or existing.get('name') or '').strip(),
        'phone': normalized,
        'role': (body.role or '').strip() or None,
        'notes': (body.notes or '').strip() or None,
        'channels': body.channels or existing.get('channels') or ['sms'],
        'active': True if body.active is None else bool(body.active),
        'updated_at': now_utc().isoformat(),
        'updated_by': user.get('email'),
    }
    await db.emergency_contacts.update_one({'id': contact_id}, {'$set': update})
    merged = {**existing, **update}
    return merged


@api_router.delete("/emergency-contacts/{contact_id}")
async def delete_emergency_contact(contact_id: str, user=Depends(require_role('fleet_admin', 'super_admin'))):
    res = await db.emergency_contacts.delete_one({'id': contact_id})
    if not res.deleted_count:
        raise HTTPException(404, "Emergency contact not found")
    return {'ok': True}


async def _load_crash_contact_phones() -> List[str]:
    """Emergency crash contact phones — DB first, .env fallback for legacy deployments."""
    phones: List[str] = []
    try:
        rows = await db.emergency_contacts.find(
            {'active': {'$ne': False}, 'channels': {'$in': ['sms']}},
            {'_id': 0, 'phone': 1}
        ).to_list(500)
        for r in rows:
            p = (r.get('phone') or '').strip()
            if p and p not in phones:
                phones.append(p)
    except Exception as e:
        logger.warning(f"Emergency contacts DB read failed: {e}")
    # Always merge in legacy env-defined contacts so existing deployments don't lose coverage.
    contacts_env = os.environ.get('NOTIFY_CRASH_CONTACTS', '').strip()
    if contacts_env:
        for raw in contacts_env.split(','):
            p = (raw or '').strip()
            if not p:
                continue
            norm = notify.normalize_phone(p) or p
            if norm not in phones:
                phones.append(norm)
    return phones


# ============================================================
# Seed — implementations live in seed_data.py (Phase 2F refactor step 1)
# ============================================================

from seed_data import seed_demo as _seed_demo_impl, wipe_demo_collections as _wipe_demo_impl
import notifications as notify  # Phase 2C: SMS + Email dispatch
import push_notifications as push_notify  # Phase 2G.2: Web Push


# ============================================================
# Push Notifications — Phase 2G.2
# ============================================================

class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: Dict[str, str]
    user_agent: Optional[str] = None


class PushUnsubscribeIn(BaseModel):
    endpoint: str


class PushTestIn(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None


@api_router.get("/push/config")
async def push_config():
    """Public endpoint so clients can fetch the VAPID public key + enabled flag."""
    return {
        "enabled": push_notify.is_push_configured(),
        "public_key": push_notify.get_vapid_public_key(),
    }


@api_router.get("/push/status")
async def push_status(user=Depends(get_current_user)):
    subs = await push_notify.list_subscriptions_for_user(db, user['id'])
    return {
        "enabled": push_notify.is_push_configured(),
        "subscribed": len(subs) > 0,
        "device_count": len(subs),
    }


@api_router.post("/push/subscribe")
async def push_subscribe(body: PushSubscribeIn, user=Depends(get_current_user)):
    if not push_notify.is_push_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured on this server.")
    try:
        doc = await push_notify.save_subscription(
            db,
            user_id=user['id'],
            subscription={'endpoint': body.endpoint, 'keys': body.keys},
            user_agent=body.user_agent or '',
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "id": doc['id']}


@api_router.post("/push/unsubscribe")
async def push_unsubscribe(body: PushUnsubscribeIn, user=Depends(get_current_user)):
    removed = await push_notify.remove_subscription(db, endpoint=body.endpoint, user_id=user['id'])
    return {"ok": True, "removed": removed}


@api_router.post("/push/test")
async def push_test(body: PushTestIn, user=Depends(get_current_user)):
    """Send a test push to every device subscribed by the current user."""
    result = await push_notify.send_push_to_users(
        db,
        [user['id']],
        title=body.title or 'RoadBoss test push',
        body=body.body or 'If you see this, push alerts are wired up. Drive safe.',
        url='/driver/settings' if user.get('role') == 'driver' else '/app/notifications',
        tag='roadboss-test',
        severity='info',
        event_type='push_test',
    )
    return result


async def _seed_demo():
    """Thin wrapper: injects server-level deps into seed_data.seed_demo."""
    await _seed_demo_impl(
        db=db,
        now_utc=now_utc,
        hash_password=hash_password,
        build_blank_items=_build_blank_items,
        logger=logger,
    )


async def _wipe_demo_collections():
    await _wipe_demo_impl(db, logger)


@api_router.post("/seed")
async def seed(force: bool = False):
    """Seed demo data. ?force=true wipes and reseeds even if users exist."""
    user_count = await db.users.count_documents({})
    if user_count > 0 and not force:
        return {'ok': True, 'message': 'Already seeded. Pass ?force=true to wipe and reseed.', 'user_count': user_count}
    if force:
        await _wipe_demo_collections()
    await _seed_demo()
    return {'ok': True, 'message': 'Seed complete.', 'forced': force}

# ============================================================
# Mount
# ============================================================

# Mount Wrecker Mode router under /api/wrecker
_wrecker_router = build_wrecker_router(db, get_current_user, require_role, serialize_doc, notifications=notify)
# Mount Square OAuth integration under /api/wrecker/integrations/square
_square_router = build_square_router(db, get_current_user, require_role)
_wrecker_router.include_router(_square_router)
api_router.include_router(_wrecker_router)
# Mount the PUBLIC (no-auth) pay-link router so customers can pay via SMS/email link
_public_pay_router = build_public_pay_router(db)
api_router.include_router(_public_pay_router)
# Truck-aware navigation (free OSRM + hazard overlay; flips to live Mapbox when MAPBOX_TOKEN is set)
register_navigation_routes(
    api_router,
    db,
    require_role('wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'),
    now_utc,
)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    """Kick off heavy work (seeding, index creation) in a background task so the
    HTTP server starts accepting traffic IMMEDIATELY. This prevents Kubernetes
    startup-probe timeouts on production Atlas (which has higher network
    latency than local sandbox Mongo)."""
    import asyncio as _asyncio

    async def _bootstrap():
        # Auto-seed on first boot for demo readiness — UNLESS the founder has
        # explicitly wiped demo data via /admin/super/wipe-demo. We respect
        # that decision so Mike never sees ghost demo accounts come back after
        # he hands the platform to Kenny.
        demo_wiped = False
        try:
            flag = await db.platform_settings.find_one({'key': 'demo_wiped'})
            demo_wiped = bool(flag and flag.get('value'))
        except Exception:
            pass
        try:
            user_count = await db.users.count_documents({})
            if user_count == 0 and not demo_wiped:
                try:
                    await _seed_demo()
                    logger.info('Auto-seeded demo data on startup')
                except Exception as e:
                    logger.error(f'Seed failed: {e}')
            elif demo_wiped:
                logger.info('Demo data wiped flag set — skipping demo seed.')
        except Exception as e:
            logger.error(f'User count check failed (non-fatal): {e}')
        # Always ensure Wrecker Mode demo data exists (idempotent) — UNLESS wiped
        try:
            if not demo_wiped:
                result = await seed_wrecker_demo(db, hash_password)
                logger.info(f'Wrecker seed: {result}')
            else:
                logger.info('Demo wiped — skipping wrecker demo seed.')
        except Exception as e:
            logger.error(f'Wrecker seed failed: {e}')

        # ONE-TIME BACKFILL — retroactively tag legacy seeded records as
        # is_demo:true so the per-user stealth filter and global wipe button
        # know what's safe to filter/delete. Runs every boot, only updates
        # records that don't yet have the flag. Safe because the seeded
        # collections (tow_jobs, impounds, drivers, motor_clubs, fuel_tanks,
        # inspections that were created by 'seed') are 100% demo at this
        # stage of the project — Mike hasn't onboarded real customers yet.
        try:
            cols = await db.list_collection_names()
            for col in ['tow_jobs', 'impounds', 'drivers', 'motor_clubs',
                        'fuel_tanks', 'fuel_transactions', 'vehicles']:
                if col in cols:
                    r = await db[col].update_many(
                        {'is_demo': {'$exists': False}},
                        {'$set': {'is_demo': True, 'tenant_id': 'demo'}}
                    )
                    if r.modified_count:
                        logger.info(f'Backfilled is_demo on {r.modified_count} {col}')
            # Inspections + users — only tag those obviously seeded (linked to
            # demo emails so we don't mis-tag any real run Mike has already
            # logged via Co-Pilot voice).
            if 'inspections' in cols:
                demo_drivers = await db.drivers.distinct('id', {'is_demo': True})
                if demo_drivers:
                    r = await db.inspections.update_many(
                        {'driver_id': {'$in': demo_drivers}, 'is_demo': {'$exists': False}},
                        {'$set': {'is_demo': True, 'tenant_id': 'demo'}}
                    )
                    if r.modified_count:
                        logger.info(f'Backfilled is_demo on {r.modified_count} inspections')
            # Users with @wrecker-logix.com / @highwaypilot.io emails are seeded demos
            r = await db.users.update_many(
                {'email': {'$regex': '@(highwaypilot\\.io|wrecker-logix\\.com)$', '$options': 'i'},
                 'is_demo': {'$exists': False}},
                {'$set': {'is_demo': True, 'tenant_id': 'demo'}}
            )
            if r.modified_count:
                logger.info(f'Backfilled is_demo on {r.modified_count} users')
        except Exception as e:
            logger.error(f'is_demo backfill failed (non-fatal): {e}')
        # FOUNDER BOOTSTRAP — guarantees Mike (or whoever owns FOUNDER_EMAILS)
        # can always log in to production as super_admin even if the DB was
        # wiped, migrated, or freshly deployed. Idempotent: creates if missing,
        # promotes to super_admin + resets password if the env vars change.
        #
        # Mike's reality: he runs multiple LLCs (Alex Epoxy Flooring, RoadBoss
        # Enterprise, etc) — each w/ its own corporate gmail. We want ALL of
        # them to be super_admin keys so he's never locked out depending on
        # which inbox he's in. Comma-separate emails in FOUNDER_EMAILS.
        try:
            # Back-compat: support old FOUNDER_EMAIL singular var too.
            raw = os.environ.get('FOUNDER_EMAILS') or os.environ.get('FOUNDER_EMAIL') or 'mward5710@gmail.com,alexepoxyflooringllc@gmail.com'
            founder_emails = [e.strip().lower() for e in raw.split(',') if e.strip()]
            founder_password = os.environ.get('FOUNDER_PASSWORD', 'HighwayPilot2026!')
            founder_name = os.environ.get('FOUNDER_NAME', 'Mike Ward')
            lock_active = os.environ.get('FOUNDER_LOCK') == '1'
            for fe in founder_emails:
                if not fe or not founder_password:
                    continue
                existing = await db.users.find_one({'email': fe})
                if not existing:
                    new_user = {
                        'id': str(uuid.uuid4()),
                        'email': fe,
                        'name': founder_name,
                        'role': 'super_admin',
                        'password_hash': hash_password(founder_password),
                        'created_at': now_utc().isoformat(),
                    }
                    await db.users.insert_one(new_user)
                    logger.info(f'Founder bootstrap: created super_admin {fe}')
                else:
                    if not lock_active:
                        await db.users.update_one(
                            {'email': fe},
                            {'$set': {
                                'role': 'super_admin',
                                'password_hash': hash_password(founder_password),
                            }}
                        )
                        logger.info(f'Founder bootstrap: synced super_admin role + password for {fe}')
                    elif existing.get('role') != 'super_admin':
                        await db.users.update_one(
                            {'email': fe},
                            {'$set': {'role': 'super_admin'}}
                        )
                        logger.info(f'Founder bootstrap: promoted {fe} to super_admin (lock active)')
        except Exception as e:
            logger.error(f'Founder bootstrap failed (non-fatal): {e}')

        # FOUNDER DRIVER BOOTSTRAP — Mike asked to appear as an available
        # driver in the dispatch rotation. His super_admin login stays
        # super_admin (can't be both); this is a separate wrecker_operator
        # user record so he shows up in the Drivers list and can be
        # dispatched on jobs. Idempotent — only creates once.
        try:
            driver_email = os.environ.get('FOUNDER_DRIVER_EMAIL', 'michael.ward@wrecker-logix.com').lower().strip()
            driver_name = os.environ.get('FOUNDER_DRIVER_NAME', 'Michael Ward')
            driver_password = os.environ.get('FOUNDER_DRIVER_PASSWORD', 'HighwayPilot2026!Driver')
            driver_truck = os.environ.get('FOUNDER_DRIVER_TRUCK', '1')
            existing_drv = await db.users.find_one({'email': driver_email})
            if not existing_drv:
                drv_doc = {
                    'id': str(uuid.uuid4()),
                    'email': driver_email,
                    'name': driver_name,
                    'role': 'wrecker_operator',
                    'password_hash': hash_password(driver_password),
                    'created_at': now_utc().isoformat(),
                    'tenant_id': 'default',
                    'on_duty': True,
                    'rotation_rank': 1,
                    'rotation_order': 1,
                    'truck_number': driver_truck,
                    'is_demo': False,
                    'created_via': 'founder_driver_bootstrap',
                }
                await db.users.insert_one(drv_doc)
                logger.info(f'Founder driver bootstrap: created wrecker_operator {driver_email} ({driver_name})')
            else:
                # Make sure the driver record is healthy + visible in rotation.
                # We don't overwrite existing rotation rank if dispatch has
                # already configured one — only fix obvious gaps.
                fixups = {}
                if existing_drv.get('role') != 'wrecker_operator':
                    fixups['role'] = 'wrecker_operator'
                if existing_drv.get('name') != driver_name:
                    fixups['name'] = driver_name
                if existing_drv.get('on_duty') is None:
                    fixups['on_duty'] = True
                if existing_drv.get('rotation_rank') in (None, 0):
                    fixups['rotation_rank'] = 1
                    fixups['rotation_order'] = 1
                if existing_drv.get('tenant_id') in (None, ''):
                    fixups['tenant_id'] = 'default'
                if fixups:
                    await db.users.update_one({'email': driver_email}, {'$set': fixups})
                    logger.info(f'Founder driver bootstrap: synced fields {list(fixups.keys())} for {driver_email}')
        except Exception as e:
            logger.error(f'Founder driver bootstrap failed (non-fatal): {e}')
        # Indexes for OAuth state cleanup + tenant_integrations uniqueness
        try:
            await db.square_oauth_states.create_index('expires_at', expireAfterSeconds=0)
            await db.square_oauth_states.create_index('state', unique=True)
            await db.tenant_integrations.create_index(
                [('tenant_id', 1), ('provider', 1)], unique=True
            )
            # Public pay-link indexes (token unique + auto-expire after 30 days)
            await db.tow_pay_links.create_index('token', unique=True)
            await db.tow_pay_links.create_index('expires_at', expireAfterSeconds=0)
            await db.tow_pay_links.create_index('job_id')
        except Exception as e:
            logger.error(f'Integration index setup failed: {e}')
        logger.info('Startup bootstrap complete')

    # Fire-and-forget — does NOT block FastAPI from accepting connections
    _asyncio.create_task(_bootstrap())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
