import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db import migrate, transaction, utc_now
from server import Handler

TOKEN = "unit-test-token-not-a-credential"
SCORES = {
    "completeness": 81,
    "content_quality": 72,
    "keyword_and_role_relevance": 75,
    "career_trajectory": 70,
    "skills_depth": 80,
    "social_proof": 64,
    "network": 55,
    "activity": 72,
}


class DatabaseAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.db_path = os.path.join(cls.temp.name, "test.sqlite3")
        migrate(cls.db_path)
        os.environ["DB_SERVICE_TOKEN"] = TOKEN
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.httpd.database_path = cls.db_path
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()

    def request(self, method, path, payload=None, token=TOKEN, actor=None, role=None):
        headers = {}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        if actor is not None:
            headers["X-Actor-Id"] = actor
        if role is not None:
            headers["X-Actor-Role"] = role
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        req = Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=4) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except HTTPError as exc:
            raw = exc.read()
            return exc.code, json.loads(raw) if raw else None

    def create_user(self, sub):
        status, body = self.request("POST", "/internal/v1/users", {"user": {"linkedin_sub": sub, "name": sub}})
        self.assertEqual(status, 201)
        return body["user"]["id"]

    def promote(self, user_id):
        with transaction(self.db_path) as conn:
            conn.execute("UPDATE users SET role='ADMIN', updated_at=? WHERE id=?", (utc_now(), user_id))

    def test_service_token_required(self):
        status, body = self.request("GET", "/internal/v1/users", token="wrong")
        self.assertEqual(status, 401)
        self.assertEqual(body, {"error": "Invalid service credentials"})

    def test_create_and_lookup_user_and_duplicate_conflict(self):
        user_id = self.create_user("subject-one")
        status, body = self.request("GET", "/internal/v1/users/by-linkedin-sub/subject-one")
        self.assertEqual(status, 200)
        self.assertEqual(body["user"]["id"], user_id)
        status, _ = self.request("POST", "/internal/v1/users", {"user": {"linkedin_sub": "subject-one"}})
        self.assertEqual(status, 409)

    def test_actor_role_is_verified_against_database(self):
        user_id = self.create_user("subject-role")
        status, _ = self.request("GET", f"/internal/v1/users/{user_id}", actor=user_id, role="ADMIN")
        self.assertEqual(status, 401)
        status, _ = self.request("GET", f"/internal/v1/users/{user_id}")
        self.assertEqual(status, 401)

    def test_self_access_and_admin_role_change_protection(self):
        user_id = self.create_user("subject-self")
        status, _ = self.request("PATCH", f"/internal/v1/users/{user_id}", {"role": "ADMIN"}, actor=user_id, role="USER")
        self.assertEqual(status, 403)
        other_id = self.create_user("subject-other")
        self.promote(user_id)
        status, body = self.request("PATCH", f"/internal/v1/users/{other_id}", {"role": "ADMIN"}, actor=user_id, role="ADMIN")
        self.assertEqual(status, 200)
        self.assertEqual(body["user"]["role"], "ADMIN")
        status, _ = self.request("PATCH", f"/internal/v1/users/{user_id}", {"role": "USER"}, actor=user_id, role="ADMIN")
        self.assertEqual(status, 403)

    def test_analysis_owner_scope_validation_and_cascade_delete(self):
        owner = self.create_user("subject-owner")
        other = self.create_user("subject-other-analysis")
        payload = {"analysis": {"analysis_result": "Useful feedback", **SCORES}}
        status, body = self.request("POST", "/internal/v1/analyses", payload, actor=owner, role="USER")
        self.assertEqual(status, 201)
        analysis_id = body["analysis"]["id"]
        self.assertEqual(body["analysis"]["user_id"], owner)
        status, _ = self.request("GET", f"/internal/v1/analyses/{analysis_id}", actor=other, role="USER")
        self.assertEqual(status, 403)
        bad = {"analysis": {"analysis_result": "x", **{**SCORES, "activity": 101}}}
        status, _ = self.request("POST", "/internal/v1/analyses", bad, actor=owner, role="USER")
        self.assertEqual(status, 400)
        status, _ = self.request("DELETE", f"/internal/v1/users/{owner}", actor=other, role="USER")
        self.assertEqual(status, 403)
        admin = self.create_user("subject-admin-delete")
        self.promote(admin)
        status, _ = self.request("DELETE", f"/internal/v1/users/{owner}", actor=admin, role="ADMIN")
        self.assertEqual(status, 204)
        status, _ = self.request("GET", f"/internal/v1/analyses/{analysis_id}", actor=admin, role="ADMIN")
        self.assertEqual(status, 404)

    def test_patch_does_not_allow_owner_or_identity_transfer(self):
        user_id = self.create_user("subject-patch-analysis")
        status, body = self.request("POST", "/internal/v1/analyses", {"analysis": {"analysis_result": "Initial", **SCORES}}, actor=user_id, role="USER")
        analysis_id = body["analysis"]["id"]
        status, body = self.request("PATCH", f"/internal/v1/analyses/{analysis_id}", {"analysis": {"content_quality": 90}}, actor=user_id, role="USER")
        self.assertEqual(status, 200)
        self.assertEqual(body["analysis"]["content_quality"], 90)
        status, _ = self.request("PATCH", f"/internal/v1/analyses/{analysis_id}", {"analysis": {"user_id": "someone-else"}}, actor=user_id, role="USER")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
