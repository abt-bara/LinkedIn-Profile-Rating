import assert from "node:assert/strict";
import test from "node:test";
import { createLinkedInAuthApp } from "../server.js";

test("LinkedIn routes require the gateway token", async (t) => {
  const previousToken = process.env.AUTH_INTERNAL_TOKEN;
  process.env.AUTH_INTERNAL_TOKEN = "test-internal-token";
  const app = createLinkedInAuthApp({
    getAuthorizationParameters: () => ({ state: "generated-state" }),
    completeAuthorization: async () => ({ sub: "linkedin-sub" }),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (previousToken === undefined) delete process.env.AUTH_INTERNAL_TOKEN;
    else process.env.AUTH_INTERNAL_TOKEN = previousToken;
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const unauthorized = await fetch(`${baseUrl}/authflow`);
  assert.equal(unauthorized.status, 403);

  const authorized = await fetch(`${baseUrl}/authflow`, {
    headers: { authorization: "Bearer test-internal-token" },
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { state: "generated-state" });

  const callback = await fetch(`${baseUrl}/callback`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-internal-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: "authorization-code", state: "state-value" }),
  });
  assert.equal(callback.status, 200);
  assert.deepEqual(await callback.json(), { sub: "linkedin-sub" });
});
