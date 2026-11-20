---
title: Auth Server
aliases: [Auth Service, Sessions and Roles]
tags: [profile-rater, backend, auth]
created: 2026-11-12
---

# Auth Server

Part of [[overview]].

## Purpose and ownership

The auth server owns app-password verification and the Redis-backed session
lifecycle. LinkedIn is used only for one-time account sign-up; later sign-ins
use the verified LinkedIn email and the app password. User records remain
owned by the separate [[database-server]], and the LinkedIn auth server
validates the OAuth identity.

The browser calls the gateway only. Gateway-to-auth requests require the
shared `AUTH_INTERNAL_TOKEN` bearer credential. The auth server fails closed
if Redis is unavailable; it does not fall back to in-memory sessions.

## Internal API

These are private gateway-to-auth routes, not browser-facing endpoints:

| Route | Purpose |
|---|---|
| `POST /signup` | Hash an app password and keep it in Redis under the OAuth `state` for 10 minutes |
| `POST /signup/complete` | Consume the pending password hash, create a user from a verified LinkedIn identity through the DB service, and issue a session |
| `DELETE /signup/{state}` | Remove pending sign-up state on cancellation/failure |
| `POST /signin` | Find a user by normalized email, verify the password hash, and issue a session |
| `GET /me` | Validate the browser session and return `{ "displayName": "...", "role": "USER" }` |
| `POST /signout` | Revoke the session and clear its cookie |
| `POST /authorize` | Validate the session and return only the internal user `id` and `role` for gateway authorization |

Unknown users and incorrect passwords produce the same `401` response. The
user ID, password hash, and email are not returned by `GET /me`.

## Redis sessions and cookies

- Connect to Redis using `REDIS_URL`; the default is
  `redis://127.0.0.1:6379`. Use Redis 6.2 or newer for atomic `GETDEL`.
- Keep pending sign-up data for 10 minutes and sessions for 30 days.
- Store sessions under a SHA-256 hash of a random opaque token. The raw token
  exists only in the `HttpOnly`, `SameSite=Lax` cookie named
  `profile_rater_session`; set `Secure` in production.
- Never store or log a raw password or session token. Passwords are hashed
  with Node's `scrypt` before being stored in Redis or sent to the DB service.

## Periodic account revalidation

Every successful session check reads Redis first. At most once every 24 hours,
the auth server loads the account again from the DB service using the internal
auth lookup contract in [[database-server]]. The DB record's
`credential_version` must increment whenever password/auth credentials change.
The auth server refreshes the cached display name, role, and version when the
record changes, preserving the active session. Deleted users or expired
sessions are rejected.

## DB service configuration

Set `DB_SERVICE_TOKEN` in the auth server and DB service. The auth server uses
the private DB routes documented in [[database-server]] to look up verified
emails and user IDs and to create a user after LinkedIn sign-up. The DB server
implementation is maintained separately; it must protect password hashes
behind its service-authenticated auth lookup routes.

## Public API boundary

The gateway exposes `POST /api/signup`, `POST /api/signin`,
`GET /api/me`, and `POST /api/signout`. The browser-facing `/api/me` response
contains only the display name and minimal role used by the existing admin UI.
Protected gateway operations obtain ID and role through the private
`/authorize` route; they do not depend on browser-supplied identity.
