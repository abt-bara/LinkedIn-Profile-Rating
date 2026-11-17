<div align="center">
  <h1>بسم الله الرحمن الرحيم</h1>
</div>

# READ Attentively 
<br>

# LinkedIn Profile Rater

A web application for reviewing LinkedIn profiles. The frontend is built with React + Vite. The planned backend separates public request routing, authentication, LinkedIn sign-in, AI analysis, and persistence:

- [Gateway](./docs/gateway.md): public API entry point; validates sessions and routes requests.
- [Auth Server](./docs/auth-server.md): session lifecycle and authenticated identity.
- [LinkedIn Auth Server](./docs/linkedin-auth-server.md): LinkedIn OAuth/OIDC flow.
- [AI Server](./docs/ai-server.md): profile analysis and scoring.
- [DB Server](./docs/database-server.md): planned private HTTP service for `User` and `Analysis` CRUD; its port and implementation are not yet assigned.
- [Edge Server](./docs/edge-server.md): public HTTPS reverse proxy and tunnel; not a data service.

### Git branches:

- Each developer creates his own branch from `main`, and `main` is the branch where we collect all developers' pull requests.
- `deployment` is a branch meant only for frontend builds: it only contains `dist/`, `docs/`, and a `Readme.md`.

<h3 style="color: red;" align="center">Read docs/ — It is mandatory to understand the project. Start with the <a href="./docs/overview.md">Overview</a>. Browser-to-gateway contracts are in the overview; planned internal database CRUD contracts are in <a href="./docs/database-server.md">Database Server</a>.</h3>
<h3 align='left'>Repository layout :</h3>

- [`frontend/`](./frontend/): Vite, React, and TypeScript application.
- [`Backend/`](./Backend/): backend service code. The database server is a separate planned service and is not implemented yet.
- [`docs/`](./docs/): application diagrams and all needed documentation; it contains details of each module server and architectural pattern inside the application.
