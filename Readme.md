<div align="center">
  <h1>بسم الله الرحمن الرحيم</h1>
</div>

# READ Attentively 
<br>

# LinkedIn Profile Rater

A web application for reviewing LinkedIn profiles. The frontend is built with React + Vite, and the backend is divided into 5 services:

- [AI Server](/Backend/ai%20server/): profile analysis, scoring, and recommendation logic.
- [Gateway](/Backend/gateway): API gateway, routing, and request orchestration.
- [Auth Server](/Backend/auth%20server/): authentication, authorization, and session management.
- [Edge Server](/Backend/edge%20server): links localhost session with the Web.
- [LinkedIn Auth Server](/Backend/LinkedIn-auth-server/): connects to linkedIn server to recieve user data.

### Git branches:

- Each developer creates his own branch from `main`, and `main` is the branch where we collect all developers' pull requests.
- `deployment` is a branch meant only for frontend builds: it only contains `dist/`, `docs/`, and a `Readme.md`.

<h3 style="color: red;" align="center">Read docs/ — It is mandatory to understand the project. We recommend starting with the <a href="./docs/overview.md">Overview file</a>. All the API contracts are inside it.</h3>
<h3 align='left'>Repository layout :</h3>

- [`frontend/`](./frontend/): Vite, React, and TypeScript application.
- [`Backend/`](./Backend/): backend servers (Express/FastAPI).
- [`docs/`](./docs/): application diagrams and all needed documentation; it contains details of each module server and architectural pattern inside the application.
