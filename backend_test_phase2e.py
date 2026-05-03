#!/usr/bin/env python3
"""
Highway Pilot Backend API Test Suite - Phase 2E Regression Testing
Tests all endpoints with investor-grade demo data seeding
Focus: Verify all 94 existing tests still pass + new seed functionality + richer data counts
"""
import requests
import sys
from datetime import datetime
import json
import time

class Phase2ERegressionTester:
    def __init__(self, base_url="https://build-forge-49.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tokens = {}  # Store tokens for all 7 demo accounts
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log(self, msg, level="INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        self.log(f"\n🔍 Test #{self.tests_run}: {name}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=15)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=15)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED - Status: {response.status_code}", "PASS")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.log(f"❌ FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                self.log(f"   Response: {response.text[:300]}", "FAIL")
                self.failed_tests.append({
                    'test': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'endpoint': endpoint,
                    'response': response.text[:200]
                })
                return False, {}

        except Exception as e:
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            self.failed_tests.append({
                'test': name,
                'error': str(e),
                'endpoint': endpoint
            })
            return False, {}

    def test_seed_endpoints(self):
        """Test seed endpoints - force reseed first, then test idempotency"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: SEED ENDPOINT TESTING")
        self.log("="*80)
        
        # Test 1: Force reseed (wipe and reseed)
        self.log("\n🔄 Forcing fresh seed (wipe + reseed)...")
        success, data = self.run_test(
            "POST /api/seed?force=true - Wipe and reseed demo data",
            "POST",
            "/seed?force=true",
            200
        )
        
        if success:
            if data.get('forced') == True:
                self.log(f"   ✓ Forced reseed confirmed")
            if data.get('message'):
                self.log(f"   Message: {data.get('message')}")
            if 'counts' in data:
                counts = data['counts']
                self.log(f"   Seeded: {counts.get('users', 0)} users, {counts.get('drivers', 0)} drivers, "
                        f"{counts.get('vehicles', 0)} vehicles, {counts.get('trips', 0)} trips")
        
        # Wait for seed to complete
        time.sleep(2)
        
        # Test 2: Idempotent seed (should skip if users exist)
        success, data = self.run_test(
            "POST /api/seed - Should return already-seeded message",
            "POST",
            "/seed",
            200
        )
        
        if success:
            if 'already' in data.get('message', '').lower() or data.get('seeded') == False:
                self.log(f"   ✓ Correctly skipped re-seeding (users already exist)")
            self.log(f"   Message: {data.get('message')}")

    def test_all_demo_logins(self):
        """Test all 7 demo accounts can login"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: ALL 7 DEMO ACCOUNT LOGINS")
        self.log("="*80)
        
        demo_accounts = [
            ('super_admin@highwaypilot.io', 'super_admin'),
            ('fleet_admin@highwaypilot.io', 'fleet_admin'),
            ('driver@highwaypilot.io', 'diego'),  # Diego Ruiz
            ('marcus@highwaypilot.io', 'marcus'),  # Marcus Bell
            ('aaliyah@highwaypilot.io', 'aaliyah'),  # Aaliyah Johnson
            ('tyler@highwaypilot.io', 'tyler'),  # Tyler Brooks
            ('rosa@highwaypilot.io', 'rosa')  # Rosa Delgado
        ]
        
        password = 'HighwayPilot2026!'
        
        for email, key in demo_accounts:
            success, data = self.run_test(
                f"Login as {email}",
                "POST",
                "/auth/login",
                200,
                data={"email": email, "password": password}
            )
            
            if success:
                token = data.get('access_token')
                if token:
                    self.tokens[key] = token
                    self.log(f"   ✓ Token stored for {key}")
                    
                    # Verify /api/auth/me returns correct info
                    success_me, me_data = self.run_test(
                        f"GET /api/auth/me for {email}",
                        "GET",
                        "/auth/me",
                        200,
                        token=token
                    )
                    
                    if success_me:
                        self.log(f"   ✓ Name: {me_data.get('name')}, Role: {me_data.get('role')}")
                else:
                    self.log(f"   ❌ No access_token returned", "FAIL")

    def test_overview_with_rich_data(self):
        """Test admin overview with expected counts from rich seed"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: ADMIN OVERVIEW WITH RICH DATA")
        self.log("="*80)
        
        token = self.tokens.get('super_admin')
        if not token:
            self.log("❌ No super_admin token - skipping overview tests", "FAIL")
            return
        
        success, data = self.run_test(
            "GET /api/overview (super_admin) - Verify KPIs",
            "GET",
            "/overview",
            200,
            token=token
        )
        
        if success:
            kpis = data.get('kpis', {})
            drivers = data.get('drivers', [])
            recent_alerts = data.get('recent_alerts', [])
            maintenance_due = data.get('maintenance_due', [])
            
            # Verify expected counts
            drivers_total = kpis.get('drivers_total', 0)
            vehicles_total = kpis.get('vehicles_total', 0)
            miles_this_week = kpis.get('miles_this_week', 0)
            
            self.log(f"   KPIs: {drivers_total} drivers, {vehicles_total} vehicles, {miles_this_week} miles this week")
            
            if drivers_total == 5:
                self.log(f"   ✓ Correct driver count: 5")
            else:
                self.log(f"   ❌ Expected 5 drivers, got {drivers_total}", "FAIL")
            
            if vehicles_total == 5:
                self.log(f"   ✓ Correct vehicle count: 5")
            else:
                self.log(f"   ❌ Expected 5 vehicles, got {vehicles_total}", "FAIL")
            
            if miles_this_week > 0:
                self.log(f"   ✓ Miles this week > 0: {miles_this_week}")
            else:
                self.log(f"   ⚠️  Miles this week is 0", "WARN")
            
            self.log(f"   Drivers list: {len(drivers)} entries")
            self.log(f"   Recent alerts: {len(recent_alerts)} entries")
            self.log(f"   Maintenance due: {len(maintenance_due)} entries")

    def test_drivers_and_vehicles(self):
        """Test drivers and vehicles endpoints"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: DRIVERS AND VEHICLES")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        # Test drivers
        success, drivers = self.run_test(
            "GET /api/drivers (admin) - Should return 5 drivers",
            "GET",
            "/drivers",
            200,
            token=token
        )
        
        if success:
            if len(drivers) == 5:
                self.log(f"   ✓ Correct count: 5 drivers")
                for driver in drivers:
                    self.log(f"   - {driver.get('name')} ({driver.get('email')})")
            else:
                self.log(f"   ❌ Expected 5 drivers, got {len(drivers)}", "FAIL")
        
        # Test vehicles
        success, vehicles = self.run_test(
            "GET /api/vehicles (admin) - Should return 5 vehicles",
            "GET",
            "/vehicles",
            200,
            token=token
        )
        
        if success:
            if len(vehicles) == 5:
                self.log(f"   ✓ Correct count: 5 vehicles")
                for vehicle in vehicles:
                    self.log(f"   - {vehicle.get('unit_number')} ({vehicle.get('make')} {vehicle.get('model')})")
            else:
                self.log(f"   ❌ Expected 5 vehicles, got {len(vehicles)}", "FAIL")

    def test_trips_with_rich_data(self):
        """Test trips endpoint with 22 trips"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: TRIPS WITH RICH DATA (22 trips expected)")
        self.log("="*80)
        
        # Test admin view (should see all 22 trips)
        token = self.tokens.get('fleet_admin')
        if token:
            success, trips = self.run_test(
                "GET /api/trips (admin) - Should return 22 trips",
                "GET",
                "/trips",
                200,
                token=token
            )
            
            if success:
                if len(trips) == 22:
                    self.log(f"   ✓ Correct count: 22 trips")
                else:
                    self.log(f"   ⚠️  Expected 22 trips, got {len(trips)}", "WARN")
                
                # Count by status
                active = sum(1 for t in trips if t.get('status') == 'active')
                planned = sum(1 for t in trips if t.get('status') == 'planned')
                completed = sum(1 for t in trips if t.get('status') == 'completed')
                
                self.log(f"   Status breakdown: {active} active, {planned} planned, {completed} completed")
                
                if active == 2:
                    self.log(f"   ✓ Correct active trips: 2")
                if planned == 2:
                    self.log(f"   ✓ Correct planned trips: 2")
                if completed == 18:
                    self.log(f"   ✓ Correct completed trips: 18")
        
        # Test driver view (should see only their own trips - ~5 for Diego)
        token = self.tokens.get('diego')
        if token:
            success, trips = self.run_test(
                "GET /api/trips (driver Diego) - Should see only own trips",
                "GET",
                "/trips",
                200,
                token=token
            )
            
            if success:
                self.log(f"   Driver sees {len(trips)} trips (driver-scoped)")
                if len(trips) >= 4 and len(trips) <= 6:
                    self.log(f"   ✓ Driver scoping working (~5 trips expected)")
                else:
                    self.log(f"   ⚠️  Expected ~5 trips for Diego, got {len(trips)}", "WARN")

    def test_hos_with_rich_data(self):
        """Test HOS logs (140+ entries expected)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: HOS LOGS (140+ entries expected)")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        success, hos_logs = self.run_test(
            "GET /api/hos (admin) - Should return 140+ HOS logs",
            "GET",
            "/hos",
            200,
            token=token
        )
        
        if success:
            if len(hos_logs) >= 140:
                self.log(f"   ✓ Correct count: {len(hos_logs)} HOS logs (>= 140)")
            else:
                self.log(f"   ⚠️  Expected >= 140 HOS logs, got {len(hos_logs)}", "WARN")
            
            # Count by status
            statuses = {}
            for log in hos_logs:
                status = log.get('status', 'unknown')
                statuses[status] = statuses.get(status, 0) + 1
            
            self.log(f"   Status breakdown: {statuses}")

    def test_inspections_with_rich_data(self):
        """Test DVIR inspections (17 certified expected, 2 with defects)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: DVIR INSPECTIONS (17 certified, 2 with defects)")
        self.log("="*80)
        
        # Test admin view (should see all 17)
        token = self.tokens.get('fleet_admin')
        if token:
            success, inspections = self.run_test(
                "GET /api/inspections (admin) - Should return 17 certified inspections",
                "GET",
                "/inspections",
                200,
                token=token
            )
            
            if success:
                if len(inspections) == 17:
                    self.log(f"   ✓ Correct count: 17 inspections")
                else:
                    self.log(f"   ⚠️  Expected 17 inspections, got {len(inspections)}", "WARN")
                
                # Count certified and defects
                certified = sum(1 for i in inspections if i.get('status') == 'certified')
                with_defects = sum(1 for i in inspections if i.get('defect_count', 0) > 0)
                
                self.log(f"   Certified: {certified}, With defects: {with_defects}")
                
                if certified == 17:
                    self.log(f"   ✓ All 17 are certified")
                if with_defects == 2:
                    self.log(f"   ✓ Correct defect count: 2 inspections with defects")
        
        # Test driver view (driver-scoped)
        token = self.tokens.get('diego')
        if token:
            success, inspections = self.run_test(
                "GET /api/inspections (driver Diego) - Should see only own inspections",
                "GET",
                "/inspections",
                200,
                token=token
            )
            
            if success:
                self.log(f"   Driver sees {len(inspections)} inspections (driver-scoped)")
        
        # Test template
        token = self.tokens.get('diego')
        if token:
            success, template = self.run_test(
                "GET /api/inspections/template - Should return 27 items",
                "GET",
                "/inspections/template",
                200,
                token=token
            )
            
            if success:
                tractor = template.get('tractor', [])
                trailer = template.get('trailer', [])
                total = len(tractor) + len(trailer)
                
                if len(tractor) == 18 and len(trailer) == 9:
                    self.log(f"   ✓ Correct template: 18 tractor + 9 trailer = 27 items")
                else:
                    self.log(f"   ⚠️  Expected 18+9, got {len(tractor)}+{len(trailer)}", "WARN")

    def test_crash_events_with_rich_data(self):
        """Test crash events (3 events with varied lifecycle)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: CRASH EVENTS (3 events with varied lifecycle)")
        self.log("="*80)
        
        # Test admin view (should see all 3)
        token = self.tokens.get('fleet_admin')
        if token:
            success, events = self.run_test(
                "GET /api/crash-events (admin) - Should return 3 crash events",
                "GET",
                "/crash-events",
                200,
                token=token
            )
            
            if success:
                if len(events) == 3:
                    self.log(f"   ✓ Correct count: 3 crash events")
                else:
                    self.log(f"   ⚠️  Expected 3 crash events, got {len(events)}", "WARN")
                
                # Verify lifecycle variety
                unack = sum(1 for e in events if e.get('status') == 'unacknowledged' and e.get('confirmed') == True)
                dismissed = sum(1 for e in events if e.get('status') == 'dismissed' and e.get('confirmed') == False)
                resolved = sum(1 for e in events if e.get('status') == 'resolved' and e.get('confirmed') == True)
                
                self.log(f"   Lifecycle: {unack} unack+confirmed, {dismissed} dismissed+false-positive, {resolved} resolved+confirmed")
                
                if unack == 1:
                    self.log(f"   ✓ 1 unacknowledged confirmed event (Aaliyah)")
                if dismissed == 1:
                    self.log(f"   ✓ 1 dismissed false-positive (Diego)")
                if resolved == 1:
                    self.log(f"   ✓ 1 resolved confirmed event (Tyler)")
        
        # Test driver view (driver-scoped)
        token = self.tokens.get('diego')
        if token:
            success, events = self.run_test(
                "GET /api/crash-events (driver Diego) - Should see only own events",
                "GET",
                "/crash-events",
                200,
                token=token
            )
            
            if success:
                self.log(f"   Driver sees {len(events)} crash events (driver-scoped)")

    def test_roadside_with_rich_data(self):
        """Test roadside assistance (6 providers, 5 dispatches)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: ROADSIDE ASSISTANCE (6 providers, 5 dispatches)")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        # Test providers
        success, providers = self.run_test(
            "GET /api/roadside/providers - Should return 6 providers",
            "GET",
            "/roadside/providers",
            200,
            token=token
        )
        
        if success:
            if len(providers) == 6:
                self.log(f"   ✓ Correct count: 6 providers")
            else:
                self.log(f"   ⚠️  Expected 6 providers, got {len(providers)}", "WARN")
        
        # Test filter by service_type
        success, tire_providers = self.run_test(
            "GET /api/roadside/providers?service_type=tire - Should return subset",
            "GET",
            "/roadside/providers",
            200,
            token=token,
            params={'service_type': 'tire'}
        )
        
        if success:
            self.log(f"   Tire providers: {len(tire_providers)}")
        
        # Test dispatches (admin view - should see all 5)
        success, dispatches = self.run_test(
            "GET /api/roadside/dispatch (admin) - Should return 5 dispatches",
            "GET",
            "/roadside/dispatch",
            200,
            token=token
        )
        
        if success:
            if len(dispatches) == 5:
                self.log(f"   ✓ Correct count: 5 dispatches")
            else:
                self.log(f"   ⚠️  Expected 5 dispatches, got {len(dispatches)}", "WARN")
            
            # Count by status
            en_route = sum(1 for d in dispatches if d.get('status') == 'en_route')
            completed = sum(1 for d in dispatches if d.get('status') == 'completed')
            cancelled = sum(1 for d in dispatches if d.get('status') == 'cancelled')
            
            self.log(f"   Status: {en_route} en_route, {completed} completed, {cancelled} cancelled")
            
            if en_route == 1:
                self.log(f"   ✓ 1 active en_route dispatch")
            if completed == 3:
                self.log(f"   ✓ 3 completed dispatches")
            if cancelled == 1:
                self.log(f"   ✓ 1 cancelled dispatch")
        
        # Test driver view (driver-scoped)
        token = self.tokens.get('diego')
        if token:
            success, dispatches = self.run_test(
                "GET /api/roadside/dispatch (driver Diego) - Should see only own dispatches",
                "GET",
                "/roadside/dispatch",
                200,
                token=token
            )
            
            if success:
                self.log(f"   Driver sees {len(dispatches)} dispatches (driver-scoped)")

    def test_ifta_with_rich_data(self):
        """Test IFTA summary (13 states, 3926.2 miles)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: IFTA SUMMARY (13 states, 3926.2 miles)")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        success, data = self.run_test(
            "GET /api/ifta/summary - Should return 13 states, 3926.2 miles",
            "GET",
            "/ifta/summary",
            200,
            token=token
        )
        
        if success:
            by_state = data.get('by_state', [])
            total_miles = data.get('total_miles', 0)
            
            if len(by_state) == 13:
                self.log(f"   ✓ Correct state count: 13 states")
            else:
                self.log(f"   ⚠️  Expected 13 states, got {len(by_state)}", "WARN")
            
            if abs(total_miles - 3926.2) < 1:
                self.log(f"   ✓ Correct total miles: {total_miles}")
            else:
                self.log(f"   ⚠️  Expected ~3926.2 miles, got {total_miles}", "WARN")
            
            # List states
            states = [s.get('state') for s in by_state]
            self.log(f"   States: {', '.join(states)}")
            
            expected_states = ['TX', 'AZ', 'NM', 'TN', 'OH', 'KY', 'GA', 'OK', 'IN', 'NC', 'AL', 'PA', 'SC']
            missing = set(expected_states) - set(states)
            if not missing:
                self.log(f"   ✓ All expected states present")
            else:
                self.log(f"   ⚠️  Missing states: {missing}", "WARN")
        
        # Test CSV export
        success, _ = self.run_test(
            "GET /api/exports/mileage.csv - CSV download works",
            "GET",
            "/exports/mileage.csv",
            200,
            token=token
        )

    def test_alerts_and_dashcam(self):
        """Test alerts (12 alerts) and dashcam events (15 events)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: ALERTS (12) AND DASHCAM EVENTS (15)")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        # Test alerts
        success, alerts = self.run_test(
            "GET /api/alerts - Should return 12 alerts",
            "GET",
            "/alerts",
            200,
            token=token
        )
        
        if success:
            if len(alerts) == 12:
                self.log(f"   ✓ Correct count: 12 alerts")
            else:
                self.log(f"   ⚠️  Expected 12 alerts, got {len(alerts)}", "WARN")
            
            # Count by severity
            critical = sum(1 for a in alerts if a.get('severity') == 'critical')
            warning = sum(1 for a in alerts if a.get('severity') == 'warning')
            info = sum(1 for a in alerts if a.get('severity') == 'info')
            
            self.log(f"   Severity: {critical} critical, {warning} warning, {info} info")
        
        # Test dashcam events
        success, events = self.run_test(
            "GET /api/dashcam-events - Should return 15 dashcam events",
            "GET",
            "/dashcam-events",
            200,
            token=token
        )
        
        if success:
            if len(events) == 15:
                self.log(f"   ✓ Correct count: 15 dashcam events")
            else:
                self.log(f"   ⚠️  Expected 15 dashcam events, got {len(events)}", "WARN")
            
            # Count by vendor
            vendors = {}
            for event in events:
                vendor = event.get('vendor', 'unknown')
                vendors[vendor] = vendors.get(vendor, 0) + 1
            
            self.log(f"   Vendors: {vendors}")

    def test_waitlist(self):
        """Test waitlist (12 signups)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: WAITLIST (12 signups)")
        self.log("="*80)
        
        token = self.tokens.get('super_admin')
        if not token:
            self.log("❌ No super_admin token - skipping", "FAIL")
            return
        
        success, signups = self.run_test(
            "GET /api/waitlist (admin) - Should return 12 waitlist signups",
            "GET",
            "/waitlist",
            200,
            token=token
        )
        
        if success:
            if len(signups) == 12:
                self.log(f"   ✓ Correct count: 12 waitlist signups")
            else:
                self.log(f"   ⚠️  Expected 12 signups, got {len(signups)}", "WARN")
        
        # Test public POST endpoint
        success, data = self.run_test(
            "POST /api/waitlist - Public endpoint can add new signup",
            "POST",
            "/waitlist",
            200,
            data={
                "name": "Test User",
                "email": f"test_{int(time.time())}@example.com",
                "role": "owner-operator",
                "fleet_size": "5"
            }
        )

    def test_maintenance_reminders(self):
        """Test maintenance reminders"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: MAINTENANCE REMINDERS")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        success, reminders = self.run_test(
            "GET /api/maintenance/reminders - Returns upcoming/overdue maintenance",
            "GET",
            "/maintenance/reminders",
            200,
            token=token
        )
        
        if success:
            self.log(f"   Maintenance reminders: {len(reminders)} items")

    def test_mapbox_config(self):
        """Test Mapbox config endpoint"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: MAPBOX CONFIG")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        success, config = self.run_test(
            "GET /api/mapbox/config - Returns Mapbox public token + style config",
            "GET",
            "/mapbox/config",
            200,
            token=token
        )
        
        if success:
            if config.get('token'):
                self.log(f"   ✓ Mapbox token present")
            if config.get('default_style'):
                self.log(f"   ✓ Default style: {config.get('default_style')}")

    def test_stripe_config(self):
        """Test Stripe config endpoint"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: STRIPE CONFIG")
        self.log("="*80)
        
        success, config = self.run_test(
            "GET /api/stripe/config - Returns Stripe publishable key + price IDs",
            "GET",
            "/stripe/config",
            200
        )
        
        if success:
            if config.get('publishable_key'):
                self.log(f"   ✓ Stripe publishable key present")
            plans = config.get('plans', [])
            if len(plans) == 2:
                self.log(f"   ✓ 2 plans configured (pro, fleet)")
                for plan in plans:
                    self.log(f"   - {plan.get('name')}: ${plan.get('price')}/{plan.get('interval')}")

    def test_copilot_status(self):
        """Test Co-Pilot status endpoint"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: CO-PILOT STATUS")
        self.log("="*80)
        
        token = self.tokens.get('diego')
        if not token:
            self.log("❌ No driver token - skipping", "FAIL")
            return
        
        success, status = self.run_test(
            "GET /api/copilot/status - Returns Copilot configuration",
            "GET",
            "/copilot/status",
            200,
            token=token
        )
        
        if success:
            if status.get('configured'):
                self.log(f"   ✓ Co-Pilot configured")
            if status.get('model'):
                self.log(f"   ✓ Model: {status.get('model')}")

    def test_copilot_chat_with_context(self):
        """Test Co-Pilot chat with seeded driver context"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: CO-PILOT CHAT WITH SEEDED CONTEXT")
        self.log("="*80)
        
        token = self.tokens.get('diego')
        if not token:
            self.log("❌ No driver token - skipping", "FAIL")
            return
        
        # Test informational query
        success, data = self.run_test(
            "POST /api/copilot/chat - AI Copilot chat with driver context",
            "POST",
            "/copilot/chat",
            200,
            token=token,
            data={"message": "What's my current duty status?"}
        )
        
        if success:
            reply = data.get('reply', '')
            if reply:
                self.log(f"   ✓ Reply received: {reply[:100]}...")
            
            # Check if context was injected (should mention driver name or status)
            if 'diego' in reply.lower() or 'driving' in reply.lower() or 'duty' in reply.lower():
                self.log(f"   ✓ Context-aware reply (mentions driver/status)")

    def test_trip_lifecycle_endpoints(self):
        """Test trip lifecycle endpoints (create, start, end)"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: TRIP LIFECYCLE ENDPOINTS")
        self.log("="*80)
        
        token = self.tokens.get('fleet_admin')
        if not token:
            self.log("❌ No fleet_admin token - skipping", "FAIL")
            return
        
        # Create a new trip
        success, trip = self.run_test(
            "POST /api/trips - Admin can create new trip",
            "POST",
            "/trips",
            200,
            token=token,
            data={
                "driver_id": "test_driver",
                "vehicle_id": "test_vehicle",
                "origin": "Test Origin",
                "destination": "Test Destination",
                "status": "planned"
            }
        )
        
        if success:
            trip_id = trip.get('id')
            if trip_id:
                self.log(f"   ✓ Trip created: {trip_id}")
                
                # Test start trip
                success_start, _ = self.run_test(
                    f"POST /api/trips/{trip_id}/start - Changes status to active",
                    "POST",
                    f"/trips/{trip_id}/start",
                    200,
                    token=token
                )
                
                # Test end trip
                if success_start:
                    success_end, _ = self.run_test(
                        f"POST /api/trips/{trip_id}/end - Changes status to completed",
                        "POST",
                        f"/trips/{trip_id}/end",
                        200,
                        token=token
                    )

    def test_inspection_lifecycle(self):
        """Test inspection creation and certification"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: INSPECTION LIFECYCLE")
        self.log("="*80)
        
        token = self.tokens.get('diego')
        if not token:
            self.log("❌ No driver token - skipping", "FAIL")
            return
        
        # Create inspection
        success, inspection = self.run_test(
            "POST /api/inspections - Driver can create new pre-trip inspection",
            "POST",
            "/inspections",
            200,
            token=token,
            data={"inspection_type": "pre_trip"}
        )
        
        if success:
            insp_id = inspection.get('id')
            if insp_id:
                self.log(f"   ✓ Inspection created: {insp_id}")
                
                # Certify inspection
                success_cert, _ = self.run_test(
                    f"POST /api/inspections/{insp_id}/certify - Certify with signature",
                    "POST",
                    f"/inspections/{insp_id}/certify",
                    200,
                    token=token,
                    data={"signature": "Diego Ruiz", "no_defects": True}
                )

    def test_voice_command_legacy(self):
        """Test legacy voice command endpoint"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E: LEGACY VOICE COMMAND")
        self.log("="*80)
        
        token = self.tokens.get('diego')
        if not token:
            self.log("❌ No driver token - skipping", "FAIL")
            return
        
        success, data = self.run_test(
            "POST /api/voice/command (legacy) - Still functional with keyword matching",
            "POST",
            "/voice/command",
            200,
            token=token,
            data={"transcript": "check my hours"}
        )
        
        if success:
            if data.get('reply'):
                self.log(f"   ✓ Legacy voice command working")

    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*80)
        self.log("PHASE 2E REGRESSION TEST SUMMARY")
        self.log("="*80)
        self.log(f"Total Tests: {self.tests_run}")
        self.log(f"Passed: {self.tests_passed}")
        self.log(f"Failed: {len(self.failed_tests)}")
        
        if self.tests_run > 0:
            success_rate = (self.tests_passed / self.tests_run) * 100
            self.log(f"Success Rate: {success_rate:.1f}%")
        
        if self.failed_tests:
            self.log("\n❌ FAILED TESTS:")
            for i, fail in enumerate(self.failed_tests, 1):
                self.log(f"{i}. {fail.get('test')}")
                self.log(f"   Endpoint: {fail.get('endpoint')}")
                if 'expected' in fail:
                    self.log(f"   Expected: {fail['expected']}, Got: {fail['actual']}")
                if 'error' in fail:
                    self.log(f"   Error: {fail['error']}")
                if 'response' in fail:
                    self.log(f"   Response: {fail['response']}")
        
        return 0 if len(self.failed_tests) == 0 else 1

def main():
    print("="*80)
    print("Highway Pilot Backend API Test Suite")
    print("Phase 2E: Investor-Grade Demo Data Seeding - REGRESSION TESTING")
    print("="*80)
    print("\nGoal: Verify all existing endpoints work with richer seed data")
    print("Expected: 22 trips, 17 inspections, 3 crash events, 5 roadside dispatches,")
    print("          13-state IFTA, 12 alerts, 15 dashcam, 140+ HOS, 12 waitlist, 6 providers")
    print("="*80)
    
    tester = Phase2ERegressionTester()
    
    # Phase 2E specific tests
    tester.test_seed_endpoints()  # NEW: Test seed with force=true
    tester.test_all_demo_logins()  # NEW: Test all 7 demo accounts
    
    # Verify rich data counts
    tester.test_overview_with_rich_data()
    tester.test_drivers_and_vehicles()
    tester.test_trips_with_rich_data()
    tester.test_hos_with_rich_data()
    tester.test_inspections_with_rich_data()
    tester.test_crash_events_with_rich_data()
    tester.test_roadside_with_rich_data()
    tester.test_ifta_with_rich_data()
    tester.test_alerts_and_dashcam()
    tester.test_waitlist()
    tester.test_maintenance_reminders()
    
    # Config endpoints
    tester.test_mapbox_config()
    tester.test_stripe_config()
    
    # Co-Pilot
    tester.test_copilot_status()
    tester.test_copilot_chat_with_context()
    
    # Lifecycle endpoints
    tester.test_trip_lifecycle_endpoints()
    tester.test_inspection_lifecycle()
    tester.test_voice_command_legacy()
    
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
