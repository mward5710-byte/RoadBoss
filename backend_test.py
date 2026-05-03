#!/usr/bin/env python3
"""
Highway Pilot Backend API Test Suite
Tests all endpoints for Stage 1 MVP
"""
import requests
import sys
from datetime import datetime
import json

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
    print("Stage 1 MVP - Full Integration Test")
    print("="*60)
    
    tester = HighwayPilotAPITester()
    
    # Run all tests
    tester.test_health()
    
    if not tester.test_auth():
        print("\n❌ Authentication failed - cannot proceed with authenticated tests")
        return tester.print_summary()
    
    tester.test_waitlist()
    tester.test_overview()
    tester.test_drivers()
    tester.test_vehicles()
    tester.test_trips()
    tester.test_hos()
    tester.test_maintenance()
    tester.test_alerts()
    tester.test_dashcam()
    tester.test_voice_commands()
    
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
