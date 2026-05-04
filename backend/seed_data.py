"""
seed_data.py — RoadBoss / Highway Pilot demo seed module.

This module is the first step in modularizing server.py (Stage 3 Phase 2F).
It contains the rich investor-grade demo seed plus the wipe helper. All external
dependencies (db handle, helpers) are injected via function kwargs so this
module never imports from server.py — avoiding circular-import pain.

Public functions:
  - seed_demo(db, now_utc, hash_password, build_blank_items, logger): full reseed
  - wipe_demo_collections(db, logger): erase all demo collections

Server.py wires these in via thin route handlers.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any, Callable, Dict, List


DEMO_COLLECTIONS = [
    'users', 'drivers', 'vehicles', 'trips', 'trip_mileage', 'hos_logs',
    'maintenance', 'alerts', 'dashcam_events', 'inspections', 'crash_events',
    'roadside_dispatches', 'roadside_providers', 'waitlist', 'voice_log',
    'copilot_chats',
]


def _dated(payload: Dict[str, Any], when) -> Dict[str, Any]:
    """Inject id + backdated created_at/updated_at."""
    payload['id'] = str(uuid.uuid4())
    payload['created_at'] = when.isoformat()
    payload['updated_at'] = when.isoformat()
    return payload


async def wipe_demo_collections(db, logger):
    """Erase every demo collection so a force reseed starts clean."""
    for coll in DEMO_COLLECTIONS:
        try:
            await db[coll].delete_many({})
        except Exception as e:
            logger.warning(f'wipe {coll} failed: {e}')


async def seed_demo(
    db,
    now_utc: Callable,
    hash_password: Callable[[str], str],
    build_blank_items: Callable[[], List[Dict[str, Any]]],
    logger,
):
    """Rich demo seed — investor-ready. Spans last 14 days of activity.

    Injected dependencies:
      db                 : motor async database handle
      now_utc            : returns timezone-aware datetime "now"
      hash_password      : bcrypt password hasher
      build_blank_items  : DVIR pristine items factory (returns 27-item list)
      logger             : standard logger
    """
    NOW = now_utc()
    SHARED_PASSWORD = 'HighwayPilot2026!'

    # ---------------- Users (login accounts) ----------------
    user_specs = [
        {'name': 'Mike Ward (Founder)', 'email': 'super_admin@highwaypilot.io', 'role': 'super_admin'},
        {'name': 'Sarah Chen (Fleet Admin)', 'email': 'fleet_admin@highwaypilot.io', 'role': 'fleet_admin'},
        {'name': 'Diego Ruiz (Driver)', 'email': 'driver@highwaypilot.io', 'role': 'driver'},
        {'name': 'Marcus Bell (Driver)', 'email': 'marcus@highwaypilot.io', 'role': 'driver'},
        {'name': 'Aaliyah Johnson (Driver)', 'email': 'aaliyah@highwaypilot.io', 'role': 'driver'},
        {'name': 'Tyler Brooks (Driver)', 'email': 'tyler@highwaypilot.io', 'role': 'driver'},
        {'name': 'Rosa Delgado (Driver)', 'email': 'rosa@highwaypilot.io', 'role': 'driver'},
    ]
    for u in user_specs:
        await db.users.insert_one({
            'id': str(uuid.uuid4()),
            'email': u['email'],
            'name': u['name'],
            'role': u['role'],
            'password_hash': hash_password(SHARED_PASSWORD),
            'created_at': (NOW - timedelta(days=42)).isoformat(),
        })

    # ---------------- Vehicles ----------------
    vehicle_specs = [
        {'name': 'Truck 101', 'make': 'Peterbilt', 'model': '579', 'year': 2022, 'plate': 'TX-7732', 'odometer': 184500},
        {'name': 'Truck 102', 'make': 'Kenworth', 'model': 'T680', 'year': 2021, 'plate': 'TX-9914', 'odometer': 312800},
        {'name': 'Truck 103', 'make': 'Freightliner', 'model': 'Cascadia', 'year': 2023, 'plate': 'TX-2210', 'odometer': 88200},
        {'name': 'Truck 104', 'make': 'Volvo', 'model': 'VNL 860', 'year': 2020, 'plate': 'TX-4419', 'odometer': 415200},
        {'name': 'Truck 105', 'make': 'Mack', 'model': 'Anthem', 'year': 2024, 'plate': 'TX-8800', 'odometer': 22100},
    ]
    vehicles: List[Dict[str, Any]] = []
    for v in vehicle_specs:
        doc = _dated({**v, 'status': 'active', 'vin': '1FUJGLD5' + str(uuid.uuid4().int)[:9]}, NOW - timedelta(days=42))
        await db.vehicles.insert_one(dict(doc))
        vehicles.append(doc)

    # ---------------- Drivers ----------------
    # Phone numbers use NANP fictional 555-01XX block (reserved for demos, won't text real people)
    driver_specs = [
        {'name': 'Diego Ruiz', 'email': 'driver@highwaypilot.io', 'phone': '+12145550101', 'license_state': 'TX', 'license_number': 'DL-7733-A', 'home_terminal': 'Dallas, TX', 'status': 'driving', 'lat': 32.7767, 'lng': -96.7970, 'hos_remaining_minutes': 235, 'avatar_color': '#22d3ee'},
        {'name': 'Marcus Bell', 'email': 'marcus@highwaypilot.io', 'phone': '+19015550102', 'license_state': 'TN', 'license_number': 'DL-1102-B', 'home_terminal': 'Memphis, TN', 'status': 'on_duty', 'lat': 35.1495, 'lng': -90.0490, 'hos_remaining_minutes': 480, 'avatar_color': '#f59e0b'},
        {'name': 'Aaliyah Johnson', 'email': 'aaliyah@highwaypilot.io', 'phone': '+14045550103', 'license_state': 'GA', 'license_number': 'DL-9921-C', 'home_terminal': 'Atlanta, GA', 'status': 'driving', 'lat': 33.7490, 'lng': -84.3880, 'hos_remaining_minutes': 75, 'avatar_color': '#ef4444'},
        {'name': 'Tyler Brooks', 'email': 'tyler@highwaypilot.io', 'phone': '+16145550104', 'license_state': 'OH', 'license_number': 'DL-3318-D', 'home_terminal': 'Columbus, OH', 'status': 'sleeper', 'lat': 39.9612, 'lng': -82.9988, 'hos_remaining_minutes': 660, 'avatar_color': '#a855f7'},
        {'name': 'Rosa Delgado', 'email': 'rosa@highwaypilot.io', 'phone': '+16025550105', 'license_state': 'AZ', 'license_number': 'DL-5550-E', 'home_terminal': 'Phoenix, AZ', 'status': 'off_duty', 'lat': 33.4484, 'lng': -112.0740, 'hos_remaining_minutes': 660, 'avatar_color': '#10b981'},
    ]
    drivers: List[Dict[str, Any]] = []
    for i, d in enumerate(driver_specs):
        doc = _dated({**d, 'vehicle_id': vehicles[i]['id']}, NOW - timedelta(days=42))
        await db.drivers.insert_one(dict(doc))
        drivers.append(doc)

    # ---------------- Trips (14 days of history + active/planned) ----------------
    trip_specs = [
        # ACTIVE NOW
        (0, 0, 'Dallas, TX', 'Memphis, TN', 452.7, 'active', 0, None, None, 8),
        (2, 2, 'Atlanta, GA', 'Charlotte, NC', 244.8, 'active', 0, None, None, 3),
        # PLANNED (assigned, not started yet)
        (3, 3, 'Columbus, OH', 'Pittsburgh, PA', 185.3, 'planned', 0, None, None, None),
        (1, 1, 'Memphis, TN', 'St. Louis, MO', 285.0, 'planned', 0, None, None, None),
        # COMPLETED last 14 days
        (1, 1, 'Memphis, TN', 'Nashville, TN', 211.4, 'completed', 1, 4.0, [('TN', 211.4)], None),
        (0, 0, 'Houston, TX', 'Dallas, TX', 239.0, 'completed', 2, 4.5, [('TX', 239.0)], None),
        (4, 4, 'Phoenix, AZ', 'Albuquerque, NM', 419.2, 'completed', 2, 6.5, [('AZ', 178.0), ('NM', 241.2)], None),
        (1, 1, 'Nashville, TN', 'Louisville, KY', 175.6, 'completed', 3, 3.5, [('TN', 90.0), ('KY', 85.6)], None),
        (3, 3, 'Columbus, OH', 'Cleveland, OH', 142.0, 'completed', 4, 2.75, [('OH', 142.0)], None),
        (2, 2, 'Charlotte, NC', 'Atlanta, GA', 244.8, 'completed', 4, 4.5, [('NC', 142.0), ('SC', 22.0), ('GA', 80.8)], None),
        (0, 0, 'Dallas, TX', 'Oklahoma City, OK', 207.5, 'completed', 5, 3.5, [('TX', 95.5), ('OK', 112.0)], None),
        (4, 4, 'Albuquerque, NM', 'Phoenix, AZ', 419.2, 'completed', 6, 6.75, [('NM', 241.2), ('AZ', 178.0)], None),
        (1, 1, 'Louisville, KY', 'Indianapolis, IN', 114.0, 'completed', 6, 2.25, [('KY', 50.0), ('IN', 64.0)], None),
        (3, 3, 'Cleveland, OH', 'Pittsburgh, PA', 134.0, 'completed', 7, 2.75, [('OH', 78.0), ('PA', 56.0)], None),
        (2, 2, 'Atlanta, GA', 'Birmingham, AL', 148.0, 'completed', 8, 2.75, [('GA', 78.0), ('AL', 70.0)], None),
        (0, 0, 'Oklahoma City, OK', 'Dallas, TX', 207.5, 'completed', 8, 3.5, [('OK', 112.0), ('TX', 95.5)], None),
        (4, 4, 'Phoenix, AZ', 'Tucson, AZ', 113.0, 'completed', 9, 2.0, [('AZ', 113.0)], None),
        (1, 1, 'Indianapolis, IN', 'Memphis, TN', 466.0, 'completed', 10, 7.5, [('IN', 142.0), ('KY', 168.0), ('TN', 156.0)], None),
        (3, 3, 'Pittsburgh, PA', 'Columbus, OH', 185.0, 'completed', 11, 3.0, [('PA', 56.0), ('OH', 129.0)], None),
        (2, 2, 'Birmingham, AL', 'Atlanta, GA', 148.0, 'completed', 12, 2.75, [('AL', 70.0), ('GA', 78.0)], None),
        (0, 0, 'Dallas, TX', 'Houston, TX', 239.0, 'completed', 13, 4.0, [('TX', 239.0)], None),
        (4, 4, 'Tucson, AZ', 'Phoenix, AZ', 113.0, 'completed', 13, 2.0, [('AZ', 113.0)], None),
    ]
    for spec in trip_specs:
        d_idx, v_idx, origin, dest, miles, status, days_ago, hours_dur, mileage_split, hours_into = spec
        when = NOW - timedelta(days=days_ago, hours=4)
        trip_doc = _dated({
            'driver_id': drivers[d_idx]['id'],
            'vehicle_id': vehicles[v_idx]['id'],
            'origin': origin,
            'destination': dest,
            'miles': miles,
            'status': status,
        }, when)
        if status == 'active':
            trip_doc['started_at'] = (NOW - timedelta(hours=hours_into or 4)).isoformat()
        elif status == 'completed' and hours_dur:
            trip_doc['started_at'] = (when + timedelta(hours=1)).isoformat()
            trip_doc['ended_at'] = (when + timedelta(hours=1 + hours_dur)).isoformat()
        await db.trips.insert_one(dict(trip_doc))
        if mileage_split:
            for state, st_miles in mileage_split:
                me_when = when + timedelta(hours=1, minutes=30)
                await db.trip_mileage.insert_one(dict(_dated({
                    'trip_id': trip_doc['id'],
                    'state': state,
                    'miles': float(st_miles),
                    'notes': 'auto-logged',
                }, me_when)))

    # ---------------- HOS logs (last 7 days, realistic duty cycles per driver) ----------------
    duty_cycle = [
        (6, 'on_duty', 'Pre-trip + paperwork'),
        (7, 'driving', 'Departed terminal'),
        (12, 'off_duty', 'Lunch break'),
        (13, 'driving', 'Back on the road'),
        (19, 'off_duty', 'End of shift'),
        (22, 'sleeper', 'Sleeper berth'),
    ]
    for d_idx, d in enumerate(drivers):
        for days_ago in range(7, 0, -1):
            base = NOW - timedelta(days=days_ago)
            base = base.replace(hour=0, minute=0, second=0, microsecond=0)
            for hour, status_v, note in duty_cycle:
                when = base + timedelta(hours=hour, minutes=(d_idx * 7) % 30)
                await db.hos_logs.insert_one(dict(_dated({
                    'driver_id': d['id'],
                    'duty_status': status_v,
                    'started_at': when.isoformat(),
                    'notes': note,
                }, when)))
        await db.hos_logs.insert_one(dict(_dated({
            'driver_id': d['id'],
            'duty_status': d['status'],
            'started_at': (NOW - timedelta(hours=2)).isoformat(),
            'notes': 'current',
        }, NOW - timedelta(hours=2))))

    # ---------------- Maintenance (mix of completed history and upcoming) ----------------
    maint_specs = [
        {'v': 0, 'svc': 'Oil change', 'due_miles': 185000, 'completed': False, 'cost': 320.0, 'due_in_days': 3, 'notes': 'Due at 185K. Currently at 184.5K.'},
        {'v': 1, 'svc': 'Brake inspection', 'due_miles': 315000, 'completed': False, 'cost': 0, 'due_in_days': 5, 'notes': 'Quarterly air-brake inspection.'},
        {'v': 1, 'svc': 'DOT annual inspection', 'completed': False, 'cost': 95.0, 'due_in_days': 12, 'notes': 'Federal annual DOT inspection.'},
        {'v': 3, 'svc': 'Tire rotation', 'due_miles': 416000, 'completed': False, 'cost': 180.0, 'due_in_days': 8, 'notes': 'Rotate steer + drive tires.'},
        {'v': 2, 'svc': 'DEF tank refill', 'completed': False, 'cost': 45.0, 'due_in_days': 2, 'notes': 'DEF level low (driver reported on DVIR).'},
        {'v': 2, 'svc': 'Oil change', 'completed': True, 'cost': 305.0, 'due_in_days': -14, 'notes': 'Completed at Heartland 24/7. 5W-40 synthetic.'},
        {'v': 0, 'svc': 'Coolant flush', 'completed': True, 'cost': 220.0, 'due_in_days': -28, 'notes': 'Performed during scheduled maintenance.'},
        {'v': 4, 'svc': 'Pre-delivery inspection', 'completed': True, 'cost': 0, 'due_in_days': -45, 'notes': 'New unit acceptance inspection.'},
    ]
    for m in maint_specs:
        when = NOW + timedelta(days=m['due_in_days'])
        doc = _dated({
            'vehicle_id': vehicles[m['v']]['id'],
            'service_type': m['svc'],
            'due_miles': m.get('due_miles'),
            'completed': m['completed'],
            'cost': m['cost'],
            'due_at': when.isoformat(),
            'notes': m['notes'],
        }, NOW - timedelta(days=max(1, abs(m['due_in_days']) // 2)))
        await db.maintenance.insert_one(dict(doc))

    # ---------------- Alerts (varied across last 7 days, mix of severities) ----------------
    alert_specs = [
        {'days_ago': 0, 'hours_ago': 1, 'type': 'hos_violation', 'severity': 'warning', 'driver_idx': 2, 'message': 'Aaliyah Johnson approaching 11-hour drive limit (75 min remaining).', 'location': {'lat': 33.749, 'lng': -84.388}},
        {'days_ago': 0, 'hours_ago': 3, 'type': 'hard_brake', 'severity': 'warning', 'driver_idx': 0, 'vehicle_idx': 0, 'message': 'Hard braking event on Truck 101 — I-30 mile marker 187.', 'location': {'lat': 32.776, 'lng': -96.797}},
        {'days_ago': 0, 'hours_ago': 5, 'type': 'fuel_log', 'severity': 'info', 'driver_idx': 1, 'message': 'Marcus Bell logged a fuel stop at Pilot #245 — Memphis, TN. $487.20 / 142 gal.'},
        {'days_ago': 1, 'hours_ago': 2, 'type': 'maintenance_due', 'severity': 'info', 'vehicle_idx': 1, 'message': 'Truck 102 due for brake inspection within 1,200 miles.'},
        {'days_ago': 1, 'hours_ago': 8, 'type': 'speeding', 'severity': 'info', 'driver_idx': 1, 'message': 'Marcus Bell averaged 71 mph on a 65 mph zone for 3 minutes.'},
        {'days_ago': 2, 'hours_ago': 5, 'type': 'dvir_defect', 'severity': 'warning', 'driver_idx': 0, 'vehicle_idx': 0, 'message': 'DVIR Defect on Truck 101: Trailer Lights — left turn signal intermittent.'},
        {'days_ago': 3, 'hours_ago': 4, 'type': 'idle_excessive', 'severity': 'info', 'driver_idx': 3, 'vehicle_idx': 3, 'message': 'Truck 104 idled 47 minutes at rest stop. Fuel waste estimated $9.40.'},
        {'days_ago': 4, 'hours_ago': 6, 'type': 'route_deviation', 'severity': 'info', 'driver_idx': 2, 'message': 'Aaliyah Johnson deviated 12 mi off planned route — likely fuel stop.'},
        {'days_ago': 5, 'hours_ago': 9, 'type': 'hard_brake', 'severity': 'warning', 'driver_idx': 4, 'vehicle_idx': 4, 'message': 'Hard braking event on Truck 105 — I-10 East.'},
        {'days_ago': 6, 'hours_ago': 3, 'type': 'fuel_log', 'severity': 'info', 'driver_idx': 4, 'message': 'Rosa Delgado logged a fuel stop at Loves #112 — Tucson, AZ. $452.80 / 132 gal.'},
        {'days_ago': 7, 'hours_ago': 7, 'type': 'maintenance_completed', 'severity': 'info', 'vehicle_idx': 2, 'message': 'Truck 103 oil change completed at Heartland 24/7. Cost $305.'},
    ]
    for a in alert_specs:
        when = NOW - timedelta(days=a['days_ago'], hours=a['hours_ago'])
        doc = _dated({
            'type': a['type'],
            'severity': a['severity'],
            'driver_id': drivers[a['driver_idx']]['id'] if 'driver_idx' in a else None,
            'vehicle_id': vehicles[a['vehicle_idx']]['id'] if 'vehicle_idx' in a else None,
            'message': a['message'],
            'location': a.get('location'),
            'acknowledged': a['days_ago'] > 1,
        }, when)
        await db.alerts.insert_one(dict(doc))

    # ---------------- Dashcam events (15 spread over last 7 days) ----------------
    cam_specs = [
        (0, 1,  0, 0, 'Hard brake',                    'warning',  'Samsara',          'https://images.unsplash.com/photo-1580651315530-69c8e0903883?w=400'),
        (0, 5,  2, 2, 'Following too close',           'warning',  'Lytx',             None),
        (1, 2,  1, 1, 'Speeding',                      'info',     'Verizon Connect',  None),
        (1, 7,  3, 3, 'Lane departure',                'warning',  'Samsara',          None),
        (2, 4,  2, 2, 'Possible collision (false-pos)','critical', 'Lytx',             None),
        (2, 9,  0, 0, 'Hard brake',                    'warning',  'Samsara',          None),
        (3, 6,  4, 4, 'Hard acceleration',             'info',     'Samsara',          None),
        (3, 11, 1, 1, 'Following too close',           'warning',  'Lytx',             None),
        (4, 3,  3, 3, 'Lane departure',                'warning',  'Verizon Connect',  None),
        (4, 8,  2, 2, 'Speeding',                      'info',     'Samsara',          None),
        (5, 5,  0, 0, 'Distracted driving (phone)',    'warning',  'Lytx',             None),
        (5, 10, 4, 4, 'Hard brake',                    'warning',  'Samsara',          None),
        (6, 2,  1, 1, 'Rolling stop',                  'info',     'Verizon Connect',  None),
        (6, 7,  3, 3, 'Hard brake',                    'warning',  'Samsara',          None),
        (7, 4,  2, 2, 'Speeding',                      'info',     'Lytx',             None),
    ]
    for days_ago, hours_ago, v_idx, d_idx, event, sev, vendor, thumb in cam_specs:
        when = NOW - timedelta(days=days_ago, hours=hours_ago)
        doc = _dated({
            'vehicle_id': vehicles[v_idx]['id'],
            'driver_id': drivers[d_idx]['id'],
            'event': event,
            'severity': sev,
            'vendor': vendor,
            'thumbnail': thumb,
        }, when)
        await db.dashcam_events.insert_one(dict(doc))

    # ---------------- Roadside provider directory ----------------
    provider_specs = [
        {'name': 'Heartland 24/7 Truck Service', 'phone': '+1-765-555-0188', 'region': 'IN/OH/IL',
         'services': ['tire', 'tow', 'mechanical', 'jumpstart'],
         'eta_avg_minutes': 32, 'rating': 4.8, 'typical_cost': 285,
         'notes': 'Family-owned. Specializes in heavy-duty.', 'active': True,
         'logo_url': 'https://cdn-icons-png.flaticon.com/512/2730/2730032.png'},
        {'name': 'BigRig Roadside Co.', 'phone': '+1-800-555-7244', 'region': 'Nationwide',
         'services': ['tire', 'tow', 'jumpstart', 'fuel', 'mechanical', 'lockout', 'other'],
         'eta_avg_minutes': 45, 'rating': 4.5, 'typical_cost': 350,
         'notes': 'National coverage. Higher cost but always available.', 'active': True,
         'logo_url': 'https://cdn-icons-png.flaticon.com/512/2933/2933245.png'},
        {'name': 'Pilot Towing Network', 'phone': '+1-865-555-0411', 'region': 'TN/KY/GA',
         'services': ['tow', 'mechanical', 'jumpstart'],
         'eta_avg_minutes': 38, 'rating': 4.6, 'typical_cost': 320,
         'notes': 'Pilot Flying-J truck stop network. Discounts at fuel.', 'active': True,
         'logo_url': 'https://cdn-icons-png.flaticon.com/512/3306/3306921.png'},
        {'name': 'Speedy Diesel Mechanics', 'phone': '+1-405-555-0312', 'region': 'OK/TX/AR',
         'services': ['mechanical', 'fuel'],
         'eta_avg_minutes': 50, 'rating': 4.7, 'typical_cost': 410,
         'notes': 'Mobile diesel mechanics. Best for engine issues.', 'active': True,
         'logo_url': 'https://cdn-icons-png.flaticon.com/512/2942/2942067.png'},
        {'name': 'Lockout Pros', 'phone': '+1-877-555-9622', 'region': 'Nationwide',
         'services': ['lockout'],
         'eta_avg_minutes': 28, 'rating': 4.9, 'typical_cost': 145,
         'notes': 'Lockout specialists. Fast and cheap.', 'active': True,
         'logo_url': 'https://cdn-icons-png.flaticon.com/512/991/991956.png'},
        {'name': 'Trucker Tire Express', 'phone': '+1-918-555-7710', 'region': 'OK/MO/KS',
         'services': ['tire'],
         'eta_avg_minutes': 25, 'rating': 4.8, 'typical_cost': 220,
         'notes': 'Tire-only specialist. Fastest tire response in the corridor.', 'active': True,
         'logo_url': 'https://cdn-icons-png.flaticon.com/512/4821/4821637.png'},
    ]
    providers: List[Dict[str, Any]] = []
    for p in provider_specs:
        doc = _dated(p, NOW - timedelta(days=42))
        await db.roadside_providers.insert_one(dict(doc))
        providers.append(doc)

    # ---------------- DVIR inspections (certified, last 5 working days, all drivers) ----------------
    def _items_all_pass() -> List[Dict[str, Any]]:
        items = build_blank_items()
        for it in items:
            it['status'] = 'pass'
            it['updated_at'] = NOW.isoformat()
        return items

    def _items_with_defect(defect_key: str, defect_note: str) -> List[Dict[str, Any]]:
        items = _items_all_pass()
        for it in items:
            if it['key'] == defect_key:
                it['status'] = 'defect'
                it['note'] = defect_note
        return items

    dvir_plan = [
        (0, 0, 'pre_trip', None, None),
        (1, 0, 'pre_trip', None, None),
        (2, 0, 'pre_trip', None, None),
        (4, 0, 'pre_trip', None, None),
        (3, 1, 'post_trip', None, None),
        (0, 1, 'post_trip', None, None),
        (1, 1, 'post_trip', None, None),
        (0, 1, 'pre_trip', None, None),
        (2, 2, 'pre_trip', 'trailer_lights', 'Left turn signal intermittent — bulb replaced.'),
        (4, 2, 'pre_trip', None, None),
        (1, 2, 'pre_trip', None, None),
        (0, 2, 'pre_trip', None, None),
        (3, 3, 'pre_trip', None, None),
        (0, 3, 'post_trip', None, None),
        (4, 4, 'pre_trip', 'tires', 'Drive tire #3 tread shallow — flagged for rotation.'),
        (2, 4, 'pre_trip', None, None),
        (1, 5, 'pre_trip', None, None),
    ]
    for d_idx, days_ago, insp_type, defect_key, defect_note in dvir_plan:
        when = NOW - timedelta(days=days_ago, hours=(7 if insp_type == 'pre_trip' else 19))
        items = _items_with_defect(defect_key, defect_note) if defect_key else _items_all_pass()
        doc = _dated({
            'driver_id': drivers[d_idx]['id'],
            'driver_name': drivers[d_idx]['name'],
            'vehicle_id': drivers[d_idx]['vehicle_id'],
            'vehicle_name': vehicles[d_idx]['name'],
            'vehicle_plate': vehicles[d_idx]['plate'],
            'inspection_type': insp_type,
            'status': 'certified',
            'items': items,
            'no_defects': defect_key is None,
            'signature': drivers[d_idx]['name'],
            'certified_at': (when + timedelta(minutes=8)).isoformat(),
        }, when)
        await db.inspections.insert_one(dict(doc))

    # ---------------- Crash events (3 with varied lifecycle) ----------------
    crash_specs = [
        {'days_ago': 4, 'hours_ago': 5, 'driver_idx': 0, 'severity': 'medium', 'g_force': 4.2, 'speed_mph': 58.0,
         'lat': 32.776, 'lng': -96.797, 'confirmed': False, 'status': 'dismissed', 'auto_detected': True,
         'notes': 'Driver acknowledged: pothole on I-30. False positive.'},
        {'days_ago': 8, 'hours_ago': 14, 'driver_idx': 3, 'severity': 'medium', 'g_force': 5.8, 'speed_mph': 22.0,
         'lat': 39.961, 'lng': -82.998, 'confirmed': True, 'status': 'resolved', 'auto_detected': True,
         'notes': 'Low-speed rear collision in yard. No injuries. Insurance claim filed. Closed.'},
        {'days_ago': 0, 'hours_ago': 2, 'driver_idx': 2, 'severity': 'high', 'g_force': 6.7, 'speed_mph': 51.0,
         'lat': 33.749, 'lng': -84.388, 'confirmed': True, 'status': 'unacknowledged', 'auto_detected': True,
         'notes': 'High-G impact detected. Driver did not respond to "I am OK" prompt within 15 seconds.'},
    ]
    for c in crash_specs:
        when = NOW - timedelta(days=c['days_ago'], hours=c['hours_ago'])
        d = drivers[c['driver_idx']]
        doc = _dated({
            'driver_id': d['id'],
            'driver_name': d['name'],
            'vehicle_id': d['vehicle_id'],
            'severity': c['severity'],
            'g_force': c['g_force'],
            'latitude': c['lat'],
            'longitude': c['lng'],
            'speed_mph': c['speed_mph'],
            'auto_detected': c['auto_detected'],
            'confirmed': c['confirmed'],
            'status': c['status'],
            'notes': c['notes'],
        }, when)
        await db.crash_events.insert_one(dict(doc))
        if c['confirmed'] and c['status'] == 'unacknowledged':
            await db.alerts.insert_one(dict(_dated({
                'type': 'crash_detected',
                'severity': 'critical',
                'driver_id': d['id'],
                'vehicle_id': d['vehicle_id'],
                'message': f"CRASH DETECTED — {d['name']} — {c['severity']} severity, {c['g_force']}g, {c['speed_mph']} mph.",
                'acknowledged': False,
            }, when)))

    # ---------------- Roadside dispatches (4 historical + 1 active) ----------------
    def _provider_for(svc):
        return next((p for p in providers if svc in p['services']), providers[0])

    roadside_specs = [
        {'days_ago': 10, 'driver_idx': 1, 'svc': 'tire', 'desc': 'Steer tire blowout on I-40 westbound near mile 42.',
         'status': 'completed', 'final_cost': 240.0,
         'history': [('requested', 0), ('confirmed', 8), ('en_route', 12), ('arrived', 38), ('completed', 92)]},
        {'days_ago': 6, 'driver_idx': 4, 'svc': 'jumpstart', 'desc': 'Battery dead at truck stop. Need a jump.',
         'status': 'completed', 'final_cost': 95.0,
         'history': [('requested', 0), ('confirmed', 5), ('en_route', 10), ('arrived', 42), ('completed', 58)]},
        {'days_ago': 8, 'driver_idx': 3, 'svc': 'lockout', 'desc': 'Locked keys in cab.',
         'status': 'cancelled', 'final_cost': 0,
         'history': [('requested', 0), ('confirmed', 4), ('cancelled', 12)],
         'cancel_note': 'Driver found spare key in glovebox. Self-resolved.'},
        {'days_ago': 13, 'driver_idx': 0, 'svc': 'mechanical', 'desc': 'Air pressure dropping fast. Possible air-line leak.',
         'status': 'completed', 'final_cost': 410.0,
         'history': [('requested', 0), ('confirmed', 6), ('en_route', 11), ('arrived', 65), ('completed', 175)]},
        {'days_ago': 0, 'hours_offset': 1, 'driver_idx': 2, 'svc': 'tire', 'desc': 'Trailer tire flat. I-285 outer loop.',
         'status': 'en_route', 'final_cost': None, 'lat': 33.78, 'lng': -84.38,
         'history': [('requested', 0), ('confirmed', 5), ('en_route', 11)]},
    ]
    for r in roadside_specs:
        d = drivers[r['driver_idx']]
        provider = _provider_for(r['svc'])
        when = NOW - timedelta(days=r.get('days_ago', 0), hours=r.get('hours_offset', 4))
        history_entries = []
        for st, mins_offset in r['history']:
            entry_t = when + timedelta(minutes=mins_offset)
            note = f"Status: {st}"
            if st == 'cancelled' and r.get('cancel_note'):
                note = r['cancel_note']
            elif st == 'requested':
                note = f"Driver requested {r['svc']}"
            elif st == 'confirmed':
                note = f"{provider['name']} confirmed dispatch."
            elif st == 'en_route':
                note = f"Tech en route. ETA {provider['eta_avg_minutes']} min."
            elif st == 'arrived':
                note = "Tech on site."
            elif st == 'completed':
                note = f"Service complete. Final cost ${r.get('final_cost', provider['typical_cost']):.2f}."
            history_entries.append({'status': st, 'at': entry_t.isoformat(), 'note': note})

        doc = _dated({
            'driver_id': d['id'],
            'driver_name': d['name'],
            'vehicle_id': d['vehicle_id'],
            'service_type': r['svc'],
            'description': r['desc'],
            'latitude': r.get('lat'),
            'longitude': r.get('lng'),
            'location_text': None,
            'provider_id': provider['id'],
            'provider_name': provider['name'],
            'provider_phone': provider['phone'],
            'eta_minutes': provider['eta_avg_minutes'],
            'status': r['status'],
            'price_estimate': provider['typical_cost'],
            'final_cost': r.get('final_cost'),
            'history': history_entries,
        }, when)
        await db.roadside_dispatches.insert_one(dict(doc))

    # ---------------- Waitlist (12 fake signups across last 30 days) ----------------
    waitlist_specs = [
        ('jpark@bluestoneexpress.com', 'Jordan Park', 'Bluestone Express', '24', 30),
        ('owner@kingfisherhauling.com', 'Travis King', 'Kingfisher Hauling', '8', 28),
        ('dispatch@northstartrucking.com', 'Linda Hayes', 'North Star Trucking', '46', 25),
        ('mike@solorigtrucker.com', 'Mike Stevens', 'Solo Owner-Op', '1', 22),
        ('fleet@redrockfreight.com', 'Carla Mendez', 'Red Rock Freight', '120', 18),
        ('ops@frontiercarriers.com', 'Brett Howell', 'Frontier Carriers', '55', 15),
        ('owner@apexhaul.io', 'Sam Tanaka', 'Apex Haul', '3', 12),
        ('dispatch@millerlogistics.com', 'Pamela Miller', 'Miller Logistics', '78', 9),
        ('rj@independentowner.net', 'RJ Sanders', 'Independent', '1', 7),
        ('admin@cornbeltexpress.com', 'Hank Voss', 'Cornbelt Express', '32', 5),
        ('hello@trinityfleet.com', 'Nora Bautista', 'Trinity Fleet', '64', 3),
        ('ceo@horizonfreightllc.com', 'Greg Whitcomb', 'Horizon Freight LLC', '210', 1),
    ]
    for email, name, company, fleet_size, days_ago in waitlist_specs:
        when = NOW - timedelta(days=days_ago)
        await db.waitlist.insert_one(dict(_dated({
            'email': email,
            'name': name,
            'company': company,
            'fleet_size': fleet_size,
            'role': 'fleet_admin' if int(fleet_size) > 1 else 'driver',
        }, when)))

    logger.info('Seed complete')
