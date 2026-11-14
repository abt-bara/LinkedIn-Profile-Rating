---
title: Auth Server
aliases: [Auth Service, Sessions and Roles]
tags: [profile-rater, backend, auth, postgresql]
created: 2026-11-12
---


## Purpose
The auth server is the server responsible for securing the application by enforcing authorization on every layer of the application we have only 3 layers of authorization:  
- **Guest** : guests can only reach linkedIn sign page and the application's home page. 
- 

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

## Frontend API boundary

The auth server's internal user and session operations are described above. The
public frontend-to-gateway endpoints and their request/response contracts are
defined centrally in [[overview]]; this service document does not define a
separate browser-facing API.
- 