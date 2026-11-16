import { Router } from "express";
import config from "../config/config.json" with { type: "json" };

const router = Router();

/**
 * @openapi
 * /api/authflow:
 *   get:
 *     tags:
 *       - LinkedIn Authentication
 *     summary: Get LinkedIn authentication flow configuration
 *     description: Retrieves the LinkedIn OAuth configuration from the LinkedIn authentication server.
 *     operationId: getLinkedInAuthFlow
 *     responses:
 *       200:
 *         description: Authentication flow configuration retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response_type:
 *                   type: string
 *                   example: code
 *                 client_id:
 *                   type: string
 *                   example: your-linkedin-client-id
 *                 redirect_uri:
 *                   type: string
 *                   example: https://example.com/callback
 *                 state:
 *                   type: string
 *                   example: random-state-value
 *                 scope:
 *                   type: string
 *                   example: openid profile email
 *       502:
 *         description: LinkedIn authentication server failed or is unreachable.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: linkedin auth server unreachable
 */
router.get("/authflow", async (req, res) => {
  try {
    const r = await fetch(
      `${config.server_url.linkedin_auth_server}/authflow`,
      {
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!r.ok) {
      return res.status(502).json({
        error: "linkedin auth server failed",
      });
    }

    const { response_type, client_id, redirect_uri, state, scope } =
      await r.json();

    res.json({ response_type, client_id, redirect_uri, state, scope });
  } catch {
    res.status(502).json({
      error: "linkedin auth server unreachable",
    });
  }
});

/**
 * @openapi
 * /api/callback:
 *   post:
 *     tags:
 *       - LinkedIn Authentication
 *     summary: Handle LinkedIn OAuth callback
 *     description: Forwards the LinkedIn OAuth callback payload to the LinkedIn authentication server.
 *     operationId: handleLinkedInCallback
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *           example:
 *             code: authorization-code
 *             state: random-state-value
 *     responses:
 *       200:
 *         description: LinkedIn callback processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       500:
 *         description: LinkedIn authentication server returned an error.
 *       502:
 *         description: LinkedIn authentication server is unreachable.
 */
router.post("/callback", async (req, res) => {
  try {
    const response = await fetch(
      `${config.server_url.linkedin_auth_server}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body),
      },
    );

    if (!response.ok) {
      return res.status(500).json({
        error: "Internal server error, LinkedIn server failed",
      });
    }

    res.status(200).json(await response.json());
  } catch {
    res.status(502).json({
      error: "linkedin auth server unreachable",
    });
  }
});

/**
 * @openapi
 * /api/check-token:
 *   get:
 *     tags:
 *       - LinkedIn Authentication
 *     summary: Check and hydrate LinkedIn token
 *     description: Requests the LinkedIn authentication server to check and hydrate the authentication token.
 *     operationId: checkLinkedInToken
 *     responses:
 *       200:
 *         description: Token check completed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token hydrated
 *       500:
 *         description: LinkedIn authentication server returned an error.
 *       502:
 *         description: LinkedIn authentication server is unreachable.
 */
router.get("/check-token", async (req, res) => {
  try {
    const response = await fetch(
      `${config.server_url.linkedin_auth_server}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return res.status(500).json({
        error: "Internal server error, LinkedIn server failed",
      });
    }

    res
      .status(response.status)
      .json(response.status === 201 ? { message: "Token hydrated" } : {});
  } catch {
    res.status(502).json({
      error: "linkedin auth server unreachable",
    });
  }
});

export default router;