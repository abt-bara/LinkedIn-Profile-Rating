import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createLinkedInAuthService } from "../services/linkedinAuthService.js";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";
const REDIRECT_URI = "https://profiles.example.com/api/signin/callback";
const NOW = 1_800_000_000_000;

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  use: "sig",
  alg: "RS256",
};

function makeIdToken(claimOverrides = {}, signingKey = privateKey) {
  const nowSeconds = Math.floor(NOW / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: "https://www.linkedin.com",
      aud: CLIENT_ID,
      sub: "linkedin-sub-1",
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
      email: "ada@example.com",
      email_verified: true,
      iat: nowSeconds,
      exp: nowSeconds + 300,
      ...claimOverrides,
    }),
  ).toString("base64url");
  const input = `${header}.${claims}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), signingKey).toString(
    "base64url",
  );
  return `${input}.${signature}`;
}

function createService({ idToken = makeIdToken(), onTokenRequest } = {}) {
  const fetchImpl = async (url, init) => {
    if (url === "https://www.linkedin.com/oauth/openid/jwks") {
      return Response.json({ keys: [jwk] });
    }
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") {
      onTokenRequest?.(url, init);
      return Response.json({ access_token: "unused", id_token: idToken });
    }
    throw new Error(`Unexpected LinkedIn endpoint: ${url}`);
  };
  return createLinkedInAuthService({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    fetchImpl,
    now: () => NOW,
    makeState: () => "state-value-that-is-long-enough",
  });
}

test("authorization parameters use OIDC scopes and fresh state", () => {
  const service = createService();
  assert.deepEqual(service.getAuthorizationParameters(), {
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: "state-value-that-is-long-enough",
    scope: "openid profile email",
  });
});

test("callback exchanges code server-side and returns verified identity claims", async () => {
  let tokenRequest;
  const service = createService({
    onTokenRequest: (url, init) => {
      tokenRequest = { url, init };
    },
  });

  const identity = await service.completeAuthorization({
    code: "authorization-code",
    state: "state-value-that-is-long-enough",
  });

  assert.equal(tokenRequest.url, "https://www.linkedin.com/oauth/v2/accessToken");
  assert.equal(tokenRequest.init.method, "POST");
  assert.match(
    tokenRequest.init.headers["content-type"],
    /application\/x-www-form-urlencoded/,
  );
  assert.equal(
    new URLSearchParams(tokenRequest.init.body).get("client_secret"),
    CLIENT_SECRET,
  );
  assert.equal(
    new URL(tokenRequest.url).searchParams.has("client_secret"),
    false,
  );
  assert.deepEqual(identity, {
    sub: "linkedin-sub-1",
    name: "Ada Lovelace",
    given_name: "Ada",
    family_name: "Lovelace",
    email: "ada@example.com",
    email_verified: true,
  });
});

test("callback rejects invalid issuer, audience, and expired ID tokens", async (t) => {
  const cases = [
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "another-client" }],
    [
      "multiple audiences without authorized party",
      { aud: [CLIENT_ID, "another-client"] },
    ],
    ["expiry", { exp: Math.floor(NOW / 1000) }],
  ];

  for (const [label, claims] of cases) {
    await t.test(label, async () => {
      const service = createService({ idToken: makeIdToken(claims) });
      await assert.rejects(
        service.completeAuthorization({
          code: "authorization-code",
          state: "state-value-that-is-long-enough",
        }),
        { status: 502 },
      );
    });
  }
});

test("callback rejects ID tokens signed by an unknown private key", async () => {
  const { privateKey: unknownPrivateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const service = createService({
    idToken: makeIdToken({}, unknownPrivateKey),
  });

  await assert.rejects(
    service.completeAuthorization({
      code: "authorization-code",
      state: "state-value-that-is-long-enough",
    }),
    { status: 502 },
  );
});

test("callback rejects missing or unverified email before returning identity", async () => {
  const service = createService({
    idToken: makeIdToken({ email_verified: false }),
  });
  await assert.rejects(
    service.completeAuthorization({
      code: "authorization-code",
      state: "state-value-that-is-long-enough",
    }),
    { status: 400 },
  );
});
