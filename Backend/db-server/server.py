#!/usr/bin/env python3
"""CRUD HTTP server for the `User` and `Analysis` tables (Bd.drawio).

Standard library only: http.server + sqlite3 + json.
Settings are read from ../shared/config/config.json (relative to this file).
Run:  python3 server.py
"""
import json
import re
import sqlite3
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# ../shared/config/config.json, resolved relative to this file (not the launch directory)
CONFIG_PATH = (Path(__file__).resolve().parent / ".." / "shared" / "config" / "config.json").resolve()


SERVICE = "db_server"  # this server's name inside the shared config
BIND_HOST = "127.0.0.1"
DB_PATH = Path(__file__).resolve().parent / "app.db"


@dataclass(frozen=True)
class Config:
    port: int
    host: str = BIND_HOST
    db: str = str(DB_PATH)
    max_body: int = 1_000_000  # bytes

    @classmethod
    def load(cls, path=CONFIG_PATH, service=SERVICE):
        """Read the shared config and keep only what this service needs.

        The file belongs to every service, so keys we don't use are ignored;
        the keys we DO need must exist and have the right type.
        """
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            sys.exit(f"cannot read config '{path}': {e}")
        try:
            port = data["server_port"][service]
        except (KeyError, TypeError):
            sys.exit(f"config '{path}' has no server_port.{service}")
        if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
            sys.exit(f"config server_port.{service} must be an integer between 1 and 65535")
        return cls(port=port)


CFG = Config.load()  # loaded once at import time; frozen, so safe to share across threads

SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    given_name  TEXT NOT NULL,
    family_name TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analysis (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    analysis_result             TEXT,
    completeness                REAL,
    content_quality             REAL,
    keyword_and_role_relevance  REAL,
    career_trajectory           REAL,
    skills_depth                REAL,
    social_proof                REAL,
    network                     REAL,
    activity                    REAL,
    created_at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analysis_user_id ON analysis(user_id);
"""

# field -> (type, required_on_create). Whitelist: only these names ever reach SQL.
RESOURCES = {
    "users": {
        "table": "user",
        "fields": {
            "name": ("text", True),
            "given_name": ("text", True),
            "family_name": ("text", True),
            "email": ("text", True),
            "role": ("text", True),
        },
        "filters": {},
    },
    "analyses": {
        "table": "analysis",
        "fields": {
            "user_id": ("int", True),
            "analysis_result": ("text", False),
            "completeness": ("real", False),
            "content_quality": ("real", False),
            "keyword_and_role_relevance": ("real", False),
            "career_trajectory": ("real", False),
            "skills_depth": ("real", False),
            "social_proof": ("real", False),
            "network": ("real", False),
            "activity": ("real", False),
        },
        "filters": {"user_id": "int"},
        "server_set": {"created_at": lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")},
    },
}

ROUTE = re.compile(r"^/(?P<name>users|analyses)(?:/(?P<id>\d+))?/?$")


class HTTPError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


# ---------- validation ----------

def _check_type(field, kind, value):
    if kind == "text" and isinstance(value, str):
        return value
    if kind == "int" and isinstance(value, int) and not isinstance(value, bool):
        return value
    if kind == "real" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    raise HTTPError(422, f"field '{field}' must be of type {kind}")


def validate(res, body, *, partial):
    if not isinstance(body, dict):
        raise HTTPError(400, "body must be a JSON object")
    fields = res["fields"]
    unknown = set(body) - set(fields)
    if unknown:
        raise HTTPError(422, f"unknown field(s): {', '.join(sorted(unknown))}")
    clean = {}
    for name, (kind, required) in fields.items():
        if name not in body:
            if required and not partial:
                raise HTTPError(422, f"field '{name}' is required")
            continue
        value = body[name]
        if value is None:
            if required:
                raise HTTPError(422, f"field '{name}' cannot be null")
            clean[name] = None
            continue
        clean[name] = _check_type(name, kind, value)
        if kind == "text" and required and not clean[name].strip():
            raise HTTPError(422, f"field '{name}' cannot be empty")
    return clean


# ---------- database ----------

@contextmanager
def db(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")  # off by default in SQLite, per connection
    try:
        with conn:  # commit on success, rollback on error
            yield conn
    finally:
        conn.close()


def get_row(conn, res, rid):
    row = conn.execute(f"SELECT * FROM {res['table']} WHERE id = ?", (rid,)).fetchone()
    if row is None:
        raise HTTPError(404, "not found")
    return dict(row)


def list_rows(conn, res, query):
    where, params = [], []
    for name, kind in res["filters"].items():
        if name in query:
            try:
                params.append(int(query[name][0]))
            except ValueError:
                raise HTTPError(400, f"filter '{name}' must be an integer")
            where.append(f"{name} = ?")
    try:
        limit = min(int(query.get("limit", ["100"])[0]), 1000)
        offset = int(query.get("offset", ["0"])[0])
    except ValueError:
        raise HTTPError(400, "limit/offset must be integers")
    if limit < 1 or offset < 0:
        raise HTTPError(400, "limit must be >= 1 and offset must be >= 0")
    sql = f"SELECT * FROM {res['table']}"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id LIMIT ? OFFSET ?"
    return [dict(r) for r in conn.execute(sql, (*params, limit, offset))]


def create_row(conn, res, data):
    for name, fn in res.get("server_set", {}).items():
        data[name] = fn()
    cols = list(data)
    cur = conn.execute(
        f"INSERT INTO {res['table']} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
        [data[c] for c in cols],
    )
    return get_row(conn, res, cur.lastrowid)


def update_row(conn, res, rid, data):
    if not data:
        raise HTTPError(400, "no fields to update")
    cols = list(data)
    cur = conn.execute(
        f"UPDATE {res['table']} SET {', '.join(c + ' = ?' for c in cols)} WHERE id = ?",
        [data[c] for c in cols] + [rid],
    )
    if cur.rowcount == 0:
        raise HTTPError(404, "not found")
    return get_row(conn, res, rid)


def delete_row(conn, res, rid):
    cur = conn.execute(f"DELETE FROM {res['table']} WHERE id = ?", (rid,))
    if cur.rowcount == 0:
        raise HTTPError(404, "not found")


# ---------- HTTP ----------

class Handler(BaseHTTPRequestHandler):
    server_version = "BdServer/1.0"

    def _send(self, status, payload=None, headers=None):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise HTTPError(400, "invalid Content-Length")
        if length <= 0:
            raise HTTPError(400, "request body required")
        if length > CFG.max_body:
            raise HTTPError(413, "body too large")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise HTTPError(400, "invalid JSON")

    def handle_request(self):
        try:
            url = urlparse(self.path)
            m = ROUTE.match(url.path)
            if not m:
                raise HTTPError(404, "not found")
            res = RESOURCES[m["name"]]
            rid = int(m["id"]) if m["id"] else None
            method = self.command

            with db(CFG.db) as conn:
                if rid is None:
                    if method == "GET":
                        return self._send(200, list_rows(conn, res, parse_qs(url.query)))
                    if method == "POST":
                        row = create_row(conn, res, validate(res, self._read_json(), partial=False))
                        return self._send(201, row, {"Location": f"/{m['name']}/{row['id']}"})
                    raise HTTPError(405, "method not allowed")

                if method == "GET":
                    return self._send(200, get_row(conn, res, rid))
                if method == "PUT":
                    data = validate(res, self._read_json(), partial=False)
                    return self._send(200, update_row(conn, res, rid, data))
                if method == "PATCH":
                    data = validate(res, self._read_json(), partial=True)
                    return self._send(200, update_row(conn, res, rid, data))
                if method == "DELETE":
                    delete_row(conn, res, rid)
                    return self._send(204)
                raise HTTPError(405, "method not allowed")

        except HTTPError as e:
            self._send(e.status, {"error": e.message})
        except sqlite3.IntegrityError as e:
            msg = str(e)
            if "FOREIGN KEY" in msg:
                self._send(422, {"error": "user_id does not reference an existing user"})
            elif "UNIQUE" in msg:
                self._send(409, {"error": "a record with this unique value already exists"})
            else:
                self._send(409, {"error": msg})
        except Exception as e:  # last resort: never leak a stack trace to the client
            print(f"internal error: {e!r}", file=sys.stderr)
            self._send(500, {"error": "internal server error"})

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = handle_request


def main():
    with sqlite3.connect(CFG.db) as conn:
        conn.executescript(SCHEMA)

    httpd = ThreadingHTTPServer((CFG.host, CFG.port), Handler)
    print(f"Serving on http://{CFG.host}:{CFG.port}  (db: {CFG.db})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n Database session closed")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()