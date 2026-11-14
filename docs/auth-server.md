---
title: Auth Server
aliases: [Auth Service, Sessions and Roles]
tags: [profile-rater, backend, auth]
created: 2026-11-12
---

# Auth Server

Part of [[overview]].

## Purpose

The auth server owns the application's session lifecycle and answers the
gateway's session-validation request. It is not the CRUD service for profile
or analysis records; those entities are owned by the separate [[database-server]].

## Responsibilities

| Area | Responsibility |
|---|---|
| Session issue | Establish a session after the LinkedIn identity has been validated and the user record is available |
| Session validation | Validate the browser's session and return the authenticated user identity |
| Session lifecycle | Expire, rotate, and revoke sessions, including sign-out |
| Role context | Return the authenticated user's current `id` and `role` for gateway authorization checks |

The browser-facing `GET /api/me` contract is documented in [[overview]]. A
successful response includes the user `id` and `role`; an absent or invalid
session must not produce a successful response.

## Data ownership boundary

- The DB server owns the `User` and `Analysis` entities and their CRUD API.
- The gateway validates each protected request with the auth server before
  calling the DB server.
- For a DB `PATCH`, the gateway passes the authenticated actor's `id` and
  `role`. The DB server checks that context and the requested change itself.
- The session store and its implementation are not specified here. Do not
  assume PostgreSQL or Redis until the auth-service implementation selects
  them.

## Session data

At minimum, a session needs a user identifier, a non-reusable session token
stored as a hash, an expiry time, and revocation state. The concrete schema,
storage engine, and session cookie settings belong to the auth-server
implementation; they are separate from the `User` and `Analysis` schema in
[[database-server]].

> [!note]
> Never store or log a raw session token. The frontend must not receive the
> token in JSON or store it in browser-accessible storage.

## Frontend API boundary

The frontend calls the gateway only. Public request/response contracts are
defined in [[overview]]; this page describes the auth server's internal
responsibilities and does not add browser-facing routes.
