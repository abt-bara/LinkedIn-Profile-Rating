import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createLinkedInAuthService } from "../services/linkedinAuthService.js";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";
const REDIRECT_URI = "https://profiles.example.com/api/signin/callback";
const USERINFO_ENDPOINT = "https://api.linkedin.com/v2/userinfo";
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
      iss: "https://www.linkedin.com/oauth",
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

function createService({
  idToken = makeIdToken(),
  onTokenRequest,
  redirectUri = REDIRECT_URI,
  tokenResponse,
  userinfoResponse,
  onUserInfoRequest,
  logger = { error() {}, warn() {} },
} = {}) {
  const fetchImpl = async (url, init) => {
    if (url === "https://www.linkedin.com/oauth/openid/jwks") {
      return Response.json({ keys: [jwk] });
    }
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") {
      onTokenRequest?.(url, init);
      return (
        tokenResponse ??
        Response.json({ access_token: "unused", id_token: idToken })
      );
    }
    if (url === USERINFO_ENDPOINT) {
      onUserInfoRequest?.(url, init);
      return Response.json(userinfoResponse);
    }
    throw new Error(`Unexpected LinkedIn endpoint: ${url}`);
  };
  return createLinkedInAuthService({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri,
    fetchImpl,
    logger,
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

test("allows HTTP loopback redirects outside production only", () => {
  const redirectUri = "http://localhost:3001/api/signin/callback";
  const service = createService({ redirectUri });
  assert.equal(
    service.getAuthorizationParameters().redirect_uri,
    redirectUri,
  );

  assert.throws(
    () =>
      createLinkedInAuthService({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: "http://profiles.example.com/api/signin/callback",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      createLinkedInAuthService({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri,
        allowHttpLoopback: false,
      }),
    /HTTPS/,
  );
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

test("fills optional ID-token profile claims using subject-bound UserInfo", async () => {
  let userinfoRequest;
  const service = createService({
    idToken: makeIdToken({ email: undefined, email_verified: undefined }),
    tokenResponse: Response.json({
      access_token: "test-access-token",
      id_token: makeIdToken({
        email: undefined,
        email_verified: undefined,
      }),
    }),
    userinfoResponse: {
      sub: "linkedin-sub-1",
      email: "ada@example.com",
      email_verified: true,
    },
    onUserInfoRequest: (url, init) => {
      userinfoRequest = { url, init };
    },
  });

  const identity = await service.completeAuthorization({
    code: "authorization-code",
    state: "state-value-that-is-long-enough",
  });

  assert.equal(userinfoRequest.url, USERINFO_ENDPOINT);
  assert.equal(
    userinfoRequest.init.headers.authorization,
    "Bearer test-access-token",
  );
  assert.equal(userinfoRequest.init.method, undefined);
  assert.deepEqual(identity, {
    sub: "linkedin-sub-1",
    name: "Ada Lovelace",
    given_name: "Ada",
    family_name: "Lovelace",
    email: "ada@example.com",
    email_verified: true,
  });
});

test("rejects UserInfo responses for a different LinkedIn subject", async () => {
  const service = createService({
    idToken: makeIdToken({ email: undefined, email_verified: undefined }),
    tokenResponse: Response.json({
      access_token: "test-access-token",
      id_token: makeIdToken({
        email: undefined,
        email_verified: undefined,
      }),
    }),
    userinfoResponse: {
      sub: "different-linkedin-sub",
      email: "ada@example.com",
      email_verified: true,
    },
  });

  await assert.rejects(
    service.completeAuthorization({
      code: "authorization-code",
      state: "state-value-that-is-long-enough",
    }),
    { status: 502 },
  );
});

test("still rejects profiles without an email verified by LinkedIn", async () => {
  const service = createService({
    idToken: makeIdToken({ email: undefined, email_verified: undefined }),
    tokenResponse: Response.json({
      access_token: "test-access-token",
      id_token: makeIdToken({
        email: undefined,
        email_verified: undefined,
      }),
    }),
    userinfoResponse: {
      sub: "linkedin-sub-1",
      name: "Ada Lovelace",
      email_verified: true,
    },
  });

  await assert.rejects(
    service.completeAuthorization({
      code: "authorization-code",
      state: "state-value-that-is-long-enough",
    }),
    {
      status: 400,
      message:
        "LinkedIn sign-up requires a verified email address and profile name.",
    },
  );
});

test("token endpoint failures log safe diagnostics without raw provider descriptions", async () => {
  const logs = [];
  const service = createService({
    tokenResponse: Response.json(
      {
        error: "invalid_grant",
        error_description: "The redirect_uri does not match the request.",
      },
      { status: 400 },
    ),
    logger: { error: (...args) => logs.push(args) },
  });

  await assert.rejects(
    service.completeAuthorization({
      code: "authorization-code",
      state: "state-value-that-is-long-enough",
    }),
    { status: 502, message: "Could not complete LinkedIn sign-up." },
  );
  assert.deepEqual(logs, [
    [
      "LinkedIn token exchange rejected.",
      {
        status: 400,
        reason: "redirect_uri_mismatch",
        providerError: "invalid_grant",
      },
    ],
  ]);
  assert.equal(JSON.stringify(logs).includes("does not match"), false);
});

test("callback rejects invalid issuer, audience, and expired ID tokens", async (t) => {
  const cases = [
    ["issuer", { iss: "https://www.linkedin.com" }, "issuer"],
    ["audience", { aud: "another-client" }, "audience"],
    [
      "multiple audiences without authorized party",
      { aud: [CLIENT_ID, "another-client"] },
      "authorized party",
    ],
    ["expiry", { exp: Math.floor(NOW / 1000) }, "expiration"],
  ];

  for (const [label, claims, failedCheck] of cases) {
    await t.test(label, async () => {
      const service = createService({ idToken: makeIdToken(claims) });
      await assert.rejects(
        service.completeAuthorization({
          code: "authorization-code",
          state: "state-value-that-is-long-enough",
        }),
        (error) =>
          error.status === 502 && error.message.includes(failedCheck),
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
