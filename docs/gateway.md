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
2. Validate the session with the auth server's `/api/me` endpoint.
3. If validation fails, stop; do not call the AI or DB server.
4. For DB operations, call the private DB-server HTTP API. The DB server runs
   separately on a port that is not assigned yet.
5. Return a browser-safe response. Never forward DB stack traces or secrets.

The gateway derives the authenticated user's `id` and `role` from `/api/me`.
For `PATCH` requests, it passes both values to the DB server as trusted actor
context; it must not copy actor identity from browser-supplied fields. The DB
server independently checks the actor, target record, role, and changed
fields. See [[database-server]] for the proposed internal API contract.

## Service responsibilities

| Downstream service | Gateway responsibility |
|---|---|
| Auth server | Validate sessions and provide the authenticated user identity |
| LinkedIn auth server | Start and complete the LinkedIn authorization-code flow |
| AI server | Forward a validated PDF for profile analysis |
| DB server | Directly create, read, partially update, and delete `User` and `Analysis` records |

After an analysis, the gateway associates the AI result with the authenticated
user and persists an `Analysis` record through the DB server. The public
browser-facing request and response remain the `/api/analyze` contract in
[[overview]].

## Ports and exposure

The frontend's Vite proxy defaults to the gateway at `http://localhost:3000`.
The DB server will have a different, private port; its value and service URL
are not implemented yet. Do not proxy the DB port through Vite or the edge
server.

The checked-in `Backend/gateway/server.js` is currently a minimal Express
stub: it listens on port `3000` and only exposes `GET /`. The routing,
session-validation, and DB calls described above are the target gateway
behavior and need implementation in that service.

## Public contract

All browser-to-gateway paths and payloads are maintained centrally in
[[overview]]. Internal DB routes and their request/response shapes are
maintained in [[database-server]]; do not duplicate them as public frontend
routes.
