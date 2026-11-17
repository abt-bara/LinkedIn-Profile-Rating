import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
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
const SESSION_COOKIE = "user_id";

if (!Number.isInteger(PORT)) {
  throw new Error(
    `config.server_port.gateway must be a number, got: ${JSON.stringify(PORT)}`,
  );
}

const app = express();
app.use(express.json());
app.use(cookieParser()); // fills req.cookies (needed for the oauth_state check)

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
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: SESSION_COOKIE,
            description:
              "Set by the server after sign-in and sent by the browser automatically. The Authorize box cannot set it.",
          },
        },
        schemas: {
          Error: {
            type: "object",
            properties: { error: { type: "string", example: "Unauthorized" } },
          },
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

app.use(`/${BasePath}`, linkedInRouter); // /signin, /signin/callback, /check-token

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
app.get(`/${BasePath}/me`, async (req, res) => {
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
app.post(`/${BasePath}/signout`, async (req, res) => {
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