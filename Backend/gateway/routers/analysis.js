import { Router } from "express";

const HISTORY_LIMIT_MAX = 10;
const SCORE_FIELDS = [
  "completeness",
  "content_quality",
  "keyword_and_role_relevance",
  "career_trajectory",
  "skills_depth",
  "social_proof",
  "network",
  "activity",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export default function createAnalysisRouter({ authServerUrl, dbServerUrl, aiServerUrl }) {
  const router = Router();

  async function getAuthenticatedUser(req, res) {
    const cookie = req.get("cookie");
    if (!cookie) {
      res.status(401).json({ message: "Authentication required." });
      return null;
    }

    const sessionResponse = await fetch(new URL("/api/me", authServerUrl), {
      headers: { cookie },
      redirect: "manual",
    });
    if (!sessionResponse.ok) {
      const isUnauthenticated =
        sessionResponse.status === 401 ||
        (sessionResponse.status >= 300 && sessionResponse.status < 400);
      res.status(isUnauthenticated ? 401 : 502).json({
        message: isUnauthenticated
          ? "Authentication required."
          : "Could not validate the current session.",
      });
      return null;
    }

    const user = await readJson(sessionResponse);
    if (!isRecord(user) || typeof user.id !== "string" || typeof user.role !== "string") {
      throw new Error("Auth service returned an invalid session user.");
    }
    return user;
  }

  function getDbServiceToken(res) {
    const serviceToken = process.env.DB_SERVICE_TOKEN;
    if (!serviceToken) {
      console.error("DB_SERVICE_TOKEN is not configured.");
      res.status(503).json({ message: "Analysis storage is not configured." });
      return null;
    }
    return serviceToken;
  }

  router.get("/analyses", async (req, res) => {
    const rawLimit = req.query.limit ?? String(HISTORY_LIMIT_MAX);
    const limit = typeof rawLimit === "string" ? Number(rawLimit) : NaN;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > HISTORY_LIMIT_MAX) {
      return res.status(400).json({
        message: `limit must be an integer between 1 and ${HISTORY_LIMIT_MAX}.`,
      });
    }

    try {
      const user = await getAuthenticatedUser(req, res);
      if (!user) return;

      const serviceToken = getDbServiceToken(res);
      if (!serviceToken) return;
      const analysesUrl = new URL("/internal/v1/analyses", dbServerUrl);
      analysesUrl.searchParams.set("limit", String(limit));

      const analysesResponse = await fetch(analysesUrl, {
        headers: {
          authorization: `Bearer ${serviceToken}`,
          "x-actor-id": user.id,
          "x-actor-role": user.role,
        },
      });
      const body = await readJson(analysesResponse);

      if (!analysesResponse.ok) {
        console.error(`DB service returned ${analysesResponse.status} for analysis history.`);
        return res.status(502).json({ message: "Could not load analysis history." });
      }
      if (!Array.isArray(body)) {
        console.error("DB service returned an invalid analysis history response.");
        return res.status(502).json({ message: "Could not load analysis history." });
      }

      return res.status(200).json(body);
    } catch (error) {
      console.error("Analysis history request failed:", error);
      return res.status(502).json({ message: "Could not load analysis history." });
    }
  });

  router.post("/analyze", async (req, res) => {
    const contentType = req.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return res.status(415).json({ message: "Expected a multipart PDF upload." });
    }

    try {
      const user = await getAuthenticatedUser(req, res);
      if (!user) return;

      const serviceToken = getDbServiceToken(res);
      if (!serviceToken) return;

      const aiResponse = await fetch(new URL("/api/analyze", aiServerUrl), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": contentType,
        },
        body: req,
        duplex: "half",
      });

      if (!aiResponse.ok) {
        console.error(`AI service returned ${aiResponse.status} for profile analysis.`);
        return res.status(aiResponse.status >= 400 && aiResponse.status < 500 ? aiResponse.status : 502)
          .json({ message: "The profile could not be analyzed." });
      }

      const analysis = await readJson(aiResponse);
      if (
        !isRecord(analysis) ||
        typeof analysis.analysis_result !== "string" ||
        !analysis.analysis_result.trim() ||
        SCORE_FIELDS.some((field) => {
          const score = analysis[field];
          return typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100;
        })
      ) {
        console.error("AI service returned an invalid analysis response.");
        return res.status(502).json({ message: "The analysis service returned invalid results." });
      }

      const analysisRecord = { analysis_result: analysis.analysis_result };
      for (const field of SCORE_FIELDS) analysisRecord[field] = analysis[field];

      const dbResponse = await fetch(new URL("/internal/v1/analyses", dbServerUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceToken}`,
          "content-type": "application/json",
          "x-actor-id": user.id,
          "x-actor-role": user.role,
        },
        body: JSON.stringify({ analysis: analysisRecord }),
      });
      if (!dbResponse.ok) {
        console.error(`DB service returned ${dbResponse.status} while saving an analysis.`);
        return res.status(502).json({ message: "The analysis could not be saved." });
      }

      return res.status(200).type("text/plain").send(analysis.analysis_result);
    } catch (error) {
      console.error("Profile analysis request failed:", error);
      return res.status(502).json({ message: "The profile could not be analyzed." });
    }
  });

  return router;
}