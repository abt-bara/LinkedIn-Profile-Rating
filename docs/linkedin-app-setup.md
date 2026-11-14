---
title: LinkedIn App Setup
aliases: [LinkedIn Developer Portal]
tags: [profile-rater, linkedin, setup, security]
created: 2026-11-12
---


## Current app (Developer Portal)

| Field | Value |
|---|---|
| App name | Profile rater |
| App type | Standalone app |
| Created | Nov 11, 2026 |
| Tabs | Settings, Auth, Products, Analytics, Team members |
| LinkedIn Page | Default Company Page for Individual Developer, **not verified** |
| Privacy policy URL | **Not set** |
| Widgets domains | None (not needed) |

## Setup checklist

- [ ] **Products and permissions:** enable the LinkedIn products that grant the requested scopes `liteprofile`, `emailaddress`, and `w_member_social`. Verify these match the app's actual LinkedIn product configuration.
- [ ] **Auth tab, redirect URLs:** add `https://<edge-domain>/api/signin/callback`. It must match the callback exactly, and it should be the public edge URL so real users can complete the flow.
- [ ] **Privacy policy URL:** add one. It is shown to users on the consent screen.
- [ ] **Verify** the app against the company page (the *Verify* button in Settings). Check whether the products you use require it.
- [ ] **Business email:** update it to receive critical platform updates (banner in the portal).
- [ ] Store `Client ID` and `Client Secret` in `.env` only.

## Secrets handling

> [!danger] Rotate the client secret
> A screenshot of the **Authentication keys** panel showed the Client ID and the first part of the Primary Client Secret. Treat that secret as exposed:
> 1. Auth tab → **Generate a new Client Secret**.
> 2. Put the new value in `.env` on the auth host.
> 3. Crop or hide the key area in any future screenshots, docs and commits.

## Questions to think through

- Why does an OAuth app need the redirect URL to be registered ahead of time instead of accepting any URL in the request?
- The client ID may be public, but the secret may not. What exactly does the secret prove, and to whom?

## Links
- LinkedIn Developer Portal: https://www.linkedin.com/developers/apps
- Sign In with LinkedIn using OIDC: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- LinkedIn authorization code flow: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
