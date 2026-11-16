import { Router } from "express";
import config from "../config/config.json";
const router = Router();
router.get("/authflow", async (req, res) => {
  try {
    const r = await fetch(
      `${config.server_url.linkedin_auth_server}/authflow`,
      {
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!r.ok)
      return res.status(502).json({ error: "linkedin auth server failed" });

    const { response_type, client_id, redirect_uri, state, scope } =
      await r.json();
    res.json({ response_type, client_id, redirect_uri, state, scope });
  } catch {
    res.status(502).json({ error: "linkedin auth server unreachable" });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const response = await fetch(`${config.server_url.linkedin_auth_server}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      return res
        .status(500)
        .json({ error: "Internal server error, LinekdIn server failed " });
    }
    res.status(200).json(response.json);
  } catch {
    res.status(502).json({ error: "linkedin auth server unreachable" });
  }
});

router.get("/check-token", async (req, res) => {
  try {
    const response = await fetch(`${config.server_url.linkedin_auth_server}`, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      return res
        .status(500)
        .json({ error: "Internal server error, LinekdIn server failed " });
    }
    res
      .status(response.status)
      .json(response.status == 201 ? { message: "Token hydrated" } : {});
  } catch {
    res.status(502).json({ error: "linkedin auth server unreachable" });
  }
});
