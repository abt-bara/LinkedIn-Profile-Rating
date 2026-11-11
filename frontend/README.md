# LinkedIn Profile Rater frontend

The frontend is a React + TypeScript application built with Vite. Its API calls
are isolated in service classes under `src/services/`; components do not depend
on fetch details or backend hostnames.

For the full application flow, service boundaries, API assumptions, and
implemented-versus-unverified behavior, see
[APPLICATION_FLOW.md](../APPLICATION_FLOW.md).

## Run locally

```sh
npm install
npm run dev
```

The development server forwards `/api/*` to `http://localhost:3000` by default.
Set `VITE_API_PROXY_TARGET` in the environment to point Vite at the gateway:

```sh
VITE_API_PROXY_TARGET=http://localhost:8080 npm run dev
```

The browser only calls relative `/api/*` URLs. For production, configure the
hosting server or gateway to reverse-proxy the same `/api/*` paths to the API;
the Vite development proxy is not included in the production build.

## Frontend flows

- The profile review page accepts a LinkedIn profile URL only for a signed-in
  user. If a signed-out visitor pastes a URL, it is retained in tab-scoped
  session storage and a LinkedIn sign-in action is shown. After authentication,
  the visitor can continue with the restored URL.
- Profile URLs are validated as LinkedIn `/in/` or `/pub/` profile links before
  the review request is sent.
- Sign-in and account creation both use LinkedIn OAuth. The first successful
  LinkedIn sign-in creates an account automatically when needed.
- Magic-link generation and the returned URL are rendered only for a user
  whose session role is `admin`.
- Profile review responses are rendered recursively, with headings capped at
  three levels.

## Service and API assumptions

`src/services/httpClient.ts` centralizes same-origin requests, cookie inclusion,
and HTTP errors. `AuthService` owns authentication endpoints and `ProfileService`
owns profile review and magic-link endpoints.

The frontend currently expects the following gateway contract:

| Method | Path | Expected behavior |
| --- | --- | --- |
| `GET` | `/api/auth/linkedin` | Start LinkedIn OAuth; on success, set the session cookie and redirect to `/`. |
| `GET` | `/api/session` | Return the signed-in user (`id`, `username`, `role`); return `401` if no session exists. |
| `POST` | `/api/signout` | Invalidate the current session. |
| `GET` | `/api/profile-check?url=...` | Require an authenticated user and return the profile-review result. |
| `POST` | `/api/magic-link` | Require an admin role and return a URL as text or as `{ "url": "..." }` / `{ "magicLink": "..." }`. |

QR rendering is not included in this first frontend pass; the admin flow
currently displays the generated link. The service boundary keeps response
handling isolated so a QR presentation can be added without changing the API
client or authentication flows.

These are frontend integration assumptions, not a finalized backend design.
Route names and payload shapes can be adjusted as the gateway contract is
defined. Authentication cookies should be HttpOnly, Secure in production, and
configured with an appropriate SameSite policy.

The UI gate and admin-only control are usability measures, not security
boundaries. The gateway must independently authenticate every protected
request, enforce the admin role for magic-link generation, validate submitted
URLs, and apply appropriate rate limits. The browser-visible `/api` path is
not hidden; the proxy keeps the upstream host out of frontend source and
provides a same-origin development path.

## Checks

```sh
npm run lint
npm run build
```
