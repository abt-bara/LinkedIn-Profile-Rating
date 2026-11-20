import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "../shared/config/config.json" with { type: "json" };
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import linkedInRouter from "./routers/linkedIn.js";
import AuthRouter from "./routers/auth.js";
import AnalysisRouter from "./routers/analysis.js";

// ---- Config: validate once, fail early with a clear message ----
const PORT = config.server_port.gateway;
const ORIGIN = config.server_url.gateway;
// Ensure BasePath never starts with a slash to avoid double-slash bugs
const BasePath = config.uris.gateway.base.replace(/^\/+/, "");
const SESSION_COOKIE = "profile_rater_session";

if (!Number.isInteger(PORT)) {
  throw new Error(
    `config.server_port.gateway must be a number, got: ${JSON.stringify(PORT)}`,
  );
}
if (!process.env.AUTH_INTERNAL_TOKEN) {
  throw new Error("AUTH_INTERNAL_TOKEN must be configured.");
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
            properties: { message: { type: "string", example: "Unauthorized." } },
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

app.use(`/${BasePath}`, linkedInRouter); // /signup, /signin/callback, /check-token
app.use(`/${BasePath}`, AuthRouter); // /signin, /me, /signout
app.use(`/${BasePath}`, AnalysisRouter); // /analyze, /analyses?limit=:limit

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


// ---- Start ----
const server = app.listen(PORT, () => {
  console.log(`gateway listening on ${ORIGIN} (docs: ${ORIGIN}/api-docs)`);
});

server.on("error", (err) => {
  console.error("listen failed:", err);
  process.exit(1);
});
