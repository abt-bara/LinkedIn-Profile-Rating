---
title: Legacy Edge Server
aliases: [nginx, Public Server, Tunnel]
tags: [profile-rater, infra, legacy]
created: 2026-11-12
---

# Legacy Edge Server

> [!note] Retired from the application architecture
> A separate edge server, nginx reverse proxy, and tunnel are no longer
> required. The browser sends HTTPS API requests directly to the public
> Gateway. This page remains only as a record of the former deployment design;
> do not use it as current deployment guidance.

The previous setup placed a public nginx server in front of the Gateway and
connected it to the application host through a tunnel:

```text
Browser ──HTTPS──► Edge (nginx) ══tunnel══► Gateway
```

The current request path is:

```text
Browser ──HTTPS──► Gateway
```

See [[overview]] for the current architecture and [[gateway]] for the public
API entry point.
