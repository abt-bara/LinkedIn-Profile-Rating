---
title: Frontend
aliases: [React App, UI, Screens]
tags: [profile-rater, frontend, react, vite, typescript]
created: 2026-11-12
---

# Frontend

Part of [[overview]]. The application in `frontend/` is a React 19,
TypeScript, and Vite single-page app. React Router handles client routes;
ESLint and TypeScript check the source. The UI provides one-time LinkedIn sign-up and local credential sign-in,
session-protected profile review, PDF analysis, and an admin-only magic-link
form.

The frontend owns browser navigation, session-aware UI, request formatting,
response validation needed for rendering, and user-facing errors. The backend
owns authentication and authorization decisions, OAuth secrets and protocol
handling, session creation and invalidation, and all protected data access.
The browser communicates with the gateway only; it never calls the DB server
or sends DB actor-identity headers directly.

## Architecture and authentication boundaries

`src/main.tsx` mounts the app under `BrowserRouter` and `ErrorBoundary`.
`App.tsx` mounts `AuthProvider` around the routes:

| Route | Access | Behavior |
|---|---|---|
| `/home` | Public | Displays the feature-led Profile Rater landing page using the existing session context; it makes no feature-data requests. |
| `/auth` | Public | Checks session state; signed-in users are redirected to `/`. Anonymous users can sign in with credentials or start one-time LinkedIn sign-up. |
| `/` | Protected | Renders the profile dashboard after `GET /api/me` confirms a session. Anonymous users are redirected to `/auth`. |
| Any other path | Public fallback | Displays a not-found page with a link to `/`. |

The frontend does not implement a LinkedIn callback route. Sign-up uses a
same-origin request to prepare OAuth, followed by top-level navigation to
LinkedIn. Credential sign-in is a same-origin JSON request:

```mermaid
sequenceDiagram
  participant B as Browser / frontend
  participant G as Backend gateway
  participant A as Auth server
  participant L as LinkedIn
  opt New account
    B->>G: POST /api/signup with chosen app password
    G->>A: Store password hash bound to OAuth state
    A-->>G: Pending sign-up stored in Redis
    G-->>B: LinkedIn authorization URL + state cookie
    B->>L: Navigate to authorization URL
    L-->>B: Redirect with code and state
    B->>G: GET /api/signin/callback
    G->>L: Exchange code and validate identity (server-to-server)
    L-->>G: Verified LinkedIn identity
    G->>A: Complete sign-up; create user and session
    G-->>B: Set HttpOnly session cookie; redirect to /
  end
  opt Returning user
    B->>G: POST /api/signin with email + password
    G->>A: Verify credentials and issue Redis session
    G-->>B: Set HttpOnly session cookie
  end
  B->>G: GET /api/me (cookie included)
  G-->>B: Display name + minimal role
  B->>B: Render protected profile page
```

The browser must never receive the LinkedIn client secret or OAuth tokens.
The user sets an app password before starting the one-time LinkedIn sign-up.
The backend is responsible for generating and checking OAuth `state` and
`nonce`, exchanging the code, validating the ID token and issuer/audience/
expiry, requiring a verified email, creating the account, loading roles, and
setting the session cookie. After successful sign-up, it must return the browser to
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
- A `200` response with `displayName` and minimal `role` populates context. `/` renders the dashboard and `/auth`
  redirects to `/`.
- A missing or invalid session returns `401` from `/api/me`; the protected
  route guard redirects to `/auth`. `/home` stays public.
- Other failures (network, server, or invalid user response) are not treated as
  successful authentication. The route guard redirects to `/auth` with a
  recoverable message; the page allows a sign-in attempt or an explicit retry
  of the session check.
- The frontend recognizes safe sign-up error codes including `access_denied`,
  `login_failed`, `account_exists`, `verified_email_required`, and
  `signup_failed` on `/auth?error=...`. It maps codes to
  fixed user-facing text and does not display arbitrary query-string content.
  The backend should redirect failed/cancelled sign-up to `/auth` with one of
  these codes and must not put secrets, authorization codes, or internal error
  details in the URL.
- Sign-out calls `POST /api/signout`. Context is cleared and the browser moves
  to `/auth` only after a successful response. If it fails, the user remains
  in the current UI and sees an error; the backend remains the authority on
  whether the session was invalidated.

## Screens and behavior

### Sign-in and one-time sign-up page

`src/pages/AuthPage.tsx` presents **Sign in** and **Sign up with LinkedIn**
actions. The sign-in panel expands inline and submits email/password to
`POST /api/signin`. Sign-up first collects the app password and calls
`POST /api/signup`; the response contains the LinkedIn authorization URL, and
the frontend navigates there without handling the callback itself. The panel
animates between the actions and honors reduced-motion preferences. Both
wrong-password and unknown-email responses use the same safe error. A returned
`/auth?error=...` code is shown using a fixed message mapping. If the current
session check failed, the user can retry that check before signing in.

### Public home page

`src/pages/HomePage.tsx` provides the public `/home` landing page. It introduces
the profile dashboard, AI-assisted profile ratings, and profile lists in
alternating copy-and-visual sections. The feature previews are local UI only;
they do not call the analysis or profile-list APIs. The page reads the existing auth context populated by `GET /api/me` to link
signed-in users to `/` and guests to `/auth`. The frontend must handle the
gateway's redirect when the session is missing.

### Profile dashboard

`src/pages/ProfileCheckPage.tsx` loads up to the latest 10 saved analyses from
`GET /api/analyses?limit=10`. It displays:

- a grouped 2D chart with one current bar and at most one older-average bar per
  metric; bar height is clamped to 0–100 visually;
- an overall score calculated as the rounded arithmetic mean of each metric's
  current score;
- an older rating calculated from the per-metric averages of returned history,
  excluding the newest/current analysis;
- the two lowest-scoring focus areas and a per-metric breakdown;
- an empty prompt before the first analysis, plus history loading/error and
  upload progress/error states.

The latest analysis is the first record; earlier records are aggregated into
one older-average value per metric. If there are no earlier records, only the
current bar is shown. Refreshing the page reloads the latest history from the
gateway. The gateway is planned to persist each result in the DB server, but
the current browser contract does not include a read-history route, so the
frontend does not reload stored analyses after refresh.

### PDF upload and analysis

The dashboard accepts a PDF using the file picker or drag-and-drop. The
frontend checks that the browser reports MIME type `application/pdf` and
rejects files larger than 15 MiB (15 × 1024 × 1024 bytes) before sending.
These checks are convenience only: the backend must independently validate
the file type, content, and size.

The request contains one multipart field named `file`. While it is in flight,
the UI shows a busy state and skeleton. On success, `POST /api/analyze`
returns plain-text feedback, which the frontend displays as text. It then
reloads the latest saved analyses through `GET /api/analyses?limit=10` to
update the current and older-average bars. The analyze response contains no
score payload or JSON response envelope. Invalid responses or failed requests
are shown as errors.

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
requests or define an application-level timeout. A `403` response redirects
the browser to `/auth` unless it is already there.

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
`VITE_API_PROXY_TARGET`, defaulting to `http://localhost:3001`. To use another
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
