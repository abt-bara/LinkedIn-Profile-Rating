---
title: LinkedIn Auth Server
aliases: [linkedin-auth]
tags: [profile-rater, backend, auth, linkedin]
created: 2026-11-12
---

# LinkedIn Auth Server

Part of [[overview]]. Folder: `Backend/linkedIn-auth-server`.

## Purpose

Ensures the **one-time LinkedIn sign-up identity check** works: it runs the authorization-code flow and validation that the full flow ([[LinkedIn-auth-flow]]) depends on. It talks to LinkedIn; it does not own user records or browser sessions. It returns a verified identity to the gateway. The gateway passes that identity and the sign-up state to the [[auth-server]], which consumes the pending password hash, creates the user through the [[database-server]], and issues the Redis session. Later sign-ins use the local email/password contract and do not call LinkedIn.

## Responsibilities

1. Build the LinkedIn authorize parameters with a fresh, random `state`.
2. Handle the callback forwarded by the gateway. The gateway compares the callback state with its short-lived, HTTP-only state cookie before forwarding it.
3. Exchange the `code` for tokens (server to server, with the client secret).
4. Verify the `id_token` signature using the LinkedIn JWKS and validate `iss`, `aud`, `exp`, `iat`, and `sub`.
5. Return the verified identity (`sub`, name, email, `email_verified`) to the gateway. The gateway asks the auth server to complete sign-up; the auth server handles DB persistence and session creation.

## LinkedIn endpoints

| Purpose | URL |
|---|---|
| Authorize | `https://www.linkedin.com/oauth/v2/authorization` |
| Token | `https://www.linkedin.com/oauth/v2/accessToken` |
| Userinfo | `https://api.linkedin.com/v2/userinfo` |
| Discovery | `https://www.linkedin.com/oauth/.well-known/openid-configuration` |

Requested authorization scopes: `openid profile email` (URL-encoded in the authorization request). These OIDC scopes are required for the verified `id_token` claims used by this application.

The LinkedIn auth server exposes private `GET /authflow` and `POST /callback`
routes to the gateway. Both require the shared `AUTH_INTERNAL_TOKEN` bearer
credential. The gateway validates the browser's state cookie; the LinkedIn auth
server validates that callback parameters are well-formed and verifies the
identity token.

## Configuration (environment)

```bash
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...        # never commit; see linkedin-app-setup
LINKEDIN_REDIRECT_URI=https://<edge-domain>/api/signin/callback
AUTH_INTERNAL_TOKEN=...           # shared with the gateway
```

> [!warning]
> Keep secrets in `.env` (git-ignored) and commit only `.env.example`.

The token request is form-encoded and sent only server-to-server. The client
secret and provider tokens must never appear in URLs, browser responses, or
logs. The auth server does not retain LinkedIn access tokens after identity
verification.

## Identity data returned (OIDC claims)

`sub` (stable LinkedIn user ID), `name`, `given_name`, `family_name`, `picture`, `email`, `email_verified`, `locale`. Use `sub` as the unique key, not the email.

## Questions to think through

- Why is `sub` safer than email as the user's identity key?
- Where should the `state` value live between step 2 and step 5, and for how long?

## Links
- Sign In with LinkedIn using OIDC: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- LinkedIn authorization code flow: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
