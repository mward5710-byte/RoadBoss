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

# Job status lifecycle (mirrors Towbook 7-stage flow)
JOB_STATUSES = [
    'pending',          # Just created (Waiting in Towbook)
    'assigned',         # Driver picked (Dispatched)
    'en_route',         # Driver heading to scene
    'on_scene',         # Driver arrived
    'towing',           # Hooking up / loading / towing in motion (was 'in_progress')
    'dest_arrival',     # At destination (drop-off arrival)
    'completed',        # Job done
    'cancelled',        # Customer cancelled
]
# Legacy alias — incoming 'in_progress' is normalized to 'towing'
_LEGACY_STATUS_ALIASES = {'in_progress': 'towing'}

# Color map for the status timeline (keep consistent across backend & frontend)
STATUS_COLOR_HEX = {
    'pending':      '#f59e0b',   # amber
    'assigned':     '#1d4ed8',   # blue-800
    'en_route':     '#86efac',   # green-300
    'on_scene':     '#16a34a',   # green-600
    'towing':       '#38bdf8',   # sky-400
    'dest_arrival': '#d946ef',   # fuchsia-500
    'completed':    '#0f172a',   # slate-900 (dark check)
    'cancelled':    '#64748b',   # slate-500
}

# Photo capture stages — tagged so the receipt/proof-of-condition is clean
PHOTO_STAGES = ['on_scene', 'towing', 'dest_arrival', 'pre_hook', 'damage', 'other']

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
    state: Optional[str] = None              # IN, OH, etc.
    vin: Optional[str] = None
    notes: Optional[str] = None
    # Towbook parity additions
    duty_class: Optional[str] = None         # Light / Medium / Heavy
    drive_type: Optional[str] = None         # FWD / RWD / AWD / 4X2 / 4X4
    has_keys: Optional[bool] = None
    key_location: Optional[str] = None       # e.g. "Locker 4634"
    drivable: Optional[bool] = None
    odometer: Optional[int] = None

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

class ImpoundNoteIn(BaseModel):
    note: str

class CertifiedMailIn(BaseModel):
    recipient_name: str
    address: Optional[str] = None
    tracking_number: Optional[str] = None
    mail_type: str = 'notification'   # notification | first_notice | final_notice | title_application
    status: str = 'sent'              # sent | delivered | returned | undeliverable
    sent_at: Optional[datetime] = None
    notes: Optional[str] = None

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

# ---- Towbook parity: photos, charges, payments, damage form, waiver ----
class PhotoUploadIn(BaseModel):
    data_url: str                       # base64 data URL — never saved to camera roll
    stage: Optional[str] = 'other'      # one of PHOTO_STAGES
    caption: Optional[str] = None

class ChargeIn(BaseModel):
    key: str                            # e.g. 'tow_hook_fee'
    label: str                          # e.g. 'Tow / Hook Fee'
    rate: float                         # per unit
    qty: float = 1.0                    # units (miles, days, hours, ea)
    unit: Optional[str] = 'ea'          # 'mi', 'day', 'hr', 'ea'

class PaymentIn(BaseModel):
    amount: float
    method: str = 'cash'                # cash / check / card / square / motor_club / other
    reference: Optional[str] = None     # check #, last-4, transaction id
    note: Optional[str] = None

class DamageMarkIn(BaseModel):
    x: float                            # 0-1 normalized in SVG viewbox
    y: float
    panel: Optional[str] = None         # e.g. 'front_bumper', 'left_door', 'wheel_fl'
    severity: str = 'minor'             # minor / moderate / major / pre_existing
    note: Optional[str] = None

class DamageFormIn(BaseModel):
    marks: List[DamageMarkIn] = []
    customer_name: Optional[str] = None
    signature_data_url: Optional[str] = None
    notes: Optional[str] = None

class WaiverAcceptIn(BaseModel):
    customer_name: str
    signature_data_url: str
    waiver_text_snapshot: Optional[str] = None    # if not provided, current fleet template is snapshotted

class WaiverTemplateIn(BaseModel):
    waiver_text: str
    company_name: Optional[str] = None

class ReceiptSendIn(BaseModel):
    channel: str = 'email'              # email / sms / both
    to_email: Optional[str] = None
    to_phone: Optional[str] = None
    hide_charges: bool = False
    hide_discounts: bool = False
    hide_photos: bool = False
    include_payment_link: bool = True
    message: Optional[str] = None

class RateSheetItemIn(BaseModel):
    key: str
    label: str
    rate: float
    unit: Optional[str] = 'ea'

class RateSheetIn(BaseModel):
    items: List[RateSheetItemIn]

# Default Martin Wrecker rate sheet (admin-editable per fleet)
DEFAULT_RATE_SHEET = [
    {'key': 'tow_hook_fee',       'label': 'Tow / Hook Fee',       'rate': 65.00, 'unit': 'ea'},
    {'key': 'loaded_mileage',     'label': 'Loaded / Hooked Mileage', 'rate': 4.50, 'unit': 'mi'},
    {'key': 'unloaded_mileage',   'label': 'Unloaded / Enroute Mileage', 'rate': 3.50, 'unit': 'mi'},
    {'key': 'admin_fee',          'label': 'Administrative Fees',  'rate': 50.00, 'unit': 'ea'},
    {'key': 'certified_mail',     'label': 'Certified Mail',       'rate': 100.00, 'unit': 'ea'},
    {'key': 'title_search',       'label': 'Title Search',         'rate': 100.00, 'unit': 'ea'},
    {'key': 'labor',              'label': 'Labor',                'rate': 150.00, 'unit': 'hr'},
    {'key': 'set_out',            'label': 'Set Out',              'rate': 100.00, 'unit': 'ea'},
    {'key': 'storage_daily',      'label': 'Daily Impound Rate',   'rate': 50.00, 'unit': 'day'},
    {'key': 'fuel_surcharge',     'label': 'Fuel Surcharge',       'rate': 5.00,  'unit': 'ea'},
]

# Default Martin Wrecker liability waiver
DEFAULT_WAIVER_TEMPLATE = """The driver has been absolutely forbidden to push cars with his/her truck or drive in any type of grass area. UNDER ANY CIRCUMSTANCES WHATSOEVER! Please do not make his/her position difficult by requesting him/her to do so.

If towing a vehicle does result in having to go onto the property/grass area the property owner understands that damage may result and will not hold {{COMPANY_NAME}} responsible for any & all damages done to said property.

I have been advised that servicing or removal of my car may result in unavoidable damage. I hereby authorize the servicing of my car and agree that I will not hold {{COMPANY_NAME}} responsible for such unavoidable damage.

I have been advised that leaving my car at an unattended location may result in unavoidable vandalism, theft or other damage. I hereby authorize the service to be provided and agree that I will not hold the service facility, its employees or {{COMPANY_NAME}} responsible for such unavoidable vandalism, theft or other damage.

I hereby agree to hold {{COMPANY_NAME}} harmless for any previous damage on vehicle prior to time of service. I will not hold {{COMPANY_NAME}} responsible for such pre-existing damage.

I hereby acknowledge the probability the vehicle may have pre-existing damage or become damaged during the course of service and agree that I will not hold {{COMPANY_NAME}} or its employees responsible for such damage. I also acknowledge that if my vehicle is 15 years old or older that I will not hold {{COMPANY_NAME}} responsible for any structural damage to the under carriage of the vehicle.

For Tire Services {{COMPANY_NAME}} is not responsible for wearable maintenance items such as Lug Nuts &/or Lug Studs."""

# ---------------------------------------------------------------
# Router factory — takes db and shared helpers as dependencies
# ---------------------------------------------------------------

def build_wrecker_router(db, get_current_user, require_role, serialize_doc, notifications=None):
    """Returns an APIRouter (without prefix) — caller mounts it under /api/wrecker.
    `notifications` (optional) is the notifications module — used for SMS/email receipts.
    """
    router = APIRouter(prefix="/wrecker", tags=["wrecker"])

    def _normalize_status(s: Optional[str]) -> Optional[str]:
        if s is None:
            return None
        return _LEGACY_STATUS_ALIASES.get(s, s)

    # ------------------------------------------------------------
    # Permission helpers — chain-of-command rules per Mike's spec:
    #   - Driver (wrecker_operator): can ONLY view + update status of their OWN assigned jobs
    #   - Dispatcher (wrecker_dispatcher): creates jobs, assigns to drivers via rotation
    #   - Supervisor (wrecker_supervisor / foreman): all dispatcher powers + can REASSIGN
    #   - Fleet Admin / Super Admin: god mode
    # Drivers NEVER pick, accept, or decline calls. Period.
    # ------------------------------------------------------------
    DISPATCH_ROLES = {'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'}
    REASSIGN_ROLES = {'wrecker_supervisor', 'fleet_admin', 'super_admin'}
    ANY_WRECKER_ROLES = {'wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'dispatcher'}

    def _is_dispatcher(user):
        return user.get('role') in DISPATCH_ROLES

    def _is_supervisor(user):
        return user.get('role') in REASSIGN_ROLES

    def _is_driver(user):
        return user.get('role') == 'wrecker_operator'

    # Either a wrecker_operator OR a fleet_admin/super_admin can use these endpoints.
    require_wrecker = require_role('wrecker_operator', 'fleet_admin', 'dispatcher', 'wrecker_dispatcher', 'wrecker_supervisor')
    require_dispatcher = require_role('wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'dispatcher')
    require_supervisor = require_role('wrecker_supervisor', 'fleet_admin')

    # =========================================================
    # Tow Jobs (the dispatch board)
    # =========================================================
    @router.get('/jobs')
    async def list_jobs(status: Optional[str] = None, user=Depends(require_wrecker)):
        q: Dict[str, Any] = {}
        if status:
            q['status'] = status
        # Drivers see ONLY their own assigned jobs — no cherry-picking
        if _is_driver(user):
            q['assigned_driver_id'] = user['id']
        cursor = db.tow_jobs.find(q).sort('created_at', -1).limit(500)
        return [serialize_doc(j) async for j in cursor]

    @router.post('/jobs')
    async def create_job(body: TowJobIn, user=Depends(require_dispatcher)):
        """Only dispatchers/supervisors/admins can create jobs. Drivers never create their own work."""
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
        # If creator pre-assigned a driver, mark assigned + bump rotation
        if doc.get('assigned_driver_id'):
            doc['status'] = 'assigned'
            doc['status_history'].append({'status': 'assigned', 'at': _now(), 'by': user['id']})
            await _bump_rotation(doc['assigned_driver_id'])
        await db.tow_jobs.insert_one(doc)
        return serialize_doc(doc)

    async def _bump_rotation(driver_id: str):
        """Stamp last_dispatched_at on a driver to push them to the back of the rotation."""
        if not driver_id:
            return
        await db.users.update_one(
            {'id': driver_id, 'role': 'wrecker_operator'},
            {'$set': {'last_dispatched_at': _now()}},
        )

    @router.get('/jobs/{job_id}')
    async def get_job(job_id: str, user=Depends(require_wrecker)):
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        if not j:
            raise HTTPException(404, 'Job not found')
        # Driver can only view their own jobs
        if _is_driver(user) and j.get('assigned_driver_id') != user['id']:
            raise HTTPException(403, 'Not your call. Talk to dispatch if there is a problem.')
        return serialize_doc(j)

    @router.put('/jobs/{job_id}')
    async def update_job(job_id: str, body: TowJobUpdate, user=Depends(require_wrecker)):
        existing = await db.tow_jobs.find_one({'id': job_id})
        if not existing:
            raise HTTPException(404, 'Job not found')

        updates: Dict[str, Any] = {k: v for k, v in body.model_dump(exclude_none=True).items()}

        # ---- Permission gate ----
        if _is_driver(user):
            # Driver can ONLY update their own assigned jobs, and only status / notes / photos / signature
            if existing.get('assigned_driver_id') != user['id']:
                raise HTTPException(403, 'Not your call. Talk to dispatch.')
            allowed_for_driver = {'status', 'notes', 'photo_urls', 'signature_url'}
            blocked = set(updates.keys()) - allowed_for_driver
            if blocked:
                raise HTTPException(403, f"Drivers cannot change: {', '.join(blocked)}. Talk to dispatch.")

        # Reassignment rules: changing assigned_driver_id on an already-assigned job requires supervisor
        new_driver = updates.get('assigned_driver_id')
        if new_driver and new_driver != existing.get('assigned_driver_id') and existing.get('assigned_driver_id'):
            if not _is_supervisor(user):
                raise HTTPException(403, 'Only supervisors can reassign a job that is already with a driver.')

        # Validate status transition
        if 'status' in updates:
            updates['status'] = _normalize_status(updates['status'])
            if updates['status'] not in JOB_STATUSES:
                raise HTTPException(400, f"Invalid status. Allowed: {JOB_STATUSES}")
            history = existing.get('status_history', [])
            history.append({'status': updates['status'], 'at': _now(), 'by': user['id']})
            updates['status_history'] = history

        # If newly assigning a driver (was unassigned), require dispatch perm + bump rotation
        if new_driver and not existing.get('assigned_driver_id'):
            if not _is_dispatcher(user):
                raise HTTPException(403, 'Only dispatchers/supervisors can assign drivers.')
            # Auto-set status to 'assigned' if it was pending
            if existing.get('status') == 'pending' and 'status' not in updates:
                updates['status'] = 'assigned'
                history = updates.get('status_history') or existing.get('status_history', [])
                history.append({'status': 'assigned', 'at': _now(), 'by': user['id']})
                updates['status_history'] = history
            await _bump_rotation(new_driver)
        elif new_driver and new_driver != existing.get('assigned_driver_id'):
            # Reassignment — bump the new driver
            await _bump_rotation(new_driver)

        updates['updated_at'] = _now()
        await db.tow_jobs.update_one({'id': job_id}, {'$set': updates})
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        return serialize_doc(j)

    @router.delete('/jobs/{job_id}')
    async def delete_job(job_id: str, user=Depends(require_dispatcher)):
        """Only dispatchers/supervisors/admins can delete jobs."""
        res = await db.tow_jobs.delete_one({'id': job_id})
        if res.deleted_count == 0:
            raise HTTPException(404, 'Job not found')
        return {'ok': True}

    @router.post('/jobs/{job_id}/status')
    async def quick_status_update(job_id: str, body: Dict[str, str], user=Depends(require_wrecker)):
        """Quick voice-friendly status changer. Body: {status: 'on_scene'}.
        Drivers can only update status on their OWN assigned jobs."""
        new_status = _normalize_status(body.get('status'))
        if new_status not in JOB_STATUSES:
            raise HTTPException(400, f"Invalid status. Allowed: {JOB_STATUSES}")
        existing = await db.tow_jobs.find_one({'id': job_id})
        if not existing:
            raise HTTPException(404, 'Job not found')
        if _is_driver(user) and existing.get('assigned_driver_id') != user['id']:
            raise HTTPException(403, 'Not your call. Talk to dispatch.')
        history = existing.get('status_history', [])
        history.append({'status': new_status, 'at': _now(), 'by': user['id']})
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'status': new_status, 'status_history': history, 'updated_at': _now()}}
        )
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        return serialize_doc(j)

    @router.post('/jobs/{job_id}/assign')
    async def assign_driver(job_id: str, body: Dict[str, str], user=Depends(require_dispatcher)):
        """Dispatcher assigns or reassigns a driver. Reassignment requires supervisor."""
        driver_id = body.get('driver_id')
        if not driver_id:
            raise HTTPException(400, 'driver_id required')
        existing = await db.tow_jobs.find_one({'id': job_id})
        if not existing:
            raise HTTPException(404, 'Job not found')
        # Reassignment guard
        if existing.get('assigned_driver_id') and existing['assigned_driver_id'] != driver_id:
            if not _is_supervisor(user):
                raise HTTPException(403, 'Only supervisors can reassign an already-assigned job.')
        # Verify the target driver actually exists and is a wrecker_operator
        target = await db.users.find_one({'id': driver_id, 'role': 'wrecker_operator'}, {'_id': 0})
        if not target:
            raise HTTPException(404, 'Driver not found or not a wrecker operator')
        history = existing.get('status_history', [])
        new_status = existing.get('status', 'pending')
        if new_status == 'pending':
            new_status = 'assigned'
            history.append({'status': 'assigned', 'at': _now(), 'by': user['id']})
        history.append({'note': f"Assigned to {target.get('name')}", 'at': _now(), 'by': user['id']})
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {
                'assigned_driver_id': driver_id,
                'status': new_status,
                'status_history': history,
                'updated_at': _now(),
            }}
        )
        await _bump_rotation(driver_id)
        j = await db.tow_jobs.find_one({'id': job_id}, {'_id': 0})
        return serialize_doc(j)

    @router.get('/dispatch/active')
    async def active_dispatch(user=Depends(require_wrecker)):
        """Voice-friendly: returns the *one* active job for the operator (or empty)."""
        # If user is a driver, scoped to them; admin sees latest active overall
        q: Dict[str, Any] = {'status': {'$nin': ['completed', 'cancelled']}}
        if _is_driver(user):
            q['assigned_driver_id'] = user['id']
        cursor = db.tow_jobs.find(q).sort('updated_at', -1).limit(1)
        async for j in cursor:
            return serialize_doc(j)
        return None

    # =========================================================
    # Drivers + Rotation
    # =========================================================
    @router.get('/drivers')
    async def list_drivers(user=Depends(require_wrecker)):
        """List wrecker drivers ordered by rotation (next-up first)."""
        drivers = []
        async for u in db.users.find({'role': 'wrecker_operator'}, {'_id': 0, 'password_hash': 0}):
            d = serialize_doc(u)
            d['rotation_order'] = u.get('rotation_order', 99)
            d['rotation_rank'] = u.get('rotation_rank') or u.get('rotation_order') or 99
            d['last_dispatched_at'] = u.get('last_dispatched_at')
            d['on_duty'] = u.get('on_duty', True)
            d['truck_number'] = u.get('truck_number')
            # Live location (if driver has ever pinged)
            d['last_known_lat'] = u.get('last_known_lat')
            d['last_known_lng'] = u.get('last_known_lng')
            d['last_known_speed'] = u.get('last_known_speed')
            d['last_known_heading'] = u.get('last_known_heading')
            d['last_location_at'] = u.get('last_location_at')
            # Active job count
            d['active_jobs'] = await db.tow_jobs.count_documents({
                'assigned_driver_id': u['id'],
                'status': {'$nin': ['completed', 'cancelled']},
            })
            drivers.append(d)
        # Sort: on-duty first, then by oldest last_dispatched (or never dispatched), then rotation_order
        def _sort_key(d):
            on_duty = 0 if d.get('on_duty') else 1
            last = d.get('last_dispatched_at') or datetime(1970, 1, 1, tzinfo=timezone.utc)
            if hasattr(last, 'tzinfo') and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            return (on_duty, last, d.get('rotation_order', 99))
        drivers.sort(key=_sort_key)
        # Mark next-in-rotation
        for i, d in enumerate(drivers):
            d['next_in_rotation'] = (i == 0 and d.get('on_duty'))
        return drivers

    @router.get('/drivers/next')
    async def next_in_rotation(user=Depends(require_dispatcher)):
        """Returns the driver who should get the next call by rotation."""
        drivers_list = await list_drivers(user)
        for d in drivers_list:
            if d.get('on_duty'):
                return d
        return None

    # ---------- Driver rotation rank + business hours config ----------
    class RankIn(BaseModel):
        rank: int  # 1 = first call, 2 = second call, etc.

    @router.post('/drivers/{driver_id}/rank')
    async def set_rank(driver_id: str, body: RankIn, user=Depends(require_dispatcher)):
        if body.rank < 1 or body.rank > 99:
            raise HTTPException(400, 'Rank must be between 1 and 99')
        res = await db.users.update_one(
            {'id': driver_id, 'role': 'wrecker_operator'},
            {'$set': {'rotation_rank': body.rank}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, 'Driver not found')
        return {'ok': True, 'rank': body.rank}

    class BusinessHoursIn(BaseModel):
        start_hour: int = 8
        start_minute: int = 30
        end_hour: int = 17
        end_minute: int = 0
        timezone: str = 'America/Indiana/Indianapolis'    # IANA tz
        weekend_after_hours: bool = True                   # Saturdays/Sundays = after-hours all day
        enabled: bool = True

    @router.get('/business-hours')
    async def get_business_hours(user=Depends(require_wrecker)):
        rec = await db.fleet_business_hours.find_one({'fleet_id': 'default'}, {'_id': 0})
        if not rec:
            return BusinessHoursIn().model_dump()
        return serialize_doc(rec)

    @router.put('/business-hours')
    async def update_business_hours(body: BusinessHoursIn, user=Depends(require_dispatcher)):
        existing = await db.fleet_business_hours.find_one({'fleet_id': 'default'})
        doc = {'fleet_id': 'default', **body.model_dump(), 'updated_at': _now()}
        if existing:
            await db.fleet_business_hours.update_one({'fleet_id': 'default'}, {'$set': doc})
            doc['id'] = existing.get('id') or _new_id()
            doc['created_at'] = existing.get('created_at') or _now()
        else:
            doc['id'] = _new_id()
            doc['created_at'] = _now()
            await db.fleet_business_hours.insert_one(doc)
        return serialize_doc(doc)

    # =========================================================
    # Accounts CRM — customer / motor club / fleet directory
    # =========================================================
    class AccountIn(BaseModel):
        name: str
        type: str = 'other'                       # motor_club | dealership | fleet | service_shop | property_removal | police | other
        contact_name: Optional[str] = None
        phone: Optional[str] = None
        email: Optional[str] = None
        address: Optional[str] = None
        billing_email: Optional[str] = None
        notes: Optional[str] = None
        custom_reasons: List[str] = []           # per-account reason dropdown (e.g. AAA: ["Tow", "Lockout w/o Key", "Jumpstart", "Tire Change", ...])
        default_rate_overrides: Optional[Dict[str, float]] = None    # {key: rate}
        active: bool = True

    DEFAULT_ACCOUNT_REASONS = [
        'Tow', 'Lockout w/o Key', 'Lockout w/ Key', 'Jumpstart', 'Tire Change',
        'Fuel Delivery', 'Winch Out', 'Extrication', 'Mobile Mechanic', 'Battery Service', 'Other',
    ]

    @router.get('/accounts')
    async def list_accounts(q: Optional[str] = None, type: Optional[str] = None, active_only: bool = True, user=Depends(require_wrecker)):
        flt: Dict[str, Any] = {}
        if active_only:
            flt['active'] = {'$ne': False}
        if type:
            flt['type'] = type
        if q:
            flt['$or'] = [
                {'name': {'$regex': q, '$options': 'i'}},
                {'contact_name': {'$regex': q, '$options': 'i'}},
                {'phone': {'$regex': q, '$options': 'i'}},
            ]
        out = []
        async for a in db.accounts.find(flt, {'_id': 0}).sort('name', 1):
            out.append(serialize_doc(a))
        return out

    @router.post('/accounts')
    async def create_account(body: AccountIn, user=Depends(require_dispatcher)):
        existing = await db.accounts.find_one({'name': {'$regex': f'^{body.name}$', '$options': 'i'}})
        if existing:
            raise HTTPException(409, 'Account with that name already exists')
        doc = body.model_dump()
        if not doc.get('custom_reasons'):
            doc['custom_reasons'] = DEFAULT_ACCOUNT_REASONS.copy()
        doc.update({
            'id': _new_id(),
            'created_at': _now(),
            'updated_at': _now(),
            'created_by': user['id'],
        })
        await db.accounts.insert_one(doc)
        return serialize_doc(doc)

    @router.get('/accounts/{account_id}')
    async def get_account(account_id: str, user=Depends(require_wrecker)):
        rec = await db.accounts.find_one({'id': account_id}, {'_id': 0})
        if not rec:
            raise HTTPException(404, 'Account not found')
        return serialize_doc(rec)

    @router.put('/accounts/{account_id}')
    async def update_account(account_id: str, body: AccountIn, user=Depends(require_dispatcher)):
        existing = await db.accounts.find_one({'id': account_id})
        if not existing:
            raise HTTPException(404, 'Account not found')
        update = body.model_dump()
        update['updated_at'] = _now()
        await db.accounts.update_one({'id': account_id}, {'$set': update})
        rec = await db.accounts.find_one({'id': account_id}, {'_id': 0})
        return serialize_doc(rec)

    @router.delete('/accounts/{account_id}')
    async def delete_account(account_id: str, user=Depends(require_dispatcher)):
        # Soft-delete via active flag
        await db.accounts.update_one({'id': account_id}, {'$set': {'active': False, 'updated_at': _now()}})
        return {'ok': True}

    # =========================================================
    # Time Clock — clock in/out + lunch break tracking + payroll preview
    # =========================================================
    class ClockActionIn(BaseModel):
        action: str                                     # in | out | lunch_start | lunch_end
        driver_id: Optional[str] = None                 # if dispatcher is clocking on someone else's behalf
        note: Optional[str] = None

    @router.get('/clock/today')
    async def clock_today(driver_id: Optional[str] = None, user=Depends(require_wrecker)):
        """Get today's open & closed clock entries for a driver (defaults to me)."""
        target_id = driver_id or user['id']
        if driver_id and not _is_dispatcher(user) and target_id != user['id']:
            raise HTTPException(403, 'Only dispatchers can read others\' time clock')
        # Find today's entries (since 4am local UTC for now — naive but works for demo)
        since = _now() - timedelta(hours=24)
        cursor = db.clock_entries.find({'driver_id': target_id, 'clocked_in_at': {'$gte': since}}).sort('clocked_in_at', -1)
        entries = []
        async for e in cursor:
            entries.append(serialize_doc(e))
        return entries

    @router.get('/clock/active')
    async def clock_active_all(user=Depends(require_dispatcher)):
        """Dispatcher view: every driver who's currently clocked in (no clocked_out_at)."""
        cursor = db.clock_entries.find({'clocked_out_at': None}).sort('clocked_in_at', -1)
        out = []
        async for e in cursor:
            doc = serialize_doc(e)
            # Pull driver's display name + truck
            u = await db.users.find_one({'id': e['driver_id']}, {'name': 1, 'truck_number': 1})
            if u:
                doc['driver_name'] = u.get('name')
                doc['truck_number'] = u.get('truck_number')
            out.append(doc)
        return out

    @router.post('/clock')
    async def clock_action(body: ClockActionIn, user=Depends(require_wrecker)):
        """Atomic clock action: in / out / lunch_start / lunch_end."""
        target_id = body.driver_id or user['id']
        # Only dispatchers can clock for others
        if body.driver_id and body.driver_id != user['id'] and not _is_dispatcher(user):
            raise HTTPException(403, 'Only dispatchers can clock for other drivers')
        now = _now()

        # Find current open shift
        open_shift = await db.clock_entries.find_one({'driver_id': target_id, 'clocked_out_at': None})

        if body.action == 'in':
            if open_shift:
                raise HTTPException(409, 'Already clocked in')
            doc = {
                'id': _new_id(),
                'driver_id': target_id,
                'clocked_in_at': now,
                'clocked_in_by': user['id'],
                'clocked_in_note': body.note,
                'clocked_out_at': None,
                'lunches': [],          # [{start, end}]
                'created_at': now,
            }
            await db.clock_entries.insert_one(doc)
            return {'ok': True, 'shift': serialize_doc(doc)}

        if not open_shift:
            raise HTTPException(409, 'Not currently clocked in')

        if body.action == 'out':
            # Close any open lunch
            lunches = open_shift.get('lunches') or []
            if lunches and lunches[-1].get('end') is None:
                lunches[-1]['end'] = now
            # Compute total worked minutes (excluding lunch)
            in_t = open_shift['clocked_in_at']
            if hasattr(in_t, 'tzinfo') and in_t.tzinfo is None:
                in_t = in_t.replace(tzinfo=timezone.utc)
            total_min = (now - in_t).total_seconds() / 60.0
            lunch_min = 0
            for l in lunches:
                if l.get('start') and l.get('end'):
                    s = l['start']; e = l['end']
                    if hasattr(s, 'tzinfo') and s.tzinfo is None: s = s.replace(tzinfo=timezone.utc)
                    if hasattr(e, 'tzinfo') and e.tzinfo is None: e = e.replace(tzinfo=timezone.utc)
                    lunch_min += (e - s).total_seconds() / 60.0
            worked_min = max(0, total_min - lunch_min)
            await db.clock_entries.update_one(
                {'id': open_shift['id']},
                {'$set': {
                    'clocked_out_at': now,
                    'clocked_out_by': user['id'],
                    'clocked_out_note': body.note,
                    'lunches': lunches,
                    'total_minutes': round(total_min, 2),
                    'lunch_minutes': round(lunch_min, 2),
                    'worked_minutes': round(worked_min, 2),
                }}
            )
            return {'ok': True, 'worked_minutes': round(worked_min, 2)}

        if body.action == 'lunch_start':
            lunches = open_shift.get('lunches') or []
            if lunches and lunches[-1].get('end') is None:
                raise HTTPException(409, 'Lunch already in progress')
            lunches.append({'start': now, 'end': None, 'started_by': user['id']})
            await db.clock_entries.update_one({'id': open_shift['id']}, {'$set': {'lunches': lunches}})
            return {'ok': True, 'lunch': lunches[-1]}

        if body.action == 'lunch_end':
            lunches = open_shift.get('lunches') or []
            if not lunches or lunches[-1].get('end') is not None:
                raise HTTPException(409, 'No lunch in progress')
            lunches[-1]['end'] = now
            lunches[-1]['ended_by'] = user['id']
            await db.clock_entries.update_one({'id': open_shift['id']}, {'$set': {'lunches': lunches}})
            return {'ok': True, 'lunch': lunches[-1]}

        raise HTTPException(400, 'Invalid action')

    @router.get('/payroll/preview')
    async def payroll_preview(start: Optional[str] = None, end: Optional[str] = None, user=Depends(require_dispatcher)):
        """Build a simple payroll preview: totals per driver between dates (defaults: last 14 days)."""
        end_dt = datetime.fromisoformat(end) if end else _now()
        start_dt = datetime.fromisoformat(start) if start else (_now() - timedelta(days=14))
        if hasattr(start_dt, 'tzinfo') and start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        if hasattr(end_dt, 'tzinfo') and end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        # Aggregate by driver
        cursor = db.clock_entries.find({
            'clocked_in_at': {'$gte': start_dt, '$lt': end_dt},
            'clocked_out_at': {'$ne': None},
        })
        totals: Dict[str, Dict[str, Any]] = {}
        async for e in cursor:
            did = e['driver_id']
            d = totals.setdefault(did, {'driver_id': did, 'shifts': 0, 'total_worked_min': 0.0, 'total_lunch_min': 0.0})
            d['shifts'] += 1
            d['total_worked_min'] += float(e.get('worked_minutes', 0) or 0)
            d['total_lunch_min'] += float(e.get('lunch_minutes', 0) or 0)
        # Add driver names + completed jobs count for commission preview
        out = []
        for did, agg in totals.items():
            u = await db.users.find_one({'id': did}, {'name': 1, 'truck_number': 1, 'pay_rate': 1})
            agg['driver_name'] = (u or {}).get('name') or 'Unknown'
            agg['truck_number'] = (u or {}).get('truck_number')
            agg['pay_rate'] = (u or {}).get('pay_rate') or 18.00
            agg['hours'] = round(agg['total_worked_min'] / 60.0, 2)
            agg['gross_pay'] = round(agg['hours'] * agg['pay_rate'], 2)
            agg['completed_jobs'] = await db.tow_jobs.count_documents({
                'assigned_driver_id': did,
                'status': 'completed',
                'completed_at': {'$gte': start_dt, '$lt': end_dt},
            })
            out.append(agg)
        out.sort(key=lambda x: -x['hours'])
        return {
            'start': start_dt.isoformat(),
            'end': end_dt.isoformat(),
            'drivers': out,
            'total_hours': round(sum(d['hours'] for d in out), 2),
            'total_gross': round(sum(d['gross_pay'] for d in out), 2),
        }

    # =========================================================
    # Trucks Fleet — maintenance work orders + driver-side expense logging
    # =========================================================
    class TruckIn(BaseModel):
        number: str                                    # display number (e.g. "66")
        year: Optional[int] = None
        make: Optional[str] = None
        model: Optional[str] = None
        vin: Optional[str] = None
        plate: Optional[str] = None
        state: Optional[str] = None
        current_mileage: Optional[int] = None
        status: str = 'active'                         # active | oos (out of service) | sold | retired
        assigned_driver_id: Optional[str] = None
        duty_class: Optional[str] = None               # Light / Medium / Heavy / Rotator
        notes: Optional[str] = None

    class WorkOrderIn(BaseModel):
        truck_id: str
        kind: str = 'repair'                           # oil_change | tire_rotation | brake | transmission | engine | inspection | repair | other
        description: str
        cost: float = 0.0
        labor_hours: Optional[float] = None
        vendor: Optional[str] = None
        invoice_number: Optional[str] = None
        mileage_at_service: Optional[int] = None
        scheduled_date: Optional[datetime] = None
        completed_date: Optional[datetime] = None
        status: str = 'pending'                        # pending | in_progress | completed | cancelled
        parts: Optional[str] = None
        notes: Optional[str] = None

    class ExpenseIn(BaseModel):
        truck_id: Optional[str] = None
        driver_id: Optional[str] = None
        kind: str = 'fuel'                             # fuel | parts | tolls | repair | misc
        amount: float
        gallons: Optional[float] = None
        vendor: Optional[str] = None
        receipt_data_url: Optional[str] = None         # base64 photo of receipt
        mileage: Optional[int] = None
        notes: Optional[str] = None
        reimbursable: bool = True
        date: Optional[datetime] = None

    @router.get('/trucks')
    async def list_trucks(user=Depends(require_wrecker)):
        out = []
        async for t in db.trucks.find({}, {'_id': 0}).sort('number', 1):
            doc = serialize_doc(t)
            # Aggregate stats per truck
            doc['ytd_maintenance'] = 0.0
            doc['ytd_expenses'] = 0.0
            doc['last_service_at'] = None
            since = datetime(_now().year, 1, 1, tzinfo=timezone.utc)
            async for wo in db.truck_work_orders.find({'truck_id': t['id'], 'status': 'completed', 'completed_date': {'$gte': since}}):
                doc['ytd_maintenance'] += float(wo.get('cost', 0) or 0)
                ld = wo.get('completed_date')
                if ld and (not doc['last_service_at'] or ld > doc['last_service_at']):
                    doc['last_service_at'] = ld
            async for ex in db.truck_expenses.find({'truck_id': t['id'], 'date': {'$gte': since}}):
                doc['ytd_expenses'] += float(ex.get('amount', 0) or 0)
            doc['ytd_maintenance'] = round(doc['ytd_maintenance'], 2)
            doc['ytd_expenses'] = round(doc['ytd_expenses'], 2)
            doc['open_work_orders'] = await db.truck_work_orders.count_documents({'truck_id': t['id'], 'status': {'$in': ['pending', 'in_progress']}})
            if doc.get('last_service_at'):
                doc['last_service_at'] = doc['last_service_at'].isoformat()
            out.append(doc)
        return out

    @router.post('/trucks')
    async def create_truck(body: TruckIn, user=Depends(require_dispatcher)):
        existing = await db.trucks.find_one({'number': body.number})
        if existing:
            raise HTTPException(409, f'Truck #{body.number} already exists')
        doc = body.model_dump()
        doc.update({'id': _new_id(), 'created_at': _now(), 'updated_at': _now()})
        await db.trucks.insert_one(doc)
        return serialize_doc(doc)

    @router.put('/trucks/{truck_id}')
    async def update_truck(truck_id: str, body: TruckIn, user=Depends(require_dispatcher)):
        existing = await db.trucks.find_one({'id': truck_id})
        if not existing:
            raise HTTPException(404, 'Truck not found')
        update = body.model_dump()
        update['updated_at'] = _now()
        await db.trucks.update_one({'id': truck_id}, {'$set': update})
        return serialize_doc(await db.trucks.find_one({'id': truck_id}, {'_id': 0}))

    @router.get('/trucks/{truck_id}/work-orders')
    async def list_work_orders(truck_id: str, user=Depends(require_wrecker)):
        out = []
        async for wo in db.truck_work_orders.find({'truck_id': truck_id}).sort('created_at', -1):
            out.append(serialize_doc(wo))
        return out

    @router.post('/work-orders')
    async def create_work_order(body: WorkOrderIn, user=Depends(require_wrecker)):
        # Verify truck exists
        truck = await db.trucks.find_one({'id': body.truck_id})
        if not truck:
            raise HTTPException(404, 'Truck not found')
        doc = body.model_dump()
        doc.update({
            'id': _new_id(),
            'created_at': _now(),
            'updated_at': _now(),
            'created_by': user['id'],
        })
        if body.status == 'completed' and not body.completed_date:
            doc['completed_date'] = _now()
        await db.truck_work_orders.insert_one(doc)
        return serialize_doc(doc)

    @router.put('/work-orders/{wo_id}')
    async def update_work_order(wo_id: str, body: WorkOrderIn, user=Depends(require_wrecker)):
        existing = await db.truck_work_orders.find_one({'id': wo_id})
        if not existing:
            raise HTTPException(404, 'Work order not found')
        update = body.model_dump()
        update['updated_at'] = _now()
        if update['status'] == 'completed' and not update.get('completed_date') and existing.get('status') != 'completed':
            update['completed_date'] = _now()
        await db.truck_work_orders.update_one({'id': wo_id}, {'$set': update})
        return serialize_doc(await db.truck_work_orders.find_one({'id': wo_id}, {'_id': 0}))

    @router.delete('/work-orders/{wo_id}')
    async def delete_work_order(wo_id: str, user=Depends(require_dispatcher)):
        await db.truck_work_orders.delete_one({'id': wo_id})
        return {'ok': True}

    @router.get('/expenses')
    async def list_expenses(truck_id: Optional[str] = None, driver_id: Optional[str] = None, user=Depends(require_wrecker)):
        flt: Dict[str, Any] = {}
        if truck_id: flt['truck_id'] = truck_id
        if driver_id: flt['driver_id'] = driver_id
        # Drivers can only see their own expenses
        if _is_driver(user) and not flt.get('driver_id'):
            flt['driver_id'] = user['id']
        out = []
        async for ex in db.truck_expenses.find(flt, {'_id': 0}).sort('date', -1).limit(200):
            out.append(serialize_doc(ex))
        return out

    @router.post('/expenses')
    async def create_expense(body: ExpenseIn, user=Depends(require_wrecker)):
        doc = body.model_dump()
        doc.update({
            'id': _new_id(),
            'driver_id': body.driver_id or user['id'],
            'date': body.date or _now(),
            'created_at': _now(),
            'created_by': user['id'],
            'created_by_name': user.get('name'),
        })
        await db.truck_expenses.insert_one(doc)
        return serialize_doc(doc)

    @router.delete('/expenses/{exp_id}')
    async def delete_expense(exp_id: str, user=Depends(require_wrecker)):
        existing = await db.truck_expenses.find_one({'id': exp_id})
        if not existing:
            raise HTTPException(404, 'Expense not found')
        # Drivers can only delete their own; dispatchers can delete any
        if _is_driver(user) and existing.get('created_by') != user['id']:
            raise HTTPException(403, 'You can only delete your own expenses')
        await db.truck_expenses.delete_one({'id': exp_id})
        return {'ok': True}

    @router.post('/drivers/{driver_id}/duty')
    async def set_duty(driver_id: str, body: Dict[str, bool], user=Depends(require_dispatcher)):
        """Toggle a driver on/off duty (affects rotation eligibility)."""
        on_duty = bool(body.get('on_duty', True))
        res = await db.users.update_one(
            {'id': driver_id, 'role': 'wrecker_operator'},
            {'$set': {'on_duty': on_duty}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, 'Driver not found')
        return {'ok': True, 'on_duty': on_duty}

    # =========================================================
    # Live truck tracking — driver pushes GPS, dispatcher reads
    # =========================================================
    class DriverLocationIn(BaseModel):
        lat: float
        lng: float
        accuracy: Optional[float] = None     # meters
        speed: Optional[float] = None        # m/s
        heading: Optional[float] = None      # degrees
        battery: Optional[float] = None      # 0..1 if available

    @router.post('/drivers/me/location')
    async def update_my_location(body: DriverLocationIn, user=Depends(require_wrecker)):
        """Driver-side: phone GPS pushes here every ~30s. Permissioned by browser, not API key."""
        if user.get('role') not in ('wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'):
            raise HTTPException(403, 'Only wrecker users can ping location')
        update = {
            'last_known_lat': body.lat,
            'last_known_lng': body.lng,
            'last_known_accuracy': body.accuracy,
            'last_known_speed': body.speed,
            'last_known_heading': body.heading,
            'last_known_battery': body.battery,
            'last_location_at': _now(),
        }
        await db.users.update_one({'id': user['id']}, {'$set': update})
        # Also append to a lightweight breadcrumb collection (last 200 points per driver, ttl-ish)
        breadcrumb = {
            'driver_id': user['id'], 'lat': body.lat, 'lng': body.lng,
            'speed': body.speed, 'heading': body.heading, 'at': _now(),
        }
        await db.driver_breadcrumbs.insert_one(breadcrumb)
        # Trim breadcrumbs to last 200 per driver (best-effort)
        try:
            cnt = await db.driver_breadcrumbs.count_documents({'driver_id': user['id']})
            if cnt > 200:
                # Delete oldest beyond 200
                old = db.driver_breadcrumbs.find({'driver_id': user['id']}).sort('at', 1).limit(cnt - 200)
                ids_to_delete = [doc['_id'] async for doc in old]
                if ids_to_delete:
                    await db.driver_breadcrumbs.delete_many({'_id': {'$in': ids_to_delete}})
        except Exception:
            pass
        return {'ok': True, 'last_location_at': update['last_location_at'].isoformat()}

    @router.get('/drivers/locations')
    async def all_driver_locations(user=Depends(require_dispatcher)):
        """Dispatcher-only: live snapshot of every on-duty driver's last known position."""
        out = []
        async for u in db.users.find({'role': 'wrecker_operator'}, {'_id': 0, 'password_hash': 0}):
            if u.get('last_known_lat') is None or u.get('last_known_lng') is None:
                continue
            out.append({
                'id': u['id'],
                'name': u.get('name'),
                'truck_number': u.get('truck_number'),
                'on_duty': u.get('on_duty', True),
                'lat': u['last_known_lat'],
                'lng': u['last_known_lng'],
                'speed': u.get('last_known_speed'),
                'heading': u.get('last_known_heading'),
                'accuracy': u.get('last_known_accuracy'),
                'last_location_at': (u.get('last_location_at') or _now()).isoformat() if isinstance(u.get('last_location_at'), datetime) else u.get('last_location_at'),
            })
        return out

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
            except Exception:
                doc['days_stored'] = 1
                doc['accrued_storage_fee'] = float(it.get('daily_rate', 0))
            # Backfill stock_number for legacy records (one-time on read)
            if not doc.get('stock_number'):
                doc['stock_number'] = (it.get('id') or '')[:8].upper()
            items.append(doc)
        return items

    @router.post('/impounds')
    async def create_impound(body: ImpoundIn, user=Depends(require_wrecker)):
        # Auto-assign next stock number (8-digit, mimics Towbook style)
        ctr = await db.counters.find_one_and_update(
            {'_id': 'impound_stock'},
            {'$inc': {'value': 1}},
            upsert=True,
            return_document=True,
        )
        # Start at 27500000 to look like real Towbook stock #s
        seed = 27500000
        next_val = (ctr.get('value') if ctr else 1) or 1
        stock_number = str(seed + next_val)
        doc = body.model_dump()
        doc.update({
            'id': _new_id(),
            'stock_number': stock_number,
            'created_at': _now(),
            'impounded_at': body.impounded_at or _now(),
            'released_at': None,
            'released_to': None,
            'amount_paid': 0.0,
            'created_by': user['id'],
            'notes_log': [],
            'certified_mail': [],
        })
        await db.impounds.insert_one(doc)
        return serialize_doc(doc)

    @router.get('/impounds/{impound_id}')
    async def get_impound(impound_id: str, user=Depends(require_wrecker)):
        rec = await db.impounds.find_one({'id': impound_id}, {'_id': 0})
        if not rec:
            raise HTTPException(404, 'Impound record not found')
        # Compute live storage fee
        try:
            start = rec.get('impounded_at') or rec.get('created_at')
            if start:
                if hasattr(start, 'tzinfo') and start.tzinfo is None:
                    start = start.replace(tzinfo=timezone.utc)
                delta_days = (_now() - start).days
                days = max(1, delta_days + 1)
                rec['days_stored'] = days
                rec['accrued_storage_fee'] = round(days * float(rec.get('daily_rate', 0)), 2)
            else:
                rec['days_stored'] = 1
                rec['accrued_storage_fee'] = float(rec.get('daily_rate', 0))
        except Exception:
            rec['days_stored'] = 1
        return serialize_doc(rec)

    @router.post('/impounds/{impound_id}/notes')
    async def add_impound_note(impound_id: str, body: ImpoundNoteIn, user=Depends(require_wrecker)):
        if not body.note or not body.note.strip():
            raise HTTPException(400, 'Note required')
        existing = await db.impounds.find_one({'id': impound_id})
        if not existing:
            raise HTTPException(404, 'Impound not found')
        entry = {
            'id': _new_id(),
            'note': body.note.strip(),
            'by_user_id': user['id'],
            'by_name': user.get('name'),
            'at': _now(),
        }
        await db.impounds.update_one(
            {'id': impound_id},
            {'$push': {'notes_log': entry}, '$set': {'updated_at': _now()}}
        )
        return {'ok': True, 'note': serialize_doc(entry)}

    @router.post('/impounds/{impound_id}/certified-mail')
    async def add_certified_mail(impound_id: str, body: CertifiedMailIn, user=Depends(require_wrecker)):
        existing = await db.impounds.find_one({'id': impound_id})
        if not existing:
            raise HTTPException(404, 'Impound not found')
        entry = body.model_dump()
        entry.update({
            'id': _new_id(),
            'sent_at': body.sent_at or _now(),
            'logged_at': _now(),
            'logged_by': user['id'],
        })
        await db.impounds.update_one(
            {'id': impound_id},
            {'$push': {'certified_mail': entry}, '$set': {'updated_at': _now()}}
        )
        return {'ok': True, 'entry': serialize_doc(entry)}

    @router.put('/impounds/{impound_id}/certified-mail/{entry_id}/status')
    async def update_mail_status(impound_id: str, entry_id: str, body: Dict[str, str], user=Depends(require_wrecker)):
        new_status = body.get('status')
        if new_status not in ('sent', 'delivered', 'returned', 'undeliverable'):
            raise HTTPException(400, 'Invalid status')
        res = await db.impounds.update_one(
            {'id': impound_id, 'certified_mail.id': entry_id},
            {'$set': {'certified_mail.$.status': new_status, 'certified_mail.$.status_updated_at': _now(), 'updated_at': _now()}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, 'Impound or mail entry not found')
        return {'ok': True}

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

    # =========================================================
    # Towbook parity: Photos, Charges, Payments, Damage Form, Waiver, Receipts
    # =========================================================

    def _job_or_404(job_id: str):
        async def _inner():
            j = await db.tow_jobs.find_one({'id': job_id})
            if not j:
                raise HTTPException(404, 'Job not found')
            return j
        return _inner

    async def _get_job_for_driver(job_id: str, user):
        j = await db.tow_jobs.find_one({'id': job_id})
        if not j:
            raise HTTPException(404, 'Job not found')
        if _is_driver(user) and j.get('assigned_driver_id') != user['id']:
            raise HTTPException(403, 'Not your call. Talk to dispatch.')
        return j

    # ---------- Photos ----------
    @router.post('/jobs/{job_id}/photo')
    async def add_job_photo(job_id: str, body: PhotoUploadIn, user=Depends(require_wrecker)):
        """Attach a base64 photo to a job, tagged by capture stage (on_scene/towing/dest_arrival/etc).
        Photos are stored INSIDE the app — never auto-saved to camera roll."""
        await _get_job_for_driver(job_id, user)
        if body.stage and body.stage not in PHOTO_STAGES:
            raise HTTPException(400, f"Invalid stage. Allowed: {PHOTO_STAGES}")
        photo = {
            'id': _new_id(),
            'data_url': body.data_url,
            'stage': body.stage or 'other',
            'caption': body.caption,
            'taken_at': _now(),
            'taken_by': user['id'],
            'taken_by_name': user.get('name'),
        }
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$push': {'photos': photo}, '$set': {'updated_at': _now()}}
        )
        return {'ok': True, 'photo_id': photo['id'], 'stage': photo['stage'], 'taken_at': photo['taken_at'].isoformat()}

    @router.delete('/jobs/{job_id}/photo/{photo_id}')
    async def delete_job_photo(job_id: str, photo_id: str, user=Depends(require_wrecker)):
        await _get_job_for_driver(job_id, user)
        res = await db.tow_jobs.update_one(
            {'id': job_id},
            {'$pull': {'photos': {'id': photo_id}}, '$set': {'updated_at': _now()}}
        )
        if res.modified_count == 0:
            raise HTTPException(404, 'Photo not found on job')
        return {'ok': True}

    # ---------- Charges (line items) ----------
    def _recompute_totals(job: Dict[str, Any]) -> Dict[str, float]:
        charges = job.get('charges') or []
        subtotal = sum(round(float(c.get('rate', 0)) * float(c.get('qty', 0)), 2) for c in charges)
        tax_rate = float(job.get('tax_rate', 0) or 0)
        tax = round(subtotal * tax_rate, 2)
        total = round(subtotal + tax, 2)
        payments = job.get('payments') or []
        paid = round(sum(float(p.get('amount', 0)) for p in payments), 2)
        balance = round(total - paid, 2)
        return {
            'subtotal': round(subtotal, 2),
            'tax': tax,
            'invoice_total': total,
            'amount_paid': paid,
            'balance_due': balance,
        }

    @router.post('/jobs/{job_id}/charges')
    async def add_charge(job_id: str, body: ChargeIn, user=Depends(require_wrecker)):
        # Drivers can add charges to their own jobs (they need to log mileage on scene).
        existing = await _get_job_for_driver(job_id, user)
        line = body.model_dump()
        line['id'] = _new_id()
        line['subtotal'] = round(line['rate'] * line['qty'], 2)
        line['added_at'] = _now()
        line['added_by'] = user['id']
        charges = list(existing.get('charges') or [])
        charges.append(line)
        existing['charges'] = charges
        totals = _recompute_totals(existing)
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'charges': charges, 'updated_at': _now(), **totals}}
        )
        return {'ok': True, 'charge': serialize_doc(line), 'totals': totals}

    @router.delete('/jobs/{job_id}/charges/{charge_id}')
    async def delete_charge(job_id: str, charge_id: str, user=Depends(require_wrecker)):
        existing = await _get_job_for_driver(job_id, user)
        charges = [c for c in (existing.get('charges') or []) if c.get('id') != charge_id]
        existing['charges'] = charges
        totals = _recompute_totals(existing)
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'charges': charges, 'updated_at': _now(), **totals}}
        )
        return {'ok': True, 'totals': totals}

    # ---------- Payments ----------
    @router.post('/jobs/{job_id}/payments')
    async def add_payment(job_id: str, body: PaymentIn, user=Depends(require_wrecker)):
        existing = await _get_job_for_driver(job_id, user)
        pay = body.model_dump()
        pay.update({
            'id': _new_id(),
            'received_at': _now(),
            'received_by': user['id'],
            'received_by_name': user.get('name'),
        })
        payments = list(existing.get('payments') or [])
        payments.append(pay)
        existing['payments'] = payments
        totals = _recompute_totals(existing)
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'payments': payments, 'updated_at': _now(), **totals}}
        )
        return {'ok': True, 'payment': serialize_doc(pay), 'totals': totals}

    @router.delete('/jobs/{job_id}/payments/{payment_id}')
    async def delete_payment(job_id: str, payment_id: str, user=Depends(require_wrecker)):
        existing = await _get_job_for_driver(job_id, user)
        payments = [p for p in (existing.get('payments') or []) if p.get('id') != payment_id]
        existing['payments'] = payments
        totals = _recompute_totals(existing)
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'payments': payments, 'updated_at': _now(), **totals}}
        )
        return {'ok': True, 'totals': totals}

    # ---------- Damage Form ----------
    @router.get('/jobs/{job_id}/damage-form')
    async def get_damage_form(job_id: str, user=Depends(require_wrecker)):
        await _get_job_for_driver(job_id, user)
        rec = await db.damage_forms.find_one({'job_id': job_id}, {'_id': 0})
        return serialize_doc(rec) if rec else None

    @router.post('/jobs/{job_id}/damage-form')
    async def upsert_damage_form(job_id: str, body: DamageFormIn, user=Depends(require_wrecker)):
        await _get_job_for_driver(job_id, user)
        existing = await db.damage_forms.find_one({'job_id': job_id})
        doc = {
            'job_id': job_id,
            'marks': [m.model_dump() for m in body.marks],
            'customer_name': body.customer_name,
            'signature_data_url': body.signature_data_url,
            'notes': body.notes,
            'updated_at': _now(),
            'updated_by': user['id'],
        }
        if existing:
            await db.damage_forms.update_one({'job_id': job_id}, {'$set': doc})
            doc['id'] = existing['id']
            doc['created_at'] = existing.get('created_at', _now())
        else:
            doc['id'] = _new_id()
            doc['created_at'] = _now()
            await db.damage_forms.insert_one(doc)
        # Stamp the job with damage_form_id
        await db.tow_jobs.update_one({'id': job_id}, {'$set': {'damage_form_id': doc['id'], 'updated_at': _now()}})
        return serialize_doc(doc)

    # ---------- Waiver ----------
    @router.get('/waiver/template')
    async def get_waiver_template(user=Depends(require_wrecker)):
        # Per-fleet template lookup (stub: single fleet doc keyed 'default')
        rec = await db.fleet_waiver_templates.find_one({'fleet_id': 'default'}, {'_id': 0})
        if not rec:
            return {
                'fleet_id': 'default',
                'company_name': 'Martin Wrecker Service Inc',
                'waiver_text': DEFAULT_WAIVER_TEMPLATE,
            }
        return serialize_doc(rec)

    @router.put('/waiver/template')
    async def update_waiver_template(body: WaiverTemplateIn, user=Depends(require_dispatcher)):
        existing = await db.fleet_waiver_templates.find_one({'fleet_id': 'default'})
        doc = {
            'fleet_id': 'default',
            'waiver_text': body.waiver_text,
            'company_name': body.company_name,
            'updated_at': _now(),
            'updated_by': user['id'],
        }
        if existing:
            await db.fleet_waiver_templates.update_one({'fleet_id': 'default'}, {'$set': doc})
            doc['id'] = existing.get('id') or _new_id()
            doc['created_at'] = existing.get('created_at') or _now()
        else:
            doc['id'] = _new_id()
            doc['created_at'] = _now()
            await db.fleet_waiver_templates.insert_one(doc)
        return serialize_doc(doc)

    @router.get('/jobs/{job_id}/waiver')
    async def get_waiver(job_id: str, user=Depends(require_wrecker)):
        await _get_job_for_driver(job_id, user)
        rec = await db.waivers.find_one({'job_id': job_id}, {'_id': 0})
        return serialize_doc(rec) if rec else None

    @router.post('/jobs/{job_id}/waiver/accept')
    async def accept_waiver(job_id: str, body: WaiverAcceptIn, user=Depends(require_wrecker)):
        await _get_job_for_driver(job_id, user)
        # Snapshot the current template if not provided
        snapshot = body.waiver_text_snapshot
        company_name = 'Martin Wrecker Service Inc'
        if not snapshot:
            tpl = await db.fleet_waiver_templates.find_one({'fleet_id': 'default'})
            snapshot = (tpl or {}).get('waiver_text') or DEFAULT_WAIVER_TEMPLATE
            company_name = (tpl or {}).get('company_name') or company_name
        # Replace {{COMPANY_NAME}} in the snapshot for record
        snapshot = (snapshot or '').replace('{{COMPANY_NAME}}', company_name)
        doc = {
            'id': _new_id(),
            'job_id': job_id,
            'waiver_text_snapshot': snapshot,
            'company_name': company_name,
            'customer_name': body.customer_name,
            'signature_data_url': body.signature_data_url,
            'accepted_at': _now(),
            'accepted_by_user': user['id'],
            'created_at': _now(),
        }
        await db.waivers.insert_one(doc)
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'waiver_id': doc['id'], 'waiver_signed_at': doc['accepted_at'], 'updated_at': _now()}}
        )
        return serialize_doc(doc)

    # ---------- Rate sheet (per-fleet) ----------
    @router.get('/rate-sheet')
    async def get_rate_sheet(user=Depends(require_wrecker)):
        rec = await db.fleet_rate_sheets.find_one({'fleet_id': 'default'}, {'_id': 0})
        if not rec:
            return {'fleet_id': 'default', 'items': DEFAULT_RATE_SHEET}
        return serialize_doc(rec)

    @router.put('/rate-sheet')
    async def update_rate_sheet(body: RateSheetIn, user=Depends(require_dispatcher)):
        items = [i.model_dump() for i in body.items]
        existing = await db.fleet_rate_sheets.find_one({'fleet_id': 'default'})
        doc = {'fleet_id': 'default', 'items': items, 'updated_at': _now()}
        if existing:
            await db.fleet_rate_sheets.update_one({'fleet_id': 'default'}, {'$set': doc})
            doc['id'] = existing.get('id') or _new_id()
            doc['created_at'] = existing.get('created_at') or _now()
        else:
            doc['id'] = _new_id()
            doc['created_at'] = _now()
            await db.fleet_rate_sheets.insert_one(doc)
        return serialize_doc(doc)

    # ---------- Receipts (Email + SMS via SendGrid/Twilio) ----------
    def _format_receipt_html(job: Dict[str, Any], totals: Dict[str, float], opts: ReceiptSendIn, company_name: str) -> str:
        veh = job.get('vehicle') or {}
        veh_str = ' '.join(str(x) for x in [veh.get('year'), veh.get('color'), veh.get('make'), veh.get('model')] if x)
        rows = ''
        if not opts.hide_charges:
            for c in (job.get('charges') or []):
                rows += f"<tr><td style='padding:6px 0;border-bottom:1px solid #eee'>{c.get('label','')} ({c.get('qty',1)} × ${c.get('rate',0):.2f})</td><td style='padding:6px 0;border-bottom:1px solid #eee;text-align:right'>${c.get('subtotal',0):.2f}</td></tr>"
        photos_html = ''
        if not opts.hide_photos:
            photos = (job.get('photos') or [])[:6]
            if photos:
                photos_html = "<div style='margin-top:16px'><div style='font-weight:bold;margin-bottom:8px'>Job Photos</div>"
                for p in photos:
                    photos_html += f"<img src='{p.get('data_url','')}' alt='{p.get('stage','photo')}' style='max-width:240px;margin:4px;border-radius:6px' />"
                photos_html += "</div>"
        msg_html = f"<p style='color:#475569'>{opts.message}</p>" if opts.message else ''
        pay_link = ''
        if opts.include_payment_link and totals.get('balance_due', 0) > 0:
            pay_link = f"<p style='margin-top:16px'><a href='#' style='background:#f59e0b;color:#0f172a;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold'>Pay ${totals['balance_due']:.2f} Online</a></p>"
        return f"""
<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto'>
  <div style='background:#0f172a;color:white;padding:20px;border-radius:12px 12px 0 0'>
    <div style='font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24'>Tow Service Receipt</div>
    <div style='font-size:22px;font-weight:bold;margin-top:6px'>{company_name}</div>
  </div>
  <div style='background:white;border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 12px 12px'>
    {msg_html}
    <div style='color:#64748b;font-size:13px'>Job # {job.get('id','')[:8].upper()} · {veh_str or 'Vehicle'} {('· '+veh.get('plate','')) if veh.get('plate') else ''}</div>
    <table style='width:100%;border-collapse:collapse;margin-top:16px;font-size:14px'>
      {rows}
      <tr><td style='padding:8px 0'><b>Sub Total</b></td><td style='padding:8px 0;text-align:right'>${totals['subtotal']:.2f}</td></tr>
      <tr><td style='padding:4px 0'>Tax</td><td style='padding:4px 0;text-align:right'>${totals['tax']:.2f}</td></tr>
      <tr><td style='padding:8px 0;font-size:18px;font-weight:bold'>Invoice Total</td><td style='padding:8px 0;text-align:right;font-size:18px;font-weight:bold'>${totals['invoice_total']:.2f}</td></tr>
      <tr><td style='padding:4px 0;color:#16a34a'>Payments</td><td style='padding:4px 0;text-align:right;color:#16a34a'>−${totals['amount_paid']:.2f}</td></tr>
      <tr><td style='padding:8px 0;color:#dc2626;font-weight:bold'>Balance Due</td><td style='padding:8px 0;text-align:right;color:#dc2626;font-weight:bold'>${totals['balance_due']:.2f}</td></tr>
    </table>
    {pay_link}
    {photos_html}
    <div style='margin-top:24px;color:#94a3b8;font-size:11px'>Thanks for choosing {company_name}. Powered by RoadBoss · Wrecker Mode.</div>
  </div>
</div>
"""

    def _format_receipt_sms(job: Dict[str, Any], totals: Dict[str, float], company_name: str) -> str:
        veh = job.get('vehicle') or {}
        veh_str = ' '.join(str(x) for x in [veh.get('year'), veh.get('make'), veh.get('model')] if x)
        return (
            f"{company_name} receipt\n"
            f"Job #{job.get('id','')[:8].upper()} · {veh_str}\n"
            f"Total ${totals['invoice_total']:.2f} · Paid ${totals['amount_paid']:.2f}\n"
            f"Balance Due ${totals['balance_due']:.2f}"
        )

    @router.post('/jobs/{job_id}/receipt')
    async def send_receipt(job_id: str, body: ReceiptSendIn, user=Depends(require_wrecker)):
        existing = await _get_job_for_driver(job_id, user)
        totals = _recompute_totals(existing)
        # Pull company name from waiver template
        tpl = await db.fleet_waiver_templates.find_one({'fleet_id': 'default'})
        company_name = (tpl or {}).get('company_name') or 'Martin Wrecker Service Inc'

        sent = {'email': None, 'sms': None}

        if body.channel in ('email', 'both'):
            to_email = body.to_email or (existing.get('customer') or {}).get('email')
            if not to_email:
                raise HTTPException(400, 'No customer email on file. Provide to_email.')
            html = _format_receipt_html(existing, totals, body, company_name)
            if notifications is not None:
                res = await notifications.send_email(
                    db, to_email,
                    subject=f"{company_name} — Receipt for Job #{job_id[:8].upper()}",
                    html=html,
                    plain_text=_format_receipt_sms(existing, totals, company_name),
                    event_type='tow_receipt',
                    event_ref_id=job_id,
                )
                sent['email'] = res
            else:
                sent['email'] = {'ok': False, 'error': 'notifications_module_not_wired'}

        if body.channel in ('sms', 'both'):
            to_phone = body.to_phone or (existing.get('customer') or {}).get('phone')
            if not to_phone:
                raise HTTPException(400, 'No customer phone on file. Provide to_phone.')
            text = _format_receipt_sms(existing, totals, company_name)
            if notifications is not None:
                res = await notifications.send_sms(
                    db, to_phone, text,
                    event_type='tow_receipt',
                    event_ref_id=job_id,
                )
                sent['sms'] = res
            else:
                sent['sms'] = {'ok': False, 'error': 'notifications_module_not_wired'}

        # Stamp receipt sent
        await db.tow_jobs.update_one(
            {'id': job_id},
            {'$set': {'receipt_last_sent_at': _now(), 'updated_at': _now()}}
        )
        return {'ok': True, 'sent': sent, 'totals': totals}

    return router


# ---------------------------------------------------------------
# Demo seed
# ---------------------------------------------------------------

async def seed_wrecker_demo(db, hash_password):
    """Seed demo wrecker data. Idempotent: only seeds if collections empty."""
    # Demo users — full chain of command
    demo_users = [
        {'email': 'wrecker@highwaypilot.io',
         'password': 'Demo!Wrecker2026',
         'name': 'Steve Carroll',
         'role': 'wrecker_operator',
         'rotation_order': 1, 'on_duty': True},
        {'email': 'wrecker2@highwaypilot.io',
         'password': 'Demo!Wrecker2026',
         'name': 'Tony Marquez',
         'role': 'wrecker_operator',
         'rotation_order': 2, 'on_duty': True},
        {'email': 'wrecker3@highwaypilot.io',
         'password': 'Demo!Wrecker2026',
         'name': 'Jake Boudreaux',
         'role': 'wrecker_operator',
         'rotation_order': 3, 'on_duty': True},
        {'email': 'dispatcher@highwaypilot.io',
         'password': 'Demo!Dispatch2026',
         'name': 'Pam Henderson',
         'role': 'wrecker_dispatcher',
         'company_name': 'Apex Towing & Recovery'},
        {'email': 'supervisor@highwaypilot.io',
         'password': 'Demo!Super2026',
         'name': 'Bill Kearney',
         'role': 'wrecker_supervisor',
         'company_name': 'Apex Towing & Recovery'},
    ]
    driver_ids: Dict[str, str] = {}  # rotation_order -> user_id
    for u in demo_users:
        existing = await db.users.find_one({'email': u['email']})
        if existing:
            # Backfill rotation fields if missing
            patch = {}
            for f in ('rotation_order', 'on_duty', 'role'):
                if f in u and u[f] != existing.get(f):
                    patch[f] = u[f]
            if patch:
                await db.users.update_one({'id': existing['id']}, {'$set': patch})
            uid = existing['id']
        else:
            doc = {
                'id': _new_id(),
                'email': u['email'],
                'password_hash': hash_password(u['password']),
                'name': u['name'],
                'role': u['role'],
                'company_name': u.get('company_name', 'Apex Towing & Recovery'),
                'created_at': _now(),
            }
            if 'rotation_order' in u:
                doc['rotation_order'] = u['rotation_order']
                doc['on_duty'] = u.get('on_duty', True)
            await db.users.insert_one(doc)
            uid = doc['id']
        if u.get('rotation_order'):
            driver_ids[u['rotation_order']] = uid

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
             'notes': 'Primary diesel for fleet. FuelCloud paused.'},
            {'name': 'Backup DEF Tank', 'location': 'Apex Yard — Kokomo, IN', 'fuel_type': 'def',
             'capacity_gallons': 250, 'current_estimate_gallons': 180},
        ]:
            doc = dict(tank)
            doc.update({'id': _new_id(), 'created_at': _now()})
            await db.fuel_tanks.insert_one(doc)

    # Tow jobs (active dispatch board) — pre-assigned to drivers in rotation order
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
                'assign_to': None,  # pending — dispatcher will assign
            },
            {
                'service_type': 'jumpstart', 'priority': 'normal', 'status': 'assigned',
                'customer': {'name': 'Mark Reilly', 'phone': '+17655552002'},
                'vehicle': {'year': 2020, 'make': 'Ford', 'model': 'F-150', 'color': 'Black', 'plate': 'IN-9382R'},
                'pickup': {'lat': 40.4933, 'lng': -86.1247, 'address': 'Walmart Parking Lot, Kokomo, IN'},
                'notes': 'Battery dead after 30 min in store.',
                'quoted_price': 65.0, 'payment_method': 'motor_club',
                'assign_to': 1,  # Steve
            },
            {
                'service_type': 'tow_medium_duty', 'priority': 'high', 'status': 'en_route',
                'customer': {'name': 'Diana Pierce', 'phone': '+17655553003'},
                'vehicle': {'year': 2017, 'make': 'Chevy', 'model': 'Silverado 2500', 'color': 'White', 'plate': 'IN-1147T'},
                'pickup': {'lat': 40.5078, 'lng': -86.1411, 'address': 'US-31 & 350 N, Kokomo, IN'},
                'notes': 'Transmission failure, stuck in middle lane.',
                'quoted_price': 175.0, 'payment_method': 'invoice',
                'assign_to': 2,  # Tony
            },
            {
                'service_type': 'lockout', 'priority': 'emergency', 'status': 'on_scene',
                'customer': {'name': 'Tyler Brooks', 'phone': '+17655554004'},
                'vehicle': {'year': 2022, 'make': 'Toyota', 'model': 'Camry', 'color': 'Blue', 'plate': 'IN-5521W'},
                'pickup': {'lat': 40.4711, 'lng': -86.1256, 'address': 'YMCA Parking, Kokomo, IN'},
                'notes': 'Keys locked inside, baby in back seat. EMERGENCY.',
                'quoted_price': 75.0, 'payment_method': 'cash',
                'assign_to': 3,  # Jake
            },
            {
                'service_type': 'flatbed', 'priority': 'normal', 'status': 'in_progress',
                'customer': {'name': 'Carlos Mendez', 'phone': '+17655555005'},
                'vehicle': {'year': 2015, 'make': 'BMW', 'model': '328i', 'color': 'Red', 'plate': 'IN-8830M'},
                'pickup': {'lat': 40.4988, 'lng': -86.1403, 'address': '500 N Main St, Kokomo, IN'},
                'dropoff': {'lat': 40.5055, 'lng': -86.1599, 'address': 'Friendly BMW Service Center'},
                'notes': 'Lowered car, requires flatbed.',
                'quoted_price': 165.0, 'payment_method': 'card',
                'assign_to': 1,  # Steve
            },
            {
                'service_type': 'accident_recovery', 'priority': 'high', 'status': 'pending',
                'customer': {'name': 'Indiana State Police', 'phone': '+18002615457'},
                'vehicle': {'year': 2021, 'make': 'Nissan', 'model': 'Altima', 'color': 'Gray', 'plate': 'IN-4477C'},
                'pickup': {'lat': 40.5201, 'lng': -86.1655, 'address': 'I-31 NB Mile 165, Kokomo, IN'},
                'notes': 'Single-vehicle rollover. Driver to hospital. Police on scene.',
                'quoted_price': 425.0, 'payment_method': 'invoice',
                'assign_to': None,  # pending
            },
            {
                'service_type': 'winch_out', 'priority': 'normal', 'status': 'completed',
                'customer': {'name': 'Robin Larkin', 'phone': '+17655556006'},
                'vehicle': {'year': 2018, 'make': 'Jeep', 'model': 'Wrangler', 'color': 'Green', 'plate': 'IN-2266L'},
                'pickup': {'lat': 40.4733, 'lng': -86.0988, 'address': 'County Road 300 E, Kokomo, IN'},
                'notes': 'Stuck in mud after rain.',
                'quoted_price': 125.0, 'final_price': 125.0, 'payment_method': 'cash',
                'assign_to': 2,  # Tony
            },
            {
                'service_type': 'tire_change', 'priority': 'low', 'status': 'pending',
                'customer': {'name': 'Maria Santos', 'phone': '+17655557007'},
                'vehicle': {'year': 2016, 'make': 'Hyundai', 'model': 'Sonata', 'color': 'Blue', 'plate': 'IN-3399S'},
                'pickup': {'lat': 40.4655, 'lng': -86.1502, 'address': 'Kroger Parking Lot, Kokomo, IN'},
                'notes': 'Customer has spare in trunk.',
                'quoted_price': 55.0, 'payment_method': 'card',
                'assign_to': None,
            },
        ]

        for i, sj in enumerate(sample_jobs):
            doc = dict(sj)
            assign_to = doc.pop('assign_to', None)
            if assign_to and assign_to in driver_ids:
                doc['assigned_driver_id'] = driver_ids[assign_to]
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
        'wrecker_users': await db.users.count_documents({'role': {'$in': ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor']}}),
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
    'towing': {
        'phrases': ['hooking up', 'loading now', 'towing now', 'in progress', 'started', 'on the hook'],
        'action': {'type': 'tow_job_status', 'status': 'towing'},
        'spoken': "Got it. Towing in progress.",
    },
    'dest_arrival': {
        'phrases': ['at destination', 'arrived at drop', 'at the drop', 'drop off arrival', 'arrived at dropoff'],
        'action': {'type': 'tow_job_status', 'status': 'dest_arrival'},
        'spoken': "Copy. At destination.",
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
