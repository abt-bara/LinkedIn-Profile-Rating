import { Router } from "express";
import multer from "multer";
import config from "../../shared/config/config.json" with { type: "json" };
import { authorize } from "../services/authenticateUser.js";
import { ACTIONS } from "../../shared/data/actions.js";

const router = Router();

// ---------- helpers ----------

class UpstreamError extends Error {
  constructor(service, status, message) {
    super(message);
    this.service = service;
    this.status = status;
  }
}

async function callService(service, url, options = {}, timeoutMs = 20_000) {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    console.error(
      `${service} call failed:`,
      err.name,
      err.cause?.code ?? err.message,
    );
    const status = err.name === "TimeoutError" ? 504 : 503;
    throw new UpstreamError(service, status, `${service} service unavailable.`);
  }
}

async function readJson(service, response) {
  try {
    return await response.json();
  } catch {
    throw new UpstreamError(
      service,
      502,
      `${service} service returned an invalid response.`,
    );
  }
}

function sendError(res, err, label) {
  if (err instanceof UpstreamError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(`${label} failed:`, err);
  return res.status(500).json({ message: "Internal server error." });
}

const internalHeaders = (cookie) => ({
  cookie,
  Authorization: `Bearer ${process.env.AUTH_INTERNAL_TOKEN}`,
});

// ---------- upload ----------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("file"); // must match formData.append('file', file)

function parseUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "File is too large (max 5 MB)." });
    }
    return res.status(400).json({ message: "Invalid upload." });
  });
}

// ---------- POST /analyze ----------

/**
 * @openapi
 * /api/analyze:
 *   post:
 *     summary: Analyze a profile file
 *     description: Forwards the uploaded file to the AI server, saves the result, and returns the analysis text.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Analysis text
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       400: { description: Missing or invalid file }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       413: { description: File too large }
 *       502: { description: Upstream service returned an invalid response }
 *       503: { description: Upstream service unreachable }
 *       504: { description: Upstream service timed out }
 */
router.post(
  "/analyze",
  authorize(ACTIONS.analysisCreate),
  parseUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "A file is required." });
      }

      // 1. Forward the file. No content-type header: fetch adds the multipart boundary.
    

      const form = new FormData();
      form.append(
        "file",
        new Blob([req.file.buffer], { type: req.file.mimetype }),
        req.file.originalname,
      );

      const aiRes = await callService(
        "analysis",
        `${config.server_url.ai_server}/analyze`,
        { method: "POST", body: form },
        20_000,
      );
      if ([400, 415, 422].includes(aiRes.status)) {
        return res
          .status(400)
          .json({ message: "The file could not be analyzed." });
      }
      if (!aiRes.ok) {
        console.error("analysis service status:", aiRes.status);
        throw new UpstreamError("analysis", 502, "Analysis service failed.");
      }

      const data = await readJson("analysis", aiRes);
      console.log(data);


      // 2. userId comes from the session (req.user) and goes last, so nobody can override it.
      const record = { ...data, user_id: Number(req.user.userId) }; // 3. Save
      const dbRes = await callService(
        "db",
        `${config.server_url.db_server}/analyses`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...internalHeaders(req.headers.cookie ?? ""),
          },
          body: JSON.stringify(record),
        },
      );
      if (!dbRes.ok) {
        console.error("db service status:", dbRes.status);
        throw new UpstreamError("db", 502, "Could not save the analysis.");
      }

      // Plain text, because the frontend uses responseType: 'text'
      return res.status(200).type("text/plain").send(record.analysis_result);
    } catch (err) {
      return sendError(res, err, "analyze");
    }
  },
);

// ---------- GET /analyses ----------

/**
 * @openapi
 * /api/analyses:
 *   get:
 *     summary: List the signed-in user's analyses
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *     responses:
 *       200:
 *         description: List of analyses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 additionalProperties: true
 *       400: { description: Invalid limit }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       502: { description: Upstream service returned an invalid response }
 *       503: { description: Upstream service unreachable }
 *       504: { description: Upstream service timed out }
 */
router.get("/analyses", authorize(ACTIONS.analysisList), async (req, res) => {
  try {
    // Same bounds as the frontend's getAnalyses (1 to 10); default 10
    let limit = 10;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
        return res
          .status(400)
          .json({ message: "limit must be an integer from 1 to 10." });
      }
    }

    // The id comes from the session; the client can never choose whose analyses to read.
    const targetUrl = new URL(`${config.server_url.db_server}/analyses`);
    targetUrl.searchParams.set("user_id", req.user.userId);
    targetUrl.searchParams.set("limit", String(limit));
    targetUrl.searchParams.set("order", "desc");

    const dbRes = await callService(
      "db",
      targetUrl,
      {
        method: "GET",
        headers: internalHeaders(req.headers.cookie ?? ""),
      },
      20_000,
    );
    if (!dbRes.ok) {
      console.error("db service status:", dbRes.status);
      throw new UpstreamError("db", 502, "Could not load analyses.");
    }

    const rows = await readJson("db", dbRes);
    if (!Array.isArray(rows)) {
      throw new UpstreamError(
        "db",
        502,
        "db service returned an invalid response.",
      );
    }
    return res.status(200).json(rows);
  } catch (err) {
    return sendError(res, err, "analyses");
  }
});

export default router;
