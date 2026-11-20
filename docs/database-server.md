# Bd Server

A minimal CRUD backend for two tables (`User`, `Analysis`) taken from `Bd.drawio`.
Python standard library only: [`http.server`](https://docs.python.org/3/library/http.server.html), [`sqlite3`](https://docs.python.org/3/library/sqlite3.html), [`json`](https://docs.python.org/3/library/json.html). No dependencies, one file (`server.py`).

## Run

```bash
python3 server.py
```

The port comes from the shared config (see Configuration below). The schema is created automatically at startup (`CREATE TABLE IF NOT EXISTS`).

## Configuration

The server reads the shared file `../shared/config/config.json` (resolved relative to the folder containing `server.py`, so the launch directory doesn't matter). That file belongs to every service in the project, so this server only picks what it needs and ignores the rest:

```json
{
  "server_port": {
    "db_server": 3003
  }
}
```

| Setting | Source | Value |
|---|---|---|
| `port` | `server_port.db_server` in the shared file | `3003` in your file |
| `host` | constant `BIND_HOST` in `server.py` | `127.0.0.1` |
| `db` | constant `DB_PATH` in `server.py` | `app.db` next to `server.py` |
| `max_body` | default in `Config` | `1000000` bytes (larger → `413`) |

The service name is the constant `SERVICE = "db_server"`. Change it if this server should use another entry of `server_port`.

The file is loaded once at startup into a frozen `Config` object (`CFG`) that the code reads as `CFG.port`, `CFG.db`, and so on. The server refuses to start (exit code 1, message on stderr) if the file is missing, is not valid JSON, has no `server_port.db_server`, or that value is not an integer from 1 to 65535.

---

## Data model

```
User (1) ────────< (n) Analysis
```

### `user`

| Column | Type | Constraints |
|---|---|---|
| `id` | integer | primary key, auto-increment |
| `name` | text | required, non-empty |
| `given_name` | text | required, non-empty |
| `family_name` | text | required, non-empty |
| `email` | text | required, non-empty, **unique** |
| `role` | text | required, non-empty |

### `analysis`

| Column | Type | Constraints |
|---|---|---|
| `id` | integer | primary key, auto-increment |
| `user_id` | integer | required, foreign key → `user.id`, `ON DELETE CASCADE` |
| `analysis_result` | text | optional |
| `completeness` | number | optional |
| `content_quality` | number | optional |
| `keyword_and_role_relevance` | number | optional |
| `career_trajectory` | number | optional |
| `skills_depth` | number | optional |
| `social_proof` | number | optional |
| `network` | number | optional |
| `activity` | number | optional |
| `created_at` | text (ISO 8601, UTC) | **set by the server**, read-only |

Notes:
- Deleting a user **deletes all of their analyses** (cascade).
- Score columns accept any number; no range is enforced.
- SQLite does not enforce foreign keys unless asked per connection; `db()` does this with [`PRAGMA foreign_keys = ON`](https://www.sqlite.org/foreignkeys.html).

---

## Code structure (main functions)

The server is driven by one dictionary, `RESOURCES`, so both tables share the same code path.

| Function / object | Role |
|---|---|
| `Config` | Frozen dataclass holding `port`, `host`, `db`, `max_body`. `Config.load()` reads the shared config file, takes `server_port.db_server`, validates it, and ignores every other key. |
| `CFG` | The single `Config` instance, created once at import time and shared by all request threads (safe because it is immutable). |
| `SCHEMA` | SQL that creates both tables and the index on `analysis.user_id`. |
| `RESOURCES` | Per-resource config: table name, whitelist of client-writable fields with `(type, required)`, allowed list filters, and server-set fields (`created_at`). Only names from this whitelist are ever interpolated into SQL; all values are bound as `?` parameters. |
| `ROUTE` | Regex `^/(users\|analyses)(/<digits>)?/?$` mapping a path to a resource and an optional id. |
| `HTTPError(status, message)` | Raised anywhere to produce a JSON error response with that status. |
| `validate(res, body, *, partial)` | Checks the body is a JSON object, rejects unknown fields (422), enforces types, enforces required fields (unless `partial=True`), rejects `null`/empty for required text fields. Returns the cleaned dict. |
| `_check_type(field, kind, value)` | Type check for `text`, `int`, `real`. Booleans are rejected as numbers. Ints are converted to float for `real`. |
| `db(path)` | Context manager: opens a connection per request, enables foreign keys, commits on success, rolls back on error, always closes. This keeps the threaded server safe. |
| `list_rows(conn, res, query)` | `SELECT` with optional filters, `limit`, `offset`, ordered by `id`. |
| `get_row(conn, res, rid)` | Fetch one row or raise 404. |
| `create_row(conn, res, data)` | Inserts, adds server-set fields, returns the created row. |
| `update_row(conn, res, rid, data)` | Updates only the provided fields, raises 404 if the id doesn't exist, returns the updated row. |
| `delete_row(conn, res, rid)` | Deletes or raises 404. |
| `Handler.handle_request()` | The single entry point for GET/POST/PUT/PATCH/DELETE: routes, validates, calls the CRUD function, and maps exceptions to status codes (`sqlite3.IntegrityError` → 409/422, anything unexpected → 500 without leaking details). |
| `Handler._read_json()` | Reads the body using `Content-Length` (max `CFG.max_body` bytes), parses JSON. |
| `Handler._send()` | Writes a JSON response with status, `Content-Length`, and optional headers. |
| `main()` | Creates the schema in `CFG.db` and starts `ThreadingHTTPServer` on `CFG.host:CFG.port`. |

Request flow:

```
request → ROUTE match → RESOURCES[name] → db() connection
        → (read JSON → validate) → CRUD function → JSON response
```

---

## API contract

### Conventions

- All request and response bodies are JSON (`UTF-8`). Send `Content-Type: application/json` on `POST`/`PUT`/`PATCH`.
- Trailing slashes are accepted (`/users/` = `/users`).
- A non-numeric id (`/users/abc`) does not match any route → `404`.
- `id` and `created_at` can never be sent by the client. Sending them returns `422 unknown field(s)`.
- Error responses always have the shape `{"error": "<message>"}`.

### Users

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `GET` | `/users` | none | `200` array of users | Supports `limit`, `offset`. |
| `POST` | `/users` | all 5 fields | `201` created user + `Location: /users/{id}` | |
| `GET` | `/users/{id}` | none | `200` user | |
| `PUT` | `/users/{id}` | all 5 fields | `200` updated user | Full update; every required field must be present. |
| `PATCH` | `/users/{id}` | 1+ fields | `200` updated user | Partial update. |
| `DELETE` | `/users/{id}` | none | `204` empty | Also deletes the user's analyses. |

User object:

```json
{
  "id": 1,
  "name": "Ali B",
  "given_name": "Ali",
  "family_name": "B",
  "email": "a@x.com",
  "role": "dev"
}
```

### Analyses

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `GET` | `/analyses` | none | `200` array of analyses | Supports `user_id`, `limit`, `offset`. |
| `POST` | `/analyses` | `user_id` required, other fields optional | `201` created analysis + `Location: /analyses/{id}` | `created_at` is set by the server. |
| `GET` | `/analyses/{id}` | none | `200` analysis | |
| `PUT` | `/analyses/{id}` | `user_id` required, others optional | `200` updated analysis | Optional fields **omitted** from the body are left unchanged, not reset to `null`. Send `null` explicitly to clear one. |
| `PATCH` | `/analyses/{id}` | 1+ fields | `200` updated analysis | Partial update. |
| `DELETE` | `/analyses/{id}` | none | `204` empty | |

Analysis object:

```json
{
  "id": 1,
  "user_id": 1,
  "analysis_result": "ok",
  "completeness": 0.8,
  "content_quality": null,
  "keyword_and_role_relevance": null,
  "career_trajectory": null,
  "skills_depth": null,
  "social_proof": null,
  "network": null,
  "activity": null,
  "created_at": "2026-11-19T20:40:16+00:00"
}
```

### Query parameters (list endpoints)

| Param | Applies to | Type | Default | Rule |
|---|---|---|---|---|
| `limit` | both | integer | `100` | `1`–`1000` (larger values are capped at `1000`; `< 1` → `400`) |
| `offset` | both | integer | `0` | `>= 0` (else `400`) |
| `user_id` | `/analyses` | integer | none | Returns only that user's analyses. Non-integer → `400`. |

Results are ordered by `id` ascending.

### Status codes

| Code | When |
|---|---|
| `200` | Read or update succeeded. |
| `201` | Created. |
| `204` | Deleted (no body). |
| `400` | Invalid JSON, missing body, bad `Content-Length`, empty `PATCH`, or bad `limit`/`offset`/filter. |
| `404` | Unknown route, or no row with that id. |
| `405` | Method not supported on that path (e.g. `DELETE /users`). |
| `409` | Unique constraint violated (e.g. duplicate `email`). |
| `413` | Body larger than `Config.max_body` (1 MB by default). |
| `422` | Valid JSON but invalid content: missing/null/empty required field, wrong type, unknown field, or `user_id` that doesn't reference an existing user. |
| `500` | Unexpected server error (details are logged to stderr, not returned). |

---

## Examples

```bash
B=http://127.0.0.1:8000
H='Content-Type: application/json'

# create a user
curl -i -X POST $B/users -H "$H" \
  -d '{"name":"Ali B","given_name":"Ali","family_name":"B","email":"a@x.com","role":"dev"}'

# change only the role
curl -X PATCH $B/users/1 -H "$H" -d '{"role":"admin"}'

# create an analysis for that user
curl -X POST $B/analyses -H "$H" \
  -d '{"user_id":1,"analysis_result":"ok","completeness":0.8}'

# list that user's analyses, first 10
curl "$B/analyses?user_id=1&limit=10"

# clear one score
curl -X PATCH $B/analyses/1 -H "$H" -d '{"completeness":null}'

# delete the user (and, by cascade, their analyses)
curl -i -X DELETE $B/users/1
```

Error examples:

```text
POST /users  (email already used)      → 409 {"error": "a record with this unique value already exists"}
POST /analyses {"user_id": 99}         → 422 {"error": "user_id does not reference an existing user"}
PUT  /users/1 {"role": "admin"}        → 422 {"error": "field 'name' is required"}
PATCH /users/1 {"foo": 1}              → 422 {"error": "unknown field(s): foo"}
DELETE /users                          → 405 {"error": "method not allowed"}
```

---

## Known limits

- No authentication or authorization.
- No CORS headers, so browsers on another origin cannot call it directly.
- No schema migrations: changing a column means editing `SCHEMA` and `RESOURCES` and recreating or altering the database yourself.
- One SQLite file: fine for learning and small internal use, not for heavy concurrent writes.