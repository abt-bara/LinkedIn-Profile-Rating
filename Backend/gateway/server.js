import express from "express";
import cors from "cors";
import config from "./config/config.json" with { type: "json" };
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import createAnalysisRouter from "./routers/analysis.js";

import linkedInRouter from "./routers/linkedIn.js";
// ---- Config: validate once, fail early with a clear message ----
const PORT = config.server_port.gateway;
const ORIGIN = config.server_url.gateway;
// Ensure BasePath never starts with a slash to avoid double-slash bugs
const BasePath = config.uris.gateway.base.replace(/^\/+/, "");

if (!Number.isInteger(PORT)) {
  throw new Error(
    `config.server_port.gateway must be a number, got: ${JSON.stringify(PORT)}`,
  );
}

const app = express();
app.use(express.json());

// ---- CORS ----
app.use(
  cors({
    origin: [
      config.server_url.frontend,
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  }),
);

// ---- Swagger ----
if (process.env.NODE_ENV !== "production") {
  const specs = swaggerJsdoc({
    definition: {
      openapi: "3.1.0",
      info: {
        title: "Profile Rater Gateway",
        version: "0.1.0",
        description: "Single entry point for the Profile Rater frontend.",
      },
      servers: [{ url: ORIGIN }],
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: "user_id" },
        },
      },
    },
    apis: ["./server.js", "./routers/*.js"],
  });

  app.get("/api-docs.json", (req, res) => res.json(specs));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
}

// ---- Routes ----
app.get("/", (req, res) => res.redirect("/api-docs"));
/**
 * @openapi
 * /api:
 *   get:
 *     summary: Get LinkedIn auth flow configuration
 *     responses:
 *       200:
 *         description: Auth flow configuration retrieved successfully
 *       502:
 *         description: LinkedIn auth server unreachable
 */
app.use(`/${BasePath}`, linkedInRouter);
/**
 * @openapi
 * /api/me:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get authenticated user information
 *     description: Retrieves the authenticated user's information from the authentication server using the session cookie.
 *     operationId: getCurrentUser
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       401:
 *         description: User is not authenticated or the session is invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: User is not authorized to access this resource.
 *       502:
 *         description: Authentication server is unreachable.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get(`/${BasePath}/me`, async (req, res) => {
  try {
    const r = await fetch(`${config.server_url.auth_server}/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${req.cookies.user_id}` },
      body: { action: req.json?.action },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: "Unauthorized" });
    }

    res.status(200);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(502).json({ error: "Authentication server unreachable" });
  }
});

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Gateway health check
 *     responses:
 *       200:
 *         description: Gateway is running
 */
app.get(`/${BasePath}/health`, (req, res) => {
  res.status(200).json({ Health: "server is running" });
});

app.use(
  `/${BasePath}`,
  createAnalysisRouter({
    authServerUrl: config.server_url.auth_server,
    dbServerUrl: config.server_url.db_server,
    aiServerUrl: config.server_url.ai_server,
  }),
);

// ---- Start ----
const server = app.listen(PORT, () => {
  console.log(`gateway listening on ${ORIGIN} (docs: ${ORIGIN}/api-docs)`);
});

server.on("error", (err) => {
  console.error("listen failed:", err);
  process.exit(1);
});
