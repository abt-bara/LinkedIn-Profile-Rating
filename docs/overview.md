# Profile Rater — Overview

> Profile Rater is a web app where a user signs in with **LinkedIn**, uploads their **LinkedIn profile as a PDF**, and receives a **score out of 100 per profile section** plus **actionable notes**, while tracking progress against their previous check.

## What the user gets

- **Sign in / sign up with LinkedIn only.** The account is created automatically on first login.
- **Upload a profile PDF** (max 15 MB) and get an analysis.
- **Seven section scores** (0–100): Headline, About, Experience, Skills, Education, Network, Activity.
- **An overall score** with the change since the last check (example: 69, up 7 from 62).
- **"Work on these first"**: the lowest-scoring sections.
- **Detailed notes** as nested feedback, for example under Skills → Programming → React: *"it is better to specify experience"*.

## The user journey

```mermaid
flowchart LR
  A[Landing page] --> B[Continue with LinkedIn]
  B --> C[LinkedIn consent]
  C --> D[Dashboard<br/>scores and history]
  D --> E[Upload profile PDF]
  E --> F[Analysis result<br/>scores and notes]
  F --> D
```

## System at a glance

```mermaid
flowchart LR
  U[Browser<br/>React SPA] -->|HTTPS| E[Edge server<br/>nginx - public]
  E ==>|tunnel| G
  subgraph P[Private network]
    G[Gateway<br/>Express]
    G --> A[Auth server<br/>sessions and identity]
    G --> L[LinkedIn auth server]
    G --> AI[AI server<br/>FastAPI, local LLM, RAG]
    G --> DB[DB server<br/>private HTTP CRUD<br/>port TBD]
  end
  L <-->|OAuth 2.0 / OIDC| LI[(LinkedIn)]
```

## Components

| Component            | Folder                         | Role                                                                             | Doc                                             |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| Frontend             | `frontend/`                    | React SPA: login, dashboard, upload                                              | [Frontend](frontend.md)                         |
| Edge server          | `Backend/edge server`          | Public nginx that exposes the local app to the internet                          | [Edge server](edge-server.md)                   |
| Gateway              | `Backend/gateway`              | Single entry point; orchestrates the private servers                             | [Gateway](gateway.md)                           |
| Auth server          | `Backend/auth server`          | Session lifecycle and authenticated identity (`/api/me`)                        | [Auth server](auth-server.md)                   |
| LinkedIn auth server | `Backend/LinkedIn-auth-server` | Sign-in/up flow with LinkedIn, state verification and validation                 | [LinkedIn auth server](linkedin-auth-server.md) |
| AI server            | `Backend/ai server`            | FastAPI + local LLM + RAG; PDF in, scores and notes out                          | [AI server](ai-server.md)                       |
| DB server            | `Backend/db server`            | Planned private HTTP service for `User` and `Analysis` persistence and CRUD      | [DB server](database-server.md)                 |

## Tech stack

| Layer                        | Technology                                 |
| ---------------------------- | ------------------------------------------ |
| Frontend                     | React, TypeScript, Vite, ESLint            |
| Gateway, Auth, LinkedIn auth | Node.js, Express                           |
| AI                           | Python, FastAPI, local LLM, RAG            |
| Database API                 | Separate HTTP service; implementation and port TBD |
| Data                         | `User` and `Analysis` entities; storage engine TBD |
| Edge                         | nginx plus a tunnel to localhost           |
| Identity                     | LinkedIn OAuth 2.0 authorization-code flow |

## Repository layout

```text
.
├── Backend/
│   ├── ai server/
│   ├── auth server/
│   ├── db server/       <- planned; separate process and port
│   ├── edge server/
│   ├── gateway/
│   └── LinkedIn-auth-server/
├── docs/                 <- you are here
├── frontend/             <- Vite + React + TypeScript
├── plan.md
└── Readme.md
```

---

## Frontend–Gateway routes

The Vite proxy forwards these frontend requests to the gateway.

### `GET /api/signin`

**Request**

Top-level browser `GET`; no request body.

**Response**

`302` redirect to LinkedIn:

```text
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={your_client_id}&redirect_uri={your_callback_url}&state=foobar&scope=liteprofile%20emailaddress%20w_member_social
```

Authorization query parameters:

- `response_type` — string, required. Always `code`.
- `client_id` — string, required. The API key generated for the registered LinkedIn application.
- `redirect_uri` — URL, required. Must exactly match a Redirect URL registered in the [LinkedIn application configuration](https://www.linkedin.com/developers/). The callback is handled by the proxy at `https://<edge-domain>/api/signin/callback`.
- `state` — string, optional in LinkedIn's parameter definition. A unique, hard-to-guess value is used to prevent [CSRF](https://en.wikipedia.org/wiki/Cross-site_request_forgery). `foobar` is a sample only; generate a new value for each sign-in.
- `scope` — string, required. URL-encoded, space-delimited member permissions explicitly enabled for the application: `liteprofile emailaddress w_member_social`. See [LinkedIn permissions](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication) and [application development best practices](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/best-practices/application-development?context=linkedin/context).

### `GET /api/signin/callback`

**Request**

The proxy receives LinkedIn's redirect to the registered callback URL and forwards it to the backend with `state` and either `code` or an authorization error. Successful callback example (the authorization code is a placeholder):

```text
https://<edge-domain>/api/signin/callback?state=foobar&code={authorization_code}
```

**Response**

On success, the backend sets the session cookie and redirects the browser to `/`. If sign-in fails, the backend redirects to `/auth`.

### `GET /api/me`

**Request**

Session cookie; no request body.

**Response**

`200 OK` with the current user as JSON:

```json
{
  "id": "user-123",
  "name": "Ada Lovelace",
  "given_name": "Ada",
  "email": "ada@example.com",
  "role": "user"
}
```

When the cookie is missing or invalid, the response redirects to `/auth`.

### `POST /api/signout`

**Request**

Session cookie and JSON body `{}`.

**Response**

Any `2xx` status after the session is invalidated and the cookie is cleared. The frontend ignores the response body.

### `POST /api/analyze`

**Request**

Session cookie and `multipart/form-data` with one `file` field containing the profile PDF.

**Response**

`200 OK` with JSON containing `analysisResult` and `graphData`. `analysisResult` is a JSON value containing the analysis feedback. `graphData` is keyed by metric; each metric has a numeric `val`, an optional numeric `oldval`, and an optional display `name`. `oldval` may be undefined for a user's first check.

```json
{
  "analysisResult": {
    "Summary": "A concise profile assessment.",
    "Recommendations": ["Clarify the headline."]
  },
  "graphData": {
    "headline": { "name": "Headline", "val": 82, "oldval": 74 },
    "experience": { "name": "Experience", "val": 68 }
  }
}
```

For an authenticated request, the gateway sends the validated AI result to the
DB server as a new `Analysis` record owned by the `/api/me` user before it
returns the response. The mapping between public `graphData` metric keys and
the DB server's named score fields must be finalized before persistence is
implemented; see [[database-server]].

---

## Gateway routes

### Gateway → Auth server

The gateway calls the auth server to validate the browser's session and obtain
the authenticated user's `id` and `role` (`GET /api/me`). User and analysis
record CRUD belongs to the separate DB server, not the auth server.

### Gateway → DB server

The gateway calls the DB server directly over its private HTTP interface for
`User` and `Analysis` CRUD. The DB server runs as a separate process on its own
port; the port has not been assigned, and the service is not implemented yet.
It is not a browser-facing API and must not be exposed through Vite or the
public edge proxy.

The planned internal endpoints use `GET`, `POST`, `PATCH`, and `DELETE`; no
`PUT` endpoint is defined. The full request/response contracts, entity fields,
authorization rules, and implementation gaps are in
[[database-server]]. In particular, the gateway must pass trusted actor
identity (`id` and `role`) for updates, and the DB server must enforce the
rules independently.

### Gateway → LinkedIn auth server

The gateway delegates authorization-code handling and identity verification
to the LinkedIn auth server. The full sequence is in
[[LinkedIn-auth-flow]].

**`/api/authflow`**

- Request: empty
- Response:

```text
{
  response_type: string
  client_id:     string
  redirect_uri:  url
  state:         string
  scope:         string
}
```

**`/api/callback`**

- Request:

```text
{
  code:  string
  state: string
}
```

After identity verification, the gateway finds or creates the user through
the DB server. The LinkedIn auth server does not own user-record CRUD.

**`/api/check-token`**

- Request: empty
- Response: success

### Gateway → AI server

**`/api/get-analysis-result`**

- Request: gateway forwards the authenticated user's PDF for analysis.
- Response: analysis result and scores. The gateway associates the result with
  the authenticated `user_id` and persists an `Analysis` record through the
  DB server before returning the browser-facing response.

---

## Notes

- Protected browser API requests enter through the gateway. Before handling
  them, the gateway validates the session with the auth server's `/api/me`
  endpoint. A failed check prevents the protected operation.
- For DB mutations, the gateway passes the authenticated actor's `id` and
  `role`; it must derive these from `/api/me`, not from browser-supplied data.
  The DB server independently validates authorization and field-level rules.
- The DB server's port, storage engine, and implementation are not yet set.
  See [[database-server]] for the proposed contract and outstanding schema
  decisions.