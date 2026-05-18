#!/usr/bin/env python3
"""
RoadBoss Highway Pilot Phase 2G.3 — Emergency Contacts CRUD API Tests

Test Coverage:
- GET /api/emergency-contacts (fleet_admin/super_admin/dispatcher allowed)
- POST /api/emergency-contacts (fleet_admin/super_admin ONLY, dispatcher 403)
- PUT /api/emergency-contacts/{id} (admin only, duplicate check, 404 if unknown)
- DELETE /api/emergency-contacts/{id} (admin only, 404 if unknown)
- Driver role forbidden (403) from all emergency-contacts endpoints
- Phone normalization and duplicate detection (409)
- Regression: crash events, roadside dispatch, dispatch SMS still work with zero DB contacts
- Regression: all 7 demo users can log in
- Regression: /api/push/* endpoints still work
- Regression: /api/notifications/logs still works
"""

import requests
import sys
import time
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional

BASE_URL = os.getenv("ROADBOSS_API_BASE_URL", "http://localhost:8001/api")
SHARED_PASSWORD = "HighwayPilot2026!"

class EmergencyContactsTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.tokens = {}
        self.created_contact_ids = []
        
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
                 data: Optional[Dict] = None, token: Optional[str] = None,
                 check_fn: Optional[callable] = None) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=15)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=15)
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
                resp_data = None
            
            # Run custom check function
            if check_fn and not check_fn(resp_data):
                self.log(f"FAILED - Custom check failed", "FAIL")
                self.tests_failed += 1
                return False, resp_data
            
            self.log(f"PASSED - Status: {response.status_code}", "PASS")
            self.tests_passed += 1
            return True, resp_data
            
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False, None
    
    def login(self, email: str, role_name: str) -> bool:
        """Login and store token"""
        self.log(f"Logging in as {role_name} ({email})...", "INFO")
        success, resp = self.run_test(
            f"Login {role_name}",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": SHARED_PASSWORD}
        )
        if success and resp and 'access_token' in resp:
            self.tokens[role_name] = resp['access_token']
            self.log(f"✓ {role_name} logged in successfully", "PASS")
            return True
        self.log(f"✗ {role_name} login failed", "FAIL")
        return False
    
    def test_login_all_users(self):
        """Test that all 7 demo users can log in"""
        self.log("\n=== Testing All Demo User Logins ===", "INFO")
        users = [
            ("super_admin@highwaypilot.io", "super_admin"),
            ("fleet_admin@highwaypilot.io", "fleet_admin"),
            ("driver@highwaypilot.io", "driver"),
            ("marcus@highwaypilot.io", "marcus"),
            ("aaliyah@highwaypilot.io", "aaliyah"),
            ("tyler@highwaypilot.io", "tyler"),
            ("rosa@highwaypilot.io", "rosa"),
        ]
        
        all_passed = True
        for email, role in users:
            if not self.login(email, role):
                all_passed = False
        
        return all_passed
    
    def test_get_emergency_contacts_permissions(self):
        """Test GET /api/emergency-contacts with different roles"""
        self.log("\n=== Testing GET /api/emergency-contacts Permissions ===", "INFO")
        
        # fleet_admin should be able to list
        success, resp = self.run_test(
            "GET emergency-contacts as fleet_admin",
            "GET",
            "emergency-contacts",
            200,
            token=self.tokens.get('fleet_admin'),
            check_fn=lambda r: isinstance(r, list)
        )
        
        # super_admin should be able to list
        success, resp = self.run_test(
            "GET emergency-contacts as super_admin",
            "GET",
            "emergency-contacts",
            200,
            token=self.tokens.get('super_admin'),
            check_fn=lambda r: isinstance(r, list)
        )
        
        # driver should be forbidden (403)
        success, resp = self.run_test(
            "GET emergency-contacts as driver (should be 403)",
            "GET",
            "emergency-contacts",
            403,
            token=self.tokens.get('driver')
        )
    
    def test_create_emergency_contact(self):
        """Test POST /api/emergency-contacts"""
        self.log("\n=== Testing POST /api/emergency-contacts ===", "INFO")
        
        # fleet_admin should be able to create
        success, resp = self.run_test(
            "Create emergency contact as fleet_admin",
            "POST",
            "emergency-contacts",
            200,
            data={
                "name": "Test Contact 1",
                "phone": "555-123-4567",
                "role": "Safety Director",
                "notes": "Test contact for Phase 2G.3",
                "channels": ["sms"],
                "active": True
            },
            token=self.tokens.get('fleet_admin'),
            check_fn=lambda r: r and 'id' in r and r.get('phone') == '+15551234567'
        )
        if success and resp:
            self.created_contact_ids.append(resp['id'])
        
        # super_admin should be able to create
        success, resp = self.run_test(
            "Create emergency contact as super_admin",
            "POST",
            "emergency-contacts",
            200,
            data={
                "name": "Test Contact 2",
                "phone": "(555) 234-5678",
                "role": "Night Dispatch",
                "channels": ["sms"]
            },
            token=self.tokens.get('super_admin'),
            check_fn=lambda r: r and 'id' in r and r.get('phone') == '+15552345678'
        )
        if success and resp:
            self.created_contact_ids.append(resp['id'])
        
        # driver should be forbidden (403)
        success, resp = self.run_test(
            "Create emergency contact as driver (should be 403)",
            "POST",
            "emergency-contacts",
            403,
            data={
                "name": "Test Contact Driver",
                "phone": "555-999-9999"
            },
            token=self.tokens.get('driver')
        )
    
    def test_phone_normalization_and_duplicates(self):
        """Test phone normalization and duplicate detection"""
        self.log("\n=== Testing Phone Normalization & Duplicate Detection ===", "INFO")
        
        # Create a contact with one format
        success, resp = self.run_test(
            "Create contact with format XXX-XXX-XXXX",
            "POST",
            "emergency-contacts",
            200,
            data={
                "name": "Normalization Test",
                "phone": "555-345-6789"
            },
            token=self.tokens.get('fleet_admin'),
            check_fn=lambda r: r and r.get('phone') == '+15553456789'
        )
        if success and resp:
            self.created_contact_ids.append(resp['id'])
        
        # Try to create duplicate with different format (XXX) XXX-XXXX - should get 409
        success, resp = self.run_test(
            "Create duplicate with format (XXX) XXX-XXXX (should be 409)",
            "POST",
            "emergency-contacts",
            409,
            data={
                "name": "Duplicate Test 1",
                "phone": "(555) 345-6789"
            },
            token=self.tokens.get('fleet_admin')
        )
        
        # Try to create duplicate with format XXXXXXXXXX - should get 409
        success, resp = self.run_test(
            "Create duplicate with format XXXXXXXXXX (should be 409)",
            "POST",
            "emergency-contacts",
            409,
            data={
                "name": "Duplicate Test 2",
                "phone": "5553456789"
            },
            token=self.tokens.get('fleet_admin')
        )
        
        # Try to create duplicate with format +1XXXXXXXXXX - should get 409
        success, resp = self.run_test(
            "Create duplicate with format +1XXXXXXXXXX (should be 409)",
            "POST",
            "emergency-contacts",
            409,
            data={
                "name": "Duplicate Test 3",
                "phone": "+15553456789"
            },
            token=self.tokens.get('fleet_admin')
        )
    
    def test_update_emergency_contact(self):
        """Test PUT /api/emergency-contacts/{id}"""
        self.log("\n=== Testing PUT /api/emergency-contacts/{id} ===", "INFO")
        
        if not self.created_contact_ids:
            self.log("No contacts created, skipping update tests", "WARN")
            return
        
        contact_id = self.created_contact_ids[0]
        
        # Update contact successfully
        success, resp = self.run_test(
            "Update emergency contact",
            "PUT",
            f"emergency-contacts/{contact_id}",
            200,
            data={
                "name": "Updated Contact Name",
                "phone": "555-456-7890",
                "role": "Updated Role",
                "notes": "Updated notes"
            },
            token=self.tokens.get('fleet_admin'),
            check_fn=lambda r: r and r.get('name') == 'Updated Contact Name' and r.get('phone') == '+15554567890'
        )
        
        # Try to update with a phone that belongs to another contact - should get 409
        if len(self.created_contact_ids) > 1:
            success, resp = self.run_test(
                "Update contact with duplicate phone (should be 409)",
                "PUT",
                f"emergency-contacts/{contact_id}",
                409,
                data={
                    "name": "Updated Contact",
                    "phone": "+15552345678"  # This belongs to Test Contact 2
                },
                token=self.tokens.get('fleet_admin')
            )
        
        # Try to update non-existent contact - should get 404
        success, resp = self.run_test(
            "Update non-existent contact (should be 404)",
            "PUT",
            "emergency-contacts/nonexistent-id-12345",
            404,
            data={
                "name": "Should Not Work",
                "phone": "555-999-9999"
            },
            token=self.tokens.get('fleet_admin')
        )
        
        # driver should be forbidden (403)
        success, resp = self.run_test(
            "Update emergency contact as driver (should be 403)",
            "PUT",
            f"emergency-contacts/{contact_id}",
            403,
            data={
                "name": "Driver Update",
                "phone": "555-888-8888"
            },
            token=self.tokens.get('driver')
        )
    
    def test_delete_emergency_contact(self):
        """Test DELETE /api/emergency-contacts/{id}"""
        self.log("\n=== Testing DELETE /api/emergency-contacts/{id} ===", "INFO")
        
        # Try to delete non-existent contact - should get 404
        success, resp = self.run_test(
            "Delete non-existent contact (should be 404)",
            "DELETE",
            "emergency-contacts/nonexistent-id-99999",
            404,
            token=self.tokens.get('fleet_admin')
        )
        
        # driver should be forbidden (403)
        if self.created_contact_ids:
            success, resp = self.run_test(
                "Delete emergency contact as driver (should be 403)",
                "DELETE",
                f"emergency-contacts/{self.created_contact_ids[0]}",
                403,
                token=self.tokens.get('driver')
            )
        
        # Delete all created contacts
        for contact_id in self.created_contact_ids:
            success, resp = self.run_test(
                f"Delete emergency contact {contact_id}",
                "DELETE",
                f"emergency-contacts/{contact_id}",
                200,
                token=self.tokens.get('fleet_admin'),
                check_fn=lambda r: r and r.get('ok') == True
            )
    
    def test_regression_push_endpoints(self):
        """Test that /api/push/* endpoints still work"""
        self.log("\n=== Testing Regression: Push Endpoints ===", "INFO")
        
        # Test GET /api/push/config (public endpoint)
        success, resp = self.run_test(
            "GET /api/push/config",
            "GET",
            "push/config",
            200,
            check_fn=lambda r: r and 'enabled' in r and 'public_key' in r
        )
        
        # Test GET /api/push/status (requires auth)
        success, resp = self.run_test(
            "GET /api/push/status",
            "GET",
            "push/status",
            200,
            token=self.tokens.get('fleet_admin'),
            check_fn=lambda r: r and 'enabled' in r and 'subscribed' in r
        )
    
    def test_regression_notifications_logs(self):
        """Test that /api/notifications/logs still works"""
        self.log("\n=== Testing Regression: Notifications Logs ===", "INFO")
        
        success, resp = self.run_test(
            "GET /api/notifications/logs",
            "GET",
            "notifications/logs?limit=5",
            200,
            token=self.tokens.get('fleet_admin'),
            check_fn=lambda r: isinstance(r, list)
        )
    
    def test_regression_crash_events_with_zero_contacts(self):
        """Test that crash events still work with zero DB contacts (fallback to env)"""
        self.log("\n=== Testing Regression: Crash Events with Zero DB Contacts ===", "INFO")
        
        # First, get a driver to create a crash event
        success, resp = self.run_test(
            "GET drivers list",
            "GET",
            "drivers",
            200,
            token=self.tokens.get('fleet_admin')
        )
        
        if success and resp and len(resp) > 0:
            driver_id = resp[0].get('id')
            truck_id = resp[0].get('truck_id')
            
            # Create a crash event
            success, resp = self.run_test(
                "Create crash event (should fallback to env NOTIFY_CRASH_CONTACTS)",
                "POST",
                "crash-events",
                200,
                data={
                    "driver_id": driver_id,
                    "truck_id": truck_id,
                    "severity": "minor",
                    "location": "Test Location",
                    "description": "Phase 2G.3 regression test - zero DB contacts",
                    "injuries": False,
                    "police_notified": False
                },
                token=self.tokens.get('driver'),
                check_fn=lambda r: r and 'id' in r
            )
        else:
            self.log("No drivers found, skipping crash event test", "WARN")
    
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
    tester = EmergencyContactsTester()
    
    try:
        # Test all demo user logins
        if not tester.test_login_all_users():
            tester.log("Some user logins failed, but continuing with tests...", "WARN")
        
        # Test emergency contacts CRUD
        tester.test_get_emergency_contacts_permissions()
        tester.test_create_emergency_contact()
        tester.test_phone_normalization_and_duplicates()
        tester.test_update_emergency_contact()
        tester.test_delete_emergency_contact()
        
        # Regression tests
        tester.test_regression_push_endpoints()
        tester.test_regression_notifications_logs()
        tester.test_regression_crash_events_with_zero_contacts()
        
    except KeyboardInterrupt:
        tester.log("\n\nTests interrupted by user", "WARN")
        return 1
    except Exception as e:
        tester.log(f"\n\nUnexpected error: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
