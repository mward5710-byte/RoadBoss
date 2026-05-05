#!/usr/bin/env python3
"""
RoadBoss Wreckerlogix Phase 8a/8b — Square OAuth + File Management Integration Tests

Test Coverage:
Phase 8a (Square OAuth Integration):
- GET /api/wrecker/integrations/square/status — returns {configured: false, connected: false} when SQUARE_OAUTH_APPLICATION_ID is empty
- GET /api/wrecker/integrations/square/connect — returns 503 when env vars not set
- GET /api/wrecker/integrations/square/webpayments-config — returns 404 when no tenant connected
- POST /api/wrecker/integrations/square/disconnect — gracefully succeeds when no connection exists
- POST /api/wrecker/integrations/square/location — returns 404 when no Square connection exists
- Auth checks: all endpoints reject driver role (wrecker_operator) with 403, accept fleet_admin

Phase 8b (File Management):
- GET /api/wrecker/jobs/{job_id}/files — returns {files: [], count: 0} for fresh job
- POST /api/wrecker/jobs/{job_id}/files — upload small base64 PDF and verify metadata
- GET /api/wrecker/jobs/{job_id}/files — after upload, verify count=1 and data_url stripped
- GET /api/wrecker/jobs/{job_id}/files/{file_id} — get individual file WITH data_url
- POST /api/wrecker/jobs/{job_id}/files — reject oversized file (>15 MB) with 413
- DELETE /api/wrecker/jobs/{job_id}/files/{file_id} — verify deletion
- Auth: wrecker_operator should only access their assigned jobs
"""

import requests
import sys
import time
import base64
from datetime import datetime
from typing import Dict, Any, Optional

BASE_URL = "https://build-forge-49.preview.emergentagent.com/api"
SHARED_PASSWORD = "HighwayPilot2026!"
WRECKER_PASSWORD = "Demo!Wrecker2026"

# Tiny valid PDF (base64 encoded)
TINY_PDF_BASE64 = "JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nDPQM1Qo5ypUMABCM0MjBQUALscCCQplbmRzdHJlYW0KZW5kb2JqCgozIDAgb2JqCjI4CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCA1IDAgUi9SZXNvdXJjZXM8PC9Qcm9jU2V0Wy9QREYvVGV4dF0vRm9udDw8L0YxIDYgMCBSPj4+Pi9Db250ZW50cyAyIDAgUj4+CmVuZG9iagoKNSAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjYgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCgo3IDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyA1IDAgUj4+CmVuZG9iagoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNzQgMDAwMDAgbiAKMDAwMDAwMDE3OCAwMDAwMCBuIAowMDAwMDAwMTk3IDAwMDAwIG4gCjAwMDAwMDAzMzYgMDAwMDAgbiAKMDAwMDAwMDM5NSAwMDAwMCBuIAowMDAwMDAwNDc0IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA4L1Jvb3QgNyAwIFI+PgpzdGFydHhyZWYKNTIzCiUlRU9G"

class Phase8Tester:
    def __init__(self):
        self.token: Optional[str] = None
        self.driver_token: Optional[str] = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.admin_user: Optional[Dict[str, Any]] = None
        self.driver_user: Optional[Dict[str, Any]] = None
        self.test_job_id: Optional[str] = None
        
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
                 check_fn: Optional[callable] = None, use_auth: bool = True,
                 use_driver_auth: bool = False) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        
        if use_driver_auth and self.driver_token:
            req_headers['Authorization'] = f'Bearer {self.driver_token}'
        elif use_auth and self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'
            
        if headers:
            req_headers.update(headers)
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=15)
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
        """Setup: Login as fleet_admin and driver"""
        self.log("=== SETUP: Login ===", "INFO")
        
        # Login as fleet_admin
        self.log("Logging in as fleet_admin...", "INFO")
        success, resp = self.run_test(
            "Login as fleet_admin",
            "POST",
            "auth/login",
            200,
            data={
                "email": "fleet_admin@highwaypilot.io",
                "password": SHARED_PASSWORD
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r,
            use_auth=False
        )
        
        if not success or not resp:
            self.log("Fleet admin login failed - cannot continue", "FAIL")
            return False
        
        self.token = resp['access_token']
        self.admin_user = resp['user']
        self.log(f"Logged in as {self.admin_user.get('name')} (role: {self.admin_user.get('role')})", "PASS")
        
        # Login as driver (wrecker_operator)
        self.log("Logging in as wrecker driver...", "INFO")
        success, driver_resp = self.run_test(
            "Login as wrecker driver",
            "POST",
            "auth/login",
            200,
            data={
                "email": "wrecker@highwaypilot.io",
                "password": WRECKER_PASSWORD
            },
            check_fn=lambda r: 'access_token' in r and 'user' in r,
            use_auth=False
        )
        
        if success and driver_resp:
            self.driver_token = driver_resp['access_token']
            self.driver_user = driver_resp['user']
            self.log(f"Logged in as driver: {self.driver_user.get('name')} (role: {self.driver_user.get('role')})", "PASS")
        else:
            self.log("Driver login failed - some tests will be skipped", "WARN")
        
        # Create a test job for file testing
        self.log("Creating test tow job for file testing...", "INFO")
        success, job_resp = self.run_test(
            "Create test tow job",
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
                    "year": 2015,
                    "make": "Honda",
                    "model": "Civic",
                    "color": "Blue",
                    "plate": "TEST123"
                },
                "pickup": {
                    "lat": 32.7767,
                    "lng": -96.7970,
                    "address": "123 Test St, Dallas, TX"
                },
                "notes": "Test job for Phase 8b file testing"
            }
        )
        
        if success and job_resp:
            self.test_job_id = job_resp.get('id')
            self.log(f"Created test job: {self.test_job_id}", "PASS")
        else:
            self.log("Failed to create test job - file tests will fail", "WARN")
        
        return True
    
    # ============================================================
    # Phase 8a: Square OAuth Integration Tests
    # ============================================================
    
    def test_square_status_not_configured(self):
        """Test GET /api/wrecker/integrations/square/status returns {configured: false} when env vars not set"""
        self.log("\n=== TEST: Square Status (Not Configured) ===", "INFO")
        
        def check_status(resp):
            if 'configured' not in resp:
                self.log("Missing 'configured' field", "FAIL")
                return False
            
            if 'connected' not in resp:
                self.log("Missing 'connected' field", "FAIL")
                return False
            
            # Should be not configured (Mike hasn't set SQUARE_OAUTH_APPLICATION_ID yet)
            if resp['configured'] != False:
                self.log(f"Expected configured=false, got {resp['configured']}", "FAIL")
                return False
            
            if resp['connected'] != False:
                self.log(f"Expected connected=false, got {resp['connected']}", "FAIL")
                return False
            
            self.log(f"✓ Status: configured={resp['configured']}, connected={resp['connected']}", "INFO")
            return True
        
        self.run_test(
            "GET /api/wrecker/integrations/square/status (fleet_admin)",
            "GET",
            "wrecker/integrations/square/status",
            200,
            check_fn=check_status
        )
    
    def test_square_status_auth_driver_rejected(self):
        """Test GET /api/wrecker/integrations/square/status rejects driver role with 403"""
        self.log("\n=== TEST: Square Status Auth (Driver Rejected) ===", "INFO")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            return
        
        self.run_test(
            "GET /api/wrecker/integrations/square/status (driver - should fail)",
            "GET",
            "wrecker/integrations/square/status",
            403,
            use_auth=False,
            use_driver_auth=True
        )
    
    def test_square_connect_not_configured(self):
        """Test GET /api/wrecker/integrations/square/connect returns 503 when env vars not set"""
        self.log("\n=== TEST: Square Connect (Not Configured) ===", "INFO")
        
        def check_error(resp):
            if 'detail' not in resp:
                self.log("Missing 'detail' field in error response", "FAIL")
                return False
            
            detail = resp['detail']
            if 'not configured' not in detail.lower():
                self.log(f"Expected 'not configured' in error message, got: {detail}", "FAIL")
                return False
            
            self.log(f"✓ Error message: {detail}", "INFO")
            return True
        
        self.run_test(
            "GET /api/wrecker/integrations/square/connect (not configured - should fail)",
            "GET",
            "wrecker/integrations/square/connect",
            503,
            check_fn=check_error
        )
    
    def test_square_connect_auth_driver_rejected(self):
        """Test GET /api/wrecker/integrations/square/connect rejects driver role with 403"""
        self.log("\n=== TEST: Square Connect Auth (Driver Rejected) ===", "INFO")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            return
        
        self.run_test(
            "GET /api/wrecker/integrations/square/connect (driver - should fail)",
            "GET",
            "wrecker/integrations/square/connect",
            403,
            use_auth=False,
            use_driver_auth=True
        )
    
    def test_square_webpayments_config_not_connected(self):
        """Test GET /api/wrecker/integrations/square/webpayments-config returns 404 when no tenant connected"""
        self.log("\n=== TEST: Square WebPayments Config (Not Connected) ===", "INFO")
        
        def check_error(resp):
            if 'detail' not in resp:
                self.log("Missing 'detail' field in error response", "FAIL")
                return False
            
            detail = resp['detail']
            if 'not connected' not in detail.lower():
                self.log(f"Expected 'not connected' in error message, got: {detail}", "FAIL")
                return False
            
            self.log(f"✓ Error message: {detail}", "INFO")
            return True
        
        self.run_test(
            "GET /api/wrecker/integrations/square/webpayments-config (not connected - should fail)",
            "GET",
            "wrecker/integrations/square/webpayments-config",
            404,
            check_fn=check_error
        )
    
    def test_square_webpayments_config_auth_driver_rejected(self):
        """Test GET /api/wrecker/integrations/square/webpayments-config rejects driver role with 403"""
        self.log("\n=== TEST: Square WebPayments Config Auth (Driver Rejected) ===", "INFO")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            return
        
        self.run_test(
            "GET /api/wrecker/integrations/square/webpayments-config (driver - should fail)",
            "GET",
            "wrecker/integrations/square/webpayments-config",
            403,
            use_auth=False,
            use_driver_auth=True
        )
    
    def test_square_disconnect_graceful_when_not_connected(self):
        """Test POST /api/wrecker/integrations/square/disconnect gracefully succeeds when no connection exists"""
        self.log("\n=== TEST: Square Disconnect (Graceful When Not Connected) ===", "INFO")
        
        def check_response(resp):
            if not resp.get('ok'):
                self.log("Expected ok=true", "FAIL")
                return False
            
            message = resp.get('message', '')
            if 'already disconnected' not in message.lower():
                self.log(f"Expected 'Already disconnected' message, got: {message}", "FAIL")
                return False
            
            self.log(f"✓ Message: {message}", "INFO")
            return True
        
        self.run_test(
            "POST /api/wrecker/integrations/square/disconnect (no connection)",
            "POST",
            "wrecker/integrations/square/disconnect",
            200,
            check_fn=check_response
        )
    
    def test_square_disconnect_auth_driver_rejected(self):
        """Test POST /api/wrecker/integrations/square/disconnect rejects driver role with 403"""
        self.log("\n=== TEST: Square Disconnect Auth (Driver Rejected) ===", "INFO")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            return
        
        self.run_test(
            "POST /api/wrecker/integrations/square/disconnect (driver - should fail)",
            "POST",
            "wrecker/integrations/square/disconnect",
            403,
            use_auth=False,
            use_driver_auth=True
        )
    
    def test_square_location_not_connected(self):
        """Test POST /api/wrecker/integrations/square/location returns 404 when no Square connection exists"""
        self.log("\n=== TEST: Square Location (Not Connected) ===", "INFO")
        
        def check_error(resp):
            if 'detail' not in resp:
                self.log("Missing 'detail' field in error response", "FAIL")
                return False
            
            detail = resp['detail']
            if 'not connected' not in detail.lower():
                self.log(f"Expected 'not connected' in error message, got: {detail}", "FAIL")
                return False
            
            self.log(f"✓ Error message: {detail}", "INFO")
            return True
        
        self.run_test(
            "POST /api/wrecker/integrations/square/location (not connected - should fail)",
            "POST",
            "wrecker/integrations/square/location",
            404,
            data={"location_id": "test_location_123"},
            check_fn=check_error
        )
    
    def test_square_location_auth_driver_rejected(self):
        """Test POST /api/wrecker/integrations/square/location rejects driver role with 403"""
        self.log("\n=== TEST: Square Location Auth (Driver Rejected) ===", "INFO")
        
        if not self.driver_token:
            self.log("No driver token available, skipping", "WARN")
            return
        
        self.run_test(
            "POST /api/wrecker/integrations/square/location (driver - should fail)",
            "POST",
            "wrecker/integrations/square/location",
            403,
            data={"location_id": "test_location_123"},
            use_auth=False,
            use_driver_auth=True
        )
    
    # ============================================================
    # Phase 8b: File Management Tests
    # ============================================================
    
    def test_files_list_empty_for_fresh_job(self):
        """Test GET /api/wrecker/jobs/{job_id}/files returns {files: [], count: 0} for fresh job"""
        self.log("\n=== TEST: List Files (Empty for Fresh Job) ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        def check_empty_list(resp):
            if 'files' not in resp:
                self.log("Missing 'files' field", "FAIL")
                return False
            
            if 'count' not in resp:
                self.log("Missing 'count' field", "FAIL")
                return False
            
            if resp['count'] != 0:
                self.log(f"Expected count=0, got {resp['count']}", "FAIL")
                return False
            
            if len(resp['files']) != 0:
                self.log(f"Expected empty files array, got {len(resp['files'])} files", "FAIL")
                return False
            
            self.log(f"✓ Files: {resp['files']}, Count: {resp['count']}", "INFO")
            return True
        
        self.run_test(
            f"GET /api/wrecker/jobs/{self.test_job_id}/files (empty)",
            "GET",
            f"wrecker/jobs/{self.test_job_id}/files",
            200,
            check_fn=check_empty_list
        )
    
    def test_files_upload_small_pdf(self):
        """Test POST /api/wrecker/jobs/{job_id}/files uploads small base64 PDF and returns metadata"""
        self.log("\n=== TEST: Upload Small PDF File ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        data_url = f"data:application/pdf;base64,{TINY_PDF_BASE64}"
        
        def check_upload(resp):
            required_fields = ['id', 'name', 'category', 'uploaded_at', 'uploaded_by']
            for field in required_fields:
                if field not in resp:
                    self.log(f"Missing required field: {field}", "FAIL")
                    return False
            
            # data_url should NOT be in the response (stripped for list)
            if 'data_url' in resp:
                self.log("data_url should be stripped from upload response", "FAIL")
                return False
            
            if resp['name'] != 'police_report.pdf':
                self.log(f"Expected name='police_report.pdf', got {resp['name']}", "FAIL")
                return False
            
            if resp['category'] != 'police_report':
                self.log(f"Expected category='police_report', got {resp['category']}", "FAIL")
                return False
            
            self.log(f"✓ File uploaded: id={resp['id']}, name={resp['name']}, category={resp['category']}", "INFO")
            
            # Store file_id for later tests
            self.uploaded_file_id = resp['id']
            return True
        
        success, resp = self.run_test(
            f"POST /api/wrecker/jobs/{self.test_job_id}/files (upload PDF)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/files",
            200,
            data={
                "data_url": data_url,
                "name": "police_report.pdf",
                "mime_type": "application/pdf",
                "category": "police_report",
                "note": "Test police report upload"
            },
            check_fn=check_upload
        )
        
        if success and resp:
            self.uploaded_file_id = resp.get('id')
    
    def test_files_list_after_upload(self):
        """Test GET /api/wrecker/jobs/{job_id}/files after upload shows count=1 and data_url stripped"""
        self.log("\n=== TEST: List Files After Upload ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        def check_list_after_upload(resp):
            if resp.get('count') != 1:
                self.log(f"Expected count=1, got {resp.get('count')}", "FAIL")
                return False
            
            if len(resp.get('files', [])) != 1:
                self.log(f"Expected 1 file in array, got {len(resp.get('files', []))}", "FAIL")
                return False
            
            file = resp['files'][0]
            
            # data_url should be stripped from list response
            if 'data_url' in file:
                self.log("data_url should be stripped from list response", "FAIL")
                return False
            
            # Should have metadata
            if 'id' not in file or 'name' not in file or 'category' not in file:
                self.log("Missing file metadata in list response", "FAIL")
                return False
            
            self.log(f"✓ Count: {resp['count']}, File: {file['name']} (data_url stripped)", "INFO")
            return True
        
        self.run_test(
            f"GET /api/wrecker/jobs/{self.test_job_id}/files (after upload)",
            "GET",
            f"wrecker/jobs/{self.test_job_id}/files",
            200,
            check_fn=check_list_after_upload
        )
    
    def test_files_get_individual_with_data_url(self):
        """Test GET /api/wrecker/jobs/{job_id}/files/{file_id} returns file WITH data_url"""
        self.log("\n=== TEST: Get Individual File (With data_url) ===", "INFO")
        
        if not self.test_job_id or not hasattr(self, 'uploaded_file_id'):
            self.log("No test job ID or uploaded file ID available, skipping", "WARN")
            return
        
        def check_individual_file(resp):
            # Should have data_url for individual file fetch
            if 'data_url' not in resp:
                self.log("data_url should be included in individual file response", "FAIL")
                return False
            
            if not resp['data_url'].startswith('data:'):
                self.log(f"Invalid data_url format: {resp['data_url'][:50]}", "FAIL")
                return False
            
            # Should have all metadata
            required_fields = ['id', 'name', 'category', 'uploaded_at', 'uploaded_by']
            for field in required_fields:
                if field not in resp:
                    self.log(f"Missing required field: {field}", "FAIL")
                    return False
            
            self.log(f"✓ File retrieved with data_url: {resp['name']} ({len(resp['data_url'])} chars)", "INFO")
            return True
        
        self.run_test(
            f"GET /api/wrecker/jobs/{self.test_job_id}/files/{self.uploaded_file_id}",
            "GET",
            f"wrecker/jobs/{self.test_job_id}/files/{self.uploaded_file_id}",
            200,
            check_fn=check_individual_file
        )
    
    def test_files_upload_oversized_rejected(self):
        """Test POST /api/wrecker/jobs/{job_id}/files rejects oversized file (>15 MB) with 413"""
        self.log("\n=== TEST: Upload Oversized File (Rejected) ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        # Create a 16 MB base64 blob (will be rejected)
        # 16 MB = 16 * 1024 * 1024 bytes = 16777216 bytes
        # Base64 encoding increases size by ~33%, so we need ~12.6 MB of raw data to get ~16 MB base64
        # For testing, we'll create a data URL that's approximately 16 MB
        oversized_data = "A" * (16 * 1024 * 1024)  # 16 MB of 'A's
        data_url = f"data:application/pdf;base64,{oversized_data}"
        
        def check_rejection(resp):
            if 'detail' not in resp:
                self.log("Missing 'detail' field in error response", "FAIL")
                return False
            
            detail = resp['detail']
            if 'too large' not in detail.lower():
                self.log(f"Expected 'too large' in error message, got: {detail}", "FAIL")
                return False
            
            self.log(f"✓ Error message: {detail}", "INFO")
            return True
        
        self.run_test(
            f"POST /api/wrecker/jobs/{self.test_job_id}/files (oversized - should fail)",
            "POST",
            f"wrecker/jobs/{self.test_job_id}/files",
            413,
            data={
                "data_url": data_url,
                "name": "oversized_file.pdf",
                "mime_type": "application/pdf",
                "category": "other"
            },
            check_fn=check_rejection
        )
    
    def test_files_delete(self):
        """Test DELETE /api/wrecker/jobs/{job_id}/files/{file_id} deletes file"""
        self.log("\n=== TEST: Delete File ===", "INFO")
        
        if not self.test_job_id or not hasattr(self, 'uploaded_file_id'):
            self.log("No test job ID or uploaded file ID available, skipping", "WARN")
            return
        
        def check_deletion(resp):
            if not resp.get('ok'):
                self.log("Expected ok=true", "FAIL")
                return False
            
            self.log("✓ File deleted successfully", "INFO")
            return True
        
        self.run_test(
            f"DELETE /api/wrecker/jobs/{self.test_job_id}/files/{self.uploaded_file_id}",
            "DELETE",
            f"wrecker/jobs/{self.test_job_id}/files/{self.uploaded_file_id}",
            200,
            check_fn=check_deletion
        )
    
    def test_files_list_after_deletion(self):
        """Test GET /api/wrecker/jobs/{job_id}/files after deletion shows count=0"""
        self.log("\n=== TEST: List Files After Deletion ===", "INFO")
        
        if not self.test_job_id:
            self.log("No test job ID available, skipping", "WARN")
            return
        
        def check_empty_after_deletion(resp):
            if resp.get('count') != 0:
                self.log(f"Expected count=0 after deletion, got {resp.get('count')}", "FAIL")
                return False
            
            if len(resp.get('files', [])) != 0:
                self.log(f"Expected empty files array after deletion, got {len(resp.get('files', []))}", "FAIL")
                return False
            
            self.log(f"✓ Files list empty after deletion: count={resp['count']}", "INFO")
            return True
        
        self.run_test(
            f"GET /api/wrecker/jobs/{self.test_job_id}/files (after deletion)",
            "GET",
            f"wrecker/jobs/{self.test_job_id}/files",
            200,
            check_fn=check_empty_after_deletion
        )
    
    def test_files_auth_driver_own_job_only(self):
        """Test that wrecker_operator can only access files on their assigned jobs"""
        self.log("\n=== TEST: File Auth (Driver Own Job Only) ===", "INFO")
        
        if not self.driver_token or not self.test_job_id:
            self.log("No driver token or test job ID available, skipping", "WARN")
            return
        
        # The test job was created by fleet_admin, not assigned to the driver
        # So driver should get 403 when trying to access it
        self.run_test(
            f"GET /api/wrecker/jobs/{self.test_job_id}/files (driver - unassigned job - should fail)",
            "GET",
            f"wrecker/jobs/{self.test_job_id}/files",
            403,
            use_auth=False,
            use_driver_auth=True
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
    tester = Phase8Tester()
    
    # Setup
    if not tester.setup():
        tester.log("Setup failed, cannot continue", "FAIL")
        return 1
    
    # Run Phase 8a tests (Square OAuth)
    tester.log("\n" + "="*60, "INFO")
    tester.log("PHASE 8a: SQUARE OAUTH INTEGRATION", "INFO")
    tester.log("="*60, "INFO")
    tester.test_square_status_not_configured()
    tester.test_square_status_auth_driver_rejected()
    tester.test_square_connect_not_configured()
    tester.test_square_connect_auth_driver_rejected()
    tester.test_square_webpayments_config_not_connected()
    tester.test_square_webpayments_config_auth_driver_rejected()
    tester.test_square_disconnect_graceful_when_not_connected()
    tester.test_square_disconnect_auth_driver_rejected()
    tester.test_square_location_not_connected()
    tester.test_square_location_auth_driver_rejected()
    
    # Run Phase 8b tests (File Management)
    tester.log("\n" + "="*60, "INFO")
    tester.log("PHASE 8b: FILE MANAGEMENT", "INFO")
    tester.log("="*60, "INFO")
    tester.test_files_list_empty_for_fresh_job()
    tester.test_files_upload_small_pdf()
    tester.test_files_list_after_upload()
    tester.test_files_get_individual_with_data_url()
    tester.test_files_upload_oversized_rejected()
    tester.test_files_delete()
    tester.test_files_list_after_deletion()
    tester.test_files_auth_driver_own_job_only()
    
    # Print summary
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
