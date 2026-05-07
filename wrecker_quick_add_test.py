#!/usr/bin/env python3
"""
RoadBoss Wrecker Mode — Quick Add Driver + Assignment Integration Tests

Test Coverage:
- POST /api/wrecker/drivers/quick-add (minimal payload, validation, duplicate handling)
- POST /api/wrecker/jobs/{job_id}/assign (status_history with TWO entries)
- End-to-end flow: quick-add → verify in list → assign → verify status change
- Auth gate: wrecker_operator role should get 403 on quick-add
"""

import requests
import sys
import time
import json
from datetime import datetime
from typing import Dict, Any, Optional

BASE_URL = "https://build-forge-49.preview.emergentagent.com/api"
SHARED_PASSWORD = "HighwayPilot2026!"

class WreckerQuickAddTester:
    def __init__(self):
        self.super_admin_token: Optional[str] = None
        self.driver_token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.super_admin_user: Optional[Dict[str, Any]] = None
        self.driver_user: Optional[Dict[str, Any]] = None
        
    def log(self, msg: str, level: str = "INFO"):
        """Log with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = {
            "INFO": "ℹ️",
            "PASS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️"
        }.get(level, "•")
        print(f"[{timestamp}] {prefix} {msg}")
    
    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None,
                 check_fn: Optional[callable] = None, token: Optional[str] = None) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if token:
            req_headers['Authorization'] = f'Bearer {token}'
        if headers:
            req_headers.update(headers)
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=req_headers, timeout=15)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Check status code
            if response.status_code != expected_status:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                self.log(f"Response: {response.text[:500]}", "FAIL")
                self.tests_failed += 1
                return False, None
            
            # Parse response
            try:
                resp_data = response.json()
            except:
                resp_data = response.text
            
            # Run custom check function if provided
            if check_fn:
                check_result = check_fn(resp_data)
                if not check_result:
                    self.log(f"FAILED - Custom check failed", "FAIL")
                    self.log(f"Response: {json.dumps(resp_data, indent=2)[:1000]}", "FAIL")
                    self.tests_failed += 1
                    return False, resp_data
            
            self.log(f"PASSED - Status: {response.status_code}", "PASS")
            self.tests_passed += 1
            return True, resp_data
            
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False, None
    
    def setup(self) -> bool:
        """Setup: Login as super_admin and driver"""
        self.log("=== SETUP: Login ===", "INFO")
        
        # Login as super_admin
        self.log("Logging in as super_admin...", "INFO")
        success, resp = self.run_test(
            "Login as super_admin",
            "POST",
            "auth/login",
            200,
            data={
                "email": "mward5710@gmail.com",
                "password": SHARED_PASSWORD
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r
        )
        
        if not success or not resp:
            self.log("Super admin login failed - cannot continue", "FAIL")
            return False
        
        self.super_admin_token = resp['access_token']
        self.super_admin_user = resp['user']
        self.log(f"Logged in as {self.super_admin_user.get('name')} (role: {self.super_admin_user.get('role')})", "PASS")
        
        # Login as driver (wrecker_operator)
        self.log("Logging in as driver (wrecker_operator)...", "INFO")
        success, driver_resp = self.run_test(
            "Login as driver",
            "POST",
            "auth/login",
            200,
            data={
                "email": "michael.ward@wrecker-logix.com",
                "password": "HighwayPilot2026!Driver"
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r
        )
        
        if success and driver_resp:
            self.driver_token = driver_resp['access_token']
            self.driver_user = driver_resp['user']
            self.log(f"Logged in as driver: {self.driver_user.get('name')} (role: {self.driver_user.get('role')})", "PASS")
        else:
            self.log("Driver login failed - some tests will be skipped", "WARN")
        
        return True
    
    # ============================================================
    # Test 1: Quick-add with minimal payload (name only)
    # ============================================================
    
    def test_quick_add_minimal(self):
        """Test POST /api/wrecker/drivers/quick-add with minimal payload (name only)"""
        self.log("\n=== TEST 1: Quick-add Driver (Minimal Payload) ===", "INFO")
        
        timestamp = int(time.time())
        driver_name = f"Test Driver {timestamp}"
        
        def check_quick_add(resp):
            # Check response structure
            if not resp.get('ok'):
                self.log("Quick-add failed: ok=False", "FAIL")
                return False
            
            if 'driver' not in resp:
                self.log("Missing 'driver' field in response", "FAIL")
                return False
            
            driver = resp['driver']
            
            # Verify driver has required fields
            required_fields = ['id', 'name', 'email', 'role']
            for field in required_fields:
                if field not in driver:
                    self.log(f"Missing required field in driver: {field}", "FAIL")
                    return False
            
            # Verify name matches
            if driver['name'] != driver_name:
                self.log(f"Name mismatch: expected '{driver_name}', got '{driver['name']}'", "FAIL")
                return False
            
            # Verify role is wrecker_operator
            if driver['role'] != 'wrecker_operator':
                self.log(f"Role should be 'wrecker_operator', got '{driver['role']}'", "FAIL")
                return False
            
            # Verify email was auto-generated
            if not driver['email']:
                self.log("Email should be auto-generated", "FAIL")
                return False
            
            if not driver['email'].endswith('@wrecker-logix.com'):
                self.log(f"Auto-generated email should end with '@wrecker-logix.com', got '{driver['email']}'", "FAIL")
                return False
            
            # Verify temp_password is returned
            if 'temp_password' not in resp:
                self.log("Missing 'temp_password' in response", "FAIL")
                return False
            
            self.log(f"✓ Driver created: {driver['name']} (ID: {driver['id']})", "INFO")
            self.log(f"✓ Auto-generated email: {driver['email']}", "INFO")
            self.log(f"✓ Temp password: {resp['temp_password']}", "INFO")
            
            # Store driver ID for later tests
            self.quick_add_driver_id = driver['id']
            self.quick_add_driver_name = driver['name']
            
            return True
        
        success, resp = self.run_test(
            "POST /api/wrecker/drivers/quick-add (name only)",
            "POST",
            "wrecker/drivers/quick-add",
            200,
            data={
                "name": driver_name
            },
            check_fn=check_quick_add,
            token=self.super_admin_token
        )
        
        return success
    
    # ============================================================
    # Test 2: Quick-add with missing name (should fail 400)
    # ============================================================
    
    def test_quick_add_missing_name(self):
        """Test POST /api/wrecker/drivers/quick-add with missing name (should fail 400)"""
        self.log("\n=== TEST 2: Quick-add Driver (Missing Name - Should Fail) ===", "INFO")
        
        # Test with empty name
        self.run_test(
            "POST /api/wrecker/drivers/quick-add (empty name)",
            "POST",
            "wrecker/drivers/quick-add",
            400,
            data={
                "name": ""
            },
            token=self.super_admin_token
        )
        
        # Test with no name field
        self.run_test(
            "POST /api/wrecker/drivers/quick-add (no name field)",
            "POST",
            "wrecker/drivers/quick-add",
            400,
            data={
                "email": "test@example.com"
            },
            token=self.super_admin_token
        )
        
        # Test with name too short (< 2 chars)
        self.run_test(
            "POST /api/wrecker/drivers/quick-add (name too short)",
            "POST",
            "wrecker/drivers/quick-add",
            400,
            data={
                "name": "A"
            },
            token=self.super_admin_token
        )
    
    # ============================================================
    # Test 3: Quick-add with duplicate email (should fail 409)
    # ============================================================
    
    def test_quick_add_duplicate_email(self):
        """Test POST /api/wrecker/drivers/quick-add with duplicate email (should fail 409)"""
        self.log("\n=== TEST 3: Quick-add Driver (Duplicate Email - Should Fail) ===", "INFO")
        
        # Use an existing email (super_admin)
        self.run_test(
            "POST /api/wrecker/drivers/quick-add (duplicate email)",
            "POST",
            "wrecker/drivers/quick-add",
            409,
            data={
                "name": "Duplicate Test",
                "email": "super_admin@highwaypilot.io"
            },
            token=self.super_admin_token
        )
    
    # ============================================================
    # Test 4: Verify quick-added driver appears in list
    # ============================================================
    
    def test_verify_driver_in_list(self):
        """Test GET /api/wrecker/drivers to verify quick-added driver appears"""
        self.log("\n=== TEST 4: Verify Quick-added Driver in List ===", "INFO")
        
        if not hasattr(self, 'quick_add_driver_id'):
            self.log("No quick-added driver ID available, skipping", "WARN")
            self.tests_run += 1
            self.tests_passed += 1
            return True
        
        def check_driver_list(resp):
            if not isinstance(resp, list):
                self.log("Response is not a list", "FAIL")
                return False
            
            # Find our quick-added driver
            found = False
            for driver in resp:
                if driver.get('id') == self.quick_add_driver_id:
                    found = True
                    self.log(f"✓ Found quick-added driver: {driver.get('name')}", "INFO")
                    break
            
            if not found:
                self.log(f"Quick-added driver (ID: {self.quick_add_driver_id}) not found in list", "FAIL")
                return False
            
            return True
        
        success, resp = self.run_test(
            "GET /api/wrecker/drivers (verify quick-added driver)",
            "GET",
            "wrecker/drivers",
            200,
            check_fn=check_driver_list,
            token=self.super_admin_token
        )
        
        return success
    
    # ============================================================
    # Test 5: Create a pending job for assignment testing
    # ============================================================
    
    def test_create_pending_job(self):
        """Create a pending tow job for assignment testing"""
        self.log("\n=== TEST 5: Create Pending Tow Job ===", "INFO")
        
        def check_job_creation(resp):
            if not resp.get('id'):
                self.log("Job creation failed: no ID", "FAIL")
                return False
            
            if resp.get('status') != 'pending':
                self.log(f"Job status should be 'pending', got '{resp.get('status')}'", "FAIL")
                return False
            
            # Verify status_history has one entry
            status_history = resp.get('status_history', [])
            if len(status_history) != 1:
                self.log(f"Status history should have 1 entry, got {len(status_history)}", "FAIL")
                return False
            
            if status_history[0].get('status') != 'pending':
                self.log(f"First status_history entry should be 'pending', got '{status_history[0].get('status')}'", "FAIL")
                return False
            
            self.log(f"✓ Pending job created: {resp['id']}", "INFO")
            self.log(f"✓ Status: {resp['status']}", "INFO")
            self.log(f"✓ Status history entries: {len(status_history)}", "INFO")
            
            # Store job ID for assignment test
            self.pending_job_id = resp['id']
            
            return True
        
        success, resp = self.run_test(
            "POST /api/wrecker/jobs (create pending job)",
            "POST",
            "wrecker/jobs",
            200,
            data={
                "service_type": "tow_light_duty",
                "priority": "normal",
                "customer": {
                    "name": "Test Customer",
                    "phone": "+12145550199"
                },
                "vehicle": {
                    "year": 2020,
                    "make": "Toyota",
                    "model": "Camry",
                    "color": "Silver"
                },
                "pickup": {
                    "lat": 39.7684,
                    "lng": -86.1581,
                    "address": "123 Test St, Indianapolis, IN"
                },
                "dropoff": {
                    "lat": 39.7910,
                    "lng": -86.1480,
                    "address": "456 Destination Ave, Indianapolis, IN"
                },
                "notes": "Test job for quick-add driver assignment"
            },
            check_fn=check_job_creation,
            token=self.super_admin_token
        )
        
        return success
    
    # ============================================================
    # Test 6: Assign quick-added driver to job (verify TWO status_history entries)
    # ============================================================
    
    def test_assign_driver_to_job(self):
        """Test POST /api/wrecker/jobs/{job_id}/assign - verify TWO status_history entries"""
        self.log("\n=== TEST 6: Assign Quick-added Driver to Job ===", "INFO")
        
        if not hasattr(self, 'pending_job_id'):
            self.log("No pending job ID available, skipping", "WARN")
            self.tests_run += 1
            self.tests_passed += 1
            return True
        
        if not hasattr(self, 'quick_add_driver_id'):
            self.log("No quick-added driver ID available, skipping", "WARN")
            self.tests_run += 1
            self.tests_passed += 1
            return True
        
        def check_assignment(resp):
            # Verify assigned_driver_id is set
            if resp.get('assigned_driver_id') != self.quick_add_driver_id:
                self.log(f"assigned_driver_id mismatch: expected '{self.quick_add_driver_id}', got '{resp.get('assigned_driver_id')}'", "FAIL")
                return False
            
            # Verify status changed to 'assigned'
            if resp.get('status') != 'assigned':
                self.log(f"Status should be 'assigned', got '{resp.get('status')}'", "FAIL")
                return False
            
            # CRITICAL: Verify status_history has TWO new entries (total 3: pending + assigned + note)
            status_history = resp.get('status_history', [])
            if len(status_history) < 3:
                self.log(f"Status history should have at least 3 entries (pending + assigned + note), got {len(status_history)}", "FAIL")
                self.log(f"Status history: {json.dumps(status_history, indent=2)}", "FAIL")
                return False
            
            # Find the 'assigned' status entry
            assigned_entry = None
            note_entry = None
            
            for entry in status_history:
                if entry.get('status') == 'assigned':
                    assigned_entry = entry
                elif 'note' in entry and 'Assigned to' in entry.get('note', ''):
                    note_entry = entry
            
            if not assigned_entry:
                self.log("Missing 'assigned' status entry in status_history", "FAIL")
                self.log(f"Status history: {json.dumps(status_history, indent=2)}", "FAIL")
                return False
            
            if not note_entry:
                self.log("Missing 'Assigned to <name>' note entry in status_history", "FAIL")
                self.log(f"Status history: {json.dumps(status_history, indent=2)}", "FAIL")
                return False
            
            # Verify note contains driver name
            if self.quick_add_driver_name not in note_entry.get('note', ''):
                self.log(f"Note should contain driver name '{self.quick_add_driver_name}', got '{note_entry.get('note')}'", "FAIL")
                return False
            
            self.log(f"✓ Driver assigned: {resp.get('assigned_driver_id')}", "INFO")
            self.log(f"✓ Status changed to: {resp.get('status')}", "INFO")
            self.log(f"✓ Status history entries: {len(status_history)}", "INFO")
            self.log(f"✓ Found 'assigned' status entry: {assigned_entry}", "INFO")
            self.log(f"✓ Found 'Assigned to' note entry: {note_entry}", "INFO")
            
            return True
        
        success, resp = self.run_test(
            f"POST /api/wrecker/jobs/{self.pending_job_id}/assign",
            "POST",
            f"wrecker/jobs/{self.pending_job_id}/assign",
            200,
            data={
                "driver_id": self.quick_add_driver_id
            },
            check_fn=check_assignment,
            token=self.super_admin_token
        )
        
        return success
    
    # ============================================================
    # Test 7: Verify job status via GET (confirm status_history persisted)
    # ============================================================
    
    def test_verify_job_status(self):
        """Test GET /api/wrecker/jobs/{job_id} to verify status_history persisted"""
        self.log("\n=== TEST 7: Verify Job Status (GET) ===", "INFO")
        
        if not hasattr(self, 'pending_job_id'):
            self.log("No pending job ID available, skipping", "WARN")
            self.tests_run += 1
            self.tests_passed += 1
            return True
        
        def check_job_status(resp):
            # Verify status is 'assigned'
            if resp.get('status') != 'assigned':
                self.log(f"Status should be 'assigned', got '{resp.get('status')}'", "FAIL")
                return False
            
            # Verify assigned_driver_id
            if resp.get('assigned_driver_id') != self.quick_add_driver_id:
                self.log(f"assigned_driver_id mismatch", "FAIL")
                return False
            
            # Verify status_history has both entries
            status_history = resp.get('status_history', [])
            if len(status_history) < 3:
                self.log(f"Status history should have at least 3 entries, got {len(status_history)}", "FAIL")
                return False
            
            # Verify both 'assigned' status and 'Assigned to' note exist
            has_assigned_status = any(e.get('status') == 'assigned' for e in status_history)
            has_assigned_note = any('Assigned to' in e.get('note', '') for e in status_history)
            
            if not has_assigned_status:
                self.log("Missing 'assigned' status in status_history", "FAIL")
                return False
            
            if not has_assigned_note:
                self.log("Missing 'Assigned to' note in status_history", "FAIL")
                return False
            
            self.log(f"✓ Job status verified: {resp.get('status')}", "INFO")
            self.log(f"✓ Status history persisted correctly with {len(status_history)} entries", "INFO")
            
            return True
        
        success, resp = self.run_test(
            f"GET /api/wrecker/jobs/{self.pending_job_id}",
            "GET",
            f"wrecker/jobs/{self.pending_job_id}",
            200,
            check_fn=check_job_status,
            token=self.super_admin_token
        )
        
        return success
    
    # ============================================================
    # Test 8: Auth gate - wrecker_operator should get 403 on quick-add
    # ============================================================
    
    def test_auth_gate_wrecker_operator(self):
        """Test POST /api/wrecker/drivers/quick-add with wrecker_operator role (should fail 403)"""
        self.log("\n=== TEST 8: Auth Gate - Wrecker Operator (Should Fail 403) ===", "INFO")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            self.tests_run += 1
            self.tests_passed += 1
            return True
        
        self.run_test(
            "POST /api/wrecker/drivers/quick-add (wrecker_operator - should fail)",
            "POST",
            "wrecker/drivers/quick-add",
            403,
            data={
                "name": "Should Fail Test"
            },
            token=self.driver_token
        )
    
    # ============================================================
    # Test 9: Quick-add with optional fields
    # ============================================================
    
    def test_quick_add_with_optional_fields(self):
        """Test POST /api/wrecker/drivers/quick-add with optional fields"""
        self.log("\n=== TEST 9: Quick-add Driver (With Optional Fields) ===", "INFO")
        
        timestamp = int(time.time())
        driver_name = f"Full Test Driver {timestamp}"
        
        def check_full_quick_add(resp):
            if not resp.get('ok'):
                self.log("Quick-add failed: ok=False", "FAIL")
                return False
            
            driver = resp.get('driver', {})
            
            # Verify optional fields are set
            if driver.get('phone') != '+13175551234':
                self.log(f"Phone mismatch: expected '+13175551234', got '{driver.get('phone')}'", "FAIL")
                return False
            
            if driver.get('truck_number') != '99':
                self.log(f"Truck number mismatch: expected '99', got '{driver.get('truck_number')}'", "FAIL")
                return False
            
            self.log(f"✓ Driver created with optional fields: {driver['name']}", "INFO")
            self.log(f"✓ Phone: {driver.get('phone')}", "INFO")
            self.log(f"✓ Truck: {driver.get('truck_number')}", "INFO")
            
            return True
        
        success, resp = self.run_test(
            "POST /api/wrecker/drivers/quick-add (with optional fields)",
            "POST",
            "wrecker/drivers/quick-add",
            200,
            data={
                "name": driver_name,
                "phone": "+13175551234",
                "truck_number": "99",
                "email": f"test.driver.{timestamp}@wrecker-logix.com"
            },
            check_fn=check_full_quick_add,
            token=self.super_admin_token
        )
        
        return success
    
    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*60, "INFO")
        self.log("TEST SUMMARY", "INFO")
        self.log("="*60, "INFO")
        self.log(f"Total Tests: {self.tests_run}", "INFO")
        self.log(f"Passed: {self.tests_passed}", "PASS")
        self.log(f"Failed: {self.tests_failed}", "FAIL")
        
        if self.tests_failed == 0:
            self.log("\n🎉 ALL TESTS PASSED!", "PASS")
            return 0
        else:
            self.log(f"\n⚠️  {self.tests_failed} TEST(S) FAILED", "FAIL")
            return 1

def main():
    tester = WreckerQuickAddTester()
    
    # Setup
    if not tester.setup():
        tester.log("Setup failed, cannot continue", "FAIL")
        return 1
    
    # Run tests
    tester.log("\n" + "="*60, "INFO")
    tester.log("WRECKER MODE: QUICK-ADD DRIVER + ASSIGNMENT TESTS", "INFO")
    tester.log("="*60, "INFO")
    
    tester.test_quick_add_minimal()
    tester.test_quick_add_missing_name()
    tester.test_quick_add_duplicate_email()
    tester.test_verify_driver_in_list()
    tester.test_create_pending_job()
    tester.test_assign_driver_to_job()
    tester.test_verify_job_status()
    tester.test_auth_gate_wrecker_operator()
    tester.test_quick_add_with_optional_fields()
    
    # Print summary
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
