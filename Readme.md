<div align="center">
  <h1>بسم الله الرحمن الرحيم</h1>
</div>

# LinkedIn Profile Rater

A web application for reviewing LinkedIn profiles. The repository contains a
React frontend and backend service projects; frontend routing and protected-page
navigation are being developed independently of backend session verification.

## Repository layout

- [`frontend/`](./frontend/): Vite, React, and TypeScript application.
- [`Backend/`](./Backend/): backend service projects and their documentation.
- [`docs/`](./docs/): application diagrams and supporting documentation.

## Frontend quick start

```sh
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The app is served locally by Vite. See the [frontend README](./frontend/README.md)
for available routes, the live API endpoints, and how to configure the gateway
URL. The default gateway URL is `http://localhost:3000`.

## Project status

The frontend includes an authentication page and a protected profile-review
page. Authentication tokens are not stored in `localStorage`: the intended
session mechanism uses a server-managed `HttpOnly` cookie, which browser
JavaScript cannot read. The frontend auth provider checks the current user
through the session endpoint. Profile metrics and uploaded PDF analysis use the
live gateway endpoints; the frontend does not substitute sample data if the
backend is unavailable. The route guard is a navigation aid, not a security
boundary. Backend access control must be enforced by the server, which should
set the cookie with `HttpOnly`, `Secure` in production, and an appropriate
`SameSite` policy.
