---
title: Gateway
aliases: [API Gateway, Orchestrator]
tags: [profile-rater, backend, express]
created: 2026-11-12
---

# Gateway

Part of [[overview]].

## Purpose

The gateway is the application's only public backend API. The edge server
forwards browser traffic to it; internal service ports are not exposed to the
browser. The gateway routes and coordinates requests to the auth,
LinkedIn-auth, AI, and DB servers.

## Protected request flow

1. Receive the browser request and session cookie.
2. Validate the session with the auth server's private `/authorize` endpoint.
3. If validation fails, stop; do not call the AI or DB server.
4. For DB operations, call the private DB-server HTTP API. The DB server runs
   separately on a port that is not assigned yet.
5. Return a browser-safe response. Never forward DB stack traces or secrets.

The gateway derives the authenticated user's `id` and `role` from the private
`/authorize` response. Browser-facing `GET /api/me` returns only the display
name and minimal role used by the UI.
For `PATCH` requests, it passes both values to the DB server as trusted actor
context; it must not copy actor identity from browser-supplied fields. The DB
server independently checks the actor, target record, role, and changed
fields. See [[database-server]] for the proposed internal API contract.

## Service responsibilities

| Downstream service | Gateway responsibility |
|---|---|
| Auth server | Verify email/password sign-in, create Redis sessions, and complete one-time sign-up |
| LinkedIn auth server | Verify the one-time LinkedIn authorization-code flow |
| AI server | Forward a validated PDF for profile analysis |
| DB server | Directly create, read, partially update, and delete `User` and `Analysis` records |

After an analysis, the gateway associates the AI result with the authenticated
user and persists an `Analysis` record through the DB server. The public
browser-facing request and response remain the `/api/analyze` contract in
[[overview]].

## Ports and exposure

The frontend's Vite proxy defaults to the gateway at `http://localhost:3001`.
The DB server uses a different, private port (`3003` in the shared config). Do
not proxy the DB port through Vite or the edge server.

The analysis routes require `DB_SERVICE_TOKEN` in the gateway environment.
The gateway sends it only to the DB server as a bearer token; it is never
returned to the browser. The DB server must be configured with the
corresponding credential.

Gateway-to-auth requests use the shared `AUTH_INTERNAL_TOKEN`; DB requests use
`DB_SERVICE_TOKEN`. Neither credential is returned to the browser.

The gateway exposes `POST /api/signup` to initiate the LinkedIn-only
registration flow, `POST /api/signin` for email/password sign-in,
`GET /api/me` for the display name/minimal role, and `POST /api/signout` to
revoke the current session. OAuth callback and token-check paths remain
separate from local credential sign-in.

## Public contract

All browser-to-gateway paths and payloads are maintained centrally in
[[overview]]. Internal DB routes and their request/response shapes are
maintained in [[database-server]]; do not duplicate them as public frontend
routes.
