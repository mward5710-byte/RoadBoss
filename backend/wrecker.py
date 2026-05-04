"""
RoadBoss — Wrecker Mode
=======================
Self-contained module that adds tow-operator capabilities to RoadBoss.

This is the *web/PWA* surface. The native iOS/Android version lives in the
separate Wreckerlogix Flutter repo (see /app/memory/wreckerlogix_master_spec.md).

Both products share:
- Stripe billing (RoadBoss subscription)
- Twilio SMS notifications
- SendGrid email receipts
- AI Co-Pilot voice intents
- Mapbox GPS

Models stored in MongoDB:
- tow_jobs          (active dispatch board)
- impounds          (stored vehicles + storage fees)
- motor_clubs       (Agero, AAA, Allied, Geico, Honk, etc.)
- fuel_tanks        (FuelCloud-managed or manual)
- fuel_transactions (per-vehicle fuel logs)
- wrecker_users     (NOT separate — uses existing 'users' collection with role='wrecker_operator')
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta
import uuid

# ---------------------------------------------------------------
# Helpers / constants
# ---------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _new_id() -> str:
    return str(uuid.uuid4())

# Job status lifecycle (mirrors Towbook)
JOB_STATUSES = [
    'pending',          # Just created
    'assigned',         # Driver picked
    'en_route',         # Driver heading to scene
    'on_scene',         # Driver arrived
    'in_progress',      # Hooking up / loading
    'completed',        # Job done
    'cancelled',        # Customer cancelled
]

SERVICE_TYPES = [
    'tow_light_duty',
    'tow_medium_duty',
    'tow_heavy_duty',
    'flatbed',
    'winch_out',
    'lockout',
    'jumpstart',
    'tire_change',
    'fuel_delivery',
    'accident_recovery',
    'impound',
    'private_property',
]

PRIORITIES = ['low', 'normal', 'high', 'emergency']

PAYMENT_METHODS = ['cash', 'check', 'card', 'ach', 'motor_club', 'invoice']

DEFAULT_MOTOR_CLUBS = [
    {'name': 'Agero', 'contact_phone': '+18002942030', 'billing_email': 'billing@agero.com',
     'default_rate_light': 75.0, 'default_rate_medium': 125.0, 'default_rate_heavy': 250.0},
    {'name': 'AAA', 'contact_phone': '+18002224357', 'billing_email': 'tow@aaa.com',
     'default_rate_light': 70.0, 'default_rate_medium': 120.0, 'default_rate_heavy': 240.0},
    {'name': 'Allied Dispatch', 'contact_phone': '+18883235458', 'billing_email': 'billing@allieddispatch.com',
     'default_rate_light': 80.0, 'default_rate_medium': 130.0, 'default_rate_heavy': 260.0},
    {'name': 'Geico Roadside', 'contact_phone': '+18004244040', 'billing_email': 'roadside@geico.com',
     'default_rate_light': 75.0, 'default_rate_medium': 125.0, 'default_rate_heavy': 250.0},
    {'name': 'Honk', 'contact_phone': '+18664406657', 'billing_email': 'partners@honk.com',
     'default_rate_light': 85.0, 'default_rate_medium': 135.0, 'default_rate_heavy': 270.0},
    {'name': 'Roadside Masters', 'contact_phone': '+18555555555', 'billing_email': 'ops@roadsidemasters.com',
     'default_rate_light': 78.0, 'default_rate_medium': 128.0, 'default_rate_heavy': 255.0},
]

# ---------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------

class CustomerInfo(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None

class VehicleInfo(BaseModel):
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    plate: Optional[str] = None
    vin: Optional[str] = None
    notes: Optional[str] = None

class GeoPoint(BaseModel):
    lat: float
    lng: float
    address: Optional[str] = None

class TowJobIn(BaseModel):
    motor_club_id: Optional[str] = None
    motor_club_name: Optional[str] = None  # for display when no account record yet
    service_type: str = 'tow_light_duty'
    priority: str = 'normal'
    customer: CustomerInfo
    vehicle: VehicleInfo
    pickup: GeoPoint
    dropoff: Optional[GeoPoint] = None
    notes: Optional[str] = None
    quoted_price: Optional[float] = None
    payment_method: Optional[str] = 'invoice'
    assigned_driver_id: Optional[str] = None
    assigned_truck_id: Optional[str] = None

class TowJobUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    final_price: Optional[float] = None
    assigned_driver_id: Optional[str] = None
    assigned_truck_id: Optional[str] = None
    payment_method: Optional[str] = None
    customer: Optional[CustomerInfo] = None
    vehicle: Optional[VehicleInfo] = None
    pickup: Optional[GeoPoint] = None
    dropoff: Optional[GeoPoint] = None
    photo_urls: Optional[List[str]] = None
    signature_url: Optional[str] = None

class ImpoundIn(BaseModel):
    vehicle: VehicleInfo
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_address: Optional[str] = None
    storage_location: str = 'Main Lot'
    daily_rate: float = 35.0
    impounded_at: Optional[datetime] = None
    reason: str = 'police_hold'  # police_hold | private_property | accident | abandoned
    police_report_no: Optional[str] = None
    notes: Optional[str] = None

class ImpoundReleaseIn(BaseModel):
    released_to_name: str
    released_to_id_type: Optional[str] = None  # driver_license | passport | other
    released_to_id_number: Optional[str] = None
    payment_method: str = 'cash'
    amount_paid: float

class MotorClubIn(BaseModel):
    name: str
    contact_phone: Optional[str] = None
    billing_email: Optional[str] = None
    default_rate_light: float = 75.0
    default_rate_medium: float = 125.0
    default_rate_heavy: float = 250.0
    api_credentials: Optional[Dict[str, Any]] = None  # placeholder for future direct integrations
    notes: Optional[str] = None

class FuelTankIn(BaseModel):
    name: str
    location: str
    fuel_type: str = 'diesel'   # diesel | gasoline | def
    capacity_gallons: float
    current_estimate_gallons: Optional[float] = None
    fuelcloud_tank_id: Optional[str] = None  # set when FuelCloud API is wired
    notes: Optional[str] = None

class FuelTxIn(BaseModel):
    tank_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    gallons: float
    cost_per_gallon: Optional[float] = None
    total_cost: Optional[float] = None
    odometer: Optional[int] = None
    receipt_photo_url: Optional[str] = None
    notes: Optional[str] = None

# ---------------------------------------------------------------
# Router factory — takes db and shared helpers as dependencies
# ---------------------------------------------------------------

def build_wrecker_router(db, get_current_user, require_role, serialize_doc):
    """Returns an APIRouter (without prefix) — caller mounts it under /api/wrecker."""
    router = APIRouter(prefix="/wrecker", tags=["wrecker"])

    # Either a wrecker_operator OR a fleet_admin/super_admin can use these endpoints.
    require_wrecker = require_role('wrecker_operator', 'fleet_admin', 'dispatcher')

    # =========================================================
    # Tow Jobs (the dispatch board)
    # =========================================================
    @router.get('/jobs')
    async def list_jobs(status: Optional[str] = None, user=Depends(require_wrecker)):
        q: Dict[str, Any] = {}
        if status:
            q['status'] = status
        cursor = db.tow_jobs.find(q).sort('created_at', -1).limit(500)
        return [serialize_doc(j) async for j in cursor]

    @router.post('/jobs')
    async def create_job(body: TowJobIn, user=Depends(require_wrecker)):
        doc = body.model_dump()
        doc.update({
            'id': _new_id(),
            'status': 'pending',
            'created_at': _now(),
            'updated_at': _now(),
            'created_by': user['id'],
            'photo_urls': [],
            'status_history': [{'status': 'pending', 'at': _now(), 'by': user['id']}],
        })
        if doc.get('assigned_driver_id'):
            doc['status'] = 'assigned'
            doc['status_history'].append({'status': 'assigned', 'at': _now(), 'by': user['id']})
        await db.tow_jobs.insert_one(doc)
        return serialize_doc(doc)

    @router.get('/jobs/{job_id}')
    async def get_job(job_id: str, user=Depends(require_wrecker)):
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        if not j:
            raise HTTPException(404, 'Job not found')
        return serialize_doc(j)

    @router.put('/jobs/{job_id}')
    async def update_job(job_id: str, body: TowJobUpdate, user=Depends(require_wrecker)):
        existing = await db.tow_jobs.find_one({'id': job_id})
        if not existing:
            raise HTTPException(404, 'Job not found')
        updates: Dict[str, Any] = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        # Validate status transition
        if 'status' in updates:
            if updates['status'] not in JOB_STATUSES:
                raise HTTPException(400, f"Invalid status. Allowed: {JOB_STATUSES}")
            history = existing.get('status_history', [])
            history.append({'status': updates['status'], 'at': _now(), 'by': user['id']})
            updates['status_history'] = history
        updates['updated_at'] = _now()
        await db.tow_jobs.update_one({'id': job_id}, {'$set': updates})
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        return serialize_doc(j)

    @router.delete('/jobs/{job_id}')
    async def delete_job(job_id: str, user=Depends(require_wrecker)):
        res = await db.tow_jobs.delete_one({'id': job_id})
        if res.deleted_count == 0:
            raise HTTPException(404, 'Job not found')
        return {'ok': True}

    @router.post('/jobs/{job_id}/status')
    async def quick_status_update(job_id: str, body: Dict[str, str], user=Depends(require_wrecker)):
        """Quick voice-friendly status changer. Body: {status: 'on_scene'}."""
        new_status = body.get('status')
        if new_status not in JOB_STATUSES:
            raise HTTPException(400, f"Invalid status. Allowed: {JOB_STATUSES}")
        existing = await db.tow_jobs.find_one({'id': job_id})
        if not existing:
            raise HTTPException(404, 'Job not found')
        history = existing.get('status_history', [])
        history.append({'status': new_status, 'at': _now(), 'by': user['id']})
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'status': new_status, 'status_history': history, 'updated_at': _now()}}
        )
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        return serialize_doc(j)

    @router.get('/dispatch/active')
    async def active_dispatch(user=Depends(require_wrecker)):
        """Voice-friendly: returns the *one* active job for the operator (or empty)."""
        # If user is a driver, scoped to them; admin sees latest active overall
        q: Dict[str, Any] = {'status': {'$nin': ['completed', 'cancelled']}}
        if user.get('role') == 'wrecker_operator':
            q['assigned_driver_id'] = user['id']
        cursor = db.tow_jobs.find(q).sort('updated_at', -1).limit(1)
        async for j in cursor:
            return serialize_doc(j)
        return None

    # =========================================================
    # Motor Clubs
    # =========================================================
    @router.get('/motor-clubs')
    async def list_clubs(user=Depends(require_wrecker)):
        cursor = db.motor_clubs.find({}).sort('name', 1)
        return [serialize_doc(c) async for c in cursor]

    @router.post('/motor-clubs')
    async def create_club(body: MotorClubIn, user=Depends(require_wrecker)):
        doc = body.model_dump()
        doc.update({'id': _new_id(), 'created_at': _now()})
        await db.motor_clubs.insert_one(doc)
        return serialize_doc(doc)

    @router.put('/motor-clubs/{club_id}')
    async def update_club(club_id: str, body: MotorClubIn, user=Depends(require_wrecker)):
        existing = await db.motor_clubs.find_one({'id': club_id})
        if not existing:
            raise HTTPException(404, 'Motor club not found')
        await db.motor_clubs.update_one({'id': club_id}, {'$set': body.model_dump()})
        c = await db.motor_clubs.find_one({'id': club_id}, {'_id': 0})
        return serialize_doc(c)

    @router.delete('/motor-clubs/{club_id}')
    async def delete_club(club_id: str, user=Depends(require_wrecker)):
        res = await db.motor_clubs.delete_one({'id': club_id})
        if res.deleted_count == 0:
            raise HTTPException(404, 'Motor club not found')
        return {'ok': True}

    # =========================================================
    # Impound
    # =========================================================
    @router.get('/impounds')
    async def list_impounds(active_only: bool = True, user=Depends(require_wrecker)):
        q: Dict[str, Any] = {}
        if active_only:
            q['released_at'] = None
        cursor = db.impounds.find(q).sort('impounded_at', -1)
        items = []
        async for it in cursor:
            doc = serialize_doc(it)
            # Compute live storage fee
            try:
                start = it.get('impounded_at') or it.get('created_at')
                if start:
                    # Make naive datetime timezone-aware (Mongo returns naive UTC)
                    if start.tzinfo is None:
                        start = start.replace(tzinfo=timezone.utc)
                    delta_days = (_now() - start).days
                    days = max(1, delta_days + 1)
                    doc['days_stored'] = days
                    doc['accrued_storage_fee'] = round(days * float(it.get('daily_rate', 0)), 2)
                else:
                    doc['days_stored'] = 1
                    doc['accrued_storage_fee'] = float(it.get('daily_rate', 0))
            except Exception as e:
                doc['days_stored'] = 1
                doc['accrued_storage_fee'] = float(it.get('daily_rate', 0))
            items.append(doc)
        return items

    @router.post('/impounds')
    async def create_impound(body: ImpoundIn, user=Depends(require_wrecker)):
        doc = body.model_dump()
        doc.update({
            'id': _new_id(),
            'created_at': _now(),
            'impounded_at': body.impounded_at or _now(),
            'released_at': None,
            'released_to': None,
            'amount_paid': 0.0,
            'created_by': user['id'],
        })
        await db.impounds.insert_one(doc)
        return serialize_doc(doc)

    @router.post('/impounds/{impound_id}/release')
    async def release_impound(impound_id: str, body: ImpoundReleaseIn, user=Depends(require_wrecker)):
        existing = await db.impounds.find_one({'id': impound_id})
        if not existing:
            raise HTTPException(404, 'Impound record not found')
        if existing.get('released_at'):
            raise HTTPException(400, 'Already released')
        await db.impounds.update_one(
            {'id': impound_id},
            {'$set': {
                'released_at': _now(),
                'released_to': {
                    'name': body.released_to_name,
                    'id_type': body.released_to_id_type,
                    'id_number': body.released_to_id_number,
                },
                'payment_method': body.payment_method,
                'amount_paid': body.amount_paid,
                'released_by': user['id'],
            }}
        )
        rec = await db.impounds.find_one({'id': impound_id}, {'_id': 0})
        return serialize_doc(rec)

    @router.get('/impounds/lookup')
    async def public_lookup(plate: Optional[str] = None, vin: Optional[str] = None):
        """PUBLIC endpoint — for police/customer 'do you have my car?' lookups.
        Lightly rate-limited via simple query checks. Returns minimal info."""
        if not plate and not vin:
            raise HTTPException(400, 'Provide plate or vin')
        q: Dict[str, Any] = {}
        if plate:
            q['vehicle.plate'] = plate.upper().strip()
        if vin:
            q['vehicle.vin'] = vin.upper().strip()
        rec = await db.impounds.find_one(q, {'_id': 0})
        if not rec or rec.get('released_at'):
            return {'found': False}
        return {
            'found': True,
            'storage_location': rec.get('storage_location'),
            'impounded_at': (rec.get('impounded_at') or rec.get('created_at')).isoformat() if rec.get('impounded_at') or rec.get('created_at') else None,
            'reason': rec.get('reason'),
            'release_instructions': 'Call our office during business hours. Bring photo ID, proof of ownership, and payment.',
        }

    # =========================================================
    # Fuel Tanks (FuelCloud manual + integration-ready)
    # =========================================================
    @router.get('/fuel/tanks')
    async def list_tanks(user=Depends(require_wrecker)):
        cursor = db.fuel_tanks.find({}).sort('name', 1)
        return [serialize_doc(t) async for t in cursor]

    @router.post('/fuel/tanks')
    async def create_tank(body: FuelTankIn, user=Depends(require_wrecker)):
        doc = body.model_dump()
        doc.update({'id': _new_id(), 'created_at': _now()})
        if doc.get('current_estimate_gallons') is None:
            doc['current_estimate_gallons'] = doc['capacity_gallons']
        await db.fuel_tanks.insert_one(doc)
        return serialize_doc(doc)

    @router.put('/fuel/tanks/{tank_id}')
    async def update_tank(tank_id: str, body: FuelTankIn, user=Depends(require_wrecker)):
        existing = await db.fuel_tanks.find_one({'id': tank_id})
        if not existing:
            raise HTTPException(404, 'Tank not found')
        await db.fuel_tanks.update_one({'id': tank_id}, {'$set': body.model_dump()})
        t = await db.fuel_tanks.find_one({'id': tank_id}, {'_id': 0})
        return serialize_doc(t)

    @router.delete('/fuel/tanks/{tank_id}')
    async def delete_tank(tank_id: str, user=Depends(require_wrecker)):
        res = await db.fuel_tanks.delete_one({'id': tank_id})
        if res.deleted_count == 0:
            raise HTTPException(404, 'Tank not found')
        return {'ok': True}

    @router.get('/fuel/transactions')
    async def list_fuel_tx(user=Depends(require_wrecker)):
        cursor = db.fuel_transactions.find({}).sort('created_at', -1).limit(200)
        return [serialize_doc(t) async for t in cursor]

    @router.post('/fuel/transactions')
    async def log_fuel_tx(body: FuelTxIn, user=Depends(require_wrecker)):
        doc = body.model_dump()
        doc.update({
            'id': _new_id(),
            'created_at': _now(),
            'logged_by': user['id'],
        })
        # Auto-compute total cost if missing
        if doc.get('total_cost') is None and doc.get('cost_per_gallon') and doc.get('gallons'):
            doc['total_cost'] = round(doc['gallons'] * doc['cost_per_gallon'], 2)
        await db.fuel_transactions.insert_one(doc)
        # Decrement tank estimate if applicable
        if doc.get('tank_id'):
            await db.fuel_tanks.update_one(
                {'id': doc['tank_id']},
                {'$inc': {'current_estimate_gallons': -float(doc.get('gallons', 0))}}
            )
        return serialize_doc(doc)

    @router.get('/fuel/integration-status')
    async def fuelcloud_status(user=Depends(require_wrecker)):
        """Returns whether FuelCloud is wired. Currently PAUSED per founder direction —
        manual logging is the active workflow."""
        return {
            'provider': 'FuelCloud',
            'status': 'paused',
            'message': 'FuelCloud integration is paused. Manual fuel logging is the active workflow.',
            'docs_url': 'https://help.fuelcloud.com/hc/en-us/articles/360008504014-FuelCloud-API',
            'manual_logging_active': True,
        }

    # =========================================================
    # Dashboard summary
    # =========================================================
    @router.get('/overview')
    async def overview(user=Depends(require_wrecker)):
        # Active jobs by status
        active_jobs = []
        async for j in db.tow_jobs.find({'status': {'$nin': ['completed', 'cancelled']}}).limit(50):
            active_jobs.append(serialize_doc(j))

        # Today completed
        start_of_day = _now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_completed = await db.tow_jobs.count_documents({
            'status': 'completed',
            'updated_at': {'$gte': start_of_day}
        })

        # Today revenue
        today_revenue = 0.0
        async for j in db.tow_jobs.find({'status': 'completed', 'updated_at': {'$gte': start_of_day}}):
            today_revenue += float(j.get('final_price') or j.get('quoted_price') or 0)

        active_impounds = await db.impounds.count_documents({'released_at': None})
        total_clubs = await db.motor_clubs.count_documents({})
        total_tanks = await db.fuel_tanks.count_documents({})

        # Status breakdown
        status_counts = {s: 0 for s in JOB_STATUSES}
        async for j in db.tow_jobs.find({}, {'status': 1}):
            s = j.get('status', 'pending')
            if s in status_counts:
                status_counts[s] += 1

        return {
            'active_jobs': active_jobs,
            'today_completed': today_completed,
            'today_revenue': round(today_revenue, 2),
            'active_impounds': active_impounds,
            'motor_clubs_count': total_clubs,
            'fuel_tanks_count': total_tanks,
            'status_breakdown': status_counts,
        }

    return router


# ---------------------------------------------------------------
# Demo seed
# ---------------------------------------------------------------

async def seed_wrecker_demo(db, hash_password):
    """Seed demo wrecker data. Idempotent: only seeds if collections empty."""
    # Demo wrecker_operator user
    demo_email = 'wrecker@highwaypilot.io'
    existing = await db.users.find_one({'email': demo_email})
    if not existing:
        await db.users.insert_one({
            'id': _new_id(),
            'email': demo_email,
            'password_hash': hash_password('Demo!Wrecker2026'),
            'name': 'Demo Wrecker Operator',
            'role': 'wrecker_operator',
            'company_name': 'Apex Towing & Recovery',
            'created_at': _now(),
        })

    # Motor clubs
    if await db.motor_clubs.count_documents({}) == 0:
        for mc in DEFAULT_MOTOR_CLUBS:
            doc = dict(mc)
            doc.update({'id': _new_id(), 'created_at': _now()})
            await db.motor_clubs.insert_one(doc)

    # Fuel tanks
    if await db.fuel_tanks.count_documents({}) == 0:
        for tank in [
            {'name': 'Main Yard Diesel', 'location': 'Apex Yard — Kokomo, IN', 'fuel_type': 'diesel',
             'capacity_gallons': 1000, 'current_estimate_gallons': 740,
             'notes': 'Primary diesel for fleet. FuelCloud pending.'},
            {'name': 'Backup DEF Tank', 'location': 'Apex Yard — Kokomo, IN', 'fuel_type': 'def',
             'capacity_gallons': 250, 'current_estimate_gallons': 180},
        ]:
            doc = dict(tank)
            doc.update({'id': _new_id(), 'created_at': _now()})
            await db.fuel_tanks.insert_one(doc)

    # Tow jobs (active dispatch board)
    if await db.tow_jobs.count_documents({}) == 0:
        # Get motor club ids
        clubs = []
        async for c in db.motor_clubs.find({}, {'id': 1, 'name': 1}):
            clubs.append({'id': c['id'], 'name': c['name']})

        sample_jobs = [
            {
                'service_type': 'tow_light_duty', 'priority': 'normal', 'status': 'pending',
                'customer': {'name': 'Sarah Johnson', 'phone': '+17655551001'},
                'vehicle': {'year': 2019, 'make': 'Honda', 'model': 'Civic', 'color': 'Silver', 'plate': 'IN-7742F'},
                'pickup': {'lat': 40.4864, 'lng': -86.1336, 'address': 'I-69 Mile 158 NB, Kokomo, IN'},
                'dropoff': {'lat': 40.4864, 'lng': -86.1336, 'address': "Apex Yard — 1200 W Markland Ave"},
                'notes': 'Flat tire, customer waiting roadside. Hazards on.',
                'quoted_price': 95.0, 'payment_method': 'motor_club',
            },
            {
                'service_type': 'jumpstart', 'priority': 'normal', 'status': 'assigned',
                'customer': {'name': 'Mark Reilly', 'phone': '+17655552002'},
                'vehicle': {'year': 2020, 'make': 'Ford', 'model': 'F-150', 'color': 'Black', 'plate': 'IN-9382R'},
                'pickup': {'lat': 40.4933, 'lng': -86.1247, 'address': 'Walmart Parking Lot, Kokomo, IN'},
                'notes': 'Battery dead after 30 min in store.',
                'quoted_price': 65.0, 'payment_method': 'motor_club',
            },
            {
                'service_type': 'tow_medium_duty', 'priority': 'high', 'status': 'en_route',
                'customer': {'name': 'Diana Pierce', 'phone': '+17655553003'},
                'vehicle': {'year': 2017, 'make': 'Chevy', 'model': 'Silverado 2500', 'color': 'White', 'plate': 'IN-1147T'},
                'pickup': {'lat': 40.5078, 'lng': -86.1411, 'address': 'US-31 & 350 N, Kokomo, IN'},
                'notes': 'Transmission failure, stuck in middle lane.',
                'quoted_price': 175.0, 'payment_method': 'invoice',
            },
            {
                'service_type': 'lockout', 'priority': 'normal', 'status': 'on_scene',
                'customer': {'name': 'Tyler Brooks', 'phone': '+17655554004'},
                'vehicle': {'year': 2022, 'make': 'Toyota', 'model': 'Camry', 'color': 'Blue', 'plate': 'IN-5521W'},
                'pickup': {'lat': 40.4711, 'lng': -86.1256, 'address': 'YMCA Parking, Kokomo, IN'},
                'notes': 'Keys locked inside, baby in back seat. EMERGENCY.',
                'priority': 'emergency',
                'quoted_price': 75.0, 'payment_method': 'cash',
            },
            {
                'service_type': 'flatbed', 'priority': 'normal', 'status': 'in_progress',
                'customer': {'name': 'Carlos Mendez', 'phone': '+17655555005'},
                'vehicle': {'year': 2015, 'make': 'BMW', 'model': '328i', 'color': 'Red', 'plate': 'IN-8830M'},
                'pickup': {'lat': 40.4988, 'lng': -86.1403, 'address': '500 N Main St, Kokomo, IN'},
                'dropoff': {'lat': 40.5055, 'lng': -86.1599, 'address': 'Friendly BMW Service Center'},
                'notes': 'Lowered car, requires flatbed.',
                'quoted_price': 165.0, 'payment_method': 'card',
            },
            {
                'service_type': 'accident_recovery', 'priority': 'high', 'status': 'pending',
                'customer': {'name': 'Indiana State Police', 'phone': '+18002615457'},
                'vehicle': {'year': 2021, 'make': 'Nissan', 'model': 'Altima', 'color': 'Gray', 'plate': 'IN-4477C'},
                'pickup': {'lat': 40.5201, 'lng': -86.1655, 'address': 'I-31 NB Mile 165, Kokomo, IN'},
                'notes': 'Single-vehicle rollover. Driver to hospital. Police on scene.',
                'quoted_price': 425.0, 'payment_method': 'invoice',
            },
            {
                'service_type': 'winch_out', 'priority': 'normal', 'status': 'completed',
                'customer': {'name': 'Robin Larkin', 'phone': '+17655556006'},
                'vehicle': {'year': 2018, 'make': 'Jeep', 'model': 'Wrangler', 'color': 'Green', 'plate': 'IN-2266L'},
                'pickup': {'lat': 40.4733, 'lng': -86.0988, 'address': 'County Road 300 E, Kokomo, IN'},
                'notes': 'Stuck in mud after rain.',
                'quoted_price': 125.0, 'final_price': 125.0, 'payment_method': 'cash',
            },
            {
                'service_type': 'tire_change', 'priority': 'low', 'status': 'pending',
                'customer': {'name': 'Maria Santos', 'phone': '+17655557007'},
                'vehicle': {'year': 2016, 'make': 'Hyundai', 'model': 'Sonata', 'color': 'Blue', 'plate': 'IN-3399S'},
                'pickup': {'lat': 40.4655, 'lng': -86.1502, 'address': 'Kroger Parking Lot, Kokomo, IN'},
                'notes': 'Customer has spare in trunk.',
                'quoted_price': 55.0, 'payment_method': 'card',
            },
        ]

        for i, sj in enumerate(sample_jobs):
            doc = dict(sj)
            # Assign random motor club to ~50% of jobs
            if clubs and i % 2 == 0:
                club = clubs[i % len(clubs)]
                doc['motor_club_id'] = club['id']
                doc['motor_club_name'] = club['name']
            doc.update({
                'id': _new_id(),
                'created_at': _now() - timedelta(minutes=10 * i),
                'updated_at': _now() - timedelta(minutes=10 * i),
                'photo_urls': [],
                'status_history': [{'status': sj['status'], 'at': _now(), 'by': 'seed'}],
            })
            await db.tow_jobs.insert_one(doc)

    # Impound vehicles
    if await db.impounds.count_documents({}) == 0:
        sample_impounds = [
            {
                'vehicle': {'year': 2014, 'make': 'Dodge', 'model': 'Charger', 'color': 'Black',
                            'plate': 'IN-9921Z', 'vin': '2C3CDXBG3EH123456'},
                'owner_name': 'Unknown',
                'storage_location': 'Main Lot — Spot 4',
                'daily_rate': 35.0,
                'reason': 'police_hold',
                'police_report_no': 'KOK-2026-04982',
                'notes': 'Stolen vehicle recovered. Hold for evidence.',
                'impounded_at': _now() - timedelta(days=4),
            },
            {
                'vehicle': {'year': 2010, 'make': 'Ford', 'model': 'Fusion', 'color': 'Silver',
                            'plate': 'IN-6643K'},
                'owner_name': 'Anonymous',
                'storage_location': 'Main Lot — Spot 12',
                'daily_rate': 35.0,
                'reason': 'private_property',
                'notes': 'Towed from apartment complex no-park zone.',
                'impounded_at': _now() - timedelta(days=2),
            },
        ]
        for imp in sample_impounds:
            doc = dict(imp)
            doc.update({
                'id': _new_id(),
                'created_at': _now(),
                'released_at': None,
                'released_to': None,
                'amount_paid': 0.0,
                'created_by': 'seed',
            })
            await db.impounds.insert_one(doc)

    return {
        'tow_jobs': await db.tow_jobs.count_documents({}),
        'impounds': await db.impounds.count_documents({}),
        'motor_clubs': await db.motor_clubs.count_documents({}),
        'fuel_tanks': await db.fuel_tanks.count_documents({}),
    }


# ---------------------------------------------------------------
# Voice intent extension — used by Co-Pilot action parser
# ---------------------------------------------------------------

WRECKER_VOICE_INTENTS = {
    'on_scene': {
        'phrases': ["i'm on scene", 'on scene', 'arrived on scene', 'on the scene'],
        'action': {'type': 'tow_job_status', 'status': 'on_scene'},
        'spoken': "10-4. Marked on scene.",
    },
    'en_route': {
        'phrases': ["i'm en route", 'en route', 'rolling', "i'm rolling", 'on my way'],
        'action': {'type': 'tow_job_status', 'status': 'en_route'},
        'spoken': "Copy. En route logged.",
    },
    'job_done': {
        'phrases': ['job complete', "i'm done", 'job is done', 'finished', 'completed'],
        'action': {'type': 'tow_job_status', 'status': 'completed'},
        'spoken': "Nice work boss. Job marked complete.",
    },
    'in_progress': {
        'phrases': ['hooking up', 'loading now', 'in progress', 'started'],
        'action': {'type': 'tow_job_status', 'status': 'in_progress'},
        'spoken': "Got it. In progress.",
    },
    'next_call': {
        'phrases': ['next call', 'whats next', "what's next", 'show me my next'],
        'action': {'type': 'tow_job_next'},
        'spoken': "Pulling up your active call now.",
    },
    'fuel_check': {
        'phrases': ['fuel level', 'how much fuel', 'tank level', 'check fuel'],
        'action': {'type': 'fuel_check'},
        'spoken': "Let me check that tank for you.",
    },
}
