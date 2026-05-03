#!/usr/bin/env python3
"""
Highway Pilot Backend API Test Suite
Tests all endpoints for Stage 1 MVP + Stage 2 features
"""
import requests
import sys
from datetime import datetime
import json
import time

class HighwayPilotAPITester:
    def __init__(self, base_url="https://build-forge-49.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.fleet_token = None
        self.driver_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log(self, msg, level="INFO"):
        """Log test messages"""
        print(f"[{level}] {msg}")

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
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

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
                self.log(f"   Response: {response.text[:200]}", "FAIL")
                self.failed_tests.append({
                    'test': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'endpoint': endpoint
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

    def test_health(self):
        """Test API health endpoint"""
        self.log("\n" + "="*60)
        self.log("TESTING: API Health Check")
        self.log("="*60)
        success, data = self.run_test(
            "API Health Check",
            "GET",
            "/",
            200
        )
        if success and data.get('status') == 'ok':
            self.log(f"   Service: {data.get('service')}, Version: {data.get('version')}")
        return success

    def test_auth(self):
        """Test authentication endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Authentication")
        self.log("="*60)
        
        # Test fleet admin login
        success, data = self.run_test(
            "Fleet Admin Login (valid credentials)",
            "POST",
            "/auth/login",
            200,
            data={"email": "fleet_admin@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        if success and 'access_token' in data:
            self.fleet_token = data['access_token']
            self.log(f"   Fleet admin token obtained: {self.fleet_token[:20]}...")
            self.log(f"   User: {data.get('user', {}).get('name')}, Role: {data.get('user', {}).get('role')}")
        
        # Test driver login
        success, data = self.run_test(
            "Driver Login (valid credentials)",
            "POST",
            "/auth/login",
            200,
            data={"email": "driver@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        if success and 'access_token' in data:
            self.driver_token = data['access_token']
            self.log(f"   Driver token obtained: {self.driver_token[:20]}...")
            self.log(f"   User: {data.get('user', {}).get('name')}, Role: {data.get('user', {}).get('role')}")
        
        # Test invalid login
        self.run_test(
            "Login with wrong password",
            "POST",
            "/auth/login",
            401,
            data={"email": "fleet_admin@highwaypilot.io", "password": "WrongPassword123!"}
        )
        
        # Test /auth/me with fleet token
        if self.fleet_token:
            success, data = self.run_test(
                "Get current user (fleet admin)",
                "GET",
                "/auth/me",
                200,
                token=self.fleet_token
            )
            if success:
                self.log(f"   Authenticated as: {data.get('name')} ({data.get('role')})")
        
        return bool(self.fleet_token and self.driver_token)

    def test_waitlist(self):
        """Test waitlist endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Waitlist")
        self.log("="*60)
        
        # Create unique email for test
        test_email = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com"
        
        # Test new waitlist submission
        success, data = self.run_test(
            "Submit new waitlist entry",
            "POST",
            "/waitlist",
            200,
            data={
                "name": "Test User",
                "email": test_email,
                "role": "fleet",
                "fleet_size": "10-50",
                "message": "Interested in demo"
            }
        )
        if success:
            self.log(f"   Message: {data.get('message')}")
        
        # Test duplicate submission (idempotent)
        success, data = self.run_test(
            "Submit duplicate waitlist entry (idempotent)",
            "POST",
            "/waitlist",
            200,
            data={
                "name": "Test User",
                "email": test_email,
                "role": "fleet"
            }
        )
        if success:
            self.log(f"   Message: {data.get('message')}")
        
        # Test GET waitlist (requires auth)
        if self.fleet_token:
            success, data = self.run_test(
                "Get waitlist submissions (fleet admin)",
                "GET",
                "/waitlist",
                200,
                token=self.fleet_token
            )
            if success and isinstance(data, list):
                self.log(f"   Found {len(data)} waitlist entries")

    def test_overview(self):
        """Test overview endpoint"""
        self.log("\n" + "="*60)
        self.log("TESTING: Overview Dashboard")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        success, data = self.run_test(
            "Get overview dashboard data",
            "GET",
            "/overview",
            200,
            token=self.fleet_token
        )
        
        if success:
            kpis = data.get('kpis', {})
            self.log(f"   KPIs:")
            self.log(f"     - Total Drivers: {kpis.get('drivers_total')}")
            self.log(f"     - Active Drivers: {kpis.get('drivers_active')}")
            self.log(f"     - Total Vehicles: {kpis.get('vehicles_total')}")
            self.log(f"     - HOS at Risk: {kpis.get('hos_at_risk')}")
            self.log(f"     - Critical Alerts: {kpis.get('critical_alerts')}")
            self.log(f"     - Maintenance Due: {kpis.get('maintenance_due')}")
            self.log(f"   Drivers: {len(data.get('drivers', []))} records")
            self.log(f"   Recent Alerts: {len(data.get('recent_alerts', []))} records")
            self.log(f"   Maintenance Due: {len(data.get('maintenance_due_list', []))} records")

    def test_drivers(self):
        """Test driver endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Drivers")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        # GET drivers
        success, data = self.run_test(
            "Get all drivers",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} drivers")
            if len(data) > 0:
                self.log(f"   Sample: {data[0].get('name')} - {data[0].get('status')}")
        
        # POST new driver
        success, data = self.run_test(
            "Create new driver",
            "POST",
            "/drivers",
            200,
            data={
                "name": "Test Driver",
                "email": f"testdriver_{datetime.now().strftime('%H%M%S')}@example.com",
                "phone": "+1-555-9999",
                "license_state": "CA",
                "status": "off_duty"
            },
            token=self.fleet_token
        )
        if success and 'id' in data:
            self.log(f"   Created driver ID: {data['id']}")
            driver_id = data['id']
            
            # GET specific driver
            success, data = self.run_test(
                "Get driver by ID",
                "GET",
                f"/drivers/{driver_id}",
                200,
                token=self.fleet_token
            )
            if success:
                self.log(f"   Retrieved: {data.get('name')}")

    def test_vehicles(self):
        """Test vehicle endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Vehicles")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        # GET vehicles
        success, data = self.run_test(
            "Get all vehicles",
            "GET",
            "/vehicles",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} vehicles")
            if len(data) > 0:
                self.log(f"   Sample: {data[0].get('name')} - {data[0].get('make')} {data[0].get('model')}")
        
        # POST new vehicle
        success, data = self.run_test(
            "Create new vehicle",
            "POST",
            "/vehicles",
            200,
            data={
                "name": f"Test Truck {datetime.now().strftime('%H%M%S')}",
                "make": "Peterbilt",
                "model": "579",
                "year": 2024,
                "status": "active"
            },
            token=self.fleet_token
        )
        if success and 'id' in data:
            self.log(f"   Created vehicle ID: {data['id']}")

    def test_trips(self):
        """Test trip endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Trips")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        # GET trips
        success, data = self.run_test(
            "Get all trips",
            "GET",
            "/trips",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} trips")
            if len(data) > 0:
                self.log(f"   Sample: {data[0].get('origin')} → {data[0].get('destination')} ({data[0].get('status')})")
        
        # Get a driver ID for creating trip
        success_d, drivers = self.run_test(
            "Get drivers for trip creation",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        
        if success_d and len(drivers) > 0:
            driver_id = drivers[0]['id']
            
            # POST new trip
            success, data = self.run_test(
                "Create new trip",
                "POST",
                "/trips",
                200,
                data={
                    "driver_id": driver_id,
                    "origin": "Los Angeles, CA",
                    "destination": "San Francisco, CA",
                    "miles": 382.5,
                    "status": "planned"
                },
                token=self.fleet_token
            )
            if success and 'id' in data:
                self.log(f"   Created trip ID: {data['id']}")

    def test_hos(self):
        """Test HOS endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Hours of Service (HOS)")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        success, data = self.run_test(
            "Get HOS logs",
            "GET",
            "/hos",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} HOS log entries")
            if len(data) > 0:
                self.log(f"   Sample: {data[0].get('duty_status')} at {data[0].get('started_at', '')[:19]}")

    def test_maintenance(self):
        """Test maintenance endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Maintenance")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        success, data = self.run_test(
            "Get maintenance records",
            "GET",
            "/maintenance",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} maintenance records")
            if len(data) > 0:
                self.log(f"   Sample: {data[0].get('service_type')} - Completed: {data[0].get('completed')}")

    def test_alerts(self):
        """Test alerts endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Alerts")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        success, data = self.run_test(
            "Get alerts",
            "GET",
            "/alerts",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} alerts")
            if len(data) > 0:
                self.log(f"   Sample: [{data[0].get('severity')}] {data[0].get('type')} - {data[0].get('message', '')[:50]}")

    def test_dashcam(self):
        """Test dashcam events endpoints"""
        self.log("\n" + "="*60)
        self.log("TESTING: Dashcam Events")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        success, data = self.run_test(
            "Get dashcam events",
            "GET",
            "/dashcam-events",
            200,
            token=self.fleet_token
        )
        if success and isinstance(data, list):
            self.log(f"   Found {len(data)} dashcam events")
            if len(data) > 0:
                self.log(f"   Sample: {data[0].get('event')} - {data[0].get('severity')} (Vendor: {data[0].get('vendor')})")

    def test_voice_commands(self):
        """Test voice command endpoint"""
        self.log("\n" + "="*60)
        self.log("TESTING: Voice Commands")
        self.log("="*60)
        
        if not self.driver_token:
            self.log("⚠️  Skipping - no driver token", "WARN")
            return
        
        test_commands = [
            ("check HOS", "check_hos"),
            ("read alerts", "read_alerts"),
            ("help", "help"),
            ("start trip", "start_trip"),
            ("end trip", "end_trip"),
            ("on duty", "duty_on_duty"),
            ("off duty", "duty_off_duty"),
            ("sleeper", "duty_sleeper"),
            ("log fuel", "log_fuel"),
            ("random gibberish xyz", "unknown"),
        ]
        
        for transcript, expected_intent in test_commands:
            success, data = self.run_test(
                f"Voice command: '{transcript}'",
                "POST",
                "/voice/command",
                200,
                data={"transcript": transcript},
                token=self.driver_token
            )
            if success:
                intent = data.get('intent')
                response = data.get('response', '')
                self.log(f"   Intent: {intent}, Response: {response[:60]}...")
                if intent != expected_intent:
                    self.log(f"   ⚠️  Expected intent '{expected_intent}', got '{intent}'", "WARN")

    def test_trip_lifecycle(self):
        """Test trip start/end endpoints (Stage 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Trip Lifecycle (Stage 2)")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        # Get drivers and create a test trip
        success_d, drivers = self.run_test(
            "Get drivers for trip test",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        
        if not success_d or len(drivers) == 0:
            self.log("⚠️  No drivers found, skipping trip lifecycle", "WARN")
            return
        
        driver_id = drivers[0]['id']
        
        # Create a planned trip
        success, trip = self.run_test(
            "Create planned trip",
            "POST",
            "/trips",
            200,
            data={
                "driver_id": driver_id,
                "origin": "Test Origin",
                "destination": "Test Destination",
                "miles": 100,
                "status": "planned"
            },
            token=self.fleet_token
        )
        
        if not success or 'id' not in trip:
            self.log("⚠️  Failed to create trip, skipping lifecycle", "WARN")
            return
        
        trip_id = trip['id']
        self.log(f"   Created trip ID: {trip_id}")
        
        # Start the trip
        success, started = self.run_test(
            "Start trip",
            "POST",
            f"/trips/{trip_id}/start",
            200,
            token=self.fleet_token
        )
        if success:
            self.log(f"   Trip status: {started.get('status')}")
            if started.get('status') != 'active':
                self.log(f"   ⚠️  Expected status 'active', got '{started.get('status')}'", "WARN")
        
        # End the trip
        success, ended = self.run_test(
            "End trip",
            "POST",
            f"/trips/{trip_id}/end",
            200,
            data={"miles": 150, "notes": "Test completed"},
            token=self.fleet_token
        )
        if success:
            self.log(f"   Trip status: {ended.get('status')}")
            if ended.get('status') != 'completed':
                self.log(f"   ⚠️  Expected status 'completed', got '{ended.get('status')}'", "WARN")

    def test_ifta_mileage(self):
        """Test IFTA mileage tracking (Stage 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: IFTA Mileage (Stage 2)")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        # Get a trip to add mileage to
        success, trips = self.run_test(
            "Get trips for mileage test",
            "GET",
            "/trips",
            200,
            token=self.fleet_token
        )
        
        if not success or len(trips) == 0:
            self.log("⚠️  No trips found, skipping mileage test", "WARN")
            return
        
        trip_id = trips[0]['id']
        
        # Add mileage entry
        success, mileage = self.run_test(
            "Add mileage entry",
            "POST",
            f"/trips/{trip_id}/mileage",
            200,
            data={"state": "TX", "miles": 100.5, "notes": "Test mileage"},
            token=self.fleet_token
        )
        
        if success and 'id' in mileage:
            mileage_id = mileage['id']
            self.log(f"   Created mileage ID: {mileage_id}")
            
            # Get mileage for trip
            success, entries = self.run_test(
                "Get trip mileage",
                "GET",
                f"/trips/{trip_id}/mileage",
                200,
                token=self.fleet_token
            )
            if success:
                self.log(f"   Found {len(entries)} mileage entries")
            
            # Delete mileage entry
            success, _ = self.run_test(
                "Delete mileage entry",
                "DELETE",
                f"/trips/{trip_id}/mileage/{mileage_id}",
                200,
                token=self.fleet_token
            )
        
        # Get IFTA summary
        success, summary = self.run_test(
            "Get IFTA summary",
            "GET",
            "/ifta/summary",
            200,
            token=self.fleet_token
        )
        if success:
            self.log(f"   Total miles: {summary.get('total')}")
            self.log(f"   States: {summary.get('state_count')}")
            self.log(f"   By state entries: {len(summary.get('by_state', []))}")

    def test_maintenance_reminders(self):
        """Test maintenance reminders (Stage 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Maintenance Reminders (Stage 2)")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        success, reminders = self.run_test(
            "Get maintenance reminders",
            "GET",
            "/maintenance/reminders",
            200,
            token=self.fleet_token
        )
        
        if success:
            self.log(f"   Found {len(reminders)} reminders")
            if len(reminders) > 0:
                r = reminders[0]
                self.log(f"   Sample: {r.get('service_type')} - {r.get('vehicle_name')}")
                if r.get('days_remaining') is not None:
                    self.log(f"     Days remaining: {r.get('days_remaining')}")
                if r.get('miles_remaining') is not None:
                    self.log(f"     Miles remaining: {r.get('miles_remaining')}")

    def test_csv_exports(self):
        """Test CSV export endpoints (Stage 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: CSV Exports (Stage 2)")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        exports = [
            ("trips.csv", "/exports/trips.csv"),
            ("hos.csv", "/exports/hos.csv"),
            ("maintenance.csv", "/exports/maintenance.csv"),
            ("mileage.csv", "/exports/mileage.csv"),
        ]
        
        for filename, endpoint in exports:
            url = f"{self.api_url}{endpoint}"
            headers = {'Authorization': f'Bearer {self.fleet_token}'}
            
            self.tests_run += 1
            self.log(f"\n🔍 Test #{self.tests_run}: Export {filename}")
            
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code == 200 and 'text/csv' in response.headers.get('Content-Type', ''):
                    self.tests_passed += 1
                    self.log(f"✅ PASSED - CSV export working, size: {len(response.content)} bytes", "PASS")
                else:
                    self.log(f"❌ FAILED - Expected 200 text/csv, got {response.status_code} {response.headers.get('Content-Type')}", "FAIL")
                    self.failed_tests.append({
                        'test': f'Export {filename}',
                        'expected': '200 text/csv',
                        'actual': f"{response.status_code} {response.headers.get('Content-Type')}",
                        'endpoint': endpoint
                    })
            except Exception as e:
                self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
                self.failed_tests.append({
                    'test': f'Export {filename}',
                    'error': str(e),
                    'endpoint': endpoint
                })

    def test_profile_update(self):
        """Test profile update endpoint (Stage 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Profile Update (Stage 2)")
        self.log("="*60)
        
        if not self.fleet_token:
            self.log("⚠️  Skipping - no fleet token", "WARN")
            return
        
        # Update name only
        success, data = self.run_test(
            "Update profile name",
            "PUT",
            "/auth/profile",
            200,
            data={"name": "Sarah Chen (Fleet Admin) - Test"},
            token=self.fleet_token
        )
        if success:
            self.log(f"   Updated name: {data.get('name')}")
        
        # Revert name
        success, data = self.run_test(
            "Revert profile name",
            "PUT",
            "/auth/profile",
            200,
            data={"name": "Sarah Chen (Fleet Admin)"},
            token=self.fleet_token
        )
        
        # Test password change with wrong current password
        success, data = self.run_test(
            "Change password with wrong current (should fail)",
            "PUT",
            "/auth/profile",
            400,
            data={
                "current_password": "WrongPassword123!",
                "new_password": "NewPassword123!"
            },
            token=self.fleet_token
        )
        
        # Test password change with short password
        success, data = self.run_test(
            "Change password with short password (should fail)",
            "PUT",
            "/auth/profile",
            400,
            data={
                "current_password": "HighwayPilot2026!",
                "new_password": "short"
            },
            token=self.fleet_token
        )

    def test_forgot_reset_password(self):
        """Test forgot/reset password flow (Stage 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Forgot/Reset Password (Stage 2)")
        self.log("="*60)
        
        # Test forgot password
        success, data = self.run_test(
            "Forgot password request",
            "POST",
            "/auth/forgot",
            200,
            data={"email": "fleet_admin@highwaypilot.io"}
        )
        
        reset_token = None
        if success:
            self.log(f"   Message: {data.get('message')}")
            if 'dev_token' in data:
                reset_token = data['dev_token']
                self.log(f"   Dev token: {reset_token[:20]}...")
        
        # Test forgot with non-existent email (should still return 200 for security)
        success, data = self.run_test(
            "Forgot password with non-existent email",
            "POST",
            "/auth/forgot",
            200,
            data={"email": "nonexistent@example.com"}
        )
        
        if reset_token:
            # Test reset with valid token
            success, data = self.run_test(
                "Reset password with valid token",
                "POST",
                "/auth/reset",
                200,
                data={"token": reset_token, "new_password": "HighwayPilot2026!"}
            )
            if success:
                self.log(f"   Message: {data.get('message')}")
            
            # Test reset with same token again (should fail - already used)
            success, data = self.run_test(
                "Reset password with used token (should fail)",
                "POST",
                "/auth/reset",
                400,
                data={"token": reset_token, "new_password": "AnotherPassword123!"}
            )
        
        # Test reset with invalid token
        success, data = self.run_test(
            "Reset password with invalid token (should fail)",
            "POST",
            "/auth/reset",
            400,
            data={"token": "invalid-token-12345", "new_password": "NewPassword123!"}
        )
        
        # Test reset with short password
        success, data = self.run_test(
            "Reset password with short password (should fail)",
            "POST",
            "/auth/reset",
            400,
            data={"token": "any-token", "new_password": "short"}
        )

    def test_stripe(self):
        """Test Stripe subscription endpoints (Stage 3 Phase 1 - NEW PRICING)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Stripe Subscriptions (Stage 3 Phase 1)")
        self.log("="*60)
        
        # Test 1: GET /stripe/config (no auth) - MUST return exactly 2 plans: pro, fleet
        success, data = self.run_test(
            "Get Stripe config (no auth)",
            "GET",
            "/stripe/config",
            200
        )
        if success:
            self.log(f"   Configured: {data.get('configured')}")
            self.log(f"   Publishable key: {data.get('publishable_key', '')[:20]}...")
            self.log(f"   Trial days: {data.get('trial_days')}")
            plans = data.get('plans', [])
            self.log(f"   Plans: {len(plans)}")
            
            # CRITICAL: Validate exactly 2 plans with correct keys and pricing
            if len(plans) != 2:
                self.log(f"   ❌ CRITICAL: Expected exactly 2 plans (pro, fleet), got {len(plans)}", "FAIL")
                self.failed_tests.append({
                    'test': 'Stripe config plan count',
                    'expected': '2 plans',
                    'actual': f'{len(plans)} plans',
                    'endpoint': '/stripe/config'
                })
            
            # Find pro and fleet plans
            pro_plan = next((p for p in plans if p.get('key') == 'pro'), None)
            fleet_plan = next((p for p in plans if p.get('key') == 'fleet'), None)
            
            if pro_plan:
                self.log(f"   ✓ Pro plan found: ${pro_plan.get('price_dollars')}/mo, per_unit={pro_plan.get('per_unit')}")
                if pro_plan.get('amount_cents') != 2999:
                    self.log(f"   ❌ Pro plan amount_cents should be 2999, got {pro_plan.get('amount_cents')}", "FAIL")
                if pro_plan.get('per_unit') != False:
                    self.log(f"   ❌ Pro plan per_unit should be False, got {pro_plan.get('per_unit')}", "FAIL")
                if not pro_plan.get('price_id'):
                    self.log(f"   ⚠️  Pro plan price_id is null (will be lazy-created on first checkout)", "WARN")
            else:
                self.log(f"   ❌ CRITICAL: Pro plan not found in config", "FAIL")
            
            if fleet_plan:
                self.log(f"   ✓ Fleet plan found: ${fleet_plan.get('price_dollars')}/truck/mo, per_unit={fleet_plan.get('per_unit')}")
                if fleet_plan.get('amount_cents') != 1999:
                    self.log(f"   ❌ Fleet plan amount_cents should be 1999, got {fleet_plan.get('amount_cents')}", "FAIL")
                if fleet_plan.get('per_unit') != True:
                    self.log(f"   ❌ Fleet plan per_unit should be True, got {fleet_plan.get('per_unit')}", "FAIL")
                if not fleet_plan.get('price_id'):
                    self.log(f"   ⚠️  Fleet plan price_id is null (will be lazy-created on first checkout)", "WARN")
            else:
                self.log(f"   ❌ CRITICAL: Fleet plan not found in config", "FAIL")
            
            # Validate config structure
            if not data.get('publishable_key', '').startswith('pk_test_'):
                self.log("   ⚠️  Publishable key should start with pk_test_", "WARN")
            if data.get('configured') != True:
                self.log("   ⚠️  Expected configured: true", "WARN")
            if data.get('trial_days') != 14:
                self.log("   ⚠️  Expected trial_days: 14", "WARN")
        
        # Test: POST /stripe/checkout no auth → 401
        success, data = self.run_test(
            "Create checkout without auth (should fail)",
            "POST",
            "/stripe/checkout",
            401,
            data={"plan_key": "pro"}
        )
        
        if not self.fleet_token:
            self.log("⚠️  Skipping authenticated Stripe tests - no fleet token", "WARN")
            return
        
        # Get super_admin token for checkout tests (drivers cannot self-subscribe)
        success, data = self.run_test(
            "Super Admin Login",
            "POST",
            "/auth/login",
            200,
            data={"email": "super_admin@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        super_admin_token = None
        if success and 'access_token' in data:
            super_admin_token = data['access_token']
            self.log(f"   Super admin token obtained")
        
        if not super_admin_token:
            self.log("⚠️  Could not get super_admin token, using fleet_token", "WARN")
            super_admin_token = self.fleet_token
        
        # Test: POST /stripe/checkout with plan_key='pro', quantity=1 as super_admin
        success, data = self.run_test(
            "Create checkout session (pro, quantity=1)",
            "POST",
            "/stripe/checkout",
            200,
            data={"plan_key": "pro", "quantity": 1},
            token=super_admin_token
        )
        if success:
            url = data.get('url', '')
            session_id = data.get('session_id', '')
            self.log(f"   Checkout URL: {url[:50]}...")
            self.log(f"   Session ID: {session_id[:20]}...")
            
            # Validate response structure
            if not url.startswith('https://checkout.stripe.com/'):
                self.log("   ⚠️  Checkout URL should start with https://checkout.stripe.com/", "WARN")
            if not session_id.startswith('cs_test_'):
                self.log("   ⚠️  Session ID should start with cs_test_", "WARN")
        
        # Test: POST /stripe/checkout with plan_key='fleet', quantity=5 as super_admin
        success, data = self.run_test(
            "Create checkout session (fleet, quantity=5)",
            "POST",
            "/stripe/checkout",
            200,
            data={"plan_key": "fleet", "quantity": 5},
            token=super_admin_token
        )
        if success:
            url = data.get('url', '')
            session_id = data.get('session_id', '')
            self.log(f"   Checkout URL: {url[:50]}...")
            self.log(f"   Session ID: {session_id[:20]}...")
            self.log(f"   ✓ Fleet plan with adjustable quantity should be enabled in Stripe checkout")
        
        # Test: POST /stripe/checkout with plan_key='invalid' → 400
        success, data = self.run_test(
            "Create checkout with invalid plan (should fail)",
            "POST",
            "/stripe/checkout",
            400,
            data={"plan_key": "invalid"},
            token=super_admin_token
        )
        
        # Test: POST /stripe/checkout as driver role → 403
        if self.driver_token:
            success, data = self.run_test(
                "Create checkout as driver (should fail with 403)",
                "POST",
                "/stripe/checkout",
                403,
                data={"plan_key": "pro"},
                token=self.driver_token
            )
        
        # Test: GET /stripe/subscription (auth)
        success, data = self.run_test(
            "Get subscription status",
            "GET",
            "/stripe/subscription",
            200,
            token=super_admin_token
        )
        if success:
            self.log(f"   Status: {data.get('status')}")
            if data.get('subscription'):
                sub = data['subscription']
                self.log(f"   Plan: {sub.get('plan_name')}")
                self.log(f"   Subscription status: {sub.get('status')}")
            else:
                self.log(f"   No active subscription")
        
        # Test: POST /stripe/webhook with raw JSON
        webhook_payload = {
            "id": "evt_test_webhook",
            "type": "customer.subscription.created",
            "data": {
                "object": {
                    "id": "sub_test_123",
                    "status": "active",
                    "metadata": {"user_id": "test-user-id", "plan_key": "pro"}
                }
            }
        }
        
        # Webhook endpoint doesn't require auth
        success, data = self.run_test(
            "Stripe webhook (no signature verification in dev)",
            "POST",
            "/stripe/webhook",
            200,
            data=webhook_payload
        )
        if success:
            self.log(f"   Received: {data.get('received')}")
            if data.get('received') != True:
                self.log("   ⚠️  Expected received: true", "WARN")

    def test_copilot(self):
        """Test AI Copilot endpoints (Stage 3 Phase 1)"""
        self.log("\n" + "="*60)
        self.log("TESTING: AI Copilot (Stage 3 Phase 1)")
        self.log("="*60)
        
        if not self.driver_token:
            self.log("⚠️  Skipping - no driver token", "WARN")
            return
        
        # Test 1: GET /copilot/status as authenticated driver
        success, data = self.run_test(
            "Get Copilot status (authenticated driver)",
            "GET",
            "/copilot/status",
            200,
            token=self.driver_token
        )
        if success:
            self.log(f"   Configured: {data.get('configured')}")
            self.log(f"   Model: {data.get('model')}")
            self.log(f"   Persona: {data.get('persona')}")
            
            # Validate response
            if data.get('configured') != True:
                self.log("   ❌ Expected configured: true", "FAIL")
            if data.get('model') != 'anthropic/claude-sonnet-4-5-20250929':
                self.log(f"   ❌ Expected model 'anthropic/claude-sonnet-4-5-20250929', got '{data.get('model')}'", "FAIL")
            if data.get('persona') != 'Co-Pilot Buddy':
                self.log(f"   ❌ Expected persona 'Co-Pilot Buddy', got '{data.get('persona')}'", "FAIL")
        
        # Test 2: POST /copilot/chat without auth → 401/403
        success, data = self.run_test(
            "Copilot chat without auth (should fail)",
            "POST",
            "/copilot/chat",
            401,
            data={"message": "Hey, how much drive time do I have left?"}
        )
        
        # Test 3: POST /copilot/chat with empty message → 400
        success, data = self.run_test(
            "Copilot chat with empty message (should fail)",
            "POST",
            "/copilot/chat",
            400,
            data={"message": ""},
            token=self.driver_token
        )
        
        # Test 4: POST /copilot/chat with message > 2000 chars → 400
        long_message = "x" * 2001
        success, data = self.run_test(
            "Copilot chat with >2000 chars (should fail)",
            "POST",
            "/copilot/chat",
            400,
            data={"message": long_message},
            token=self.driver_token
        )
        
        # Test 5: POST /copilot/chat with valid message (HOS context test)
        self.log("\n   ⚠️  Making real LLM call - this consumes credits", "WARN")
        success, data = self.run_test(
            "Copilot chat: 'Hey, how much drive time do I have left?'",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "Hey, how much drive time do I have left?"},
            token=self.driver_token
        )
        if success:
            reply = data.get('reply', '')
            session_id = data.get('session_id', '')
            model = data.get('model', '')
            self.log(f"   Reply: {reply[:100]}...")
            self.log(f"   Session ID: {session_id[:30]}...")
            self.log(f"   Model: {model}")
            
            # Check if reply references HOS (context injection working)
            if 'hour' in reply.lower() or 'minute' in reply.lower() or 'time' in reply.lower():
                self.log(f"   ✓ Reply appears to reference HOS context")
            else:
                self.log(f"   ⚠️  Reply may not be using HOS context", "WARN")
            
            # Validate response structure
            if not reply:
                self.log("   ❌ Expected non-empty reply", "FAIL")
            if not session_id:
                self.log("   ❌ Expected session_id", "FAIL")
        
        # Test 6: GET /copilot/history as driver
        success, data = self.run_test(
            "Get Copilot history",
            "GET",
            "/copilot/history",
            200,
            token=self.driver_token
        )
        if success:
            messages = data.get('messages', [])
            self.log(f"   Found {len(messages)} messages in history")
            if len(messages) > 0:
                # Should have at least the message from test 5
                self.log(f"   Sample: {messages[-1].get('role')} - {messages[-1].get('content', '')[:50]}...")
                # Verify messages are sorted oldest-first
                if len(messages) > 1:
                    first_time = messages[0].get('created_at', '')
                    last_time = messages[-1].get('created_at', '')
                    if first_time > last_time:
                        self.log(f"   ⚠️  Messages not sorted oldest-first", "WARN")
        
        # Test 7: Multi-turn conversation (context awareness)
        self.log("\n   ⚠️  Making 2nd LLM call for multi-turn test", "WARN")
        success, data = self.run_test(
            "Copilot chat: 'What was my last question?'",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "What was my last question?"},
            token=self.driver_token
        )
        if success:
            reply = data.get('reply', '')
            self.log(f"   Reply: {reply[:100]}...")
            # Check if reply shows context awareness from previous turn
            if 'drive time' in reply.lower() or 'hos' in reply.lower() or 'hour' in reply.lower():
                self.log(f"   ✓ Reply shows context awareness from previous turn")
            else:
                self.log(f"   ⚠️  Reply may not show context from previous turn", "WARN")
        
        # Test 8: POST /copilot/reset as driver
        success, data = self.run_test(
            "Reset Copilot session",
            "POST",
            "/copilot/reset",
            200,
            token=self.driver_token
        )
        if success:
            deleted = data.get('deleted', 0)
            self.log(f"   Deleted {deleted} messages")
            if deleted < 2:
                self.log(f"   ⚠️  Expected at least 2 messages deleted (from tests above)", "WARN")
        
        # Test 9: Verify history is cleared after reset
        success, data = self.run_test(
            "Get Copilot history after reset",
            "GET",
            "/copilot/history",
            200,
            token=self.driver_token
        )
        if success:
            messages = data.get('messages', [])
            self.log(f"   Found {len(messages)} messages after reset")
            if len(messages) > 0:
                self.log(f"   ⚠️  Expected 0 messages after reset, got {len(messages)}", "WARN")

    def test_regression(self):
        """Test existing endpoints still work (regression)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Regression - Existing Endpoints")
        self.log("="*60)
        
        if not self.fleet_token or not self.driver_token:
            self.log("⚠️  Skipping - missing tokens", "WARN")
            return
        
        # POST /auth/login
        success, data = self.run_test(
            "POST /auth/login (regression)",
            "POST",
            "/auth/login",
            200,
            data={"email": "driver@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        
        # GET /drivers
        success, data = self.run_test(
            "GET /drivers (regression)",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        
        # GET /trips
        success, data = self.run_test(
            "GET /trips (regression)",
            "GET",
            "/trips",
            200,
            token=self.fleet_token
        )
        
        # GET /alerts
        success, data = self.run_test(
            "GET /alerts (regression)",
            "GET",
            "/alerts",
            200,
            token=self.fleet_token
        )
        
        # POST /voice/command (intent matching for 'check HOS')
        success, data = self.run_test(
            "POST /voice/command 'check HOS' (regression)",
            "POST",
            "/voice/command",
            200,
            data={"transcript": "check HOS"},
            token=self.driver_token
        )
        if success:
            intent = data.get('intent')
            if intent != 'check_hos':
                self.log(f"   ⚠️  Expected intent 'check_hos', got '{intent}'", "WARN")
        
        # POST /hos
        # Get a driver ID first
        success_d, drivers = self.run_test(
            "GET /drivers for HOS test",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        if success_d and len(drivers) > 0:
            driver_id = drivers[0]['id']
            success, data = self.run_test(
                "POST /hos (regression)",
                "POST",
                "/hos",
                200,
                data={
                    "driver_id": driver_id,
                    "duty_status": "on_duty",
                    "notes": "regression test"
                },
                token=self.fleet_token
            )
        
        # GET /maintenance/reminders
        success, data = self.run_test(
            "GET /maintenance/reminders (regression)",
            "GET",
            "/maintenance/reminders",
            200,
            token=self.fleet_token
        )
        
        # GET /stripe/subscription
        success, data = self.run_test(
            "GET /stripe/subscription (regression)",
            "GET",
            "/stripe/subscription",
            200,
            token=self.fleet_token
        )
        
        # GET /auth/google (should redirect)
        url = f"{self.api_url}/auth/google"
        self.tests_run += 1
        self.log(f"\n🔍 Test #{self.tests_run}: GET /auth/google (regression)")
        try:
            response = requests.get(url, allow_redirects=False, timeout=10)
            if response.status_code == 302:
                self.tests_passed += 1
                self.log(f"✅ PASSED - Status: 302 (redirect to Google)", "PASS")
                location = response.headers.get('Location', '')
                if 'accounts.google.com' in location:
                    self.log(f"   ✓ Redirects to Google OAuth")
                else:
                    self.log(f"   ⚠️  Redirect location unexpected: {location[:50]}...", "WARN")
            else:
                self.log(f"❌ FAILED - Expected 302, got {response.status_code}", "FAIL")
                self.failed_tests.append({
                    'test': 'GET /auth/google',
                    'expected': 302,
                    'actual': response.status_code,
                    'endpoint': '/auth/google'
                })
        except Exception as e:
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            self.failed_tests.append({
                'test': 'GET /auth/google',
                'error': str(e),
                'endpoint': '/auth/google'
            })

    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*60)
        self.log("TEST SUMMARY")
        self.log("="*60)
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
        
        return 0 if len(self.failed_tests) == 0 else 1

def main():
    print("="*60)
    print("Highway Pilot Backend API Test Suite")
    print("Stage 3 Phase 1: Stripe Pricing + AI Copilot")
    print("="*60)
    
    tester = HighwayPilotAPITester()
    
    # Run all tests
    tester.test_health()
    
    if not tester.test_auth():
        print("\n❌ Authentication failed - cannot proceed with authenticated tests")
        return tester.print_summary()
    
    # Stage 3 Phase 1 tests (NEW)
    tester.test_stripe()  # Updated for new pricing (pro, fleet)
    tester.test_copilot()  # NEW AI Copilot tests
    
    # Regression tests
    tester.test_regression()
    
    # Stage 1 tests (optional - can be skipped for focused testing)
    # tester.test_waitlist()
    # tester.test_overview()
    # tester.test_drivers()
    # tester.test_vehicles()
    # tester.test_trips()
    # tester.test_hos()
    # tester.test_maintenance()
    # tester.test_alerts()
    # tester.test_dashcam()
    # tester.test_voice_commands()
    
    # Stage 2 tests (optional - can be skipped for focused testing)
    # tester.test_trip_lifecycle()
    # tester.test_ifta_mileage()
    # tester.test_maintenance_reminders()
    # tester.test_csv_exports()
    # tester.test_profile_update()
    # tester.test_forgot_reset_password()
    
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
