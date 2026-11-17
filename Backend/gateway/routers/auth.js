import { Router } from "express";
import config from "../../shared/config/config.json" with { type: "json" };
import { authorize } from "../services/authenticateUser.js";
const router = Router();
const BasePath = config.uris.gateway.base.replace(/^\/+/, "");

/**
 * @openapi
 * /api/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get the authenticated user
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: The current user (id, name, given_name, email, role)
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
router.get(`/${BasePath}/me`, async (req, res) => {
  try {
    const r = await fetch(`${config.server_url.auth_server}/me`, {
      headers: { cookie: req.headers.cookie ?? "" }, // forward the browser's cookie by hand
      redirect: "manual", // a redirect to /auth must not be mistaken for success
      signal: AbortSignal.timeout(3000),
    });

    if (r.status === 403) return res.status(403).json({ error: "Forbidden" });
    if (!r.ok) return res.status(401).json({ error: "Unauthorized" });

    res.status(200).json(await r.json());
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(502).json({ error: "Authentication server unreachable" });
  }
});

/**
 * @openapi
 * /api/signout:
 *   post:
 *     tags: [Authentication]
 *     summary: End the session
 *     description: Idempotent. Always clears the cookie, even if it was missing or expired.
 *     responses:
 *       204:
 *         description: Signed out
 */
router.post(`/${BasePath}/signout`, async (req, res) => {
  
  try {
    await fetch(`${config.server_url.auth_server}/signout`, {
      method: "POST",
      headers: { cookie: req.headers.cookie ?? "" },
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    // Still clear the browser's cookie; the server-side session will expire on its own.
    console.error("signout upstream failed:", err);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.sendStatus(204);
});
export default router;