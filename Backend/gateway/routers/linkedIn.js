import { Router } from "express";
import config from "../../shared/config/config.json" with { type: "json" };

const router = Router();
const BasePath = config.uris.gateway.base.replace(/^\/+/, "");

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

/**
 * @openapi
 * /api/signin:
 *   get:
 *     tags: [LinkedIn Authentication]
 *     summary: Start sign-in
 *     description: Redirects to / when the session cookie is valid, otherwise to LinkedIn's authorization page.
 *     responses:
 *       302:
 *         description: Redirect to / or to LinkedIn
 *       502:
 *         description: An upstream server failed or is unreachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/signin", async (req, res) => {
  try {
    // 1. Returning user: a valid cookie logs them in without LinkedIn.
    const me = await fetch(`${config.server_url.auth_server}/me`, {
      headers: { cookie: req.headers.cookie ?? "" },
      redirect: "manual", // a redirect to /auth must not be mistaken for success
      signal: AbortSignal.timeout(3000),
    });
    if (me.ok) return res.redirect("/");

    // 2. Otherwise start the authorization flow.
    const r = await fetch(linkedin("/authflow"), {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) {
      return res.status(502).json({ error: "linkedin auth server failed" });
    }

    const params = await r.json();
    const missing = PARAM_KEYS.filter((k) => !params[k]);
    if (missing.length) {
      return res.status(502).json({ error: `authflow missing: ${missing.join(", ")}` });
    }

    // 3. Bind `state` to this browser; the callback compares it with the query string.
    res.cookie(STATE_COOKIE, params.state, {
      ...STATE_COOKIE_OPTIONS,
      maxAge: 10 * 60 * 1000,
    });

    // 4. Go to LinkedIn (encodeURIComponent keeps spaces in scope as %20).
    const query = PARAM_KEYS.map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
    res.redirect(`${LINKEDIN_AUTHORIZE_URL}?${query}`);
  } catch (err) {
    console.error("signin failed:", err);
    res.status(502).json({ error: "upstream server unreachable" });
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

  if (
    error ||
    typeof code !== "string" ||
    typeof state !== "string" ||
    !expected ||
    state !== expected
  ) {
    return res.redirect("/auth");
  }

  try {
    const r = await fetch(linkedin("/callback"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, state }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.redirect("/auth");

    // TODO: find or create the user through the DB server (not implemented yet).
    for (const c of r.headers.getSetCookie()) res.append("set-cookie", c); // session cookie created upstream
    res.redirect("/");
  } catch (err) {
    console.error("callback failed:", err);
    res.redirect("/auth");
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