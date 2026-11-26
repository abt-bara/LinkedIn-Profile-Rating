import assert from "node:assert/strict";
import cookieParser from "cookie-parser";
import express from "express";
import test from "node:test";
import linkedInRouter from "../routers/linkedIn.js";

test("callback logs safe state and upstream failure reasons", async (t) => {
  const previousToken = process.env.AUTH_INTERNAL_TOKEN;
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  const previousError = console.error;
  const logs = [];
  const privateCode = "must-not-appear-in-logs";
  const state = "state-value-long-enough";
  let callbackStatus = 502;

  process.env.AUTH_INTERNAL_TOKEN = "test-internal-token";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/callback")) {
      return callbackStatus === 400
        ? Response.json(
            {
              message:
                "LinkedIn sign-up requires a verified email address and profile name.",
            },
            { status: callbackStatus },
          )
        : new Response(null, { status: callbackStatus });
    }
    if (url.includes("/signup/")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url}`);
  };
  console.warn = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);

  const app = express();
  app.use(cookieParser());
  app.use("/api", linkedInRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
    console.error = previousError;
    if (previousToken === undefined) delete process.env.AUTH_INTERNAL_TOKEN;
    else process.env.AUTH_INTERNAL_TOKEN = previousToken;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/signin/callback`;
  const missingCookie = await previousFetch(
    `${baseUrl}?code=${privateCode}&state=${state}`,
    { redirect: "manual" },
  );
  assert.equal(missingCookie.status, 302);
  assert.equal(missingCookie.headers.get("location"), "/auth?error=login_failed");

  const rejectedUpstream = await previousFetch(
    `${baseUrl}?code=${privateCode}&state=${state}`,
    {
      headers: { cookie: `oauth_state=${state}` },
      redirect: "manual",
    },
  );
  assert.equal(rejectedUpstream.status, 302);
  assert.equal(rejectedUpstream.headers.get("location"), "/auth?error=login_failed");

  callbackStatus = 400;
  const unavailableProfile = await previousFetch(
    `${baseUrl}?code=${privateCode}&state=${state}`,
    {
      headers: { cookie: `oauth_state=${state}` },
      redirect: "manual",
    },
  );
  assert.equal(unavailableProfile.status, 302);
  assert.equal(
    unavailableProfile.headers.get("location"),
    "/auth?error=verified_email_required",
  );
  assert.deepEqual(logs, [
    ["LinkedIn callback state validation failed.", { reason: "missing_state_cookie" }],
    [
      "LinkedIn callback identity verification failed.",
      { status: 502, reason: "service_rejected" },
    ],
    [
      "LinkedIn callback identity verification failed.",
      { status: 400, reason: "verified_profile_unavailable" },
    ],
  ]);
  assert.equal(JSON.stringify(logs).includes(privateCode), false);
  assert.equal(JSON.stringify(logs).includes(state), false);
});
