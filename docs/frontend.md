---
title: Frontend
aliases: [React App, UI, Screens]
tags: [profile-rater, frontend, react, vite, typescript]
created: 2026-11-12
---

# Frontend

Part of [[overview]]. The application in `frontend/` is a React 19,
TypeScript, and Vite single-page app. React Router handles client routes;
ESLint and TypeScript check the source. The UI provides LinkedIn sign-in,
session-protected profile review, PDF analysis, and an admin-only magic-link
form.

The frontend owns browser navigation, session-aware UI, request formatting,
response validation needed for rendering, and user-facing errors. The backend
owns authentication and authorization decisions, OAuth secrets and protocol
handling, session creation and invalidation, and all protected data access.

## Architecture and authentication boundaries

`src/main.tsx` mounts the app under `BrowserRouter` and `ErrorBoundary`.
`App.tsx` mounts `AuthProvider` around the routes:

| Route | Access | Behavior |
|---|---|---|
| `/home` | Public | Displays the feature-led Profile Rater landing page using the existing session context; it makes no feature-data requests. |
| `/auth` | Public | Checks session state; signed-in users are redirected to `/`. Anonymous users see the LinkedIn sign-in page. |
| `/` | Protected | Renders the profile dashboard after `GET /api/me` confirms a session. Anonymous users are redirected to `/auth`. |
| Any other path | Public fallback | Displays a not-found page with a link to `/`. |

The frontend does not implement a LinkedIn callback route. The login is a
top-level browser navigation to the backend, not an XHR request:

```mermaid
sequenceDiagram
  participant B as Browser / frontend
  participant G as Backend gateway
  participant L as LinkedIn
  B->>G: Navigate to GET /api/signin
  G->>L: Authorization redirect (backend-owned)
  L-->>G: Redirect to /api/signin/callback?code&state via public proxy
  G->>L: Exchange code and validate identity (server-to-server)
  Note over G: Validate state/nonce and ID token; find or create account
  G-->>B: Set HttpOnly session cookie; redirect to /
  B->>G: GET /api/me (cookie included)
  G-->>B: Current user
  B->>B: Render protected profile page
```

The browser must never receive the LinkedIn client secret or OAuth tokens.
The backend is responsible for generating and checking OAuth `state` and
`nonce`, exchanging the code, validating the ID token and issuer/audience/
expiry, looking up or creating the account, loading roles, and setting the
session cookie. After successful authentication, it must return the browser to
`/`, where the provider loads the session with `GET /api/me`.

The app keeps the normalized user in React context only. It does not store a
session token in `localStorage`, `sessionStorage`, or JavaScript-readable
cookies. API calls include credentials by default so the browser can attach
the backend's session cookie. The cookie should be `HttpOnly`, `Secure` in
production, and use an appropriate `SameSite` policy. A frontend route guard
is only a navigation/UI aid; the backend must authenticate and authorize every
protected request.

### Session states and errors

- On application start, `AuthProvider` calls `GET /api/me`.
- While that request is pending, protected routes show a session-loading
  screen. `/auth` also waits for the initial check so a known signed-in user is
  not prompted to sign in again. `/home` remains available while the request
  runs and after an unauthenticated or failed check.
- A `200` user response populates context. `/` renders the dashboard and `/auth`
  redirects to `/`.
- The gateway redirects a missing or invalid session from `/api/me` to `/auth`.
  `/home` stays public; `/` must lead the user to `/auth`.
- Other failures (network, server, or invalid user response) are not treated as
  successful authentication. The route guard redirects to `/auth` with a
  recoverable message; the page allows a sign-in attempt or an explicit retry
  of the session check.
- The frontend recognizes the safe login error codes `access_denied`,
  `login_failed`, and `session_expired` on `/auth?error=...`. It maps codes to
  fixed user-facing text and does not display arbitrary query-string content.
  The backend should redirect failed/cancelled login to `/auth` with one of
  these codes and must not put secrets, authorization codes, or internal error
  details in the URL.
- Sign-out calls `POST /api/signout`. Context is cleared and the browser moves
  to `/auth` only after a successful response. If it fails, the user remains
  in the current UI and sees an error; the backend remains the authority on
  whether the session was invalidated.

## Screens and behavior

### Sign-in page

`src/pages/AuthPage.tsx` displays the LinkedIn-only sign-in action. Activating
**Continue with LinkedIn** navigates the browser to `/api/signin`; the frontend
does not construct the authorization URL or handle the callback. A returned
`/auth?error=...` code is shown using a fixed message mapping. If the current
session check failed, the user can retry that check before starting a new login.

### Public home page

`src/pages/HomePage.tsx` provides the public `/home` landing page. It introduces
the profile dashboard, AI-assisted profile ratings, and profile lists in
alternating copy-and-visual sections. The feature previews are local UI only;
they do not call the analysis, graph, or profile-list APIs. The page reads the existing auth context populated by `GET /api/me` to link
signed-in users to `/` and guests to `/auth`. The frontend must handle the
gateway's redirect when the session is missing.

### Profile dashboard

`src/pages/ProfileCheckPage.tsx` initially loads the current metrics from
`GET /api/graph`. It displays:

- a previous/current grouped chart, with scores clamped to 0–100 visually;
- an overall score calculated as the rounded arithmetic mean of each metric's
  current score (`val`, falling back to `oldval`);
- comparison with the prior values (`oldval`, falling back to the current
  value when no prior value exists);
- the two lowest-scoring focus areas and a per-metric breakdown;
- explicit loading, empty, retry, and request-error states.

An empty graph object represents no scores yet. A metric is rendered when it
has a numeric `val` or `oldval`. The backend should return finite numeric
scores and meaningful metric names.

### PDF upload and analysis

The dashboard accepts a PDF using the file picker or drag-and-drop. The
frontend checks that the browser reports MIME type `application/pdf` and
rejects files larger than 15 MiB (15 × 1024 × 1024 bytes) before sending.
These checks are convenience only: the backend must independently validate
the file type, content, and size.

The request contains one multipart field named `file`. While it is in flight,
the UI shows a busy state and skeleton. On success, the frontend renders
`analysisResult` recursively and immediately replaces the dashboard metrics
with `graphData`; it does not follow with another `GET /api/graph`. Invalid
responses or failed requests are shown as upload errors.

The PDF-help dialog provides steps for LinkedIn's profile **More → Save to
PDF** action. It can be dismissed with Escape or the close button and returns
focus to the opening control.

### Admin magic-link form

The form is shown only when the session user has `role: "admin"`. It accepts a
whole-number duration of 1–4,320 hours, 1–180 days, or 1–6 months (30 days per
month), defaulting to 24 hours. The service converts the duration to seconds
and checks the inclusive range of 3,600–15,552,000 seconds before sending.
Backend authentication, role checks, bounds validation, token creation, and
expiration enforcement are mandatory regardless of UI visibility.

## API client behavior

`src/services/httpClient.ts` prefixes service paths with `/api`. Requests use
`credentials: "include"` by default. JSON request bodies use
`Content-Type: application/json`.
`FormData` requests leave the multipart content type and boundary to the
browser.

The client reads an empty response as `null`, parses JSON when possible, and
otherwise returns the response text. For non-2xx responses it throws
`HttpError`, using a non-empty JSON `message`, non-empty text body, or a
status-based fallback message, in that order. The client does not retry
requests or define an application-level timeout.

For JSON API requests, the gateway should return a non-2xx status and a safe
JSON body such as
`{ "message": "A user-safe explanation", "requestId": "..." }`. The client
displays `message` when present and ignores `requestId`; it must not contain
stack traces, secrets, or tokens. A plain-text error body is also displayed.
Network errors are surfaced using the browser's error message. The frontend
does not retry mutations automatically.

## Frontend–Gateway contract

The canonical contract for all public frontend-to-gateway endpoints and
payloads is maintained in [[overview]]. Keep endpoint tables and response
schemas there rather than duplicating them in this document. This page
describes frontend screens and how they use those contracts.

## Development and deployment

Install dependencies from `frontend/`, then use the scripts in
`frontend/package.json`:

```sh
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

During development, Vite proxies `/api/*` to
`VITE_API_PROXY_TARGET`, defaulting to `http://localhost:3000`. To use another
local gateway:

```dotenv
VITE_API_PROXY_TARGET=http://localhost:8080
```

The sign-in URL is a browser navigation under `/api`, so it goes through the
same Vite proxy. In production, a same-origin reverse proxy serving the static
frontend and forwarding `/api/*` to the gateway is preferred. For a
cross-origin deployment, the backend must explicitly allow the frontend origin
with credentials and set compatible cookie attributes; frontend
`credentials: "include"` alone does not configure CORS or cookies.
