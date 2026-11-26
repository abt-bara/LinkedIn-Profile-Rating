import express from "express";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { timingSafeEqual } from "node:crypto";
import config from "../shared/config/config.json" with { type: "json" };
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createAuthService,
} from "./services/authService.js";
import { redis, connectRedis } from "./services/redisClient.js";
import { createUserRepository } from "./services/userRepository.js";
import { ACTIONS, can } from "../shared/data/actions.js";

const app = express();
const ORIGIN = config.server_url.auth_server;
const PORT = config.server_port.auth_server;
if (!process.env.AUTH_INTERNAL_TOKEN) {
  throw new Error("AUTH_INTERNAL_TOKEN must be configured.");
}
const authService = createAuthService({
  redis,
  userRepository: createUserRepository(),
});
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Auth Server API",
      version: "1.0.0",
    },
    servers: [{ url: ORIGIN }],
  },
  apis: ["./server.js"],
});

app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

function requireGateway(req, res, next) {
  const expected = process.env.AUTH_INTERNAL_TOKEN;
  const provided = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected) {
    return res.status(503).json({ message: "Auth internal token is not configured." });
  }
  if (
    !provided ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return res.status(403).json({ message: "Gateway authentication failed." });
  }
  next();
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

function sendAuthError(res, error) {
  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;
  if (status >= 500) console.error("Authentication request failed:", error);
  return res.status(status).json({
    message:
      status >= 500
        ? "Authentication service unavailable."
        : error instanceof Error
          ? error.message
          : "Authentication request failed.",
  });
}

/**
 * @openapi
 * /me:
 *   get:
 *     summary: Check the current session
 *     description: Checks the Redis session and revalidates the account every 24 hours.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current display name and minimal role
 *       401:
 *         description: Unauthorized
 */
app.get("/me", requireGateway, async (req, res) => {
  try {
    
    const session = await authService.checkToken(req.cookies[SESSION_COOKIE]);

    if (!session) return res.status(401).json({ message: "Unauthorized." });
    return res
      .status(200)
      .json({ displayName: session.displayName, role: session.role });
  } catch (error) {
    return sendAuthError(res, error);
  }
});

/**
 * @openapi
 * /signin:
 *   post:
 *     summary: Verify local credentials and issue a session
 *     tags: [Auth]
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
 */
app.post("/signin", requireGateway, async (req, res) => {
  try {
    const token = await authService.signIn({
      ...(req.body ?? {}),
      currentToken: req.cookies[SESSION_COOKIE],
    });
    setSessionCookie(res, token);
    return res.sendStatus(204);
  } catch (error) {
    return sendAuthError(res, error);
  }
});

app.post("/signup", requireGateway, async (req, res) => {
  try {
    await authService.startSignup(req.body ?? {});
    return res.sendStatus(204);
  } catch (error) {
    return sendAuthError(res, error);
  }
});

app.post("/signup/complete", requireGateway, async (req, res) => {
  try {
    const token = await authService.completeSignup(req.body ?? {});
    setSessionCookie(res, token);
    return res.sendStatus(204);
  } catch (error) {
    return sendAuthError(res, error);
  }
});

app.delete("/signup/:state", requireGateway, async (req, res) => {
  try {
    await authService.cancelSignup(req.params.state);
    return res.sendStatus(204);
  } catch (error) {
    return sendAuthError(res, error);
  }
});

/**
 * @openapi
 * /signout:
 *   post:
 *     summary: Revoke the current session
 *     tags: [Auth]
 *     responses:
 *       204:
 *         description: Session revoked and cookie cleared
 *       503:
 *         description: Session store unavailable
 */
app.post("/signout", requireGateway, async (req, res) => {
  try {
    await authService.signOut(req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return res.sendStatus(204);
  } catch (error) {
    return sendAuthError(res, error);
  }
});

/**
 * @openapi
 * /authorize:
 *   post:
 *     summary: Validate a session for gateway authorization
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Authenticated user ID and role
 *       401:
 *         description: No valid session
 */

const KNOWN_ACTIONS = new Set(Object.values(ACTIONS));

app.post("/authorize", requireGateway, async (req, res) => {
  try {
    const session = await authService.checkToken(req.cookies?.[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ message: "Unauthorized." });

    const { action, targetUserId } = req.body ?? {};
    if (typeof action !== "string" || !KNOWN_ACTIONS.has(action)) {
      return res.status(400).json({ message: "Unknown action." });
    }

    if (!can(session.role, action)) {
      return res.status(403).json({ message: "Forbidden." });
    }

    // Acting on another user's data: only the owner or an admin
    if (
      targetUserId !== undefined &&
      targetUserId !== session.userId &&
      session.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden." });
    }

    return res.status(200).json({ userId: session.userId, role: session.role });
  } catch (error) {
    return sendAuthError(res, error);
  }
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

async function startServer() {
  await connectRedis();
  const server = app.listen(PORT, () => {
    console.log(`auth server listening on ${ORIGIN} (docs: ${ORIGIN}/api-docs)`);
  });

  server.on("error", (err) => {
    console.error("listen failed:", err);
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error("Failed to connect to Redis:", error);
  process.exit(1);
});
