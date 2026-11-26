import { Router } from "express";
import config from "../../shared/config/config.json" with { type: "json" };

const router = Router();

const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const PARAM_KEYS = ["response_type", "client_id", "redirect_uri", "state", "scope"];

const STATE_COOKIE = "oauth_state";
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax", // lax, not strict: LinkedIn returns the user through a cross-site GET
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// Paths exposed by the LinkedIn auth server. Adjust if yours differ.
const linkedin = (path) => `${config.server_url.linkedin_auth_server}${path}`;
const authServer = (path) => `${config.server_url.auth_server}${path}`;

function authHeaders(json = false) {
  const token = process.env.AUTH_INTERNAL_TOKEN;
  if (!token) throw new Error("AUTH_INTERNAL_TOKEN is not configured.");
  return {
    authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function clearPendingSignup(state) {
  if (typeof state !== "string" || !state) return;
  try {
    const response = await fetch(authServer(`/signup/${encodeURIComponent(state)}`), {
      method: "DELETE",
      headers: authHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.error(`Could not clear pending sign-up (${response.status}).`);
    }
  } catch (error) {
    console.error("Could not clear pending sign-up:", error);
  }
}

/**
 * @openapi
 * /api/signup:
 *   post:
 *     tags: [LinkedIn Authentication]
 *     summary: Start one-time LinkedIn sign-up
 *     description: Stores a password hash temporarily and returns the LinkedIn authorization URL.
 *     responses:
 *       200:
 *         description: Authorization URL ready
 *       400:
 *         description: Invalid password
 *       502:
 *         description: An upstream server failed or is unreachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/signup", async (req, res) => {
  try {
    const r = await fetch(linkedin("/authflow"), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      return res.status(502).json({ message: "LinkedIn sign-up is unavailable." });
    }

    const params = await r.json();
    const missing = PARAM_KEYS.filter((k) => !params[k]);
    if (missing.length || typeof params.state !== "string" || params.state.length < 16) {
      console.error("LinkedIn authflow returned incomplete sign-up parameters.");
      return res.status(502).json({ message: "LinkedIn sign-up is unavailable." });
    }

    const stored = await fetch(authServer("/signup"), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ state: params.state, password: req.body?.password }),
      signal: AbortSignal.timeout(5000),
    });
    if (!stored.ok) {
      const body = await stored.json().catch(() => null);
      return res.status(stored.status >= 500 ? 502 : stored.status).json({
        message:
          typeof body?.message === "string"
            ? body.message
            : "Could not start sign-up.",
      });
    }

    res.cookie(STATE_COOKIE, params.state, {
      ...STATE_COOKIE_OPTIONS,
      maxAge: 10 * 60 * 1000,
    });

    const query = PARAM_KEYS.map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
    return res.status(200).json({
      authorizationUrl: `${LINKEDIN_AUTHORIZE_URL}?${query}`,
    });
  } catch (err) {
    console.error("Could not start LinkedIn sign-up:", err);
    return res.status(502).json({ message: "Sign-up service is unreachable." });
  }
});

/**
 * @openapi
 * /api/signin/callback:
 *   get:
 *     tags: [LinkedIn Authentication]
 *     summary: LinkedIn redirects the browser here after consent
 *     parameters:
 *       - { in: query, name: code, schema: { type: string } }
 *       - { in: query, name: state, schema: { type: string } }
 *       - { in: query, name: error, schema: { type: string } }
 *     responses:
 *       302:
 *         description: Redirect to / with a session cookie on success, or to /auth on any failure
 */
router.get("/signin/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const expected = req.cookies?.[STATE_COOKIE];

  res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS); // single use, whatever happens next

  if (typeof state !== "string" || !expected || state !== expected) {
    await clearPendingSignup(expected);
    return res.redirect("/auth?error=login_failed");
  }
  if (error) {
    await clearPendingSignup(expected);
    return res.redirect("/auth?error=access_denied");
  }
  if (typeof code !== "string") {
    await clearPendingSignup(state);
    return res.redirect("/auth?error=login_failed");
  }

  try {
    const r = await fetch(linkedin("/callback"), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ code, state }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      await clearPendingSignup(state);
      return res.redirect("/auth?error=login_failed");
    }

    const identity = await r.json();
    const completed = await fetch(authServer("/signup/complete"), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ state, identity }),
      signal: AbortSignal.timeout(10000),
    });
    if (!completed.ok) {
      const body = await completed.json().catch(() => null);
      if (completed.status === 409) {
        return res.redirect("/auth?error=account_exists");
      }
      if (completed.status === 400) {
        return res.redirect("/auth?error=verified_email_required");
      }
      console.error(
        "Could not complete sign-up:",
        typeof body?.message === "string" ? body.message : completed.status,
      );
      return res.redirect("/auth?error=signup_failed");
    }

    for (const value of completed.headers.getSetCookie()) {
      res.append("set-cookie", value);
    }
    return res.redirect("/");
  } catch (err) {
    console.error("Sign-up callback failed:", err);
    await clearPendingSignup(state);
    return res.redirect("/auth?error=signup_failed");
  }
});

/**
 * @openapi
 * /api/check-token:
 *   get:
 *     tags: [LinkedIn Authentication]
 *     summary: Check and hydrate the LinkedIn token for this session
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Token check completed
 *       201:
 *         description: Token hydrated
 *       401:
 *         description: No valid session
 *       502:
 *         description: LinkedIn auth server failed or is unreachable
 */
router.get("/check-token", async (req, res) => {
  try {
    const r = await fetch(linkedin("/check-token"), {
      method: "POST",
      headers: { cookie: req.headers.cookie ?? "" },
      signal: AbortSignal.timeout(30000),
    });

    if (r.status === 401) return res.status(401).json({ error: "Unauthorized" });
    if (!r.ok) return res.status(502).json({ error: "linkedin auth server failed" });

    for (const c of r.headers.getSetCookie()) res.append("set-cookie", c);
    res.status(r.status).json(r.status === 201 ? { message: "Token hydrated" } : {});
  } catch (err) {
    console.error("check-token failed:", err);
    res.status(502).json({ error: "linkedin auth server unreachable" });
  }
});

export default router;