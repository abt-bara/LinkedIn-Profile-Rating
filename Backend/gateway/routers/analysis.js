import { Router } from "express";
import config from "../../shared/config/config.json" with { type: "json" };
import { authorize } from "../services/authenticateUser.js";
import { ACTIONS } from "../../shared/data/actions.js";
const router = Router();
const BasePath = config.uris.gateway.base.replace(/^\/+/, "");

/**
 * @openapi
 * /api/analyze:
 *   post:
 *     summary: Analyze data
 *     description: Forwards an analysis request to the internal AI server. Requires authorization.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Successful analysis response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Forbidden
 */
router.post(
  `/analyze`,
  authorize(ACTIONS.analysisCreate),
  async (req, res) => {
    const r = await fetch(`${config.server_url.ai_server}/analyze`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    });
    if (r.status === 403) return res.status(403).json({ error: "Forbidden" });
    if (!r.ok) return res.status(401).json({ error: "Unauthorized" });
    res.status(200).json(await r.json());
  },
);

/**
 * @openapi
 * /api/analyses:
 *   get:
 *     summary: List analyses
 *     description: Retrieves a list of analyses for the authenticated user.
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Maximum number of analyses to return.
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: A list of analyses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 additionalProperties: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       404:
 *         description: Not Found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Not Found
 */
router.get(
  `/analyses`,
  authorize(ACTIONS.analysisList),
  async (req, res) => {
    const me = await fetch(`${config.server_url.auth_server}/me`, {
      headers: { cookie: req.headers.cookie ?? "" },
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    if (!me.ok) return res.status(401).json({ error: "Unauthorized" });
    const user_data = await me.json();

    // Use req.query.limit instead of req.params.limit
    const limit = req.query.limit;

    // Build the target URL properly with query params (or pass body if your db server expects it, 
    // but note that standard GET requests typically shouldn't have a body).
    const targetUrl = new URL(`${config.server_url.db_server}/analyses`);
    targetUrl.searchParams.append('userId', user_data.id);
    if (limit) targetUrl.searchParams.append('limit', limit);

    const r = await fetch(targetUrl, {
      method: "GET",
      headers: { cookie: req.headers.cookie ?? "" },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return res.status(404).json({ error: "Not Found" });

    res.status(200).json(await r.json());
  },
);
export default router;