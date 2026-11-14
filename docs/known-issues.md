---
title: Known Issues and Open Questions
aliases: [Issues, TODO, Risks]
tags: [profile-rater, issues, todo]
created: 2026-11-12
---

# Known Issues and Open Questions

Part of [[overview]].

## 1. `Request failed (502)` on "Continue with LinkedIn"

**Where:** login page ([[frontend]]). **Meaning:** a *502 Bad Gateway* means the first server (the nginx edge, or the [[gateway]]) got no valid answer from the next one.

Debug from the outside in:

- [ ] Is the **tunnel** up? Check the SSH or tunnel process on the local machine.
- [ ] Does the **edge port** respond on the edge host? `curl -i http://127.0.0.1:8080/` there.
- [ ] Does nginx `proxy_pass` point to that same port? Check the nginx error log.
- [ ] Is the **gateway** really listening on the local port (`ss -ltnp | grep 3000`)?
- [ ] Does the gateway reach the [[linkedin-auth-server]]? Check its logs for connection errors.
- [ ] Is the `/api/signin` route proxied to the right upstream?

> [!tip]
> Test each hop separately with `curl`, from the inside out: service → gateway → tunnel port on the edge → public URL. The first hop that fails is the culprit.

## 2. Secret exposure

A screenshot showed part of the LinkedIn client secret. Rotate it. See [[linkedin-app-setup]].

## 3. Open decisions

| Question | Doc |
|---|---|
| Who stores score history (previous vs current)? | [[auth-server]] |
| Cookie session or JWT plus refresh token? | [[auth-server]] |
| How are Network and Activity scored from a PDF? | [[ai-server]] |
| Final gateway route table (auth, LinkedIn auth, AI) | [[gateway]] |
| PDF retention policy | [[ai-server]] |

## 4. Missing pieces

- [ ] Privacy policy URL on the LinkedIn app (also needed for a real launch)
- [ ] App verification against the company page
- [ ] "How do I get my profile PDF?" content
- [ ] Friendly error page when the tunnel is down
- [ ] Response schema (Pydantic) for the AI output

## Links
- MDN, 502 Bad Gateway: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/502
- nginx troubleshooting (error log): https://docs.nginx.com/nginx/admin-guide/monitoring/logging/
