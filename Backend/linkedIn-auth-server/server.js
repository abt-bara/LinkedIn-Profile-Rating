import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import express from "express";
import swaggerUi from "swagger-ui-express";
import config from "../shared/config/config.json" with { type: "json" };
import { createLinkedInAuthService } from "./services/linkedinAuthService.js";

const PORT = config.server_port.linkedin_auth_server;
const ORIGIN = config.server_url.linkedin_auth_server;

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "LinkedIn Authentication Service",
    version: "1.0.0",
    description:
      "Private gateway-facing API for initiating and verifying one-time LinkedIn OIDC sign-up.",
  },
  servers: [{ url: ORIGIN }],
  tags: [
    { name: "Health", description: "Service health" },
    { name: "LinkedIn OIDC", description: "Private gateway-to-service routes" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check service health",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: { status: { type: "string", const: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/authflow": {
      get: {
        tags: ["LinkedIn OIDC"],
        summary: "Create LinkedIn authorization parameters",
        description:
          "Private gateway route. Returns the configured client ID, callback URI, OIDC scopes, and a fresh state. The gateway stores the state and binds it to the browser.",
        operationId: "getAuthorizationParameters",
        security: [{ gatewayBearer: [] }],
        responses: {
          "200": {
            description: "Authorization parameters ready",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthorizationParameters" },
              },
            },
          },
          "403": {
            description: "Gateway bearer token is invalid",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "503": {
            description: "Gateway token or LinkedIn client configuration is missing",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/callback": {
      post: {
        tags: ["LinkedIn OIDC"],
        summary: "Exchange authorization code and verify LinkedIn identity",
        description:
          "Private gateway route. Do not invoke this operation manually in Swagger: authorization codes are single-use, and this endpoint does not finish user persistence or create a session. The browser callback must go through the gateway, which validates browser-bound state before forwarding the code. The service exchanges the code server-to-server and returns verified OIDC identity claims; provider tokens are never returned.",
        operationId: "verifyLinkedInCallback",
        security: [{ gatewayBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CallbackRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Verified LinkedIn identity",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifiedIdentity" },
              },
            },
          },
          "400": {
            description: "Invalid callback data or missing verified profile claims",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "403": {
            description: "Gateway bearer token is invalid",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "502": {
            description: "LinkedIn token exchange or ID-token verification failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "503": {
            description: "Gateway token or LinkedIn client configuration is missing",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      gatewayBearer: {
        type: "http",
        scheme: "bearer",
        description: "Shared AUTH_INTERNAL_TOKEN; gateway-to-service only.",
      },
    },
    schemas: {
      AuthorizationParameters: {
        type: "object",
        required: ["response_type", "client_id", "redirect_uri", "state", "scope"],
        properties: {
          response_type: { type: "string", const: "code" },
          client_id: { type: "string" },
          redirect_uri: { type: "string", format: "uri" },
          state: { type: "string", minLength: 16, maxLength: 512 },
          scope: { type: "string", const: "openid profile email" },
        },
      },
      CallbackRequest: {
        type: "object",
        required: ["code", "state"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 4096 },
          state: { type: "string", minLength: 16, maxLength: 512 },
        },
        additionalProperties: false,
      },
      VerifiedIdentity: {
        type: "object",
        required: ["sub", "name", "email", "email_verified"],
        properties: {
          sub: { type: "string" },
          name: { type: "string" },
          given_name: { type: "string" },
          family_name: { type: "string" },
          picture: { type: "string", format: "uri" },
          email: { type: "string", format: "email" },
          email_verified: { type: "boolean", const: true },
          locale: { type: "string" },
        },
      },
      Error: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
    },
  },
};

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

  app.get("/", (_req, res) => res.redirect("/api-docs"));
  app.get("/api-docs.json", (_req, res) => res.json(openApiSpec));
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      swaggerOptions: { supportedSubmitMethods: ["get"] },
    }),
  );

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
