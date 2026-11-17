# LinkedIn Profile Rater — DB Server

A private, dependency-free Python HTTP service backed by SQLite. It is intended to be called only by the application gateway, on `127.0.0.1:3003` by default. Do not expose this port through the edge proxy, Vite, or a public firewall.

## Requirements

- Python 3.10 or newer
- No third-party Python runtime packages

## Setup

From the `db-server/` directory:

```sh
cp .env.example .env
```

Generate a new service token locally and place its output in `.env` as `DB_SERVICE_TOKEN`:

```sh
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Configure the exact same token as `DB_SERVICE_TOKEN` in the gateway environment. Never commit `.env`, send the token to a browser, or put it in source control. If a previously used token was committed or shared, rotate it in both services.

The service reads `.env` itself; variables already present in the process environment take precedence. The default database path is `./data/profile-rater.sqlite3`, relative to the working directory.

## Initialize the database

Migrations are applied automatically at service startup. You can also initialize explicitly:

```sh
python admin.py --init-db
```

Set `DB_PATH` in `.env` or the environment first if you want a different database location. The database directory is created automatically.

## Provision the first administrator

There is deliberately no public HTTP endpoint for granting the first administrator role. First, have the user sign in through the LinkedIn flow so their ordinary `USER` record is created. Then, using the verified LinkedIn subject (`linkedin_sub`) from a trusted source, run:

```sh
python admin.py --provision-admin --linkedin-sub 'VERIFIED_LINKEDIN_SUBJECT'
```

This creates a minimal admin row if the subject has not signed in yet, or promotes the existing account. The account can complete its profile at the next sign-in. Restrict shell access and database-file access to trusted operators.

## Run

```sh
python server.py
```

Defaults: `DB_HOST=127.0.0.1`, `DB_PORT=3003`. Set `DB_HOST` to another private interface only if the gateway genuinely runs on a separate trusted host and network controls restrict access. A non-empty `DB_SERVICE_TOKEN` is mandatory; startup fails otherwise.

## API contract

Every request requires `Authorization: Bearer <DB_SERVICE_TOKEN>`. Actor-scoped routes also require `X-Actor-Id` and `X-Actor-Role`; the service verifies both against the current user row in SQLite. The two bootstrap routes (`POST /internal/v1/users` and `GET /internal/v1/users/by-linkedin-sub/{linkedinSub}`) use the service credential without actor headers because a first-time LinkedIn identity has no database actor yet. The gateway must only call them after verifying the LinkedIn identity.

- `POST /internal/v1/users` — `{ "user": { "linkedin_sub": "...", "name": "...", "given_name": "...", "family_name": "...", "email": "..." } }`; role is always `USER`.
- `GET /internal/v1/users` — admin only; returns `{ "users": [...] }`.
- `GET /internal/v1/users/{userId}` — self or admin; returns `{ "user": {...} }`.
- `GET /internal/v1/users/by-linkedin-sub/{linkedinSub}` — service-authenticated identity lookup.
- `PATCH /internal/v1/users/{userId}` — direct partial user fields; users may change their own profile fields. Role changes require an admin and a different target user.
- `DELETE /internal/v1/users/{userId}` — admin only; returns 204.
- `POST /internal/v1/analyses` — `{ "analysis": { "analysis_result": "...", "completeness": 0, "content_quality": 0, "keyword_and_role_relevance": 0, "career_trajectory": 0, "skills_depth": 0, "social_proof": 0, "network": 0, "activity": 0 } }`; owner is derived from the actor.
- `GET /internal/v1/analyses?limit=10` — actor's newest analyses; limit 1–10. Admin may supply `user_id`.
- `GET /internal/v1/analyses/{analysisId}` — owner or admin.
- `PATCH /internal/v1/analyses/{analysisId}` — `{ "analysis": { ...changed fields... } }`; `id` and `user_id` are immutable.
- `DELETE /internal/v1/analyses/{analysisId}` — owner or admin; returns 204.

Responses use wrapper objects for singular/plural resources (`user`, `users`, `analysis`, `analyses`) and `{ "error": "..." }` for errors. Statuses: 400 malformed input, 401 invalid service/actor authentication, 403 forbidden, 404 missing resource, 409 uniqueness/integrity conflict. There is no browser-facing CORS endpoint or health route.

Example local request (after creating a user through the API):

```sh
curl -i http://127.0.0.1:3003/internal/v1/users \
  -H "Authorization: Bearer $DB_SERVICE_TOKEN" \
  -H 'X-Actor-Id: USER_UUID' \
  -H 'X-Actor-Role: ADMIN'
```

## Tests

No external test runner is required:

```sh
python -m unittest discover -s tests -v
```

## Schema and explicit implementation decisions

The checked-in repository documentation labels the DB API as a proposed contract and says no DB implementation/schema was present. Accordingly, these are explicit defaults rather than claims about a pre-existing schema:

- User IDs and analysis IDs are UUID strings; `linkedin_sub` is required and unique. Profile attributes are nullable because the docs do not specify mandatory profile fields. `role` is non-null and constrained to `USER`/`ADMIN`.
- Analysis text, all eight scores, owner, and timestamps are non-null. Scores are stored as REAL to accept any finite numeric score from 0 through 100.
- Timestamps are UTC ISO-8601 strings with millisecond precision. Both timestamps are generated by the service and `updated_at` changes on PATCH.
- `analyses.user_id` references `users.id` with `ON DELETE CASCADE`, so admin user deletion removes dependent analyses. This resolves the documented open deletion-policy decision; change it to `RESTRICT` if retention is required.
- Indexes: unique `users.linkedin_sub` and `(analyses.user_id, analyses.created_at DESC)`. SQLite foreign-key enforcement is enabled on every connection.
- Migrations are numbered SQL files recorded in `schema_migrations` and applied on startup.
- The gateway docs describe the DB service token and actor headers, but the repository's gateway is documented as a minimal stub; gateway-side DB callers were not available to confirm a deployed request implementation.

If you already have a database file or a separate SQLite schema, back it up before using this service and review these assumptions before pointing `DB_PATH` at it. This package does not attempt to infer or migrate an unknown existing schema.
