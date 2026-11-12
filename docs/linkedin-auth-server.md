---
title: LinkedIn Auth Server
aliases: [linkedin-auth]
tags: [profile-rater, backend, auth, linkedin]
created: 2026-11-12
---

# LinkedIn Auth Server

Part of [[architecture]]. Folder: `Backend/LinkedIn-auth-server`.

## Purpose

Ensures **sign-in and sign-up through LinkedIn** work: it runs the login-state verification and validation that the full flow ([[auth-flow]]) depends on. It talks to LinkedIn; it does not own users or sessions. It hands a verified identity to the [[auth-server]].

## Responsibilities

1. Build the LinkedIn authorize URL with a fresh `state` (and `nonce`).
2. Handle `/callback`: validate `state`, reject on mismatch or LinkedIn error.
3. Exchange the `code` for tokens (server to server, with the client secret).
4. Verify the `id_token`.
5. Pass the verified identity (`sub`, name, email, picture) to the [[auth-server]] for find-or-create and session issuing.

## LinkedIn endpoints

| Purpose | URL |
|---|---|
| Authorize | `https://www.linkedin.com/oauth/v2/authorization` |
| Token | `https://www.linkedin.com/oauth/v2/accessToken` |
| Userinfo | `https://api.linkedin.com/v2/userinfo` |
| Discovery | `https://www.linkedin.com/oauth/.well-known/openid-configuration` |

Scopes: `openid profile email`.

## Configuration (environment)

```bash
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...        # never commit; see linkedin-app-setup
LINKEDIN_REDIRECT_URI=https://<edge-domain>/callback
```

> [!warning]
> Keep secrets in `.env` (git-ignored) and commit only `.env.example`.

## Identity data returned (OIDC claims)

`sub` (stable LinkedIn user ID), `name`, `given_name`, `family_name`, `picture`, `email`, `email_verified`, `locale`. Use `sub` as the unique key, not the email.

## Questions to think through

- Why is `sub` safer than email as the user's identity key?
- Where should the `state` value live between step 2 and step 5, and for how long?

## Links
- Sign In with LinkedIn using OIDC: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- LinkedIn authorization code flow: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
