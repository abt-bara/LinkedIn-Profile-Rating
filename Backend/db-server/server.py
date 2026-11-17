"""Private, dependency-free HTTP persistence API for LinkedIn Profile Rater."""
from __future__ import annotations

import json
import math
import os
import re
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from auth import Actor, AuthError, load_actor, require_admin, verify_service_token
from db import migrate, row_dict, transaction, utc_now

USER_FIELDS = {"name", "given_name", "family_name", "email"}
SCORE_FIELDS = {"completeness", "content_quality", "keyword_and_role_relevance", "career_trajectory", "skills_depth", "social_proof", "network", "activity"}
ANALYSIS_FIELDS = SCORE_FIELDS | {"analysis_result"}
ID_RE = re.compile(r"^[^/]+$")
MAX_BODY = 1024 * 1024


def load_dotenv() -> None:
    """Load a local .env without overriding process environment values."""
    path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def validate_text(value, field, required=False, max_length=10000):
    if value is None and not required:
        return None
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > max_length:
        raise ValueError(f"Invalid {field}")
    return value


def validate_score(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 100:
        raise ValueError(f"Invalid {field}")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "ProfileRaterDB/1.0"
    sys_version = ""

    def log_message(self, _format, *_args):
        # Default access logs include paths/identifiers. Do not log requests or credentials.
        return

    @property
    def database(self):
        return self.server.database_path

    def send_json(self, status, payload=None):
        body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def read_json(self):
        length = self.headers.get("Content-Length")
        if length is None:
            raise ValueError("Request body is required")
        try:
            size = int(length)
        except ValueError:
            raise ValueError("Invalid request body")
        if size < 0 or size > MAX_BODY:
            raise ValueError("Request body is too large")
        raw = self.rfile.read(size)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("Invalid JSON body")
        if not isinstance(value, dict):
            raise ValueError("JSON body must be an object")
        return value

    def service_auth(self):
        verify_service_token(self.headers.get("Authorization"), os.environ.get("DB_SERVICE_TOKEN", ""))

    def actor(self, conn):
        return load_actor(conn, self.headers.get("X-Actor-Id"), self.headers.get("X-Actor-Role"))

    def dispatch(self):
        try:
            self.service_auth()
            parsed = urlsplit(self.path)
            parts = [unquote(p) for p in parsed.path.split("/") if p]
            if len(parts) < 2 or parts[:2] != ["internal", "v1"]:
                self.send_json(404, {"error": "Not found"})
                return
            with transaction(self.database) as conn:
                self.route(conn, parts[2:], parse_qs(parsed.query, keep_blank_values=True))
        except AuthError as exc:
            self.send_json(exc.status, {"error": exc.message})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            # Avoid leaking database errors, stack traces, paths, or internals.
            if exc.__class__.__name__ == "IntegrityError":
                self.send_json(409, {"error": "Resource conflicts with an existing record"})
            else:
                self.send_json(500, {"error": "Internal server error"})

    def route(self, conn, parts, query):
        method = self.command
        if parts == ["users"]:
            if method == "POST":
                self.create_user(conn)
                return
            actor = self.actor(conn)
            if method == "GET":
                require_admin(actor)
                rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC, id").fetchall()
                self.send_json(200, {"users": [dict(row) for row in rows]})
                return
        if len(parts) == 3 and parts[0] == "users" and parts[1] == "by-linkedin-sub" and method == "GET":
            row = conn.execute("SELECT * FROM users WHERE linkedin_sub = ?", (parts[2],)).fetchone()
            self.send_json(200, {"user": dict(row)}) if row else self.send_json(404, {"error": "Not found"})
            return
        if len(parts) == 2 and parts[0] == "users":
            user_id = parts[1]
            actor = self.actor(conn)
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row is None:
                self.send_json(404, {"error": "Not found"})
                return
            if method == "GET":
                if actor.role != "ADMIN" and actor.id != user_id:
                    raise AuthError(403, "Access denied")
                self.send_json(200, {"user": dict(row)})
                return
            if method == "PATCH":
                self.patch_user(conn, actor, user_id)
                return
            if method == "DELETE":
                require_admin(actor)
                conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
                self.send_json(204)
                return
        if parts == ["analyses"]:
            actor = self.actor(conn)
            if method == "POST":
                self.create_analysis(conn, actor)
                return
            if method == "GET":
                self.list_analyses(conn, actor, query)
                return
        if len(parts) == 2 and parts[0] == "analyses":
            actor = self.actor(conn)
            analysis_id = parts[1]
            row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
            if row is None:
                self.send_json(404, {"error": "Not found"})
                return
            if actor.role != "ADMIN" and row["user_id"] != actor.id:
                raise AuthError(403, "Access denied")
            if method == "GET":
                self.send_json(200, {"analysis": dict(row)})
                return
            if method == "PATCH":
                self.patch_analysis(conn, analysis_id)
                return
            if method == "DELETE":
                conn.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
                self.send_json(204)
                return
        self.send_json(404, {"error": "Not found"})

    def create_user(self, conn):
        payload = self.read_json()
        data = payload.get("user")
        if set(payload) != {"user"} or not isinstance(data, dict) or set(data) - {"linkedin_sub", *USER_FIELDS}:
            raise ValueError("Invalid user payload")
        subject = validate_text(data.get("linkedin_sub"), "linkedin_sub", True, 512)
        values = {field: validate_text(data.get(field), field, False, 500) for field in USER_FIELDS}
        user_id, now = str(uuid.uuid4()), utc_now()
        conn.execute("INSERT INTO users(id, linkedin_sub, name, given_name, family_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'USER', ?, ?)", (user_id, subject, values["name"], values["given_name"], values["family_name"], values["email"], now, now))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        self.send_json(201, {"user": dict(row)})

    def patch_user(self, conn, actor, user_id):
        payload = self.read_json()
        if set(payload) - USER_FIELDS - {"role"} or not payload:
            raise ValueError("Invalid user fields")
        if actor.role != "ADMIN" and actor.id != user_id:
            raise AuthError(403, "Access denied")
        if "role" in payload:
            if actor.role != "ADMIN" or actor.id == user_id or payload["role"] not in ("USER", "ADMIN"):
                raise AuthError(403, "Role change is not permitted")
        values = {}
        for field in USER_FIELDS & payload.keys():
            values[field] = validate_text(payload[field], field, False, 500)
        values.update({"role": payload["role"]} if "role" in payload else {})
        values["updated_at"] = utc_now()
        assignments = ", ".join(f"{field} = ?" for field in values)
        conn.execute(f"UPDATE users SET {assignments} WHERE id = ?", (*values.values(), user_id))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        self.send_json(200, {"user": dict(row)})

    def create_analysis(self, conn, actor):
        payload = self.read_json()
        data = payload.get("analysis")
        if set(payload) != {"analysis"} or not isinstance(data, dict) or set(data) != ANALYSIS_FIELDS:
            raise ValueError("Invalid analysis payload")
        result = validate_text(data["analysis_result"], "analysis_result", True, 100000)
        scores = {field: validate_score(data[field], field) for field in SCORE_FIELDS}
        analysis_id, now = str(uuid.uuid4()), utc_now()
        fields = sorted(SCORE_FIELDS)
        conn.execute("INSERT INTO analyses(id, user_id, analysis_result, " + ", ".join(fields) + ", created_at, updated_at) VALUES (?, ?, ?, " + ", ".join("?" for _ in fields) + ", ?, ?)", (analysis_id, actor.id, result, *(scores[field] for field in fields), now, now))
        row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        self.send_json(201, {"analysis": dict(row)})

    def list_analyses(self, conn, actor, query):
        try:
            limit = int(query.get("limit", ["10"])[0])
        except (TypeError, ValueError):
            raise ValueError("Invalid limit")
        if not 1 <= limit <= 10:
            raise ValueError("Invalid limit")
        target = query.get("user_id", [None])[0]
        if actor.role != "ADMIN" and target not in (None, actor.id):
            raise AuthError(403, "Access denied")
        if actor.role == "ADMIN" and target:
            rows = conn.execute("SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", (target, limit)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", (actor.id, limit)).fetchall()
        self.send_json(200, {"analyses": [dict(row) for row in rows]})

    def patch_analysis(self, conn, analysis_id):
        payload = self.read_json()
        data = payload.get("analysis")
        if set(payload) != {"analysis"} or not isinstance(data, dict) or not data or set(data) - ANALYSIS_FIELDS:
            raise ValueError("Invalid analysis fields")
        values = {}
        for field, value in data.items():
            values[field] = validate_text(value, field, True, 100000) if field == "analysis_result" else validate_score(value, field)
        values["updated_at"] = utc_now()
        assignments = ", ".join(f"{field} = ?" for field in values)
        conn.execute(f"UPDATE analyses SET {assignments} WHERE id = ?", (*values.values(), analysis_id))
        row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        self.send_json(200, {"analysis": dict(row)})

    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def do_PATCH(self): self.dispatch()
    def do_DELETE(self): self.dispatch()
    def do_PUT(self): self.dispatch()
    def do_OPTIONS(self): self.dispatch()


def main():
    load_dotenv()
    token = os.environ.get("DB_SERVICE_TOKEN", "")
    if not token:
        raise SystemExit("DB_SERVICE_TOKEN must be set; see .env.example")
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = int(os.environ.get("DB_PORT", "3003"))
    database = os.environ.get("DB_PATH", "./data/profile-rater.sqlite3")
    migrate(database)
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    httpd.database_path = database
    print(f"DB service listening on {host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
