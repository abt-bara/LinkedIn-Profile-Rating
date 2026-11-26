import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import express from "express";
import config from "../shared/config/config.json" with { type: "json" };
import { createLinkedInAuthService } from "./services/linkedinAuthService.js";

const PORT = config.server_port.linkedin_auth_server;
const ORIGIN = config.server_url.linkedin_auth_server;

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
  return next();
}

function sendServiceError(res, error) {
  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 502;
  if (status >= 500) console.error("LinkedIn auth request failed:", error.message);
  return res.status(status).json({
    message:
      status >= 500 ? "LinkedIn sign-up is unavailable." : error.message,
  });
}

export function createLinkedInAuthApp(service) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.get("/authflow", requireGateway, (_req, res) => {
    try {
      return res.status(200).json(service.getAuthorizationParameters());
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.post("/callback", requireGateway, async (req, res) => {
    try {
      const identity = await service.completeAuthorization(req.body ?? {});
      return res.status(200).json(identity);
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  return app;
}

function startServer() {
  if (!process.env.AUTH_INTERNAL_TOKEN) {
    throw new Error("AUTH_INTERNAL_TOKEN must be configured.");
  }
  const service = createLinkedInAuthService({
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI,
  });
  const server = createLinkedInAuthApp(service).listen(PORT, () => {
    console.log(`LinkedIn auth server listening on ${ORIGIN}`);
  });
  server.on("error", (error) => {
    console.error("LinkedIn auth server listen failed:", error);
    process.exit(1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
