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

    def test_copilot_actions(self):
        """Test AI Copilot ACTION EXECUTION (Stage 3 Phase 1.5)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Co-Pilot Action Execution (Stage 3 Phase 1.5)")
        self.log("="*60)
        
        if not self.driver_token:
            self.log("⚠️  Skipping - no driver token", "WARN")
            return
        
        # Get driver record to verify side effects
        success, drivers = self.run_test(
            "Get drivers for action tests",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        
        driver_email = "driver@highwaypilot.io"
        driver_record = next((d for d in drivers if d.get('email') == driver_email), None) if success else None
        
        if not driver_record:
            self.log("⚠️  Could not find driver record, skipping action tests", "WARN")
            return
        
        driver_id = driver_record['id']
        self.log(f"   Testing with driver: {driver_record.get('name')} (ID: {driver_id})")
        
        # Test 1: duty_change action - "Switch me to sleeper berth"
        self.log("\n   ⚠️  Making LLM call for duty_change action", "WARN")
        success, data = self.run_test(
            "Co-Pilot action: duty_change to sleeper",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "Switch me to sleeper berth, gonna grab some shut-eye"},
            token=self.driver_token
        )
        
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:80]}...")
            
            # Verify action object
            if action:
                self.log(f"   Action type: {action.get('type')}")
                self.log(f"   Action executed: {action.get('executed')}")
                self.log(f"   New status: {action.get('new_status')}")
                
                if action.get('type') != 'duty_change':
                    self.log(f"   ❌ Expected action type 'duty_change', got '{action.get('type')}'", "FAIL")
                if action.get('executed') != True:
                    self.log(f"   ❌ Expected action.executed=true", "FAIL")
                if action.get('new_status') != 'sleeper':
                    self.log(f"   ❌ Expected new_status='sleeper', got '{action.get('new_status')}'", "FAIL")
            else:
                self.log(f"   ❌ No action object returned", "FAIL")
            
            # Verify reply text does NOT contain ACTION marker
            if '<<<ACTION' in reply or '>>>' in reply or '{' in reply:
                self.log(f"   ❌ Reply text contains ACTION marker remnants", "FAIL")
            else:
                self.log(f"   ✓ Reply text clean (no ACTION marker)")
            
            # Verify driver status actually changed in DB
            time.sleep(0.5)  # Brief wait for DB update
            success_verify, updated_driver = self.run_test(
                "Verify driver status changed in DB",
                "GET",
                f"/drivers/{driver_id}",
                200,
                token=self.fleet_token
            )
            if success_verify:
                actual_status = updated_driver.get('status')
                self.log(f"   Driver status in DB: {actual_status}")
                if actual_status != 'sleeper':
                    self.log(f"   ❌ Expected driver status 'sleeper', got '{actual_status}'", "FAIL")
                else:
                    self.log(f"   ✓ Driver status correctly updated to 'sleeper'")
        
        # Test 2: start_trip action - create a planned trip first
        success, trip = self.run_test(
            "Create planned trip for start_trip test",
            "POST",
            "/trips",
            200,
            data={
                "driver_id": driver_id,
                "origin": "Dallas, TX",
                "destination": "Memphis, TN",
                "miles": 450,
                "status": "planned"
            },
            token=self.fleet_token
        )
        
        if success and 'id' in trip:
            trip_id = trip['id']
            self.log(f"   Created planned trip: {trip_id}")
            
            self.log("\n   ⚠️  Making LLM call for start_trip action", "WARN")
            success, data = self.run_test(
                "Co-Pilot action: start_trip",
                "POST",
                "/copilot/chat",
                200,
                data={"message": "Start my trip"},
                token=self.driver_token
            )
            
            if success:
                reply = data.get('reply', '')
                action = data.get('action')
                self.log(f"   Reply: {reply[:80]}...")
                
                if action:
                    self.log(f"   Action type: {action.get('type')}")
                    self.log(f"   Action executed: {action.get('executed')}")
                    self.log(f"   Trip ID: {action.get('trip_id')}")
                    
                    if action.get('type') != 'start_trip':
                        self.log(f"   ❌ Expected action type 'start_trip'", "FAIL")
                    if action.get('executed') != True:
                        self.log(f"   ❌ Expected action.executed=true", "FAIL")
                    if not action.get('trip_id'):
                        self.log(f"   ❌ Expected trip_id in action", "FAIL")
                else:
                    self.log(f"   ❌ No action object returned", "FAIL")
                
                # Verify trip status changed to active
                time.sleep(0.5)
                success_verify, updated_trip = self.run_test(
                    "Verify trip status changed to active",
                    "GET",
                    "/trips",
                    200,
                    params={"driver_id": driver_id},
                    token=self.fleet_token
                )
                if success_verify:
                    active_trips = [t for t in updated_trip if t.get('id') == trip_id]
                    if active_trips and active_trips[0].get('status') == 'active':
                        self.log(f"   ✓ Trip status correctly updated to 'active'")
                    else:
                        self.log(f"   ❌ Trip status not updated correctly", "FAIL")
        
        # Test 3: end_trip action
        self.log("\n   ⚠️  Making LLM call for end_trip action", "WARN")
        success, data = self.run_test(
            "Co-Pilot action: end_trip",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "End my trip, I'm here"},
            token=self.driver_token
        )
        
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:80]}...")
            
            if action:
                self.log(f"   Action type: {action.get('type')}")
                self.log(f"   Action executed: {action.get('executed')}")
                
                if action.get('type') != 'end_trip':
                    self.log(f"   ❌ Expected action type 'end_trip'", "FAIL")
                if action.get('executed') != True:
                    self.log(f"   ❌ Expected action.executed=true", "FAIL")
            else:
                self.log(f"   ❌ No action object returned", "FAIL")
        
        # Test 4: log_fuel action
        self.log("\n   ⚠️  Making LLM call for log_fuel action", "WARN")
        success, data = self.run_test(
            "Co-Pilot action: log_fuel",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "Just fueled up, log it"},
            token=self.driver_token
        )
        
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:80]}...")
            
            if action:
                self.log(f"   Action type: {action.get('type')}")
                self.log(f"   Action executed: {action.get('executed')}")
                
                if action.get('type') != 'log_fuel':
                    self.log(f"   ❌ Expected action type 'log_fuel'", "FAIL")
                if action.get('executed') != True:
                    self.log(f"   ❌ Expected action.executed=true", "FAIL")
            else:
                self.log(f"   ❌ No action object returned", "FAIL")
            
            # Verify fuel_log alert was created
            time.sleep(0.5)
            success_verify, alerts = self.run_test(
                "Verify fuel_log alert created",
                "GET",
                "/alerts",
                200,
                token=self.fleet_token
            )
            if success_verify:
                fuel_alerts = [a for a in alerts if a.get('type') == 'fuel_log']
                if fuel_alerts:
                    self.log(f"   ✓ Found {len(fuel_alerts)} fuel_log alert(s)")
                else:
                    self.log(f"   ❌ No fuel_log alert found", "FAIL")
        
        # Test 5: start_inspection action
        self.log("\n   ⚠️  Making LLM call for start_inspection action", "WARN")
        success, data = self.run_test(
            "Co-Pilot action: start_inspection (pre-trip)",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "Start my pre-trip inspection"},
            token=self.driver_token
        )
        
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:80]}...")
            
            if action:
                self.log(f"   Action type: {action.get('type')}")
                self.log(f"   Action executed: {action.get('executed')}")
                self.log(f"   Inspection type: {action.get('inspection_type')}")
                self.log(f"   Inspection ID: {action.get('inspection_id', '')[:30]}...")
                self.log(f"   Redirect URL: {action.get('redirect')}")
                
                if action.get('type') != 'start_inspection':
                    self.log(f"   ❌ Expected action type 'start_inspection'", "FAIL")
                if action.get('executed') != True:
                    self.log(f"   ❌ Expected action.executed=true", "FAIL")
                if action.get('inspection_type') != 'pre_trip':
                    self.log(f"   ❌ Expected inspection_type='pre_trip'", "FAIL")
                if not action.get('inspection_id'):
                    self.log(f"   ❌ Expected inspection_id", "FAIL")
                if not action.get('redirect') or '/driver/inspection/' not in action.get('redirect', ''):
                    self.log(f"   ❌ Expected redirect URL with /driver/inspection/", "FAIL")
                
                # Verify inspection record exists
                if action.get('inspection_id'):
                    time.sleep(0.5)
                    success_verify, inspection = self.run_test(
                        "Verify inspection record exists",
                        "GET",
                        f"/inspections/{action['inspection_id']}",
                        200,
                        token=self.driver_token
                    )
                    if success_verify:
                        self.log(f"   ✓ Inspection record found: {inspection.get('status')}, {len(inspection.get('items', []))} items")
                    else:
                        self.log(f"   ❌ Inspection record not found", "FAIL")
            else:
                self.log(f"   ❌ No action object returned", "FAIL")
        
        # Test 6: Informational query (no action)
        self.log("\n   ⚠️  Making LLM call for informational query (no action expected)", "WARN")
        success, data = self.run_test(
            "Co-Pilot informational query (no action)",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "What's my next destination?"},
            token=self.driver_token
        )
        
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:80]}...")
            
            if action is None:
                self.log(f"   ✓ No action object (as expected for informational query)")
            else:
                self.log(f"   ⚠️  Action object present for informational query: {action.get('type')}", "WARN")
        
        # Test 7: start_trip with no planned trip (should fail gracefully)
        # First, complete any active trips
        success, trips = self.run_test(
            "Get trips to clean up",
            "GET",
            "/trips",
            200,
            params={"driver_id": driver_id},
            token=self.fleet_token
        )
        if success:
            for t in trips:
                if t.get('status') in ('active', 'planned'):
                    self.run_test(
                        f"Complete trip {t['id']}",
                        "POST",
                        f"/trips/{t['id']}/end",
                        200,
                        token=self.fleet_token
                    )
        
        self.log("\n   ⚠️  Making LLM call for start_trip with no planned trip", "WARN")
        success, data = self.run_test(
            "Co-Pilot action: start_trip with no planned trip",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "Start my trip"},
            token=self.driver_token
        )
        
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:80]}...")
            
            if action:
                self.log(f"   Action executed: {action.get('executed')}")
                self.log(f"   Action error: {action.get('error')}")
                
                if action.get('executed') == False and 'No planned trip' in action.get('error', ''):
                    self.log(f"   ✓ Action correctly failed with 'No planned trip' error")
                else:
                    self.log(f"   ⚠️  Expected action.executed=false with error", "WARN")

    def test_dvir(self):
        """Test DVIR (Driver Vehicle Inspection Reports) endpoints (Stage 3 Phase 1.5)"""
        self.log("\n" + "="*60)
        self.log("TESTING: DVIR - Driver Vehicle Inspection Reports (Stage 3 Phase 1.5)")
        self.log("="*60)
        
        if not self.driver_token or not self.fleet_token:
            self.log("⚠️  Skipping - missing tokens", "WARN")
            return
        
        # Test 1: GET /inspections/template
        success, data = self.run_test(
            "Get DVIR template",
            "GET",
            "/inspections/template",
            200,
            token=self.driver_token
        )
        
        if success:
            template = data.get('template', {})
            tractor_items = template.get('tractor', [])
            trailer_items = template.get('trailer', [])
            self.log(f"   Tractor items: {len(tractor_items)}")
            self.log(f"   Trailer items: {len(trailer_items)}")
            
            if len(tractor_items) != 18:
                self.log(f"   ❌ Expected 18 tractor items, got {len(tractor_items)}", "FAIL")
            if len(trailer_items) != 9:
                self.log(f"   ❌ Expected 9 trailer items, got {len(trailer_items)}", "FAIL")
            
            # Verify structure
            if tractor_items and isinstance(tractor_items[0], dict):
                sample = tractor_items[0]
                if 'key' in sample and 'label' in sample:
                    self.log(f"   ✓ Template structure correct: {sample.get('key')} - {sample.get('label')}")
                else:
                    self.log(f"   ❌ Template items missing key/label", "FAIL")
        
        # Test 2: POST /inspections (create pre-trip inspection as driver)
        success, inspection = self.run_test(
            "Create pre-trip inspection (driver)",
            "POST",
            "/inspections",
            200,
            data={"inspection_type": "pre_trip"},
            token=self.driver_token
        )
        
        inspection_id = None
        if success and 'id' in inspection:
            inspection_id = inspection['id']
            self.log(f"   Created inspection ID: {inspection_id}")
            self.log(f"   Status: {inspection.get('status')}")
            self.log(f"   Type: {inspection.get('inspection_type')}")
            self.log(f"   Items: {len(inspection.get('items', []))}")
            
            if inspection.get('status') != 'in_progress':
                self.log(f"   ❌ Expected status 'in_progress', got '{inspection.get('status')}'", "FAIL")
            if inspection.get('inspection_type') != 'pre_trip':
                self.log(f"   ❌ Expected type 'pre_trip'", "FAIL")
            if len(inspection.get('items', [])) != 27:
                self.log(f"   ❌ Expected 27 items (18+9), got {len(inspection.get('items', []))}", "FAIL")
            
            # Verify all items are status='pending'
            items = inspection.get('items', [])
            pending_count = sum(1 for i in items if i.get('status') == 'pending')
            if pending_count != 27:
                self.log(f"   ❌ Expected all 27 items with status='pending', got {pending_count}", "FAIL")
        
        # Test 3: POST /inspections as fleet_admin (should fail - only drivers)
        success, data = self.run_test(
            "Create inspection as fleet_admin (should fail)",
            "POST",
            "/inspections",
            403,
            data={"inspection_type": "pre_trip"},
            token=self.fleet_token
        )
        
        # Test 4: GET /inspections (list inspections as driver - scoped)
        success, inspections = self.run_test(
            "List inspections (driver scoped)",
            "GET",
            "/inspections",
            200,
            token=self.driver_token
        )
        
        if success:
            self.log(f"   Found {len(inspections)} inspection(s)")
            if len(inspections) > 0:
                self.log(f"   Sample: {inspections[0].get('inspection_type')} - {inspections[0].get('status')}")
        
        # Test 5: GET /inspections/{id}
        if inspection_id:
            success, data = self.run_test(
                "Get inspection by ID",
                "GET",
                f"/inspections/{inspection_id}",
                200,
                token=self.driver_token
            )
            
            if success:
                self.log(f"   Retrieved inspection: {data.get('id')[:30]}...")
        
        # Test 6: PUT /inspections/{id}/item (update item status to 'pass')
        if inspection_id:
            success, data = self.run_test(
                "Update inspection item (service_brakes to pass)",
                "PUT",
                f"/inspections/{inspection_id}/item",
                200,
                data={"key": "service_brakes", "status": "pass"},
                token=self.driver_token
            )
            
            if success:
                items = data.get('items', [])
                service_brakes = next((i for i in items if i.get('key') == 'service_brakes'), None)
                if service_brakes and service_brakes.get('status') == 'pass':
                    self.log(f"   ✓ Item updated: service_brakes status='pass'")
                else:
                    self.log(f"   ❌ Item not updated correctly", "FAIL")
        
        # Test 7: PUT item with status='defect' and note
        if inspection_id:
            success, data = self.run_test(
                "Update inspection item (tires to defect with note)",
                "PUT",
                f"/inspections/{inspection_id}/item",
                200,
                data={"key": "tires", "status": "defect", "note": "Left front tire worn"},
                token=self.driver_token
            )
            
            if success:
                items = data.get('items', [])
                tires = next((i for i in items if i.get('key') == 'tires'), None)
                if tires and tires.get('status') == 'defect' and tires.get('note'):
                    self.log(f"   ✓ Item updated: tires status='defect', note='{tires.get('note')}'")
                else:
                    self.log(f"   ❌ Item not updated correctly", "FAIL")
        
        # Test 8: PUT item with invalid status (should fail)
        if inspection_id:
            success, data = self.run_test(
                "Update item with invalid status (should fail)",
                "PUT",
                f"/inspections/{inspection_id}/item",
                400,
                data={"key": "horn", "status": "invalid_status"},
                token=self.driver_token
            )
        
        # Test 9: PUT item with unknown key (should fail)
        if inspection_id:
            success, data = self.run_test(
                "Update item with unknown key (should fail)",
                "PUT",
                f"/inspections/{inspection_id}/item",
                400,
                data={"key": "unknown_item_key", "status": "pass"},
                token=self.driver_token
            )
        
        # Test 10: POST /inspections/{id}/certify with defects
        if inspection_id:
            # Mark another item as defect
            self.run_test(
                "Mark mirrors as defect",
                "PUT",
                f"/inspections/{inspection_id}/item",
                200,
                data={"key": "mirrors", "status": "defect", "note": "Passenger mirror cracked"},
                token=self.driver_token
            )
            
            success, data = self.run_test(
                "Certify inspection with defects",
                "POST",
                f"/inspections/{inspection_id}/certify",
                200,
                data={"no_defects": False, "signature": "Diego Ruiz"},
                token=self.driver_token
            )
            
            if success:
                self.log(f"   Status: {data.get('status')}")
                self.log(f"   Defect count: {data.get('defect_count')}")
                self.log(f"   Certified at: {data.get('certified_at', '')[:19]}")
                self.log(f"   Signature: {data.get('signature')}")
                
                if data.get('status') != 'certified':
                    self.log(f"   ❌ Expected status 'certified'", "FAIL")
                if data.get('defect_count') != 2:
                    self.log(f"   ❌ Expected defect_count=2 (tires, mirrors), got {data.get('defect_count')}", "FAIL")
                if not data.get('certified_at'):
                    self.log(f"   ❌ Expected certified_at timestamp", "FAIL")
                
                # Verify maintenance records auto-created
                time.sleep(0.5)
                success_maint, maintenance = self.run_test(
                    "Verify maintenance records auto-created",
                    "GET",
                    "/maintenance",
                    200,
                    token=self.fleet_token
                )
                if success_maint:
                    dvir_maintenance = [m for m in maintenance if 'DVIR Defect:' in m.get('service_type', '')]
                    self.log(f"   Found {len(dvir_maintenance)} DVIR maintenance record(s)")
                    if len(dvir_maintenance) >= 2:
                        self.log(f"   ✓ Maintenance records auto-created for defects")
                    else:
                        self.log(f"   ⚠️  Expected at least 2 DVIR maintenance records", "WARN")
                
                # Verify alerts auto-created
                success_alerts, alerts = self.run_test(
                    "Verify alerts auto-created for defects",
                    "GET",
                    "/alerts",
                    200,
                    token=self.fleet_token
                )
                if success_alerts:
                    dvir_alerts = [a for a in alerts if a.get('type') == 'maintenance_due' and 'DVIR' in a.get('message', '')]
                    self.log(f"   Found {len(dvir_alerts)} DVIR alert(s)")
                    if len(dvir_alerts) >= 2:
                        self.log(f"   ✓ Alerts auto-created for defects")
        
        # Test 11: Certify with empty signature (should fail)
        success, inspection2 = self.run_test(
            "Create another inspection for certify tests",
            "POST",
            "/inspections",
            200,
            data={"inspection_type": "post_trip"},
            token=self.driver_token
        )
        
        if success and 'id' in inspection2:
            inspection2_id = inspection2['id']
            
            success, data = self.run_test(
                "Certify with empty signature (should fail)",
                "POST",
                f"/inspections/{inspection2_id}/certify",
                400,
                data={"no_defects": True, "signature": ""},
                token=self.driver_token
            )
        
        # Test 12: Certify already-certified inspection (should fail)
        if inspection_id:
            success, data = self.run_test(
                "Certify already-certified inspection (should fail)",
                "POST",
                f"/inspections/{inspection_id}/certify",
                400,
                data={"no_defects": False, "signature": "Diego Ruiz"},
                token=self.driver_token
            )
        
        # Test 13: PUT item on certified inspection (should fail)
        if inspection_id:
            success, data = self.run_test(
                "Update item on certified inspection (should fail)",
                "PUT",
                f"/inspections/{inspection_id}/item",
                400,
                data={"key": "horn", "status": "pass"},
                token=self.driver_token
            )

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

    def test_crash_events(self):
        """Test Crash Events module (Stage 3 Phase 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Crash Events (Stage 3 Phase 2)")
        self.log("="*60)
        
        if not self.driver_token or not self.fleet_token:
            self.log("⚠️  Skipping - missing tokens", "WARN")
            return
        
        # Get driver record
        success, drivers = self.run_test(
            "Get drivers for crash event tests",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        
        driver_email = "driver@highwaypilot.io"
        driver_record = next((d for d in drivers if d.get('email') == driver_email), None) if success else None
        
        if not driver_record:
            self.log("⚠️  Could not find driver record", "WARN")
            return
        
        driver_id = driver_record['id']
        
        # Test 1: POST crash event with confirmed=true (should create critical alert)
        success, crash_event = self.run_test(
            "POST /crash-events with confirmed=true (creates alert)",
            "POST",
            "/crash-events",
            200,
            data={
                "severity": "high",
                "g_force": 3.2,
                "latitude": 32.7767,
                "longitude": -96.7970,
                "speed_mph": 55.0,
                "auto_detected": True,
                "confirmed": True,
                "notes": "Test crash event - confirmed"
            },
            token=self.driver_token
        )
        
        crash_event_id = None
        if success:
            crash_event_id = crash_event.get('id')
            self.log(f"   Created crash event: {crash_event_id}")
            self.log(f"   Status: {crash_event.get('status')}")
            
            if crash_event.get('status') != 'unacknowledged':
                self.log(f"   ❌ Expected status 'unacknowledged', got '{crash_event.get('status')}'", "FAIL")
            
            # Verify critical alert was created
            time.sleep(0.5)
            success_alert, alerts = self.run_test(
                "Verify critical alert created for confirmed crash",
                "GET",
                "/alerts",
                200,
                token=self.fleet_token
            )
            
            if success_alert:
                crash_alerts = [a for a in alerts if a.get('type') == 'crash_detected' and a.get('severity') == 'critical']
                if crash_alerts:
                    self.log(f"   ✓ Critical alert created: {crash_alerts[0].get('message')[:60]}...")
                else:
                    self.log(f"   ❌ No critical alert found for confirmed crash", "FAIL")
        
        # Test 2: POST crash event with confirmed=false (should NOT create alert)
        alerts_before_count = 0
        success_before, alerts_before = self.run_test(
            "Get alerts count before false alarm",
            "GET",
            "/alerts",
            200,
            token=self.fleet_token
        )
        if success_before:
            alerts_before_count = len(alerts_before)
        
        success, false_alarm = self.run_test(
            "POST /crash-events with confirmed=false (no alert)",
            "POST",
            "/crash-events",
            200,
            data={
                "severity": "low",
                "g_force": 1.5,
                "confirmed": False,
                "notes": "False alarm - driver OK"
            },
            token=self.driver_token
        )
        
        if success:
            time.sleep(0.5)
            success_after, alerts_after = self.run_test(
                "Verify no new alert for false alarm",
                "GET",
                "/alerts",
                200,
                token=self.fleet_token
            )
            
            if success_after:
                new_crash_alerts = [a for a in alerts_after if a.get('type') == 'crash_detected' and a.get('created_at') > false_alarm.get('created_at', '')]
                if new_crash_alerts:
                    self.log(f"   ❌ Alert created for false alarm (should not happen)", "FAIL")
                else:
                    self.log(f"   ✓ No alert created for false alarm (correct)")
        
        # Test 3: GET crash events as driver (should see only own)
        success, driver_crashes = self.run_test(
            "GET /crash-events as driver (driver-scoped)",
            "GET",
            "/crash-events",
            200,
            token=self.driver_token
        )
        
        if success:
            self.log(f"   Driver sees {len(driver_crashes)} crash events")
            # All should belong to this driver
            other_driver_crashes = [c for c in driver_crashes if c.get('driver_id') != driver_id]
            if other_driver_crashes:
                self.log(f"   ❌ Driver sees other drivers' crashes", "FAIL")
            else:
                self.log(f"   ✓ Driver sees only their own crashes")
        
        # Test 4: GET crash events as admin (should see all)
        success, admin_crashes = self.run_test(
            "GET /crash-events as admin (sees all)",
            "GET",
            "/crash-events",
            200,
            token=self.fleet_token
        )
        
        if success:
            self.log(f"   Admin sees {len(admin_crashes)} crash events")
            if len(admin_crashes) >= len(driver_crashes):
                self.log(f"   ✓ Admin sees all crashes (>= driver's count)")
            else:
                self.log(f"   ❌ Admin sees fewer crashes than driver", "FAIL")
        
        # Test 5: PUT crash event status as admin (should work)
        if crash_event_id:
            success, updated = self.run_test(
                "PUT /crash-events/{id}/status as admin (acknowledged)",
                "PUT",
                f"/crash-events/{crash_event_id}/status",
                200,
                data={"status": "acknowledged", "notes": "Fleet admin reviewed"},
                token=self.fleet_token
            )
            
            if success:
                if updated.get('status') == 'acknowledged':
                    self.log(f"   ✓ Status updated to 'acknowledged'")
                else:
                    self.log(f"   ❌ Status not updated correctly", "FAIL")
        
        # Test 6: PUT crash event status as driver (should fail 403)
        if crash_event_id:
            success, data = self.run_test(
                "PUT /crash-events/{id}/status as driver (should fail 403)",
                "PUT",
                f"/crash-events/{crash_event_id}/status",
                403,
                data={"status": "resolved"},
                token=self.driver_token
            )
        
        # Test 7: PUT crash event with invalid status (should fail 400)
        if crash_event_id:
            success, data = self.run_test(
                "PUT /crash-events/{id}/status with invalid status (400)",
                "PUT",
                f"/crash-events/{crash_event_id}/status",
                400,
                data={"status": "invalid_status"},
                token=self.fleet_token
            )

    def test_roadside_assistance(self):
        """Test Roadside Assistance module (Stage 3 Phase 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Roadside Assistance (Stage 3 Phase 2)")
        self.log("="*60)
        
        if not self.driver_token or not self.fleet_token:
            self.log("⚠️  Skipping - missing tokens", "WARN")
            return
        
        # Get driver record
        success, drivers = self.run_test(
            "Get drivers for roadside tests",
            "GET",
            "/drivers",
            200,
            token=self.fleet_token
        )
        
        driver_email = "driver@highwaypilot.io"
        driver_record = next((d for d in drivers if d.get('email') == driver_email), None) if success else None
        
        if not driver_record:
            self.log("⚠️  Could not find driver record", "WARN")
            return
        
        driver_id = driver_record['id']
        
        # Test 1: GET roadside providers (should return 6 seeded providers)
        success, providers = self.run_test(
            "GET /roadside/providers (6 seeded providers)",
            "GET",
            "/roadside/providers",
            200,
            token=self.driver_token
        )
        
        if success:
            self.log(f"   Found {len(providers)} providers")
            if len(providers) != 6:
                self.log(f"   ⚠️  Expected 6 providers, got {len(providers)}", "WARN")
            
            # Check for expected providers
            provider_names = [p.get('name') for p in providers]
            expected_names = ['Heartland', 'BigRig', 'Pilot', 'Speedy', 'Lockout', 'Trucker']
            for exp in expected_names:
                if any(exp in name for name in provider_names):
                    self.log(f"   ✓ Found provider with '{exp}' in name")
                else:
                    self.log(f"   ⚠️  Provider with '{exp}' not found", "WARN")
        
        # Test 2: GET roadside providers with service_type=tire filter
        success, tire_providers = self.run_test(
            "GET /roadside/providers?service_type=tire",
            "GET",
            "/roadside/providers",
            200,
            params={"service_type": "tire"},
            token=self.driver_token
        )
        
        if success:
            self.log(f"   Found {len(tire_providers)} tire providers")
            # All should have 'tire' in services
            for p in tire_providers:
                if 'tire' not in p.get('services', []):
                    self.log(f"   ❌ Provider {p.get('name')} doesn't offer tire service", "FAIL")
            
            # Trucker Tire Express should be fastest (25 min)
            if tire_providers:
                fastest = tire_providers[0]
                self.log(f"   Fastest tire provider: {fastest.get('name')} ({fastest.get('eta_avg_minutes')} min)")
                if 'Trucker' in fastest.get('name', ''):
                    self.log(f"   ✓ Trucker Tire Express is fastest")
                else:
                    self.log(f"   ⚠️  Expected Trucker Tire Express to be fastest", "WARN")
        
        # Test 3: POST roadside dispatch with service_type=tire (auto-selects fastest)
        success, dispatch = self.run_test(
            "POST /roadside/dispatch with service_type=tire (auto-select)",
            "POST",
            "/roadside/dispatch",
            200,
            data={
                "service_type": "tire",
                "description": "Blew a tire on I-30",
                "latitude": 32.7767,
                "longitude": -96.7970,
                "location_text": "I-30 mile marker 45"
            },
            token=self.driver_token
        )
        
        dispatch_id = None
        if success:
            dispatch_id = dispatch.get('id')
            self.log(f"   Created dispatch: {dispatch_id}")
            self.log(f"   Provider: {dispatch.get('provider_name')}")
            self.log(f"   ETA: {dispatch.get('eta_minutes')} min")
            self.log(f"   Status: {dispatch.get('status')}")
            
            if dispatch.get('status') != 'requested':
                self.log(f"   ❌ Expected status 'requested', got '{dispatch.get('status')}'", "FAIL")
            
            # Should auto-select Trucker Tire Express (fastest tire provider)
            if 'Trucker' in dispatch.get('provider_name', ''):
                self.log(f"   ✓ Auto-selected fastest tire provider (Trucker Tire Express)")
            else:
                self.log(f"   ⚠️  Expected Trucker Tire Express, got {dispatch.get('provider_name')}", "WARN")
            
            # Verify alert was created
            time.sleep(0.5)
            success_alert, alerts = self.run_test(
                "Verify roadside_dispatch alert created",
                "GET",
                "/alerts",
                200,
                token=self.fleet_token
            )
            
            if success_alert:
                roadside_alerts = [a for a in alerts if a.get('type') == 'roadside_dispatch']
                if roadside_alerts:
                    self.log(f"   ✓ Roadside alert created")
                else:
                    self.log(f"   ❌ No roadside alert found", "FAIL")
        
        # Test 4: POST roadside dispatch with invalid service_type (should fail 400)
        success, data = self.run_test(
            "POST /roadside/dispatch with invalid service_type (400)",
            "POST",
            "/roadside/dispatch",
            400,
            data={
                "service_type": "invalid_service",
                "description": "Test"
            },
            token=self.driver_token
        )
        
        # Test 5: POST roadside dispatch with provider_id specified
        if tire_providers and len(tire_providers) > 1:
            specific_provider = tire_providers[1]  # Pick second provider
            success, dispatch2 = self.run_test(
                "POST /roadside/dispatch with provider_id specified",
                "POST",
                "/roadside/dispatch",
                200,
                data={
                    "service_type": "tire",
                    "description": "Another tire issue",
                    "provider_id": specific_provider.get('id')
                },
                token=self.driver_token
            )
            
            if success:
                if dispatch2.get('provider_id') == specific_provider.get('id'):
                    self.log(f"   ✓ Used specified provider: {dispatch2.get('provider_name')}")
                else:
                    self.log(f"   ❌ Did not use specified provider", "FAIL")
        
        # Test 6: GET roadside dispatches as driver (should see only own)
        success, driver_dispatches = self.run_test(
            "GET /roadside/dispatch as driver (driver-scoped)",
            "GET",
            "/roadside/dispatch",
            200,
            token=self.driver_token
        )
        
        if success:
            self.log(f"   Driver sees {len(driver_dispatches)} dispatches")
            # All should belong to this driver
            other_driver_dispatches = [d for d in driver_dispatches if d.get('driver_id') != driver_id]
            if other_driver_dispatches:
                self.log(f"   ❌ Driver sees other drivers' dispatches", "FAIL")
            else:
                self.log(f"   ✓ Driver sees only their own dispatches")
        
        # Test 7: GET roadside dispatches as admin (should see all)
        success, admin_dispatches = self.run_test(
            "GET /roadside/dispatch as admin (sees all)",
            "GET",
            "/roadside/dispatch",
            200,
            token=self.fleet_token
        )
        
        if success:
            self.log(f"   Admin sees {len(admin_dispatches)} dispatches")
            if len(admin_dispatches) >= len(driver_dispatches):
                self.log(f"   ✓ Admin sees all dispatches")
            else:
                self.log(f"   ❌ Admin sees fewer dispatches than driver", "FAIL")
        
        # Test 8: GET single dispatch by ID as driver
        if dispatch_id:
            success, single = self.run_test(
                "GET /roadside/dispatch/{id} as driver",
                "GET",
                f"/roadside/dispatch/{dispatch_id}",
                200,
                token=self.driver_token
            )
            
            if success:
                if single.get('id') == dispatch_id:
                    self.log(f"   ✓ Retrieved dispatch by ID")
                else:
                    self.log(f"   ❌ Wrong dispatch returned", "FAIL")
        
        # Test 9: PUT dispatch status as admin (full lifecycle)
        if dispatch_id:
            # confirmed
            success, updated = self.run_test(
                "PUT /roadside/dispatch/{id}/status to 'confirmed' (admin)",
                "PUT",
                f"/roadside/dispatch/{dispatch_id}/status",
                200,
                data={"status": "confirmed", "note": "Provider confirmed"},
                token=self.fleet_token
            )
            
            if success:
                if updated.get('status') == 'confirmed':
                    self.log(f"   ✓ Status: requested → confirmed")
                    history = updated.get('history', [])
                    if len(history) >= 2:
                        self.log(f"   ✓ History has {len(history)} entries")
                    else:
                        self.log(f"   ❌ History not appended correctly", "FAIL")
                else:
                    self.log(f"   ❌ Status not updated", "FAIL")
            
            # en_route
            success, updated = self.run_test(
                "PUT /roadside/dispatch/{id}/status to 'en_route' (admin)",
                "PUT",
                f"/roadside/dispatch/{dispatch_id}/status",
                200,
                data={"status": "en_route", "note": "Provider on the way"},
                token=self.fleet_token
            )
            
            if success and updated.get('status') == 'en_route':
                self.log(f"   ✓ Status: confirmed → en_route")
            
            # arrived
            success, updated = self.run_test(
                "PUT /roadside/dispatch/{id}/status to 'arrived' (admin)",
                "PUT",
                f"/roadside/dispatch/{dispatch_id}/status",
                200,
                data={"status": "arrived", "note": "Provider on site"},
                token=self.fleet_token
            )
            
            if success and updated.get('status') == 'arrived':
                self.log(f"   ✓ Status: en_route → arrived")
            
            # completed
            success, updated = self.run_test(
                "PUT /roadside/dispatch/{id}/status to 'completed' (admin)",
                "PUT",
                f"/roadside/dispatch/{dispatch_id}/status",
                200,
                data={"status": "completed", "note": "Service complete"},
                token=self.fleet_token
            )
            
            if success:
                if updated.get('status') == 'completed':
                    self.log(f"   ✓ Status: arrived → completed")
                    history = updated.get('history', [])
                    if len(history) >= 5:
                        self.log(f"   ✓ Full lifecycle tracked in history ({len(history)} entries)")
                    else:
                        self.log(f"   ⚠️  History has only {len(history)} entries", "WARN")
                else:
                    self.log(f"   ❌ Status not updated to completed", "FAIL")
        
        # Test 10: PUT dispatch status as driver (only cancel allowed)
        # Create a new dispatch for this test
        success, cancel_dispatch = self.run_test(
            "Create dispatch for driver cancel test",
            "POST",
            "/roadside/dispatch",
            200,
            data={
                "service_type": "tow",
                "description": "Test cancel"
            },
            token=self.driver_token
        )
        
        if success:
            cancel_id = cancel_dispatch.get('id')
            
            # Try to set to 'confirmed' as driver (should fail 403)
            success, data = self.run_test(
                "PUT dispatch status to 'confirmed' as driver (403)",
                "PUT",
                f"/roadside/dispatch/{cancel_id}/status",
                403,
                data={"status": "confirmed"},
                token=self.driver_token
            )
            
            # Try to cancel as driver (should work)
            success, cancelled = self.run_test(
                "PUT dispatch status to 'cancelled' as driver (allowed)",
                "PUT",
                f"/roadside/dispatch/{cancel_id}/status",
                200,
                data={"status": "cancelled", "note": "Driver cancelled"},
                token=self.driver_token
            )
            
            if success:
                if cancelled.get('status') == 'cancelled':
                    self.log(f"   ✓ Driver can cancel their own dispatch")
                else:
                    self.log(f"   ❌ Status not updated to cancelled", "FAIL")

    def test_copilot_dispatch_roadside(self):
        """Test Co-Pilot dispatch_roadside action (Stage 3 Phase 2)"""
        self.log("\n" + "="*60)
        self.log("TESTING: Co-Pilot dispatch_roadside Action (Stage 3 Phase 2)")
        self.log("="*60)
        
        if not self.driver_token:
            self.log("⚠️  Skipping - no driver token", "WARN")
            return
        
        # Test 1: Co-Pilot dispatch_roadside action with "I blew a tire"
        self.log("\n   ⚠️  Making LLM call for dispatch_roadside action", "WARN")
        success, data = self.run_test(
            "Co-Pilot dispatch_roadside: 'I blew a tire'",
            "POST",
            "/copilot/chat",
            200,
            data={"message": "Hey, I blew a tire and need help"},
            token=self.driver_token
        )
        
        dispatch_id = None
        if success:
            reply = data.get('reply', '')
            action = data.get('action')
            self.log(f"   Reply: {reply[:100]}...")
            
            # Verify action object
            if action:
                self.log(f"   Action type: {action.get('type')}")
                self.log(f"   Action executed: {action.get('executed')}")
                self.log(f"   Service type: {action.get('service_type')}")
                self.log(f"   Provider: {action.get('provider_name')}")
                self.log(f"   ETA: {action.get('eta_minutes')} min")
                
                if action.get('type') != 'dispatch_roadside':
                    self.log(f"   ❌ Expected action type 'dispatch_roadside', got '{action.get('type')}'", "FAIL")
                if action.get('executed') != True:
                    self.log(f"   ❌ Expected action.executed=true", "FAIL")
                if action.get('service_type') != 'tire':
                    self.log(f"   ❌ Expected service_type='tire', got '{action.get('service_type')}'", "FAIL")
                
                dispatch_id = action.get('dispatch_id')
                if not dispatch_id:
                    self.log(f"   ❌ No dispatch_id in action", "FAIL")
                else:
                    self.log(f"   ✓ Dispatch created: {dispatch_id}")
            else:
                self.log(f"   ❌ No action object returned", "FAIL")
            
            # Verify reply text does NOT contain ACTION marker
            if '<<<ACTION' in reply or '>>>' in reply:
                self.log(f"   ❌ Reply text contains ACTION marker remnants", "FAIL")
            else:
                self.log(f"   ✓ Reply text clean (no ACTION marker)")
            
            # Verify dispatch record was created
            if dispatch_id:
                time.sleep(0.5)
                success_verify, dispatches = self.run_test(
                    "Verify dispatch record created via Co-Pilot",
                    "GET",
                    "/roadside/dispatch",
                    200,
                    token=self.driver_token
                )
                
                if success_verify:
                    created_dispatch = next((d for d in dispatches if d.get('id') == dispatch_id), None)
                    if created_dispatch:
                        self.log(f"   ✓ Dispatch record found in DB")
                        self.log(f"   Service: {created_dispatch.get('service_type')}")
                        self.log(f"   Provider: {created_dispatch.get('provider_name')}")
                        self.log(f"   Status: {created_dispatch.get('status')}")
                    else:
                        self.log(f"   ❌ Dispatch record not found in DB", "FAIL")

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
    print("Stage 3 Phase 2: Crash Events + Roadside Assistance + Co-Pilot dispatch_roadside")
    print("="*60)
    
    tester = HighwayPilotAPITester()
    
    # Run all tests
    tester.test_health()
    
    if not tester.test_auth():
        print("\n❌ Authentication failed - cannot proceed with authenticated tests")
        return tester.print_summary()
    
    # Stage 3 Phase 2 tests (NEW - Iteration 6)
    tester.test_crash_events()  # NEW Crash Events module
    tester.test_roadside_assistance()  # NEW Roadside Assistance module
    tester.test_copilot_dispatch_roadside()  # NEW Co-Pilot dispatch_roadside action
    
    # Stage 3 Phase 1.5 tests (from iteration 5)
    tester.test_copilot_actions()  # Co-Pilot action execution tests
    tester.test_dvir()  # DVIR tests
    
    # Stage 3 Phase 1 tests (from iteration 4)
    tester.test_stripe()  # Stripe pricing (pro, fleet)
    tester.test_copilot()  # AI Copilot basic tests
    
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
