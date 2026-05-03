from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
async def list_dashcam(user=Depends(get_current_user)):
    return await _list('dashcam_events', limit=200)

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
    # Until email service is wired in Stage 3, return token in dev for testing.
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
    {'key': 'owner_op', 'name': 'Owner-Operator', 'description': 'For solo owner-operators on the road.',
     'amount_cents': 2900, 'interval': 'month',
     'features': ['1 driver seat', 'Hands-free voice OS', 'HOS countdown + IFTA mileage', 'Maintenance reminders', 'Driver PWA + personal dashboard']},
    {'key': 'small_fleet', 'name': 'Small Fleet', 'description': 'For fleets of up to 10 trucks.',
     'amount_cents': 9900, 'interval': 'month',
     'features': ['Up to 10 driver seats', 'Everything in Owner-Op', 'Fleet command center', 'Dashcam events feed', 'Roadside assistance dispatch']},
    {'key': 'mid_fleet', 'name': 'Mid Fleet', 'description': 'For fleets of 11-50 trucks.',
     'amount_cents': 29900, 'interval': 'month',
     'features': ['Up to 50 driver seats', 'Everything in Small Fleet', 'AI Copilot for dispatch', 'CB Talker network access', 'Priority support']},
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
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None

@api_router.post("/stripe/checkout")
async def create_checkout(body: CheckoutIn, user=Depends(get_current_user)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(400, "Stripe is not configured")
    plan = next((p for p in PLAN_CATALOG if p['key'] == body.plan_key), None)
    if not plan:
        raise HTTPException(400, "Unknown plan")
    rec = await db.stripe_plans.find_one({'key': body.plan_key})
    if not rec or not rec.get('price_id'):
        await _ensure_stripe_prices()
        rec = await db.stripe_plans.find_one({'key': body.plan_key})
    if not rec or not rec.get('price_id'):
        raise HTTPException(500, "Could not initialize Stripe price")
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
        session = _stripe.checkout.Session.create(
            mode='subscription',
            customer=customer_id,
            line_items=[{'price': rec['price_id'], 'quantity': 1}],
            subscription_data={'trial_period_days': STRIPE_TRIAL_DAYS, 'metadata': {'user_id': user['id'], 'plan_key': body.plan_key}},
            success_url=success,
            cancel_url=cancel,
            allow_promotion_codes=True,
            metadata={'user_id': user['id'], 'plan_key': body.plan_key},
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
# Seed (idempotent) - run via GET /api/seed
# ============================================================

@api_router.post("/seed")
async def seed():
    # Only seed if no users exist
    user_count = await db.users.count_documents({})
    if user_count > 0:
        return {'ok': True, 'message': 'Already seeded.', 'user_count': user_count}

    await _seed_demo()
    return {'ok': True, 'message': 'Seed complete.'}

async def _seed_demo():
    # Users
    users = [
        {'name': 'Mike Ward (Founder)', 'email': 'super_admin@highwaypilot.io', 'role': 'super_admin'},
        {'name': 'Sarah Chen (Fleet Admin)', 'email': 'fleet_admin@highwaypilot.io', 'role': 'fleet_admin'},
        {'name': 'Diego Ruiz (Driver)', 'email': 'driver@highwaypilot.io', 'role': 'driver'},
    ]
    for u in users:
        u_doc = {
            'id': str(uuid.uuid4()),
            'email': u['email'],
            'name': u['name'],
            'role': u['role'],
            'password_hash': hash_password('HighwayPilot2026!'),
            'created_at': now_utc().isoformat(),
        }
        await db.users.insert_one(u_doc)

    # Vehicles
    vehicle_specs = [
        {'name': 'Truck 101', 'make': 'Peterbilt', 'model': '579', 'year': 2022, 'plate': 'TX-7732', 'odometer': 184500},
        {'name': 'Truck 102', 'make': 'Kenworth', 'model': 'T680', 'year': 2021, 'plate': 'TX-9914', 'odometer': 312800},
        {'name': 'Truck 103', 'make': 'Freightliner', 'model': 'Cascadia', 'year': 2023, 'plate': 'TX-2210', 'odometer': 88200},
        {'name': 'Truck 104', 'make': 'Volvo', 'model': 'VNL 860', 'year': 2020, 'plate': 'TX-4419', 'odometer': 415200},
        {'name': 'Truck 105', 'make': 'Mack', 'model': 'Anthem', 'year': 2024, 'plate': 'TX-8800', 'odometer': 22100},
    ]
    vehicles = []
    for v in vehicle_specs:
        doc = _make_doc({**v, 'status': 'active', 'vin': '1FUJGLD5' + str(uuid.uuid4().int)[:9]})
        await db.vehicles.insert_one(doc)
        vehicles.append(doc)

    # Drivers (with positions across central/eastern US)
    driver_specs = [
        {'name': 'Diego Ruiz', 'email': 'driver@highwaypilot.io', 'phone': '+1-555-0101', 'license_state': 'TX', 'license_number': 'DL-7733-A', 'home_terminal': 'Dallas, TX', 'status': 'driving', 'lat': 32.7767, 'lng': -96.7970, 'hos_remaining_minutes': 235, 'avatar_color': '#22d3ee'},
        {'name': 'Marcus Bell', 'email': 'marcus@highwaypilot.io', 'phone': '+1-555-0102', 'license_state': 'TN', 'license_number': 'DL-1102-B', 'home_terminal': 'Memphis, TN', 'status': 'on_duty', 'lat': 35.1495, 'lng': -90.0490, 'hos_remaining_minutes': 480, 'avatar_color': '#f59e0b'},
        {'name': 'Aaliyah Johnson', 'email': 'aaliyah@highwaypilot.io', 'phone': '+1-555-0103', 'license_state': 'GA', 'license_number': 'DL-9921-C', 'home_terminal': 'Atlanta, GA', 'status': 'driving', 'lat': 33.7490, 'lng': -84.3880, 'hos_remaining_minutes': 75, 'avatar_color': '#ef4444'},
        {'name': 'Tyler Brooks', 'email': 'tyler@highwaypilot.io', 'phone': '+1-555-0104', 'license_state': 'OH', 'license_number': 'DL-3318-D', 'home_terminal': 'Columbus, OH', 'status': 'sleeper', 'lat': 39.9612, 'lng': -82.9988, 'hos_remaining_minutes': 660, 'avatar_color': '#a855f7'},
        {'name': 'Rosa Delgado', 'email': 'rosa@highwaypilot.io', 'phone': '+1-555-0105', 'license_state': 'AZ', 'license_number': 'DL-5550-E', 'home_terminal': 'Phoenix, AZ', 'status': 'off_duty', 'lat': 33.4484, 'lng': -112.0740, 'hos_remaining_minutes': 660, 'avatar_color': '#10b981'},
    ]
    drivers = []
    for i, d in enumerate(driver_specs):
        doc = _make_doc({**d, 'vehicle_id': vehicles[i]['id']})
        await db.drivers.insert_one(doc)
        drivers.append(doc)

    # Trips
    trip_specs = [
        {'driver_id': drivers[0]['id'], 'vehicle_id': vehicles[0]['id'], 'origin': 'Dallas, TX', 'destination': 'Memphis, TN', 'miles': 452.7, 'status': 'active'},
        {'driver_id': drivers[1]['id'], 'vehicle_id': vehicles[1]['id'], 'origin': 'Memphis, TN', 'destination': 'Nashville, TN', 'miles': 211.4, 'status': 'completed'},
        {'driver_id': drivers[2]['id'], 'vehicle_id': vehicles[2]['id'], 'origin': 'Atlanta, GA', 'destination': 'Charlotte, NC', 'miles': 244.8, 'status': 'active'},
        {'driver_id': drivers[0]['id'], 'vehicle_id': vehicles[0]['id'], 'origin': 'Houston, TX', 'destination': 'Dallas, TX', 'miles': 239.0, 'status': 'completed'},
        {'driver_id': drivers[3]['id'], 'vehicle_id': vehicles[3]['id'], 'origin': 'Columbus, OH', 'destination': 'Pittsburgh, PA', 'miles': 185.3, 'status': 'planned'},
        {'driver_id': drivers[4]['id'], 'vehicle_id': vehicles[4]['id'], 'origin': 'Phoenix, AZ', 'destination': 'Albuquerque, NM', 'miles': 419.2, 'status': 'completed'},
        {'driver_id': drivers[1]['id'], 'vehicle_id': vehicles[1]['id'], 'origin': 'Nashville, TN', 'destination': 'Louisville, KY', 'miles': 175.6, 'status': 'completed'},
    ]
    for t in trip_specs:
        await db.trips.insert_one(_make_doc(t))

    # HOS logs
    for d in drivers:
        for hours_ago, status_v in [(8, 'off_duty'), (6, 'on_duty'), (4, 'driving'), (1, d['status'])]:
            await db.hos_logs.insert_one(_make_doc({
                'driver_id': d['id'],
                'duty_status': status_v,
                'started_at': (now_utc() - timedelta(hours=hours_ago)).isoformat(),
                'notes': 'demo seed',
            }))

    # Maintenance
    maint_specs = [
        {'vehicle_id': vehicles[0]['id'], 'service_type': 'Oil change', 'due_miles': 185000, 'completed': False, 'cost': 320.0},
        {'vehicle_id': vehicles[1]['id'], 'service_type': 'Brake inspection', 'due_miles': 315000, 'completed': False, 'cost': 0},
        {'vehicle_id': vehicles[1]['id'], 'service_type': 'DOT inspection', 'completed': False, 'cost': 95.0},
        {'vehicle_id': vehicles[3]['id'], 'service_type': 'Tire rotation', 'due_miles': 416000, 'completed': False, 'cost': 180.0},
        {'vehicle_id': vehicles[2]['id'], 'service_type': 'Oil change', 'completed': True, 'cost': 305.0},
    ]
    for m in maint_specs:
        m['due_at'] = (now_utc() + timedelta(days=7)).isoformat() if not m.get('completed') else (now_utc() - timedelta(days=14)).isoformat()
        await db.maintenance.insert_one(_make_doc(m))

    # Alerts
    alert_specs = [
        {'type': 'hos_violation', 'severity': 'warning', 'driver_id': drivers[2]['id'], 'message': 'Aaliyah Johnson approaching 11-hour drive limit (75 min remaining).', 'location': {'lat': 33.749, 'lng': -84.388}},
        {'type': 'hard_brake', 'severity': 'warning', 'driver_id': drivers[0]['id'], 'vehicle_id': vehicles[0]['id'], 'message': 'Hard braking event on Truck 101 \u2014 I-30 mile marker 187.', 'location': {'lat': 32.776, 'lng': -96.797}},
        {'type': 'maintenance_due', 'severity': 'info', 'vehicle_id': vehicles[1]['id'], 'message': 'Truck 102 due for brake inspection within 1,200 miles.'},
        {'type': 'speeding', 'severity': 'info', 'driver_id': drivers[1]['id'], 'message': 'Marcus Bell averaged 71 mph on a 65 mph zone for 3 minutes.'},
        {'type': 'crash', 'severity': 'critical', 'driver_id': drivers[2]['id'], 'vehicle_id': vehicles[2]['id'], 'message': 'CRITICAL: Possible collision detected on Truck 103. Auto-alert sequence initiated. (Demo)', 'location': {'lat': 33.749, 'lng': -84.388}},
    ]
    for a in alert_specs:
        await db.alerts.insert_one(_make_doc(a))

    # Dashcam events
    cam_specs = [
        {'vehicle_id': vehicles[0]['id'], 'driver_id': drivers[0]['id'], 'event': 'Hard brake', 'severity': 'warning', 'vendor': 'Samsara', 'thumbnail': 'https://images.unsplash.com/photo-1580651315530-69c8e0903883?w=400'},
        {'vehicle_id': vehicles[2]['id'], 'driver_id': drivers[2]['id'], 'event': 'Following too close', 'severity': 'warning', 'vendor': 'Lytx'},
        {'vehicle_id': vehicles[1]['id'], 'driver_id': drivers[1]['id'], 'event': 'Speeding', 'severity': 'info', 'vendor': 'Verizon Connect'},
        {'vehicle_id': vehicles[3]['id'], 'driver_id': drivers[3]['id'], 'event': 'Lane departure', 'severity': 'warning', 'vendor': 'Samsara'},
        {'vehicle_id': vehicles[2]['id'], 'driver_id': drivers[2]['id'], 'event': 'Possible collision', 'severity': 'critical', 'vendor': 'Lytx'},
    ]
    for c in cam_specs:
        await db.dashcam_events.insert_one(_make_doc(c))

    logger.info('Seed complete')

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
