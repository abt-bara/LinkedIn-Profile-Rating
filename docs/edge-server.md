---
title: Edge Server
aliases: [nginx, Public Server, Tunnel]
tags: [profile-rater, infra, nginx]
created: 2026-11-12
---


## Purpose

`localhost` has no internet-facing address, so nobody outside the machine can reach it. The **edge server** is a public server running **nginx**. It receives internet traffic and forwards it through a **tunnel** to the local [[gateway]]. To the outside world the edge *is* the application, and the local machine stays hidden behind it (a reverse proxy that masks the session path).

```
Browser ──HTTPS──► Edge (nginx, public IP) ══tunnel══► localhost:3000 (Gateway)
```

## Responsibilities

- Terminate TLS (HTTPS certificates).
- Reverse-proxy to the tunnel's local port on the edge.
- Pass real client info via `X-Forwarded-*` headers.
- Rate limiting and basic abuse protection (first layer only).
- Serve a friendly error page when the tunnel is down.

## Reference configuration

> [!example] Example, adapt names and ports
> ```nginx
> server {
>     listen 443 ssl;
>     server_name app.example.com;
>
>     location / {
>         proxy_pass http://127.0.0.1:8080;     # tunnel's port on the edge
>         proxy_set_header Host $host;
>         proxy_set_header X-Forwarded-For $remote_addr;
>         proxy_set_header X-Forwarded-Proto $scheme;
>     }
> }
> ```

Tunnel from the local machine (reverse SSH example):

```bash
ssh -N -R 127.0.0.1:8080:localhost:3000 \
    -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
    tunnel@edge-host
```

## Hardening checklist

- [ ] Firewall: open only 22, 80, 443. The tunnel port stays on loopback.
- [ ] Dedicated `tunnel` user, no shell, key restricted with `permitlisten="127.0.0.1:8080"`.
- [ ] Keep the tunnel alive (systemd unit or `autossh`).
- [ ] Gateway sets `app.set('trust proxy', 1)` and binds `127.0.0.1`.
- [ ] The LinkedIn **redirect URL** uses the edge's public HTTPS domain and
  `/api/signin/callback` path (see [[linkedin-app-setup]]).

> [!bug] A 502 on the login page
> Seen in the UI: "Request failed (502)". It means nginx reached no valid upstream. See [[known-issues]] for a checklist.

## Links
- nginx reverse proxy: https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/
- OpenSSH `authorized_keys` options: https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT
- Express behind proxies: https://expressjs.com/en/guide/behind-proxies.html
