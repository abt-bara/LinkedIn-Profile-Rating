---
title: Gateway
aliases: [API Gateway, Orchestrator]
tags: [profile-rater, backend, express]
created: 2026-11-12
---

# Gateway

Part of [[architecture]]. Folder: `Backend/gateway`. Stack: Express.

## Purpose

The **main entry point** of the application. The browser only ever talks to the gateway (through the [[edge-server]]); the gateway **orchestrates the private servers**:

| Route group | Forwards to |
|---|---|
| Auth and session routes | [[auth-server]] |
| LinkedIn sign-in routes (`/auth/linkedin`, `/callback`) | [[linkedin-auth-server]] |
| Analysis routes | [[ai-server]] |

> [!question] To confirm
> The project notes mention the gateway orchestrating three private servers (auth, AI, and the LinkedIn auth server). Confirm the final route table and prefixes.

## Responsibilities

- Single public surface, so the internal servers never need to be exposed.
- Authenticate requests (validate the session) before routing to protected services.
- Authorize by role (roles come from [[auth-server]]).
- CORS allowlist: only the real frontend origin(s).
- Request limits: body size (PDF up to 15 MB), rate limiting, timeouts.
- Error mapping: translate upstream failures into clear responses.

## Express setup notes

```js
app.set('trust proxy', 1);                 // one proxy hop (the edge)
app.use(cors({
  origin: process.env.CORS_ORIGINS.split(','),
  credentials: true,                       // cookies
}));
app.listen(3000, '127.0.0.1', (err) => {   // loopback only; only the tunnel reaches it
  if (err) throw err;
});
```

> [!tip]
> Express does not listen on the public URL. It listens on a local port, and the tunnel and edge map the public domain to it.

## Questions to think through

- The upload is up to 15 MB. Should the gateway stream the PDF to the AI server, or buffer it? What does each do to memory under load?
- Which failures should be retried by the gateway, and which should go straight to the user?

## Links
- Express `cors` middleware: https://expressjs.com/en/resources/middleware/cors.html
- Express `app.listen`: https://expressjs.com/en/5x/api.html#app.listen
- API Gateway pattern: https://microservices.io/patterns/apigateway.html
