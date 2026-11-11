# Frontend

The frontend is a React and TypeScript single-page application built with Vite.
It provides an authentication page and a protected profile-review page.

## Requirements

- Node.js and npm

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

Vite prints the local development URL after startup. Other available commands:

```sh
npm run build
npm run lint
npm run preview
```

## Connect to the backend

The frontend makes live requests; it does not include demo or fallback profile
data. Vite forwards `/api/*` to the gateway URL configured by
`VITE_API_PROXY_TARGET`. The default is `http://localhost:3000`.

To start the frontend against a gateway running elsewhere, set the URL in
`frontend/.env.local`:

```dotenv
VITE_API_PROXY_TARGET=http://localhost:8080
```

Then start Vite:

```sh
npm run dev
```

Or launch the frontend and set the gateway URL in one command:

```sh
VITE_API_PROXY_TARGET=http://localhost:8080 npm run dev
```

The current frontend API client expects:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/user` | Load the signed-in user using the session cookie. |
| `POST` | `/api/auth` | Complete authentication and establish the session. |
| `POST` | `/api/signout` | End the current session. |
| `GET` | `/api/graph` | Load profile metrics for the dashboard. |
| `POST` | `/api/Analyze` | Upload a PDF as multipart form data and return its analysis JSON. |

These are the paths used by the current frontend client, not confirmation that
the gateway implementation is available or running. The backend directories
in this repository currently contain documentation only; start the gateway
using its own project instructions or point `VITE_API_PROXY_TARGET` at an
already-running gateway. A failed request is shown in the UI rather than
replaced with sample data. In production, configure the hosting server to
forward `/api/*` to the gateway and keep the session cookie secure.

## Routes and authentication

- `/auth` displays the authentication page.
- `/` displays the profile-review page after the existing auth provider confirms
  a signed-in user.
- Other paths display a not-found page.

The frontend does not store or read authentication tokens in `localStorage`.
The browser cannot access an `HttpOnly` cookie from JavaScript; the server sets
and validates the session cookie, and the auth provider derives the current
user from its session response. API requests include credentials. `ProtectedRoute`
shows a loading or retry state while the session is checked and redirects
visitors without a signed-in user to `/auth`.

The backend must set the session cookie with `HttpOnly`, `Secure` in
production, and an appropriate `SameSite` policy, and enforce authorization on
every protected API request. Frontend route protection is a navigation aid,
not a security boundary. An application-level error boundary displays a
recovery message for render errors.

The app uses React Router for client-side navigation. The router is mounted in
`src/main.tsx`, while route declarations live in `src/App.tsx`.
