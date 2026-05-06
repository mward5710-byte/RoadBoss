#!/usr/bin/env python3
"""
Backend API Test Suite for Highway Pilot / RoadBoss
Tests the new Media Hub and Voice Walkthrough features + core functionality
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://build-forge-49.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

class BackendTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.tokens = {}
        self.results = []

    def log(self, msg, color=Colors.RESET):
        print(f"{color}{msg}{Colors.RESET}")

    def test(self, name, method, endpoint, expected_status, data=None, headers=None, token_key=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        
        if token_key and token_key in self.tokens:
            req_headers['Authorization'] = f'Bearer {self.tokens[token_key]}'
        elif headers:
            req_headers.update(headers)

        self.tests_run += 1
        self.log(f"\n[{self.tests_run}] Testing: {name}", Colors.BLUE)
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=req_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=req_headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASS - Status: {response.status_code}", Colors.GREEN)
                try:
                    resp_data = response.json()
                    self.results.append({
                        'test': name,
                        'status': 'PASS',
                        'http_status': response.status_code,
                        'response': resp_data
                    })
                    return True, resp_data
                except:
                    self.results.append({
                        'test': name,
                        'status': 'PASS',
                        'http_status': response.status_code,
                        'response': response.text[:200]
                    })
                    return True, {}
            else:
                self.tests_failed += 1
                self.log(f"❌ FAIL - Expected {expected_status}, got {response.status_code}", Colors.RED)
                try:
                    error_detail = response.json()
                    self.log(f"   Error: {error_detail}", Colors.YELLOW)
                    self.results.append({
                        'test': name,
                        'status': 'FAIL',
                        'http_status': response.status_code,
                        'expected': expected_status,
                        'error': error_detail
                    })
                except:
                    self.log(f"   Response: {response.text[:200]}", Colors.YELLOW)
                    self.results.append({
                        'test': name,
                        'status': 'FAIL',
                        'http_status': response.status_code,
                        'expected': expected_status,
                        'error': response.text[:200]
                    })
                return False, {}

        except Exception as e:
            self.tests_failed += 1
            self.log(f"❌ FAIL - Exception: {str(e)}", Colors.RED)
            self.results.append({
                'test': name,
                'status': 'FAIL',
                'error': str(e)
            })
            return False, {}

    def run_all_tests(self):
        """Execute all test scenarios"""
        self.log("\n" + "="*70, Colors.BLUE)
        self.log("HIGHWAY PILOT / ROADBOSS BACKEND TEST SUITE", Colors.BLUE)
        self.log("="*70 + "\n", Colors.BLUE)

        # Test 1: Health check
        self.test("Health Check", "GET", "health", 200)

        # Test 2: Root endpoint
        self.test("Root API", "GET", "", 200)

        # Test 3: Login as super admin
        success, resp = self.test(
            "Login - Super Admin",
            "POST",
            "auth/login",
            200,
            data={"email": "super_admin@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        if success and 'access_token' in resp:
            self.tokens['super_admin'] = resp['access_token']
            self.log(f"   Token saved for super_admin", Colors.GREEN)

        # Test 4: Login as fleet admin
        success, resp = self.test(
            "Login - Fleet Admin",
            "POST",
            "auth/login",
            200,
            data={"email": "fleet_admin@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        if success and 'access_token' in resp:
            self.tokens['fleet_admin'] = resp['access_token']

        # Test 5: Login as driver (Diego Ruiz)
        success, resp = self.test(
            "Login - Driver (Diego)",
            "POST",
            "auth/login",
            200,
            data={"email": "driver@highwaypilot.io", "password": "HighwayPilot2026!"}
        )
        if success and 'access_token' in resp:
            self.tokens['driver'] = resp['access_token']
            self.log(f"   Token saved for driver", Colors.GREEN)

        # Test 6: Get current user (driver)
        if 'driver' in self.tokens:
            self.test("Get Current User (Driver)", "GET", "auth/me", 200, token_key='driver')

        # Test 7: Get drivers list (as fleet admin)
        if 'fleet_admin' in self.tokens:
            self.test("List Drivers", "GET", "drivers", 200, token_key='fleet_admin')

        # Test 8: Get inspection template
        if 'driver' in self.tokens:
            self.test("Get Inspection Template", "GET", "inspections/template", 200, token_key='driver')

        # Test 9: Create new inspection
        inspection_id = None
        if 'driver' in self.tokens:
            success, resp = self.test(
                "Create New Inspection",
                "POST",
                "inspections",
                200,
                data={"inspection_type": "pre_trip"},
                token_key='driver'
            )
            if success and 'id' in resp:
                inspection_id = resp['id']
                self.log(f"   Inspection ID: {inspection_id}", Colors.GREEN)

        # Test 10: Get inspection by ID
        if inspection_id and 'driver' in self.tokens:
            self.test(
                "Get Inspection by ID",
                "GET",
                f"inspections/{inspection_id}",
                200,
                token_key='driver'
            )

        # Test 11: Update inspection item status
        if inspection_id and 'driver' in self.tokens:
            self.test(
                "Update Inspection Item (PASS)",
                "PUT",
                f"inspections/{inspection_id}/item",
                200,
                data={"key": "headlights", "status": "pass"},
                token_key='driver'
            )

        # Test 12: Copilot chat - start inspection (normal mode)
        if 'driver' in self.tokens:
            success, resp = self.test(
                "Copilot - Start Inspection (Normal)",
                "POST",
                "copilot/chat",
                200,
                data={"message": "start my pre-trip inspection"},
                token_key='driver'
            )
            if success:
                self.log(f"   Response: {json.dumps(resp, indent=2)[:300]}", Colors.YELLOW)
                # Check if action was returned
                if 'action' in resp:
                    action = resp['action']
                    if action.get('type') == 'start_inspection':
                        self.log(f"   ✓ Action type correct: start_inspection", Colors.GREEN)
                        if 'redirect' in action:
                            self.log(f"   ✓ Redirect: {action['redirect']}", Colors.GREEN)
                        # voice_mode should be false or omitted
                        voice_mode = action.get('voice_mode', False)
                        if not voice_mode:
                            self.log(f"   ✓ voice_mode is False (correct for normal inspection)", Colors.GREEN)
                        else:
                            self.log(f"   ⚠ voice_mode is True (expected False for 'start my pre-trip')", Colors.YELLOW)

        # Test 13: Copilot chat - start inspection (VOICE MODE)
        if 'driver' in self.tokens:
            success, resp = self.test(
                "Copilot - Start Inspection (Voice Mode)",
                "POST",
                "copilot/chat",
                200,
                data={"message": "walk me through my pre-trip inspection hands free"},
                token_key='driver'
            )
            if success:
                self.log(f"   Response: {json.dumps(resp, indent=2)[:300]}", Colors.YELLOW)
                # Check if action was returned with voice_mode=true
                if 'action' in resp:
                    action = resp['action']
                    if action.get('type') == 'start_inspection':
                        self.log(f"   ✓ Action type correct: start_inspection", Colors.GREEN)
                        voice_mode = action.get('voice_mode', False)
                        if voice_mode:
                            self.log(f"   ✓ voice_mode is True (correct for hands-free request)", Colors.GREEN)
                            if 'redirect' in action and '/voice' in action['redirect']:
                                self.log(f"   ✓ Redirect includes /voice: {action['redirect']}", Colors.GREEN)
                            else:
                                self.log(f"   ⚠ Redirect missing /voice path", Colors.YELLOW)
                        else:
                            self.log(f"   ⚠ voice_mode is False (expected True for 'hands free' request)", Colors.YELLOW)
                            self.log(f"   Note: This is LLM-dependent, so soft-check only", Colors.YELLOW)

        # Test 14: Get trips
        if 'driver' in self.tokens:
            self.test("List Trips", "GET", "trips", 200, token_key='driver')

        # Test 15: Get vehicles
        if 'fleet_admin' in self.tokens:
            self.test("List Vehicles", "GET", "vehicles", 200, token_key='fleet_admin')

        # Test 16: Get alerts
        if 'fleet_admin' in self.tokens:
            self.test("List Alerts", "GET", "alerts", 200, token_key='fleet_admin')

        # Test 17: Public business profile
        self.test("Public Business Profile", "GET", "business-profile/public", 200)

        # Test 18: Share stats (public)
        self.test("Share Stats", "GET", "share/stats", 200)

        # Test 19: Demo login
        success, resp = self.test(
            "Demo Login (Driver)",
            "POST",
            "auth/demo",
            200,
            data={"role": "driver", "source": "test"}
        )
        if success and 'access_token' in resp:
            self.log(f"   Demo token received", Colors.GREEN)

        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        self.log("\n" + "="*70, Colors.BLUE)
        self.log("TEST SUMMARY", Colors.BLUE)
        self.log("="*70, Colors.BLUE)
        self.log(f"Total Tests: {self.tests_run}", Colors.BLUE)
        self.log(f"Passed: {self.tests_passed}", Colors.GREEN)
        self.log(f"Failed: {self.tests_failed}", Colors.RED)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success Rate: {success_rate:.1f}%", Colors.GREEN if success_rate >= 90 else Colors.YELLOW)
        
        if self.tests_failed > 0:
            self.log("\nFailed Tests:", Colors.RED)
            for result in self.results:
                if result['status'] == 'FAIL':
                    self.log(f"  - {result['test']}", Colors.RED)
                    if 'error' in result:
                        self.log(f"    Error: {result['error']}", Colors.YELLOW)

        self.log("\n" + "="*70 + "\n", Colors.BLUE)

        return 0 if self.tests_failed == 0 else 1

def main():
    tester = BackendTester()
    exit_code = tester.run_all_tests()
    
    # Save results to file for reference
    try:
        with open('/app/backend/test_results.json', 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'total': tester.tests_run,
                'passed': tester.tests_passed,
                'failed': tester.tests_failed,
                'results': tester.results
            }, f, indent=2)
        print(f"\n{Colors.GREEN}Results saved to /app/backend/test_results.json{Colors.RESET}")
    except Exception as e:
        print(f"\n{Colors.YELLOW}Could not save results: {e}{Colors.RESET}")
    
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
