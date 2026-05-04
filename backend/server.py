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
JWT_EXP_HOURS = 24 * 14  # 14 days

app = FastAPI(title="Highway Pilot API", version="0.1.0")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

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
    return await _list('drivers')

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
        session = _stripe.checkout.Session.create(
            mode='subscription',
            customer=customer_id,
            line_items=[line_item],
            subscription_data={'trial_period_days': STRIPE_TRIAL_DAYS, 'metadata': {'user_id': user['id'], 'plan_key': body.plan_key}},
            success_url=success,
            cancel_url=cancel,
            allow_promotion_codes=True,
            metadata={'user_id': user['id'], 'plan_key': body.plan_key, 'quantity': str(qty)},
        )
    except Exception as e:
        raise HTTPException(500, f"Checkout creation failed: {e}")
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
    return {'received': True}


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
    'tractor': [
        {'key': 'service_brakes', 'label': 'Service Brakes'},
        {'key': 'parking_brake', 'label': 'Parking Brake'},
        {'key': 'steering', 'label': 'Steering Mechanism'},
        {'key': 'lights_reflectors', 'label': 'Lights and Reflectors'},
        {'key': 'tires', 'label': 'Tires'},
        {'key': 'wheels_rims', 'label': 'Wheels and Rims'},
        {'key': 'mirrors', 'label': 'Mirrors'},
        {'key': 'windshield_wipers', 'label': 'Windshield and Wipers'},
        {'key': 'horn', 'label': 'Horn'},
        {'key': 'coupling', 'label': 'Coupling Devices and Fifth Wheel'},
        {'key': 'fluid_leaks', 'label': 'Fluid Leaks (oil, coolant, fuel)'},
        {'key': 'fluid_levels', 'label': 'Fluid Levels (oil, coolant, washer)'},
        {'key': 'air_brakes', 'label': 'Air Pressure and Air Lines'},
        {'key': 'suspension', 'label': 'Suspension'},
        {'key': 'exhaust', 'label': 'Exhaust System'},
        {'key': 'frame_body', 'label': 'Frame, Body, and Doors'},
        {'key': 'emergency_equipment', 'label': 'Emergency Equipment (Triangles, Fire Extinguisher, Spare Fuses)'},
        {'key': 'seat_belt', 'label': 'Seat Belt'},
    ],
    'trailer': [
        {'key': 'trailer_brakes', 'label': 'Trailer Brakes'},
        {'key': 'trailer_lights', 'label': 'Trailer Lights and Reflectors'},
        {'key': 'trailer_tires', 'label': 'Trailer Tires'},
        {'key': 'trailer_wheels', 'label': 'Trailer Wheels and Rims'},
        {'key': 'trailer_coupling', 'label': 'Coupling (King Pin, Apron, Hooks)'},
        {'key': 'trailer_doors', 'label': 'Doors, Hinges, Latches'},
        {'key': 'trailer_frame', 'label': 'Frame and Body'},
        {'key': 'trailer_suspension', 'label': 'Suspension and Air Lines'},
        {'key': 'trailer_load', 'label': 'Load Securement'},
    ],
}


def _build_blank_items() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for section, rows in DVIR_TEMPLATE.items():
        for row in rows:
            items.append({
                'section': section,
                'key': row['key'],
                'label': row['label'],
                'status': 'pending',  # pending | pass | defect | na
                'note': None,
                'updated_at': None,
            })
    return items


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
    status: str  # pass | defect | na
    note: Optional[str] = None


class InspectionCertifyIn(BaseModel):
    no_defects: bool
    signature: str


@api_router.get("/inspections/template")
async def get_inspection_template(user=Depends(get_current_user)):
    return {'template': DVIR_TEMPLATE}


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
    rows = await db.inspections.find(query, {'_id': 0}).sort('created_at', -1).to_list(max(1, min(limit, 200)))
    return rows


@api_router.post("/inspections")
async def create_inspection(body: InspectionCreateIn, user=Depends(get_current_user)):
    if user.get('role') != 'driver':
        raise HTTPException(403, "Only drivers can start a DVIR inspection.")
    driver = await _get_my_driver(user['email'])
    if not driver:
        raise HTTPException(404, "Driver record not found.")
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
    if body.status not in ('pass', 'defect', 'na'):
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
            item['status'] = body.status
            item['note'] = body.note
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
- NEVER tell the driver to look at, tap, or read the screen while driving.
- All answers must be designed to be HEARD, not seen.
- If something requires the screen (e.g., signing a document), say so but suggest doing it at the next safe stop.
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
- start_inspection — args: {"inspection_type":"pre_trip"|"post_trip"}
  Use when: "start my pre-trip", "begin pre-trip inspection", "pre trip", "post-trip", "DVIR", "vehicle inspection"
- dispatch_roadside — args: {"service_type":"tire"|"tow"|"jumpstart"|"fuel"|"mechanical"|"lockout"|"other","description":"<short desc>"}
  Use when: "I need a tire fixed", "I broke down", "need a tow", "send a wrecker", "I'm out of fuel", "battery's dead", "locked out", "something broke", "need roadside assistance"
- send_sms — args: {"recipient":"dispatch"|"admin"|"fleet_admin"|"<person_name>","message":"<exact message to send>"}
  Use when driver wants to send an SMS hands-free: "text dispatch I'm 30 minutes late", "message my admin I picked up the load", "tell Sarah I'm at the pickup", "send a text to fleet that I need to fuel up", "let dispatch know I'm rolling".
  recipient values:
    - "dispatch" or "admin" or "fleet_admin" -> first available fleet admin
    - First name like "Sarah" -> fuzzy-matched to a fleet user by name
    - Use "admin" as the safe fallback if unsure
  IMPORTANT: Only send when the driver clearly states the message content. If unclear, ask "What do you want me to text them?" first.

Rules for actions:
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
<<<ACTION:{"type":"start_inspection","args":{"inspection_type":"pre_trip"}}>>>"

Driver: "What's my next destination?"
You: "Memphis, boss. About four hundred miles out." (no marker — informational only)

SIGN-OFF
- End assertive actions with a brief confirmation ("Logged it." "Done." "Rolling.").
- For safety-critical replies, end with "Stay safe out there.\""""


def _build_driver_context(user: Dict[str, Any], driver: Optional[Dict[str, Any]],
                          active_trip: Optional[Dict[str, Any]],
                          vehicle: Optional[Dict[str, Any]],
                          recent_alerts: List[Dict[str, Any]]) -> str:
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
    lines.append("=== END CONTEXT ===")
    return "\n".join(lines)


class CopilotChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None


# Pattern matches <<<ACTION:{...}>>> at the end of an LLM reply (DOTALL allows JSON across lines)
_ACTION_MARKER_RE = re.compile(r'<<<\s*ACTION\s*:\s*(\{.*?\})\s*>>>', re.DOTALL)


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
            result.update({'executed': True, 'new_status': new_status})
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
            inspection = await _create_blank_inspection(driver, insp_type)
            result.update({
                'executed': True,
                'inspection_id': inspection['id'],
                'inspection_type': insp_type,
                'redirect': f"/driver/inspection/{inspection['id']}",
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

        # Unknown action — silently ignore
        result['error'] = f"Unknown action type: {action_type}"
        return result
    except Exception as e:
        logger.error(f"Action execution failed ({action_type}): {e}")
        result['error'] = str(e)
        return result


async def _parse_and_execute_action(reply_text: str, user: Dict[str, Any],
                                      driver: Optional[Dict[str, Any]]):
    """Strip <<<ACTION:{...}>>> from the reply, execute it, return (clean_text, action_result_or_None)."""
    import json as _json
    if not reply_text:
        return reply_text, None
    m = _ACTION_MARKER_RE.search(reply_text)
    if not m:
        return reply_text.strip(), None
    raw_json = m.group(1)
    cleaned = (reply_text[:m.start()] + reply_text[m.end():]).strip()
    try:
        action = _json.loads(raw_json)
    except Exception as e:
        logger.warning(f"Co-Pilot emitted malformed ACTION marker: {raw_json!r} ({e})")
        return cleaned, {'executed': False, 'error': 'malformed_action_json'}
    result = await _execute_copilot_action(action, user, driver)
    return cleaned, result


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

    # Build live context
    driver = await _get_my_driver(user['email']) if user.get('role') == 'driver' else None
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

    # Persist user turn first
    user_doc = {
        'id': str(uuid.uuid4()),
        'session_id': session_id,
        'user_id': user['id'],
        'role': 'user',
        'content': msg_text,
        'created_at': now_utc().isoformat(),
    }
    await db.copilot_chats.insert_one(user_doc)

    # Lazy import so server still boots if package missing
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.error(f"emergentintegrations import failed: {e}")
        raise HTTPException(500, "Co-Pilot AI library not available.")

    system_prompt = COPILOT_SYSTEM_BASE + _build_driver_context(user, driver, active_trip, vehicle, recent_alerts)

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model(COPILOT_MODEL_PROVIDER, COPILOT_MODEL_NAME)

        # Replay short conversational history (last 6 turns) so context survives across calls
        history = await db.copilot_chats.find(
            {'session_id': session_id, 'user_id': user['id'], 'id': {'$ne': user_doc['id']}},
            {'_id': 0},
        ).sort('created_at', -1).to_list(6)
        history.reverse()
        prior_text = ""
        if history:
            transcript_lines = []
            for h in history:
                speaker = "Driver" if h.get('role') == 'user' else "You"
                transcript_lines.append(f"{speaker}: {h.get('content', '')}")
            prior_text = "\n\nRecent conversation so far (oldest first):\n" + "\n".join(transcript_lines) + "\n\n"

        composed = prior_text + f"Driver just said: {msg_text}"
        reply = await chat.send_message(UserMessage(text=composed))
        reply_text = (reply or '').strip()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Copilot LLM error: {e}")
        raise HTTPException(502, "Co-Pilot is having trouble reaching the brain. Try again in a moment.")

    # Parse and execute any ACTION marker emitted by the model
    spoken_text, action_result = await _parse_and_execute_action(reply_text, user, driver)

    # Persist assistant turn (clean spoken text only)
    await db.copilot_chats.insert_one({
        'id': str(uuid.uuid4()),
        'session_id': session_id,
        'user_id': user['id'],
        'role': 'assistant',
        'content': spoken_text,
        'action': action_result,
        'model': f"{COPILOT_MODEL_PROVIDER}/{COPILOT_MODEL_NAME}",
        'created_at': now_utc().isoformat(),
    })

    return {
        'reply': spoken_text,
        'action': action_result,
        'session_id': session_id,
        'model': f"{COPILOT_MODEL_PROVIDER}/{COPILOT_MODEL_NAME}",
    }


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
    # Auto-seed on first boot for demo readiness
    user_count = await db.users.count_documents({})
    if user_count == 0:
        try:
            await _seed_demo()
            logger.info('Auto-seeded demo data on startup')
        except Exception as e:
            logger.error(f'Seed failed: {e}')

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
