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
| `/auth` | Public | Checks session state; signed-in users are redirected to `/`. Anonymous users see the LinkedIn sign-in page. |
| `/` | Protected | Renders the profile dashboard after `GET /api/user` confirms a session. Anonymous users are redirected to `/auth`. |
| Any other path | Public fallback | Displays a not-found page with a link to `/`. |

The frontend does not implement a LinkedIn callback route. The login is a
top-level browser navigation to the backend, not an XHR request:

```mermaid
sequenceDiagram
  participant B as Browser / frontend
  participant G as Backend gateway
  participant L as LinkedIn
  B->>G: Navigate to GET /api/signIn
  G->>L: Authorization redirect (backend-owned)
  L-->>G: Redirect to registered backend callback with code and state
  G->>L: Exchange code and validate identity (server-to-server)
  Note over G: Validate state/nonce and ID token; find or create account
  G-->>B: Set HttpOnly session cookie; redirect to /
  B->>G: GET /api/user (cookie included)
  G-->>B: Current user
  B->>B: Render protected profile page
```

The browser must never receive the LinkedIn client secret or OAuth tokens.
The backend is responsible for generating and checking OAuth `state` and
`nonce`, exchanging the code, validating the ID token and issuer/audience/
expiry, looking up or creating the account, loading roles, and setting the
session cookie. After successful authentication, it must return the browser to
`/`, where the provider loads the session with `GET /api/user`.

The app keeps the normalized user in React context only. It does not store a
session token in `localStorage`, `sessionStorage`, or JavaScript-readable
cookies. API calls include credentials by default so the browser can attach
the backend's session cookie. The cookie should be `HttpOnly`, `Secure` in
production, and use an appropriate `SameSite` policy. A frontend route guard
is only a navigation/UI aid; the backend must authenticate and authorize every
protected request.

### Session states and errors

- On application start, `AuthProvider` calls `GET /api/user`.
- While that request is pending, protected routes show a session-loading
  screen. `/auth` also waits for the initial check so a known signed-in user is
  not prompted to sign in again.
- A `200` user response populates context. `/` renders the dashboard and `/auth`
  redirects to `/`.
- A `401` means there is no valid session. `/` redirects to `/auth`.
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
**Continue with LinkedIn** navigates the browser to `/api/signIn`; the frontend
does not construct the authorization URL or handle the callback. A returned
`/auth?error=...` code is shown using a fixed message mapping. If the current
session check failed, the user can retry that check before starting a new login.

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
`credentials: "include"` by default. The `POST /api/sign` helper opts out of
credentials. JSON request bodies use `Content-Type: application/json`;
`FormData` requests leave the multipart content type and boundary to the
browser.

The client reads an empty response as `null`, parses JSON when possible, and
otherwise returns the response text. For non-2xx responses it throws
`HttpError`, using a non-empty JSON `message`, non-empty text body, or a
status-based fallback message, in that order. The client does not retry
requests or define an application-level timeout.

The frontend does not depend on a particular error status beyond treating
`GET /api/user` `401` as an absent session. For API requests, the gateway
should return a non-2xx status and a safe JSON body such as
`{ "message": "A user-safe explanation", "requestId": "..." }`. The client
displays `message` when present and ignores `requestId`; it must not contain
stack traces, secrets, or tokens. A plain-text error body is also displayed.
Network errors are surfaced using the browser's error message. The frontend
does not retry mutations automatically.

## API contracts

These are the contracts the current frontend sends and consumes. They are not
confirmation that a backend route is implemented. API paths below include the
`/api` base prefix. Method/path casing is significant when the gateway is
case-sensitive.

### Authentication endpoints

| Method and path | Request and credentials | Success expected by frontend | Frontend behavior |
|---|---|---|---|
| `GET /api/signIn` | Top-level browser navigation; no body and no XHR. | Redirect chain to LinkedIn and back through the backend callback; after success, set session cookie and redirect to `/`. | Starts LinkedIn sign-in or account creation. This is a browser navigation, so normal HTTP redirects are followed by the browser. |
| `GET /api/user` | No body. Sends session cookies. | `200` user object, either directly or wrapped as `{ "user": { ... } }`. | Called when `AuthProvider` starts and when session verification is retried. |
| `POST /api/signout` | JSON `{}`. Sends session cookies. | Any `2xx` response; response body is ignored. | Calls backend sign-out. Local auth context is cleared only after success. |

The frontend normalizes a user using these fields:

```json
{
  "id": "user-123",
  "name": "Ada Lovelace",
  "given_name": "Ada",
  "email": "ada@example.com",
  "role": "admin"
}
```

`name` may also be supplied as `full_name` or `displayName`; `given_name` may
also be `firstName`. `id`, `email`, and `role` are optional. If no ID is
provided, the frontend uses the display name as a UI identifier. If no name is
available, it falls back to the first name and then `"Friend"`. Only
`role: "admin"` displays the admin form; this is not authorization.

`GET /api/user` with `401` is the unauthenticated case. Other non-2xx
responses, network errors, or a body that cannot be normalized are surfaced as
session errors rather than being treated as an authenticated user.

#### Login error redirect

If LinkedIn login is cancelled or the backend cannot complete the flow, it
should redirect to `/auth?error=<code>`. Supported codes are:

| Code | Fixed frontend message |
|---|---|
| `access_denied` | LinkedIn sign-in was cancelled. You can try again. |
| `login_failed` | We couldn't complete LinkedIn sign-in. Please try again. |
| `session_expired` | Your sign-in session expired. Please start again. |

Unknown codes use the generic `login_failed` message. The backend must not
place raw exception messages, OAuth credentials, tokens, or authorization
codes in this query parameter. A session-check error passed through router
state takes precedence over the query error.

For `POST /api/signout`, any non-2xx response leaves the current user in
frontend context and displays the error in the header; the backend should
make sign-out idempotent so retries are safe. `GET /api/signIn` is a browser
navigation, so a failed redirect that does not return to `/auth` is shown by
the browser rather than converted to an in-app `HttpError`.

### Profile dashboard and analysis

| Method and path | Request and credentials | Success expected by frontend | Frontend behavior |
|---|---|---|---|
| `GET /api/graph` | No body. Sends session cookies. | JSON object keyed by metric; `{}` means there are no scores. | Called on dashboard load and when the user retries a failed graph load. |
| `POST /api/analyze` | `multipart/form-data` containing one `file` field with the PDF. Sends session cookies. | JSON object with `analysisResult` and `graphData`, described below. | On success, renders the analysis result and updates graph metrics from the same response. |

Graph response example:

```json
{
  "headline": { "name": "Headline", "val": 82, "oldval": 74 },
  "experience": { "name": "Experience", "val": 68 },
  "skills": { "name": "Skills", "oldval": 55 }
}
```

Each graph property is a metric. `name` is its display label. At least one of
`val` (current score) or `oldval` (previous score) must be a finite number for
the metric to render. Names are strings; if omitted in analysis `graphData`,
the frontend uses the metric key as the label. The dashboard graph has no
fixed list of metric keys.

Analysis success example:

```json
{
  "analysisResult": {
    "Summary": "A concise profile assessment.",
    "Recommendations": ["Clarify the headline.", "Add measurable outcomes."]
  },
  "graphData": {
    "headline": { "name": "Headline", "val": 82, "oldval": 74 },
    "experience": { "name": "Experience", "val": 68 }
  }
}
```

Both top-level properties are required. `analysisResult` can be any JSON value
and is rendered recursively; `null`, strings, numbers, booleans, arrays, and
nested objects are supported. `graphData` must be a graph object as described
above. A malformed envelope or malformed metric produces an explicit upload
error instead of silently showing an empty dashboard.

The analysis request uses `POST /api/analyze` (lowercase `a`). The response
includes both the free-form result and the new graph metrics, so the frontend
does not make a follow-up `GET /api/graph` after a successful upload. The
backend must return the latest graph snapshot in this response.

Any non-2xx response from `GET /api/graph` is shown in the chart with a retry
button. Any non-2xx analysis response is shown in the upload panel. The client
does not assume a fixed set of analysis failure statuses; the backend should
use appropriate 4xx/5xx statuses and a safe message. `graphData` from the
analysis response is runtime-validated. The initial `GET /api/graph` response
is currently trusted to follow the graph contract; the UI filters out metrics
that have no numeric score, so the backend should still validate and return
finite numeric values.

### Admin magic link

| Method and path | Request and credentials | Success expected by frontend | Frontend behavior |
|---|---|---|---|
| `POST /api/magic-link` | JSON `{ "durationSeconds": number }`. Sends session cookies. | JSON `{ "url": "https://..." }`; frontend accepts only an absolute `http:` or `https:` URL. | Available only to a UI session with `role: "admin"`; shows the returned URL as a link and surfaces errors. |

The UI emits integer seconds from 3,600 (1 hour) through 15,552,000 (6
30-day months). For example:

```json
{ "durationSeconds": 86400 }
```

```json
{ "durationSeconds": 2592000 }
```

The backend must independently authenticate the session, authorize the admin
role, validate the duration, and generate/enforce the link expiration.

### Exported helpers not currently used by the UI

| Method and path | Request and credentials | Success accepted by helper | Notes |
|---|---|---|---|
| `POST /api/sign` | Any JSON object. Omits browser credentials. | Any successful response body, returned without interpretation. | Legacy helper; not the LinkedIn sign-in flow and not called by current pages. |
| `GET /api/profile-check?url=...` | URL-encoded `url` query parameter. Sends session cookies. | Any response body, returned without interpretation. | Legacy helper; not called by current pages. The frontend does not fetch or validate the supplied URL. |

These helpers are not required for the currently rendered auth/dashboard
workflow. If retained, the backend must define their authorization, validation,
and response contracts independently.

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

## Related documentation

- [[auth-flow]] — backend-owned LinkedIn OAuth sequence and security checks.
- [[gateway]] — public API gateway and backend routing.
- [[auth-server]] — account, role, and session responsibilities.
- [[ai-server]] — PDF analysis behavior.
- [[known-issues]] — observed project issues and implementation gaps.
- [Vite guide](https://vite.dev/guide/) and [React docs](https://react.dev/learn).
