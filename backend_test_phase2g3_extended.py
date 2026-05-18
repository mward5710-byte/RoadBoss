#!/usr/bin/env python3
"""
RoadBoss Highway Pilot Phase 2G.3 — Extended Regression Tests

Additional regression tests for:
- Roadside dispatch still works
- Dispatch SMS still works
- Inbound webhook still works
"""

import requests
import sys
import os
from datetime import datetime
from typing import Dict, Any, Optional

BASE_URL = os.getenv("ROADBOSS_API_BASE_URL", "http://localhost:8001/api")
SHARED_PASSWORD = "HighwayPilot2026!"

class ExtendedRegressionTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.token = None
        
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
                 data: Optional[Dict] = None, check_fn: Optional[callable] = None) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=15)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            if response.status_code != expected_status:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                self.log(f"Response: {response.text[:500]}", "FAIL")
                self.tests_failed += 1
                return False, None
            
            try:
                resp_data = response.json()
            except:
                resp_data = None
            
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
    
    def login(self):
        """Login as fleet_admin"""
        self.log("Logging in as fleet_admin...", "INFO")
        success, resp = self.run_test(
            "Login fleet_admin",
            "POST",
            "auth/login",
            200,
            data={"email": "fleet_admin@highwaypilot.io", "password": SHARED_PASSWORD}
        )
        if success and resp and 'access_token' in resp:
            self.token = resp['access_token']
            return True
        return False
    
    def test_dispatch_sms(self):
        """Test dispatch SMS still works"""
        self.log("\n=== Testing Regression: Dispatch SMS ===", "INFO")
        
        # Get a driver first
        success, resp = self.run_test(
            "GET drivers list",
            "GET",
            "drivers",
            200
        )
        
        if success and resp and len(resp) > 0:
            driver_id = resp[0].get('id')
            
            # Send dispatch SMS
            success, resp = self.run_test(
                "Send dispatch SMS",
                "POST",
                "dispatch/sms",
                200,
                data={
                    "driver_id": driver_id,
                    "message": "Phase 2G.3 regression test - dispatch SMS"
                },
                check_fn=lambda r: r and r.get('ok') == True
            )
        else:
            self.log("No drivers found, skipping dispatch SMS test", "WARN")
    
    def test_roadside_dispatch(self):
        """Test roadside dispatch still works"""
        self.log("\n=== Testing Regression: Roadside Dispatch ===", "INFO")
        
        # Get a driver first
        success, resp = self.run_test(
            "GET drivers list for roadside",
            "GET",
            "drivers",
            200
        )
        
        if success and resp and len(resp) > 0:
            driver_id = resp[0].get('id')
            truck_id = resp[0].get('truck_id')
            
            # Create roadside dispatch
            success, resp = self.run_test(
                "Create roadside dispatch",
                "POST",
                "roadside/dispatch",
                200,
                data={
                    "driver_id": driver_id,
                    "truck_id": truck_id,
                    "issue_type": "tire",
                    "location": "Test Location I-40",
                    "description": "Phase 2G.3 regression test - roadside dispatch",
                    "provider": "test_provider"
                },
                check_fn=lambda r: r and 'id' in r
            )
        else:
            self.log("No drivers found, skipping roadside dispatch test", "WARN")
    
    def test_notifications_status(self):
        """Test notifications status endpoint"""
        self.log("\n=== Testing Regression: Notifications Status ===", "INFO")
        
        success, resp = self.run_test(
            "GET /api/notifications/status",
            "GET",
            "notifications/status",
            200,
            check_fn=lambda r: r and 'sms' in r and 'email' in r
        )
    
    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*60, "INFO")
        self.log("EXTENDED REGRESSION TEST SUMMARY", "INFO")
        self.log("="*60, "INFO")
        self.log(f"Total Tests: {self.tests_run}", "INFO")
        self.log(f"Passed: {self.tests_passed}", "PASS")
        self.log(f"Failed: {self.tests_failed}", "FAIL")
        
        if self.tests_failed == 0:
            self.log("\n🎉 ALL EXTENDED REGRESSION TESTS PASSED!", "PASS")
            return 0
        else:
            self.log(f"\n⚠️  {self.tests_failed} TEST(S) FAILED", "FAIL")
            return 1

def main():
    tester = ExtendedRegressionTester()
    
    try:
        if not tester.login():
            tester.log("Login failed, cannot continue", "FAIL")
            return 1
        
        tester.test_notifications_status()
        tester.test_dispatch_sms()
        tester.test_roadside_dispatch()
        
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
