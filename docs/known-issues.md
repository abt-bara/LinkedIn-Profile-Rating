---
title: Known Issues and Open Questions
aliases: [Issues, TODO, Risks]
tags: [profile-rater, issues, todo]
created: 2026-11-12
---

# Known Issues and Open Questions

Part of [[overview]].

## 1. `Request failed (502)` on "Continue with LinkedIn"

**Where:** login page ([[frontend]]). **Meaning:** the public API endpoint or
hosting layer could not get a valid response from the [[gateway]] or one of its
downstream services. A dedicated edge server and tunnel are not part of the
current setup.

Debug the active request path:

- [ ] Is the frontend configured with the correct API URL for the **gateway**?
- [ ] Is the **gateway** running and listening on its configured port (default `3001`)?
- [ ] Does the gateway reach the [[linkedin-auth-server]]? Check its logs for connection errors.
- [ ] Is the `/api/signin` route proxied to the right upstream?

> [!tip]
> Test the active path with `curl`, from the inside out: downstream service →
> gateway → frontend's configured API URL. The first failing hop is the
> culprit. In local development, Vite forwards `/api` requests to the gateway.

## 2. Secret exposure

A screenshot showed part of the LinkedIn client secret. Rotate it. See [[linkedin-app-setup]].

## 3. Open decisions

| Question | Doc |
|---|---|
| Score history, user-to-analysis ownership, and CRUD | [[database-server]] |
| Cookie session or JWT plus refresh token? | [[auth-server]] |
| How are Network and Activity scored from a PDF? | [[ai-server]] |
| DB port, persistence engine, and migrations | [[database-server]] |
| Analysis timestamp and LinkedIn `sub` schema fields | [[database-server]] |
| PDF retention policy | [[ai-server]] |

## 4. Missing pieces

- [ ] Privacy policy URL on the LinkedIn app (also needed for a real launch)
- [ ] App verification against the company page
- [ ] "How do I get my profile PDF?" content
- [ ] Response schema (Pydantic) for the AI output
- [ ] Implement the DB server and its private CRUD routes; see [[database-server]]

## Links
- MDN, 502 Bad Gateway: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/502
