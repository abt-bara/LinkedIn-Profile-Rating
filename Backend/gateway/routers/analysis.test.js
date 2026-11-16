import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import createAnalysisRouter from "./analysis.js";

const scores = {
  completeness: 82,
  content_quality: 68,
  keyword_and_role_relevance: 75,
  career_trajectory: 70,
  skills_depth: 80,
  social_proof: 64,
  network: 55,
  activity: 72,
};

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}

function origin(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}

test("analysis routes authenticate, persist scores, and return text/history", async () => {
  const observed = { cookie: null, dbHeaders: null, dbBody: null, aiBody: "" };

  const authApp = express();
  authApp.get("/api/me", (req, res) => {
    observed.cookie = req.get("cookie");
    res.json({ id: "user-1", role: "USER" });
  });

  const dbApp = express();
  dbApp.use(express.json());
  dbApp.get("/internal/v1/analyses", (req, res) => {
    observed.dbHeaders = req.headers;
    assert.equal(req.query.limit, "10");
    res.json([
      {
        id: "analysis-1",
        user_id: "user-1",
        created_at: "2026-11-16T08:30:00Z",
        ...scores,
      },
    ]);
  });
  dbApp.post("/internal/v1/analyses", (req, res) => {
    observed.dbHeaders = req.headers;
    observed.dbBody = req.body;
    res.status(201).json({ id: "analysis-2" });
  });

  const aiApp = express();
  aiApp.post("/api/analyze", async (req, res) => {
    for await (const chunk of req) observed.aiBody += chunk.toString();
    res.json({
      analysis_result: "Profile analysis feedback.",
      ...scores,
    });
  });

  const authServer = await listen(authApp);
  const dbServer = await listen(dbApp);
  const aiServer = await listen(aiApp);
  const gatewayApp = express();
  gatewayApp.use(express.json());
  gatewayApp.use(
    "/api",
    createAnalysisRouter({
      authServerUrl: origin(authServer),
      dbServerUrl: origin(dbServer),
      aiServerUrl: origin(aiServer),
    }),
  );
  const gatewayServer = await listen(gatewayApp);
  const previousToken = process.env.DB_SERVICE_TOKEN;
  process.env.DB_SERVICE_TOKEN = "test-service-token";

  try {
    const historyResponse = await fetch(`${origin(gatewayServer)}/api/analyses?limit=10`, {
      headers: { cookie: "session=test-session" },
    });
    assert.equal(historyResponse.status, 200);
    assert.equal(observed.cookie, "session=test-session");
    assert.equal(observed.dbHeaders.authorization, "Bearer test-service-token");
    assert.equal(observed.dbHeaders["x-actor-id"], "user-1");
    assert.equal(observed.dbHeaders["x-actor-role"], "USER");
    assert.equal((await historyResponse.json()).length, 1);

    const invalidLimitResponse = await fetch(`${origin(gatewayServer)}/api/analyses?limit=11`, {
      headers: { cookie: "session=test-session" },
    });
    assert.equal(invalidLimitResponse.status, 400);

    const form = new FormData();
    form.append("file", new Blob(["profile pdf"]), "profile.pdf");
    const analyzeResponse = await fetch(`${origin(gatewayServer)}/api/analyze`, {
      method: "POST",
      headers: { cookie: "session=test-session" },
      body: form,
    });
    assert.equal(analyzeResponse.status, 200);
    assert.match(analyzeResponse.headers.get("content-type"), /^text\/plain/);
    assert.equal(await analyzeResponse.text(), "Profile analysis feedback.");
    assert.match(observed.aiBody, /name="file"/);
    assert.equal(observed.dbHeaders["x-actor-id"], "user-1");
    assert.equal(observed.dbBody.analysis.analysis_result, "Profile analysis feedback.");
    assert.equal(observed.dbBody.analysis.completeness, 82);
  } finally {
    if (typeof previousToken === "undefined") delete process.env.DB_SERVICE_TOKEN;
    else process.env.DB_SERVICE_TOKEN = previousToken;
    await Promise.all([close(gatewayServer), close(aiServer), close(dbServer), close(authServer)]);
  }
});
