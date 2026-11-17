import express from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import cookie from "cookie";
import config from "../shared/config/config.json" with { type: "json" };
import { getUser } from "./services/getUser.js";

const app = express();
const ORIGIN = config.server_url.auth_server;
const PORT = config.server_port.auth_server;

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

/**
 * @openapi
 * /me:
 *   get:
 *     summary: Get the currently authenticated user
 *     description: Reads the auth cookies from the request and resolves the user profile.
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Current authenticated user
 *       401:
 *         description: Unauthorized
 */
app.get("/me", async (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  try {
    const user = await getUser(cookies);

    if (user.id === 0) {
      return res.status(401).json({ message: "unexistant" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("Failed to get current user:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const server = app.listen(PORT, () => {
  console.log(`auth server listening on ${ORIGIN} (docs: ${ORIGIN}/api-docs)`);
});

server.on("error", (err) => {
  console.error("listen failed:", err);
  process.exit(1);
});
