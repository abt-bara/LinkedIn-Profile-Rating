---
title: Auth Server
aliases: [Auth Service, Sessions and Roles]
tags: [profile-rater, backend, auth, postgresql]
created: 2026-11-12
---

# Auth Server

Part of [[architecture]]. Folder: `Backend/auth server`. Stack: Express + PostgreSQL (Redis cache per `Diagram.drawio`).

## Purpose

Owns **who the user is and what they may do**:

- Manages **user session tokens**.
- Manages **roles and authorities**.
- **Saves the LinkedIn OpenID data** received from [[linkedin-auth-server]].
- Owns the **PostgreSQL** database.

## Responsibilities

| Area | Detail |
|---|---|
| Find or create user | Key on LinkedIn `sub`; store name, email, picture |
| Sessions | Issue, validate, rotate and revoke session tokens |
| Roles / authorities | e.g. `USER`, `ADMIN`; checked by the [[gateway]] |
| Caching | Redis cache-aside for hot lookups (session, roles) |

## Draft data model (proposal)

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : has
  ROLES ||--o{ USER_ROLES : grants
  USERS ||--o{ SESSIONS : opens
  USERS {
    uuid id PK
    string linkedin_sub UK
    string email
    string name
    string picture_url
    timestamp created_at
  }
  ROLES { int id PK
          string name UK }
  USER_ROLES { uuid user_id FK
               int role_id FK }
  SESSIONS { uuid id PK
             uuid user_id FK
             string token_hash
             timestamp expires_at
             timestamp revoked_at }
```

> [!note]
> Store only a **hash** of session tokens, never the raw token.

## Open decisions

> [!question] Where does score history live?
> The dashboard shows **current vs previous** scores and "+7 since your last check". Something must persist each analysis per user. Options: an `analyses` table here, or a separate store owned by the [[ai-server]] side. Decide who owns it.

> [!question] Session style
> Cookie with a server-side session, or a short-lived JWT plus refresh token? The login flow sets a cookie ([[auth-flow]], step 9). Which one the gateway checks per request affects latency and revocation.

## Links
- OWASP session management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- PostgreSQL docs: https://www.postgresql.org/docs/
- Redis caching patterns: https://redis.io/solutions/caching/
