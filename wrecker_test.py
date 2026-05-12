#!/usr/bin/env python3
"""
RoadBoss Wrecker Mode Phases 1-3 — Integration Tests

Test Coverage:
Phase 1 (Photos & Status):
- POST /api/wrecker/jobs/{id}/photo with base64 data_url + stage
- DELETE /api/wrecker/jobs/{id}/photo/{photo_id}
- POST /api/wrecker/jobs/{id}/status with new statuses 'towing' and 'dest_arrival'
- Legacy 'in_progress' status auto-normalizes to 'towing'

Phase 3 (Charges & Payments):
- POST /api/wrecker/jobs/{id}/charges adds line item with rate × qty
- DELETE /api/wrecker/jobs/{id}/charges/{charge_id}
- POST /api/wrecker/jobs/{id}/payments records payment, balance_due decreases
- DELETE /api/wrecker/jobs/{id}/payments/{payment_id}
- GET /api/wrecker/rate-sheet returns default rate sheet
- PUT /api/wrecker/rate-sheet (dispatcher+) updates rate sheet

Phase 2 (Waiver & Damage Form):
- GET /api/wrecker/waiver/template returns Martin Wrecker default waiver
- POST /api/wrecker/jobs/{id}/waiver/accept stores waiver with signature
- POST /api/wrecker/jobs/{id}/damage-form upserts damage form
- GET /api/wrecker/jobs/{id}/damage-form returns saved form

Receipts (SendGrid/Twilio):
- POST /api/wrecker/jobs/{id}/receipt with channel='email'
- POST /api/wrecker/jobs/{id}/receipt with channel='sms'

Authorization:
- Driver role can ONLY add photos/charges/payments to assigned jobs (403 on others)
- Dispatcher role can manage all jobs

Regression:
- GET /api/wrecker/jobs, /api/wrecker/overview, /api/wrecker/drivers, /api/wrecker/impounds
"""

import requests
import sys
import time
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional

BASE_URL = os.getenv("ROADBOSS_API_BASE_URL", "http://localhost:8001/api")

class WreckerModeTester:
    def __init__(self):
        self.admin_token: Optional[str] = None
        self.driver_token: Optional[str] = None
        self.dispatcher_token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.admin_user: Optional[Dict[str, Any]] = None
        self.driver_user: Optional[Dict[str, Any]] = None
        self.dispatcher_user: Optional[Dict[str, Any]] = None
        self.test_job_id: Optional[str] = None
        self.driver_job_id: Optional[str] = None
        
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
            elif method == 'DELETE':
                response = requests.delete(url, headers=req_headers, timeout=15)
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
                    self.log(f"Response: {json.dumps(resp_data, indent=2)[:500]}", "FAIL")
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
        """Setup: Login as admin, driver, and dispatcher"""
        self.log("=== SETUP: Login as Admin, Driver, and Dispatcher ===", "INFO")
        
        # Login as super_admin
        self.log("Logging in as super_admin...", "INFO")
        success, resp = self.run_test(
            "Login as super_admin",
            "POST",
            "auth/login",
            200,
            data={
                "email": "super_admin@highwaypilot.io",
                "password": "HighwayPilot2026!"
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r
        )
        
        if not success or not resp:
            self.log("Admin login failed - cannot continue", "FAIL")
            return False
        
        self.admin_token = resp['access_token']
        self.admin_user = resp['user']
        self.log(f"Logged in as admin: {self.admin_user.get('name')}", "PASS")
        
        # Login as wrecker operator (driver)
        self.log("Logging in as wrecker operator...", "INFO")
        success, driver_resp = self.run_test(
            "Login as wrecker operator",
            "POST",
            "auth/login",
            200,
            data={
                "email": "wrecker@highwaypilot.io",
                "password": "Demo!Wrecker2026"
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r
        )
        
        if success and driver_resp:
            self.driver_token = driver_resp['access_token']
            self.driver_user = driver_resp['user']
            self.log(f"Logged in as driver: {self.driver_user.get('name')}", "PASS")
        else:
            self.log("Driver login failed", "WARN")
        
        # Login as dispatcher
        self.log("Logging in as dispatcher...", "INFO")
        success, disp_resp = self.run_test(
            "Login as dispatcher",
            "POST",
            "auth/login",
            200,
            data={
                "email": "dispatcher@highwaypilot.io",
                "password": "Demo!Dispatch2026"
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r
        )
        
        if success and disp_resp:
            self.dispatcher_token = disp_resp['access_token']
            self.dispatcher_user = disp_resp['user']
            self.log(f"Logged in as dispatcher: {self.dispatcher_user.get('name')}", "PASS")
        else:
            self.log("Dispatcher login failed", "WARN")
        
        return True
    
    # ============================================================
    # Regression Tests
    # ============================================================
    
    def test_regression_existing_endpoints(self):
        """Test existing wrecker endpoints still work"""
        self.log("\n=== TEST: Regression - Existing Endpoints ===", "INFO")
        
        # Test GET /api/wrecker/jobs
        success, jobs = self.run_test(
            "GET /api/wrecker/jobs",
            "GET",
            "wrecker/jobs",
            200,
            check_fn=lambda r: isinstance(r, list),
            token=self.admin_token
        )
        
        if success and jobs and len(jobs) > 0:
            self.test_job_id = jobs[0]['id']
            self.log(f"Using test job ID: {self.test_job_id}", "INFO")
            
            # Find a job assigned to the driver
            for job in jobs:
                if job.get('assigned_driver_id') == self.driver_user.get('id'):
                    self.driver_job_id = job['id']
                    self.log(f"Found driver-assigned job: {self.driver_job_id}", "INFO")
                    break
        
        # Test GET /api/wrecker/overview
        self.run_test(
            "GET /api/wrecker/overview",
            "GET",
            "wrecker/overview",
            200,
            check_fn=lambda r: 'active_jobs' in r and 'today_completed' in r,
            token=self.admin_token
        )
        
        # Test GET /api/wrecker/drivers
        self.run_test(
            "GET /api/wrecker/drivers",
            "GET",
            "wrecker/drivers",
            200,
            check_fn=lambda r: isinstance(r, list) and len(r) > 0,
            token=self.admin_token
        )
        
        # Test GET /api/wrecker/impounds
        self.run_test(
            "GET /api/wrecker/impounds",
            "GET",
            "wrecker/impounds",
            200,
            check_fn=lambda r: isinstance(r, list),
            token=self.admin_token
        )
    
    # ============================================================
    # Phase 1: Photos & Status Tests
    # ============================================================
    
    def test_photo_upload(self):
        """Test POST /api/wrecker/jobs/{id}/photo"""
        self.log("\n=== TEST: Photo Upload ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test 1: Upload photo with stage
        base64_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        def check_photo_upload(resp):
            if not resp.get('ok'):
                self.log("Photo upload failed", "FAIL")
                return False
            if not resp.get('photo_id'):
                self.log("No photo_id returned", "FAIL")
                return False
            if resp.get('stage') != 'on_scene':
                self.log(f"Stage mismatch: expected 'on_scene', got '{resp.get('stage')}'", "FAIL")
                return False
            self.log(f"✓ Photo uploaded: {resp.get('photo_id')}, stage={resp.get('stage')}", "INFO")
            return True
        
        success, resp = self.run_test(
            "POST /api/wrecker/jobs/{id}/photo (on_scene)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/photo",
            200,
            data={
                "data_url": base64_photo,
                "stage": "on_scene",
                "caption": "Test photo - on scene"
            },
            check_fn=check_photo_upload,
            token=self.admin_token
        )
        
        if success and resp:
            self.photo_id = resp.get('photo_id')
        
        # Test 2: Upload photo with different stage
        self.run_test(
            "POST /api/wrecker/jobs/{id}/photo (towing)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/photo",
            200,
            data={
                "data_url": base64_photo,
                "stage": "towing",
                "caption": "Test photo - towing"
            },
            check_fn=lambda r: r.get('ok') and r.get('stage') == 'towing',
            token=self.admin_token
        )
        
        # Test 3: Invalid stage should fail
        self.run_test(
            "POST /api/wrecker/jobs/{id}/photo (invalid stage)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/photo",
            400,
            data={
                "data_url": base64_photo,
                "stage": "invalid_stage"
            },
            token=self.admin_token
        )
    
    def test_photo_delete(self):
        """Test DELETE /api/wrecker/jobs/{id}/photo/{photo_id}"""
        self.log("\n=== TEST: Photo Delete ===", "INFO")
        
        if not self.test_job_id or not hasattr(self, 'photo_id'):
            self.log("No test job or photo ID available, skipping", "WARN")
            return
        
        self.run_test(
            "DELETE /api/wrecker/jobs/{id}/photo/{photo_id}",
            "DELETE",
            f"wrecker/jobs/{self.test_job_id}/photo/{self.photo_id}",
            200,
            check_fn=lambda r: r.get('ok') == True,
            token=self.admin_token
        )
    
    def test_status_update_new_statuses(self):
        """Test POST /api/wrecker/jobs/{id}/status with new statuses"""
        self.log("\n=== TEST: Status Update (New Statuses) ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test 1: Update to 'towing' status
        def check_status_towing(resp):
            if resp.get('status') != 'towing':
                self.log(f"Status mismatch: expected 'towing', got '{resp.get('status')}'", "FAIL")
                return False
            self.log(f"✓ Status updated to 'towing'", "INFO")
            return True
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/status (towing)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/status",
            200,
            data={"status": "towing"},
            check_fn=check_status_towing,
            token=self.admin_token
        )
        
        # Test 2: Update to 'dest_arrival' status
        self.run_test(
            "POST /api/wrecker/jobs/{id}/status (dest_arrival)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/status",
            200,
            data={"status": "dest_arrival"},
            check_fn=lambda r: r.get('status') == 'dest_arrival',
            token=self.admin_token
        )
    
    def test_legacy_status_normalization(self):
        """Test legacy 'in_progress' status auto-normalizes to 'towing'"""
        self.log("\n=== TEST: Legacy Status Normalization ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test: Send 'in_progress' status, should be normalized to 'towing'
        def check_legacy_normalization(resp):
            if resp.get('status') != 'towing':
                self.log(f"Legacy normalization failed: expected 'towing', got '{resp.get('status')}'", "FAIL")
                return False
            self.log(f"✓ Legacy 'in_progress' normalized to 'towing'", "INFO")
            return True
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/status (in_progress → towing)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/status",
            200,
            data={"status": "in_progress"},
            check_fn=check_legacy_normalization,
            token=self.admin_token
        )
    
    # ============================================================
    # Phase 3: Charges & Payments Tests
    # ============================================================
    
    def test_charges_add(self):
        """Test POST /api/wrecker/jobs/{id}/charges"""
        self.log("\n=== TEST: Add Charge ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test: Add charge with rate × qty
        def check_charge_add(resp):
            if not resp.get('ok'):
                self.log("Charge add failed", "FAIL")
                return False
            
            charge = resp.get('charge')
            if not charge:
                self.log("No charge object returned", "FAIL")
                return False
            
            # Check subtotal calculation (rate × qty)
            expected_subtotal = 65.0 * 1.0
            if charge.get('subtotal') != expected_subtotal:
                self.log(f"Subtotal mismatch: expected {expected_subtotal}, got {charge.get('subtotal')}", "FAIL")
                return False
            
            totals = resp.get('totals')
            if not totals:
                self.log("No totals object returned", "FAIL")
                return False
            
            self.log(f"✓ Charge added: {charge.get('label')}, subtotal={charge.get('subtotal')}", "INFO")
            self.log(f"✓ Totals: subtotal={totals.get('subtotal')}, invoice_total={totals.get('invoice_total')}", "INFO")
            return True
        
        success, resp = self.run_test(
            "POST /api/wrecker/jobs/{id}/charges (Tow/Hook Fee)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/charges",
            200,
            data={
                "key": "tow_hook_fee",
                "label": "Tow / Hook Fee",
                "rate": 65.0,
                "qty": 1.0,
                "unit": "ea"
            },
            check_fn=check_charge_add,
            token=self.admin_token
        )
        
        if success and resp:
            self.charge_id = resp.get('charge', {}).get('id')
        
        # Test 2: Add another charge (mileage)
        self.run_test(
            "POST /api/wrecker/jobs/{id}/charges (Loaded Mileage)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/charges",
            200,
            data={
                "key": "loaded_mileage",
                "label": "Loaded / Hooked Mileage",
                "rate": 4.5,
                "qty": 10.0,
                "unit": "mi"
            },
            check_fn=lambda r: r.get('ok') and r.get('charge', {}).get('subtotal') == 45.0,
            token=self.admin_token
        )
    
    def test_charges_delete(self):
        """Test DELETE /api/wrecker/jobs/{id}/charges/{charge_id}"""
        self.log("\n=== TEST: Delete Charge ===", "INFO")
        
        if not self.test_job_id or not hasattr(self, 'charge_id'):
            self.log("No test job or charge ID available, skipping", "WARN")
            return
        
        def check_charge_delete(resp):
            if not resp.get('ok'):
                self.log("Charge delete failed", "FAIL")
                return False
            
            totals = resp.get('totals')
            if not totals:
                self.log("No totals object returned", "FAIL")
                return False
            
            self.log(f"✓ Charge deleted, totals recomputed: subtotal={totals.get('subtotal')}", "INFO")
            return True
        
        self.run_test(
            "DELETE /api/wrecker/jobs/{id}/charges/{charge_id}",
            "DELETE",
            f"wrecker/jobs/{self.test_job_id}/charges/{self.charge_id}",
            200,
            check_fn=check_charge_delete,
            token=self.admin_token
        )
    
    def test_payments_add(self):
        """Test POST /api/wrecker/jobs/{id}/payments"""
        self.log("\n=== TEST: Add Payment ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # First, add a charge to have something to pay
        self.run_test(
            "POST /api/wrecker/jobs/{id}/charges (setup for payment)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/charges",
            200,
            data={
                "key": "tow_hook_fee",
                "label": "Tow / Hook Fee",
                "rate": 100.0,
                "qty": 1.0,
                "unit": "ea"
            },
            token=self.admin_token
        )
        
        # Test: Add payment
        def check_payment_add(resp):
            if not resp.get('ok'):
                self.log("Payment add failed", "FAIL")
                return False
            
            payment = resp.get('payment')
            if not payment:
                self.log("No payment object returned", "FAIL")
                return False
            
            totals = resp.get('totals')
            if not totals:
                self.log("No totals object returned", "FAIL")
                return False
            
            # Check balance_due decreased
            if totals.get('balance_due') >= totals.get('invoice_total'):
                self.log(f"Balance due did not decrease: balance_due={totals.get('balance_due')}, invoice_total={totals.get('invoice_total')}", "FAIL")
                return False
            
            self.log(f"✓ Payment added: amount={payment.get('amount')}, method={payment.get('method')}", "INFO")
            self.log(f"✓ Totals: invoice_total={totals.get('invoice_total')}, amount_paid={totals.get('amount_paid')}, balance_due={totals.get('balance_due')}", "INFO")
            return True
        
        success, resp = self.run_test(
            "POST /api/wrecker/jobs/{id}/payments (cash)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/payments",
            200,
            data={
                "amount": 50.0,
                "method": "cash",
                "note": "Test payment"
            },
            check_fn=check_payment_add,
            token=self.admin_token
        )
        
        if success and resp:
            self.payment_id = resp.get('payment', {}).get('id')
    
    def test_payments_delete(self):
        """Test DELETE /api/wrecker/jobs/{id}/payments/{payment_id}"""
        self.log("\n=== TEST: Delete Payment ===", "INFO")
        
        if not self.test_job_id or not hasattr(self, 'payment_id'):
            self.log("No test job or payment ID available, skipping", "WARN")
            return
        
        def check_payment_delete(resp):
            if not resp.get('ok'):
                self.log("Payment delete failed", "FAIL")
                return False
            
            totals = resp.get('totals')
            if not totals:
                self.log("No totals object returned", "FAIL")
                return False
            
            self.log(f"✓ Payment deleted, totals recomputed: balance_due={totals.get('balance_due')}", "INFO")
            return True
        
        self.run_test(
            "DELETE /api/wrecker/jobs/{id}/payments/{payment_id}",
            "DELETE",
            f"wrecker/jobs/{self.test_job_id}/payments/{self.payment_id}",
            200,
            check_fn=check_payment_delete,
            token=self.admin_token
        )
    
    def test_rate_sheet_get(self):
        """Test GET /api/wrecker/rate-sheet"""
        self.log("\n=== TEST: Get Rate Sheet ===", "INFO")
        
        def check_rate_sheet(resp):
            if not resp.get('items'):
                self.log("No items in rate sheet", "FAIL")
                return False
            
            items = resp.get('items')
            if not isinstance(items, list):
                self.log("Items is not a list", "FAIL")
                return False
            
            # Check for default items
            expected_keys = ['tow_hook_fee', 'loaded_mileage', 'unloaded_mileage']
            found_keys = [item.get('key') for item in items]
            
            for key in expected_keys:
                if key not in found_keys:
                    self.log(f"Missing expected rate sheet item: {key}", "FAIL")
                    return False
            
            self.log(f"✓ Rate sheet has {len(items)} items", "INFO")
            return True
        
        self.run_test(
            "GET /api/wrecker/rate-sheet",
            "GET",
            "wrecker/rate-sheet",
            200,
            check_fn=check_rate_sheet,
            token=self.admin_token
        )
    
    def test_rate_sheet_update(self):
        """Test PUT /api/wrecker/rate-sheet (dispatcher+)"""
        self.log("\n=== TEST: Update Rate Sheet ===", "INFO")
        
        if not self.dispatcher_token:
            self.log("No dispatcher token available, skipping", "WARN")
            return
        
        # Test: Update rate sheet
        def check_rate_sheet_update(resp):
            if not resp.get('items'):
                self.log("No items in updated rate sheet", "FAIL")
                return False
            
            items = resp.get('items')
            # Check if our custom item is there
            custom_item = next((item for item in items if item.get('key') == 'custom_fee'), None)
            if not custom_item:
                self.log("Custom item not found in updated rate sheet", "FAIL")
                return False
            
            self.log(f"✓ Rate sheet updated with {len(items)} items", "INFO")
            return True
        
        self.run_test(
            "PUT /api/wrecker/rate-sheet (dispatcher)",
            "PUT",
            "wrecker/rate-sheet",
            200,
            data={
                "items": [
                    {"key": "tow_hook_fee", "label": "Tow / Hook Fee", "rate": 70.0, "unit": "ea"},
                    {"key": "loaded_mileage", "label": "Loaded Mileage", "rate": 5.0, "unit": "mi"},
                    {"key": "custom_fee", "label": "Custom Fee", "rate": 25.0, "unit": "ea"}
                ]
            },
            check_fn=check_rate_sheet_update,
            token=self.dispatcher_token
        )
    
    # ============================================================
    # Phase 2: Waiver & Damage Form Tests
    # ============================================================
    
    def test_waiver_template_get(self):
        """Test GET /api/wrecker/waiver/template"""
        self.log("\n=== TEST: Get Waiver Template ===", "INFO")
        
        def check_waiver_template(resp):
            if not resp.get('waiver_text'):
                self.log("No waiver_text in response", "FAIL")
                return False
            
            waiver_text = resp.get('waiver_text')
            
            # Check for Martin Wrecker default text
            if '{{COMPANY_NAME}}' not in waiver_text:
                self.log("Waiver text missing {{COMPANY_NAME}} placeholder", "FAIL")
                return False
            
            if 'Martin Wrecker' not in resp.get('company_name', ''):
                self.log("Company name not 'Martin Wrecker Service Inc'", "FAIL")
                return False
            
            self.log(f"✓ Waiver template retrieved: company={resp.get('company_name')}", "INFO")
            return True
        
        self.run_test(
            "GET /api/wrecker/waiver/template",
            "GET",
            "wrecker/waiver/template",
            200,
            check_fn=check_waiver_template,
            token=self.admin_token
        )
    
    def test_waiver_accept(self):
        """Test POST /api/wrecker/jobs/{id}/waiver/accept"""
        self.log("\n=== TEST: Accept Waiver ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test: Accept waiver with signature
        def check_waiver_accept(resp):
            if not resp.get('id'):
                self.log("No waiver ID returned", "FAIL")
                return False
            
            if not resp.get('waiver_text_snapshot'):
                self.log("No waiver_text_snapshot in response", "FAIL")
                return False
            
            # Check that {{COMPANY_NAME}} was replaced
            if '{{COMPANY_NAME}}' in resp.get('waiver_text_snapshot', ''):
                self.log("Waiver text still has {{COMPANY_NAME}} placeholder", "FAIL")
                return False
            
            self.log(f"✓ Waiver accepted: id={resp.get('id')}, customer={resp.get('customer_name')}", "INFO")
            return True
        
        base64_signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/waiver/accept",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/waiver/accept",
            200,
            data={
                "customer_name": "John Doe",
                "signature_data_url": base64_signature
            },
            check_fn=check_waiver_accept,
            token=self.admin_token
        )
    
    def test_damage_form_upsert(self):
        """Test POST /api/wrecker/jobs/{id}/damage-form"""
        self.log("\n=== TEST: Upsert Damage Form ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test: Create damage form
        def check_damage_form(resp):
            if not resp.get('id'):
                self.log("No damage form ID returned", "FAIL")
                return False
            
            if not resp.get('marks'):
                self.log("No marks in damage form", "FAIL")
                return False
            
            marks = resp.get('marks')
            if len(marks) != 2:
                self.log(f"Expected 2 marks, got {len(marks)}", "FAIL")
                return False
            
            self.log(f"✓ Damage form created: id={resp.get('id')}, marks={len(marks)}", "INFO")
            return True
        
        base64_signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/damage-form",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/damage-form",
            200,
            data={
                "marks": [
                    {"x": 0.5, "y": 0.3, "panel": "front_bumper", "severity": "minor", "note": "Small scratch"},
                    {"x": 0.7, "y": 0.6, "panel": "left_door", "severity": "moderate", "note": "Dent"}
                ],
                "customer_name": "John Doe",
                "signature_data_url": base64_signature,
                "notes": "Test damage form"
            },
            check_fn=check_damage_form,
            token=self.admin_token
        )
    
    def test_damage_form_get(self):
        """Test GET /api/wrecker/jobs/{id}/damage-form"""
        self.log("\n=== TEST: Get Damage Form ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        def check_damage_form_get(resp):
            if not resp:
                self.log("No damage form returned", "FAIL")
                return False
            
            if not resp.get('id'):
                self.log("No damage form ID", "FAIL")
                return False
            
            self.log(f"✓ Damage form retrieved: id={resp.get('id')}", "INFO")
            return True
        
        self.run_test(
            "GET /api/wrecker/jobs/{id}/damage-form",
            "GET",
            f"wrecker/jobs/{self.test_job_id}/damage-form",
            200,
            check_fn=check_damage_form_get,
            token=self.admin_token
        )
    
    # ============================================================
    # Receipts Tests (SendGrid/Twilio)
    # ============================================================
    
    def test_receipt_email(self):
        """Test POST /api/wrecker/jobs/{id}/receipt with channel='email'"""
        self.log("\n=== TEST: Send Receipt Email ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # First, ensure job has charges and customer email
        # Get job details
        success, job = self.run_test(
            "GET /api/wrecker/jobs/{id} (for receipt test)",
            "GET",
            f"wrecker/jobs/{self.test_job_id}",
            200,
            token=self.admin_token
        )
        
        if not success or not job:
            self.log("Failed to get job details", "WARN")
            return
        
        # Test: Send email receipt
        def check_receipt_email(resp):
            if not resp.get('ok'):
                self.log("Receipt send failed", "FAIL")
                return False
            
            sent = resp.get('sent', {})
            if not sent.get('email'):
                self.log("No email sent result", "FAIL")
                return False
            
            self.log(f"✓ Receipt email sent: {sent.get('email')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/receipt (email)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/receipt",
            200,
            data={
                "channel": "email",
                "to_email": "test@example.com",
                "hide_charges": False,
                "hide_photos": False,
                "include_payment_link": True,
                "message": "Test receipt email"
            },
            check_fn=check_receipt_email,
            token=self.admin_token
        )
    
    def test_receipt_sms(self):
        """Test POST /api/wrecker/jobs/{id}/receipt with channel='sms'"""
        self.log("\n=== TEST: Send Receipt SMS ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Test: Send SMS receipt
        def check_receipt_sms(resp):
            if not resp.get('ok'):
                self.log("Receipt send failed", "FAIL")
                return False
            
            sent = resp.get('sent', {})
            if not sent.get('sms'):
                self.log("No SMS sent result", "FAIL")
                return False
            
            self.log(f"✓ Receipt SMS sent: {sent.get('sms')}", "INFO")
            return True
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/receipt (sms)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/receipt",
            200,
            data={
                "channel": "sms",
                "to_phone": "+12145550101"
            },
            check_fn=check_receipt_sms,
            token=self.admin_token
        )
    
    # ============================================================
    # Authorization Tests
    # ============================================================
    
    def test_driver_authorization(self):
        """Test driver role can ONLY add photos/charges/payments to assigned jobs"""
        self.log("\n=== TEST: Driver Authorization ===", "INFO")
        
        if not self.driver_token or not self.driver_job_id:
            self.log("No driver token or assigned job available, skipping", "WARN")
            return
        
        # Test 1: Driver can add photo to their assigned job
        base64_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/photo (driver, assigned job)",
            "POST",
            f"wrecker/jobs/{self.driver_job_id}/photo",
            200,
            data={
                "data_url": base64_photo,
                "stage": "on_scene",
                "caption": "Driver test photo"
            },
            check_fn=lambda r: r.get('ok') == True,
            token=self.driver_token
        )
        
        # Test 2: Driver CANNOT add photo to non-assigned job (should get 403)
        if self.test_job_id != self.driver_job_id:
            self.run_test(
                "POST /api/wrecker/jobs/{id}/photo (driver, non-assigned job - should fail)",
                "POST",
                f"wrecker/jobs/{self.test_job_id}/photo",
                403,
                data={
                    "data_url": base64_photo,
                    "stage": "on_scene"
                },
                token=self.driver_token
            )
        
        # Test 3: Driver can add charge to their assigned job
        self.run_test(
            "POST /api/wrecker/jobs/{id}/charges (driver, assigned job)",
            "POST",
            f"wrecker/jobs/{self.driver_job_id}/charges",
            200,
            data={
                "key": "loaded_mileage",
                "label": "Loaded Mileage",
                "rate": 4.5,
                "qty": 5.0,
                "unit": "mi"
            },
            check_fn=lambda r: r.get('ok') == True,
            token=self.driver_token
        )
        
        # Test 4: Driver can add payment to their assigned job
        self.run_test(
            "POST /api/wrecker/jobs/{id}/payments (driver, assigned job)",
            "POST",
            f"wrecker/jobs/{self.driver_job_id}/payments",
            200,
            data={
                "amount": 25.0,
                "method": "cash"
            },
            check_fn=lambda r: r.get('ok') == True,
            token=self.driver_token
        )
    
    def test_dispatcher_authorization(self):
        """Test dispatcher role can manage all jobs"""
        self.log("\n=== TEST: Dispatcher Authorization ===", "INFO")
        
        if not self.dispatcher_token or not self.test_job_id:
            self.log("No dispatcher token or test job available, skipping", "WARN")
            return
        
        # Test: Dispatcher can add photo to any job
        base64_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        self.run_test(
            "POST /api/wrecker/jobs/{id}/photo (dispatcher, any job)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/photo",
            200,
            data={
                "data_url": base64_photo,
                "stage": "dest_arrival",
                "caption": "Dispatcher test photo"
            },
            check_fn=lambda r: r.get('ok') == True,
            token=self.dispatcher_token
        )
    
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
    tester = WreckerModeTester()
    
    # Setup
    if not tester.setup():
        tester.log("Setup failed, cannot continue", "FAIL")
        return 1
    
    # Run Regression Tests
    tester.log("\n" + "="*60, "INFO")
    tester.log("REGRESSION TESTS", "INFO")
    tester.log("="*60, "INFO")
    tester.test_regression_existing_endpoints()
    
    # Run Phase 1 Tests (Photos & Status)
    tester.log("\n" + "="*60, "INFO")
    tester.log("PHASE 1: PHOTOS & STATUS", "INFO")
    tester.log("="*60, "INFO")
    tester.test_photo_upload()
    tester.test_photo_delete()
    tester.test_status_update_new_statuses()
    tester.test_legacy_status_normalization()
    
    # Run Phase 3 Tests (Charges & Payments)
    tester.log("\n" + "="*60, "INFO")
    tester.log("PHASE 3: CHARGES & PAYMENTS", "INFO")
    tester.log("="*60, "INFO")
    tester.test_charges_add()
    tester.test_charges_delete()
    tester.test_payments_add()
    tester.test_payments_delete()
    tester.test_rate_sheet_get()
    tester.test_rate_sheet_update()
    
    # Run Phase 2 Tests (Waiver & Damage Form)
    tester.log("\n" + "="*60, "INFO")
    tester.log("PHASE 2: WAIVER & DAMAGE FORM", "INFO")
    tester.log("="*60, "INFO")
    tester.test_waiver_template_get()
    tester.test_waiver_accept()
    tester.test_damage_form_upsert()
    tester.test_damage_form_get()
    
    # Run Receipts Tests
    tester.log("\n" + "="*60, "INFO")
    tester.log("RECEIPTS (SENDGRID/TWILIO)", "INFO")
    tester.log("="*60, "INFO")
    tester.test_receipt_email()
    tester.test_receipt_sms()
    
    # Run Authorization Tests
    tester.log("\n" + "="*60, "INFO")
    tester.log("AUTHORIZATION TESTS", "INFO")
    tester.log("="*60, "INFO")
    tester.test_driver_authorization()
    tester.test_dispatcher_authorization()
    
    # Print summary
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
