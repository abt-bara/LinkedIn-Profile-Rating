---
title: Gateway
aliases: [API Gateway, Orchestrator]
tags: [profile-rater, backend, express]
created: 2026-11-12
---

## Purpose

The **main entry point** of the backend. The gateway is the orchestrator and is the only public server of the backend.  
The gateway orchestrates 3 servers:

- [AI Server](/Backend/ai%20server/) 
- [Auth Server](/Backend/auth%20server/)
- [LinkedIn Auth Server](/Backend/LinkedIn-auth-server/)  

and recieves via a tunnel connected to [Edge Server](/Backend/edge%20server) .

The canonical browser-facing routes and request/response contracts are listed
in [[overview]]. This document describes the gateway's routing and orchestration
responsibilities.

