---
title: LinkedIn Login Flow
aliases: [Auth Flow, OAuth Flow, OIDC Flow]
tags: [profile-rater, auth, oauth, oidc]
created: 2026-11-12
updated: 2026-11-14
---

# LinkedIn Login Flow

LinkedIn is used only for **one-time sign-up**. The user first chooses an app
password; after LinkedIn verifies their identity and email, later visits use
that verified email and app password.

The flow is the **OpenID Connect Authorization Code Flow**: OAuth 2.0 answers *what may this app access*, and OIDC adds *who is this user* through the `id_token`.

## Sequence


```mermaid
sequenceDiagram
    participant B as Browser
    participant G as Gateway
    participant O as LinkedIn auth server
    participant L as LinkedIn
    participant D as DB server
    participant A as Auth server

    B->>G: 1. POST /api/signup with app password
    G->>O: 2. Request authorization parameters
    O-->>G: Authorization URL
    G->>A: Store password hash bound to OAuth state
    A-->>G: Pending sign-up stored in Redis
    G-->>B: Authorization URL and short-lived state cookie
    B->>L: 3. User signs in and consents
    L-->>B: 4. Redirect to callback with code and state
    B->>G: 5. GET /api/signin/callback
    G->>O: Forward code and state
    Note over O: Compare state with the stored value
    O->>L: 6. POST token endpoint with code and client_secret
    L-->>O: 7. access_token and id_token
    Note over O: Verify id_token and return verified identity
    O-->>G: 8. Verified LinkedIn identity
    G->>A: Complete sign-up with verified identity and state
    A->>A: Consume pending password hash from Redis
    A->>D: POST /internal/v1/auth/signup
    alt New LinkedIn account
        D-->>A: Created user (role assigned as unpaid)
    else Existing LinkedIn-only user
        D-->>A: App password attached to existing user
    end
    A->>A: Create Redis session
    A-->>G: Session established
    G-->>B: 9. Set session cookie and redirect into the app
```

Steps 1-5 and 9 pass through the **browser** (requests and redirects). Step 6 (the request, which carries the secret) and step 7 (the response, which carries the tokens) are **server to server**, so neither the secret nor the tokens reach the browser.

## What each step must guarantee

| Step | Check |
|---|---|
| 1-2 | Keep the app password in a JSON POST body, never a URL. Hash it in the auth server and store only the hash in Redis, bound to the short-lived OAuth `state`; set an `HttpOnly`, `SameSite=Lax` state cookie for this browser. Request OIDC scopes `openid profile email` |
| 5 | If the callback carries `error` (`user_cancelled_login`, `user_cancelled_authorize`), stop there. Otherwise compare the returned `state` with the stored one, **use it once** (delete it after reading), and reject on a mismatch, a missing value or an expired entry (CSRF protection) |
| 6 | Send `client_id` and `client_secret` in the **POST body** (form-encoded), only server to server, over HTTPS. Never in a URL. The code is single-use and short-lived, so exchange it immediately |
| 7-8 | Verify the `id_token`: signature (LinkedIn JWKS, `RS256`), `iss` = `https://www.linkedin.com`, `aud` = our client ID, `exp` and `iat` |
| 8 | The LinkedIn auth server returns verified `sub` and profile claims to the gateway. The auth server requires a verified email, consumes the pending password hash, and creates the user through the DB server with the default `unpaid` role. If email is missing or unverified, stop sign-up; never create a credential account with an unverified identifier. |
| 9 | Issue a **new** session id (never reuse one from before login). Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`. Then redirect into the app |

> [!important]
> **Redirect URL.** The callback is `https://<edge-domain>/api/signin/callback`; it must be an absolute `HTTPS` URL registered in the developer portal, and the `redirect_uri` we send must match it. Query parameters are ignored. Our own decision is to register the public edge URL and not `localhost` (see [[linkedin-app-setup]]).

> [!info]
> **Why `SameSite=Lax` and not `Strict`.** Step 4 is a cross-site redirect from LinkedIn back to us. A `Strict` cookie is not sent on that navigation, so the `state` cookie would be missing exactly when step 5 needs it.

## LinkedIn specifics

| Item | Value |
|---|---|
| Discovery document | `https://www.linkedin.com/oauth/.well-known/openid-configuration` |
| Authorization endpoint | `https://www.linkedin.com/oauth/v2/authorization` |
| Token endpoint | `https://www.linkedin.com/oauth/v2/accessToken` |
| JWKS | `https://www.linkedin.com/oauth/openid/jwks` |
| UserInfo endpoint | `https://api.linkedin.com/v2/userinfo` |
| `iss` | `https://www.linkedin.com` |
| Signing algorithm | `RS256` |
| Scopes | `openid` (required for the `id_token`), `profile`, `email` |
| Requires | The *Sign In with LinkedIn using OpenID Connect* product enabled on the app |
| `sub` | Pairwise: stable for **our app**, not a global LinkedIn member id |
| `email`, `email_verified` | LinkedIn may omit them; this app requires a verified email for local email/password sign-in and must stop sign-up if it is absent |

The `id_token` already carries the profile claims, so for sign-up a separate
UserInfo call is not required. Since this app uses LinkedIn only to verify
identity once, there is no reason to keep the LinkedIn access token after
step 8.

> Open items to verify against the real LinkedIn responses
> - **`nonce`.** The earlier version of this note listed a `nonce` check at step 8 but never generated one at step 2. LinkedIn's documentation does not list `nonce` among the authorization parameters or the `id_token` claims. Test whether LinkedIn echoes it. Until confirmed, do not make the login fail on a missing `nonce`, and rely on `state` for the browser binding.
> - **PKCE.** Not documented for this flow. We are a confidential server-side client with a `client_secret`, so it is not required, but check before relying on it.
> - **`localhost` redirects.** The LinkedIn docs say `HTTPS` but do not explicitly forbid `localhost`. The "public edge URL" rule above is our own decision, not a LinkedIn rule.

The implementation requests the OIDC scope set `openid profile email` so the
LinkedIn auth server can verify the returned ID token and provide the identity
claims required by sign-up. The LinkedIn application must have the
*Sign In with LinkedIn using OpenID Connect* product enabled.
