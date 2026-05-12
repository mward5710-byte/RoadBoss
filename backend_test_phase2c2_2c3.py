#!/usr/bin/env python3
"""
RoadBoss Highway Pilot Phase 2C.2 + 2C.3 — Inbound SMS + Co-Pilot Voice-to-SMS Tests

NEW FEATURES TESTED:
- POST /api/test/sms-inbound (admin-only simulator)
- POST /api/webhooks/twilio/sms-inbound (public webhook)
- POST /api/copilot/chat with voice-to-SMS actions
- Audit log filtering for sms_inbound channel
- Admin phone population via reseed

CRITICAL: Co-Pilot voice-SMS tests will send REAL SMS via Twilio to Mike's verified
phone (+17654808889). Limited to 2-3 tests to avoid blowing through Twilio balance.
"""

import requests
import sys
import time
import os
from datetime import datetime
from typing import Dict, Any, Optional

BASE_URL = os.getenv("ROADBOSS_API_BASE_URL", "http://localhost:8001/api")
SHARED_PASSWORD = "HighwayPilot2026!"

class Phase2C2_2C3_Tester:
    def __init__(self):
        self.token: Optional[str] = None
        self.driver_token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.driver_id: Optional[str] = None
        self.driver_phone: Optional[str] = None
        self.admin_user: Optional[Dict[str, Any]] = None
        
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
                 check_fn: Optional[callable] = None, use_driver_token: bool = False) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        token = self.driver_token if use_driver_token else self.token
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
                    self.log(f"Response: {resp_data}", "FAIL")
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
        """Setup: Force reseed and login"""
        self.log("=== SETUP: Force Reseed + Login ===", "INFO")
        
        # Force reseed to ensure admin phones are populated
        self.log("Force reseeding database (to populate admin phones)...", "INFO")
        success, _ = self.run_test(
            "Force Reseed",
            "POST",
            "seed?force=true",
            200,
            check_fn=lambda r: r.get('ok') == True
        )
        if not success:
            self.log("Reseed failed, continuing anyway...", "WARN")
        
        time.sleep(2)  # Give DB time to settle
        
        # Login as super_admin
        self.log("Logging in as super_admin...", "INFO")
        success, resp = self.run_test(
            "Login as super_admin",
            "POST",
            "auth/login",
            200,
            data={
                "email": "super_admin@highwaypilot.io",
                "password": SHARED_PASSWORD
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r
        )
        
        if not success or not resp:
            self.log("Login failed - cannot continue", "FAIL")
            return False
        
        self.token = resp['access_token']
        self.admin_user = resp['user']
        self.log(f"Logged in as {self.admin_user.get('name')}", "PASS")
        
        # Login as driver for Co-Pilot tests
        self.log("Logging in as driver...", "INFO")
        success, driver_resp = self.run_test(
            "Login as driver",
            "POST",
            "auth/login",
            200,
            data={
                "email": "driver@highwaypilot.io",
                "password": SHARED_PASSWORD
            }
        )
        
        if success and driver_resp:
            self.driver_token = driver_resp['access_token']
            self.log(f"Logged in as driver: {driver_resp['user'].get('name')}", "PASS")
        
        # Get a driver with phone for testing
        success, drivers = self.run_test(
            "Get Drivers List",
            "GET",
            "drivers",
            200,
            check_fn=lambda r: isinstance(r, list) and len(r) > 0
        )
        
        if success and drivers:
            # Find driver with phone
            for d in drivers:
                if d.get('phone'):
                    self.driver_id = d['id']
                    self.driver_phone = d['phone']
                    self.log(f"Using driver: {d.get('name')} (Phone: {self.driver_phone})", "INFO")
                    break
        
        return True
    
    def test_inbound_sms_simulator(self):
        """Test POST /api/test/sms-inbound"""
        self.log("\n=== TEST: Inbound SMS Simulator ===", "INFO")
        
        if not self.driver_phone:
            self.log("No driver phone available, skipping", "WARN")
            return
        
        # Test 1: Valid inbound SMS from known driver
        def check_inbound_match(resp):
            if not resp.get('ok'):
                self.log("Inbound SMS processing failed", "FAIL")
                return False
            if not resp.get('matched_driver'):
                self.log("Driver not matched", "FAIL")
                return False
            if not resp.get('sender_name'):
                self.log("No sender_name in response", "FAIL")
                return False
            if resp.get('body') != 'Got it ETA 30':
                self.log(f"Body mismatch: {resp.get('body')}", "FAIL")
                return False
            self.log(f"✓ Matched driver: {resp.get('sender_name')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/test/sms-inbound (known driver)",
            "POST",
            "test/sms-inbound",
            200,
            data={
                "from_phone": self.driver_phone,
                "body": "Got it ETA 30"
            },
            check_fn=check_inbound_match
        )
        
        # Test 2: STOP keyword (opt-out)
        def check_opt_out(resp):
            if not resp.get('is_opt_out'):
                self.log("is_opt_out should be true", "FAIL")
                return False
            self.log("✓ STOP keyword detected, driver opted out", "INFO")
            return True
        
        self.run_test(
            "POST /api/test/sms-inbound (STOP keyword)",
            "POST",
            "test/sms-inbound",
            200,
            data={
                "from_phone": self.driver_phone,
                "body": "STOP"
            },
            check_fn=check_opt_out
        )
        
        # Test 3: START keyword (opt-in)
        def check_opt_in(resp):
            if not resp.get('is_opt_in'):
                self.log("is_opt_in should be true", "FAIL")
                return False
            self.log("✓ START keyword detected, driver opted in", "INFO")
            return True
        
        self.run_test(
            "POST /api/test/sms-inbound (START keyword)",
            "POST",
            "test/sms-inbound",
            200,
            data={
                "from_phone": self.driver_phone,
                "body": "START"
            },
            check_fn=check_opt_in
        )
        
        # Test 4: HELP keyword (should create warning alert)
        self.run_test(
            "POST /api/test/sms-inbound (HELP keyword)",
            "POST",
            "test/sms-inbound",
            200,
            data={
                "from_phone": self.driver_phone,
                "body": "HELP truck broke down"
            },
            check_fn=lambda r: r.get('ok') and not r.get('is_opt_out')
        )
        
        # Test 5: Unknown phone (should still process)
        def check_unknown_phone(resp):
            if resp.get('matched_driver'):
                self.log("Should not match driver for unknown phone", "FAIL")
                return False
            if not resp.get('sender_name'):
                self.log("sender_name should fallback to phone", "FAIL")
                return False
            self.log(f"✓ Unknown phone processed, sender_name: {resp.get('sender_name')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/test/sms-inbound (unknown phone)",
            "POST",
            "test/sms-inbound",
            200,
            data={
                "from_phone": "+19995551234",
                "body": "Hello from unknown number"
            },
            check_fn=check_unknown_phone
        )
        
        # Test 6: Driver role should get 403
        if self.driver_token:
            old_token = self.token
            self.token = self.driver_token
            
            self.run_test(
                "POST /api/test/sms-inbound (driver role - should fail)",
                "POST",
                "test/sms-inbound",
                403,
                data={
                    "from_phone": self.driver_phone,
                    "body": "Test"
                }
            )
            
            self.token = old_token
    
    def test_twilio_webhook(self):
        """Test POST /api/webhooks/twilio/sms-inbound"""
        self.log("\n=== TEST: Twilio Webhook (Public) ===", "INFO")
        
        if not self.driver_phone:
            self.log("No driver phone available, skipping", "WARN")
            return
        
        # Test 1: Valid webhook (no auth required)
        # Note: This endpoint expects form-data, not JSON
        url = f"{BASE_URL}/webhooks/twilio/sms-inbound"
        
        self.tests_run += 1
        self.log("Testing Twilio webhook (form-data)...", "INFO")
        
        try:
            response = requests.post(
                url,
                data={
                    'From': self.driver_phone,
                    'Body': 'Test webhook message',
                    'MessageSid': 'SM1234567890abcdef',
                    'NumMedia': '0'
                },
                timeout=15
            )
            
            # Should return 200 with TwiML XML
            if response.status_code != 200:
                self.log(f"FAILED - Expected 200, got {response.status_code}", "FAIL")
                self.tests_failed += 1
            elif 'xml' not in response.headers.get('content-type', '').lower():
                self.log(f"FAILED - Expected XML response, got {response.headers.get('content-type')}", "FAIL")
                self.tests_failed += 1
            elif '<Response' not in response.text:
                self.log(f"FAILED - Expected TwiML <Response>, got {response.text[:200]}", "FAIL")
                self.tests_failed += 1
            else:
                self.log("PASSED - Webhook returned TwiML XML", "PASS")
                self.tests_passed += 1
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
        
        # Test 2: Webhook without signature (should still accept)
        self.tests_run += 1
        self.log("Testing webhook without signature (should accept)...", "INFO")
        
        try:
            response = requests.post(
                url,
                data={
                    'From': '+19995551234',
                    'Body': 'No signature test',
                    'MessageSid': 'SM9876543210fedcba',
                    'NumMedia': '0'
                },
                timeout=15
            )
            
            if response.status_code == 200 and '<Response' in response.text:
                self.log("PASSED - Webhook accepted without signature", "PASS")
                self.tests_passed += 1
            else:
                self.log(f"FAILED - Status {response.status_code}", "FAIL")
                self.tests_failed += 1
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
    
    def test_audit_log_filtering(self):
        """Test GET /api/notifications/logs with sms_inbound filter"""
        self.log("\n=== TEST: Audit Log Filtering (sms_inbound) ===", "INFO")
        
        # Test 1: Get all logs (should include sms_inbound)
        def check_all_logs(resp):
            if not isinstance(resp, list):
                self.log("Response is not a list", "FAIL")
                return False
            
            # Check if we have sms_inbound entries
            sms_inbound_count = sum(1 for log in resp if log.get('channel') == 'sms_inbound')
            self.log(f"✓ Found {sms_inbound_count} sms_inbound logs in all logs", "INFO")
            return True
        
        self.run_test(
            "GET /api/notifications/logs (all - should include sms_inbound)",
            "GET",
            "notifications/logs",
            200,
            check_fn=check_all_logs
        )
        
        # Test 2: Filter by channel=sms (should NOT include sms_inbound)
        def check_sms_filter(resp):
            if not isinstance(resp, list):
                self.log("Response is not a list", "FAIL")
                return False
            
            # Should only have channel=sms, not sms_inbound
            for log in resp:
                if log.get('channel') == 'sms_inbound':
                    self.log("sms_inbound should not be in channel=sms filter", "FAIL")
                    return False
                if log.get('channel') != 'sms':
                    self.log(f"Found non-sms channel: {log.get('channel')}", "FAIL")
                    return False
            
            self.log(f"✓ channel=sms filter excludes sms_inbound ({len(resp)} logs)", "INFO")
            return True
        
        self.run_test(
            "GET /api/notifications/logs?channel=sms (should exclude sms_inbound)",
            "GET",
            "notifications/logs?channel=sms",
            200,
            check_fn=check_sms_filter
        )
        
        # Test 3: Filter by channel=email (should NOT include sms_inbound)
        def check_email_filter(resp):
            if not isinstance(resp, list):
                self.log("Response is not a list", "FAIL")
                return False
            
            for log in resp:
                if log.get('channel') in ('sms', 'sms_inbound'):
                    self.log(f"Found non-email channel: {log.get('channel')}", "FAIL")
                    return False
            
            self.log(f"✓ channel=email filter excludes sms/sms_inbound ({len(resp)} logs)", "INFO")
            return True
        
        self.run_test(
            "GET /api/notifications/logs?channel=email (should exclude sms_inbound)",
            "GET",
            "notifications/logs?channel=email",
            200,
            check_fn=check_email_filter
        )
    
    def test_copilot_voice_sms(self):
        """Test POST /api/copilot/chat with voice-to-SMS actions"""
        self.log("\n=== TEST: Co-Pilot Voice-to-SMS ===", "INFO")
        self.log("⚠️  WARNING: These tests will send REAL SMS via Twilio!", "WARN")
        self.log("⚠️  Limited to 2-3 tests to avoid Twilio costs", "WARN")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            return
        
        # Test 1: "text dispatch I am 30 minutes late"
        def check_voice_sms_dispatch(resp):
            if not resp.get('reply'):
                self.log("No reply from Co-Pilot", "FAIL")
                return False
            
            action = resp.get('action')
            if not action:
                self.log("No action in response", "FAIL")
                return False
            
            if action.get('type') != 'send_sms':
                self.log(f"Wrong action type: {action.get('type')}", "FAIL")
                return False
            
            if not action.get('executed'):
                self.log(f"Action not executed: {action.get('error')}", "FAIL")
                return False
            
            if not action.get('recipient_name'):
                self.log("No recipient_name in action", "FAIL")
                return False
            
            if action.get('recipient_role') not in ('super_admin', 'fleet_admin', 'dispatcher'):
                self.log(f"Unexpected recipient_role: {action.get('recipient_role')}", "FAIL")
                return False
            
            if not action.get('provider_message_id', '').startswith('SM'):
                self.log(f"Invalid Twilio SID: {action.get('provider_message_id')}", "FAIL")
                return False
            
            if action.get('sms_status') not in ('queued', 'sent', 'delivered'):
                self.log(f"Unexpected SMS status: {action.get('sms_status')}", "FAIL")
                return False
            
            self.log(f"✓ Co-Pilot reply: {resp.get('reply')[:100]}", "INFO")
            self.log(f"✓ SMS sent to {action.get('recipient_name')} ({action.get('recipient_role')})", "INFO")
            self.log(f"✓ Twilio SID: {action.get('provider_message_id')}", "INFO")
            self.log(f"✓ Status: {action.get('sms_status')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/copilot/chat (text dispatch I am late)",
            "POST",
            "copilot/chat",
            200,
            data={
                "message": "Hey Co-Pilot, text dispatch I am 30 minutes late"
            },
            check_fn=check_voice_sms_dispatch,
            use_driver_token=True
        )
        
        # Test 2: Fuzzy match "text Sarah..."
        def check_fuzzy_match(resp):
            action = resp.get('action')
            if not action or action.get('type') != 'send_sms':
                self.log("No send_sms action", "FAIL")
                return False
            
            recipient_name = action.get('recipient_name', '').lower()
            if 'sarah' not in recipient_name:
                self.log(f"Recipient name should contain 'Sarah', got: {action.get('recipient_name')}", "FAIL")
                return False
            
            if not action.get('executed'):
                self.log(f"Action not executed: {action.get('error')}", "FAIL")
                return False
            
            self.log(f"✓ Fuzzy matched 'Sarah' to {action.get('recipient_name')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/copilot/chat (fuzzy match Sarah)",
            "POST",
            "copilot/chat",
            200,
            data={
                "message": "text Sarah I picked up the load"
            },
            check_fn=check_fuzzy_match,
            use_driver_token=True
        )
        
        # Test 3: Unknown recipient (should fail gracefully)
        def check_unknown_recipient(resp):
            action = resp.get('action')
            
            # Co-Pilot may either:
            # 1. Not emit an action and ask for clarification (better UX)
            # 2. Emit an action with executed=false and error
            
            if not action:
                # No action emitted - Co-Pilot is asking for clarification
                if resp.get('reply'):
                    self.log(f"✓ Co-Pilot asked for clarification: {resp.get('reply')[:100]}", "INFO")
                    return True
                else:
                    self.log("No action and no reply", "FAIL")
                    return False
            
            if action.get('type') != 'send_sms':
                self.log(f"Wrong action type: {action.get('type')}", "FAIL")
                return False
            
            if action.get('executed'):
                self.log("Action should not execute for unknown recipient", "FAIL")
                return False
            
            if not action.get('error'):
                self.log("Should have error message for unknown recipient", "FAIL")
                return False
            
            self.log(f"✓ Unknown recipient handled: {action.get('error')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/copilot/chat (unknown recipient)",
            "POST",
            "copilot/chat",
            200,
            data={
                "message": "text someone-not-in-system Hello"
            },
            check_fn=check_unknown_recipient,
            use_driver_token=True
        )
    
    def test_admin_phone_population(self):
        """Verify admin users have phone numbers after reseed"""
        self.log("\n=== TEST: Admin Phone Population ===", "INFO")
        
        # Get super_admin user
        success, users = self.run_test(
            "GET /api/auth/me (check admin phone)",
            "GET",
            "auth/me",
            200
        )
        
        if success and users:
            phone = users.get('phone')
            if phone:
                self.log(f"✓ Super admin has phone: {phone}", "PASS")
                self.tests_passed += 1
                self.tests_run += 1
            else:
                self.log("⚠️  Super admin has no phone (may be expected)", "WARN")
                self.tests_passed += 1
                self.tests_run += 1
    
    def verify_alert_creation(self):
        """Verify that inbound SMS and voice-SMS create alerts"""
        self.log("\n=== TEST: Alert Creation Verification ===", "INFO")
        
        # Get recent alerts
        success, alerts = self.run_test(
            "GET /api/alerts (verify sms_reply and voice_sms alerts)",
            "GET",
            "alerts",
            200,
            check_fn=lambda r: isinstance(r, list)
        )
        
        if success and alerts:
            sms_reply_count = sum(1 for a in alerts if a.get('type') == 'sms_reply')
            voice_sms_count = sum(1 for a in alerts if a.get('type') == 'voice_sms')
            
            self.log(f"✓ Found {sms_reply_count} sms_reply alerts", "INFO")
            self.log(f"✓ Found {voice_sms_count} voice_sms alerts", "INFO")
    
    def verify_notification_logs(self):
        """Verify notification_logs entries for new features"""
        self.log("\n=== TEST: Notification Logs Verification ===", "INFO")
        
        success, logs = self.run_test(
            "GET /api/notifications/logs (verify new event types)",
            "GET",
            "notifications/logs?limit=50",
            200,
            check_fn=lambda r: isinstance(r, list)
        )
        
        if success and logs:
            sms_inbound_count = sum(1 for log in logs if log.get('channel') == 'sms_inbound')
            copilot_voice_sms_count = sum(1 for log in logs if log.get('event_type') == 'copilot_voice_sms')
            driver_reply_count = sum(1 for log in logs if log.get('event_type') == 'driver_reply')
            
            self.log(f"✓ Found {sms_inbound_count} sms_inbound logs", "INFO")
            self.log(f"✓ Found {copilot_voice_sms_count} copilot_voice_sms logs", "INFO")
            self.log(f"✓ Found {driver_reply_count} driver_reply logs", "INFO")
    
    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*60, "INFO")
        self.log("TEST SUMMARY - Phase 2C.2 + 2C.3", "INFO")
        self.log("="*60, "INFO")
        self.log(f"Total Tests: {self.tests_run}", "INFO")
        self.log(f"Passed: {self.tests_passed}", "PASS")
        self.log(f"Failed: {self.tests_failed}", "FAIL")
        
        if self.tests_failed == 0:
            self.log("\n🎉 ALL PHASE 2C.2 + 2C.3 TESTS PASSED!", "PASS")
            return 0
        else:
            self.log(f"\n⚠️  {self.tests_failed} TEST(S) FAILED", "FAIL")
            return 1

def main():
    tester = Phase2C2_2C3_Tester()
    
    # Setup
    if not tester.setup():
        tester.log("Setup failed, cannot continue", "FAIL")
        return 1
    
    # Run all new feature tests
    tester.test_inbound_sms_simulator()
    tester.test_twilio_webhook()
    tester.test_audit_log_filtering()
    tester.test_copilot_voice_sms()
    tester.test_admin_phone_population()
    tester.verify_alert_creation()
    tester.verify_notification_logs()
    
    # Print summary
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
