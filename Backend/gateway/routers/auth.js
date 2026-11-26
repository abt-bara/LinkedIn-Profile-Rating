import { Router } from "express";
import config from "../../shared/config/config.json" with { type: "json" };
const router = Router();
const SESSION_COOKIE = "profile_rater_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function authHeaders(cookieHeader, includeJson = false) {
  const token = process.env.AUTH_INTERNAL_TOKEN;
  if (!token) throw new Error("AUTH_INTERNAL_TOKEN is not configured.");
  return {
    ...(includeJson ? { "content-type": "application/json" } : {}),
    authorization: `Bearer ${token}`,
    cookie: cookieHeader ?? "",
  };
}

function forwardSetCookies(upstream, res) {
  for (const value of upstream.headers.getSetCookie()) {
    res.append("set-cookie", value);
  }
}

/**
 * @openapi
 * /api/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get the current session display name
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: The display name and minimal role used by the frontend
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       401:
 *         description: No valid session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Not authorized
 *       502:
 *         description: Authentication server unreachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/me", async (req, res) => {
  try {
    const r = await fetch(`${config.server_url.auth_server}/me`, {
      headers: authHeaders(req.headers.cookie),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });

    if (r.status === 401) return res.status(401).json({ message: "Unauthorized." });
    if (!r.ok) {
      return res.status(r.status === 403 || r.status >= 500 ? 502 : r.status).json({
        message: "Could not check the current session.",
      });
    }

    const body = await r.json();
    if (
      typeof body !== "object" ||
      body === null ||
      typeof body.displayName !== "string"
    ) {
      console.error("Auth server returned an invalid session response.");
      return res.status(502).json({ message: "Could not check the current session." });
    }
    return res.status(200).json({
      displayName: body.displayName,
      ...(typeof body.role === "string" ? { role: body.role } : {}),
    });
  } catch (err) {
    console.error("Error checking current session:", err);
    return res.status(502).json({ message: "Authentication server unreachable." });
  }
});

/**
 * @openapi
 * /api/signin:
 *   post:
 *     tags: [Authentication]
 *     summary: Sign in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       204:
 *         description: Session cookie issued
 *       401:
 *         description: Incorrect email or password
 *       502:
 *         description: Authentication service unreachable
 */
router.post("/signin", async (req, res) => {
  try {
    const r = await fetch(`${config.server_url.auth_server}/signin`, {
      method: "POST",
      headers: authHeaders(req.headers.cookie, true),
      body: JSON.stringify(req.body ?? {}),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    forwardSetCookies(r, res);
    if (r.status === 204) return res.sendStatus(204);

    const body = await r.json().catch(() => null);
    return res.status(r.status === 403 || r.status >= 500 ? 502 : r.status).json({
      message:
        typeof body?.message === "string"
          ? body.message
          : "Sign-in failed.",
    });
  } catch (err) {
    console.error("Sign-in request failed:", err);
    return res.status(502).json({ message: "Authentication server unreachable." });
  }
});

/**
 * @openapi
 * /api/signout:
 *   post:
 *     tags: [Authentication]
 *     summary: End the session
 *     description: Idempotent for a missing or expired session; reports service failures.
 *     responses:
 *       204:
 *         description: Signed out
 */
router.post(`/signout`, async (req, res) => {
  try {
    const r = await fetch(`${config.server_url.auth_server}/signout`, {
      method: "POST",
      headers: authHeaders(req.headers.cookie),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      return res.status(r.status === 403 || r.status >= 500 ? 502 : r.status).json({
        message: "Could not end the session.",
      });
    }
    forwardSetCookies(r, res);
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return res.sendStatus(204);
  } catch (err) {
    console.error("Sign-out request failed:", err);
    return res.status(502).json({ message: "Authentication server unreachable." });
  }
});
export default router;