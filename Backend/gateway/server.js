import express from "express";
import cors from "cors";
import config from "./config/config.json" with { type: "json" };
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import createAnalysisRouter from "./routers/analysis.js";

// ---- Config: validate once, fail early with a clear message ----
const PORT = config.server_port.gateway; // must be a number, for listen()
const ORIGIN = config.server_url.gateway; // full URL, for Swagger "servers"
const BasePath = config.uris.gateway.base;

if (!Number.isInteger(PORT)) {
  throw new Error(
    `config.server_port.gateway must be a number, got: ${JSON.stringify(PORT)}`,
  );
}

const app = express();
app.use(express.json());

// ---- CORS: the browser origins allowed to call the gateway ----
app.use(
  cors({
    origin: [
      config.server_url.frontend, // http://localhost:4173
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true, // required so the session cookie is accepted
  }),
);

// ---- Swagger (disabled in production) ----
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
          sessionCookie: { type: "apiKey", in: "cookie", name: "user_id" }, // adjust to your cookie name
        },
      },
    },
    apis: ["./server.js", "./routers/*.js"], // files containing @openapi comments
  });

  app.get("/api-docs.json", (req, res) => res.json(specs));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
}

// ---- Routes ----
app.get("/", (req, res) => res.redirect("/api-docs"));

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

// Works on Express 4 and 5: listen failures arrive as an 'error' event
server.on("error", (err) => {
  console.error("listen failed:", err);
  process.exit(1);
});