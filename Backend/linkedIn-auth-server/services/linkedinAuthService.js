import {
  createPublicKey,
  createVerify,
  randomBytes,
} from "node:crypto";

const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";
const JWKS_ENDPOINT = "https://www.linkedin.com/oauth/openid/jwks";
const ISSUER = "https://www.linkedin.com";
const JWKS_CACHE_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

function linkedinError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function decodeJsonSegment(segment) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw linkedinError("LinkedIn returned an invalid ID token.");
  }
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw linkedinError("LinkedIn returned an invalid ID token.");
  }
}

function parseJwt(idToken) {
  if (typeof idToken !== "string") {
    throw linkedinError("LinkedIn returned an invalid ID token.");
  }
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw linkedinError("LinkedIn returned an invalid ID token.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonSegment(encodedHeader);
  const claims = decodeJsonSegment(encodedPayload);
  if (
    typeof header !== "object" ||
    header === null ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    !header.kid ||
    header.crit !== undefined ||
    typeof claims !== "object" ||
    claims === null
  ) {
    throw linkedinError("LinkedIn returned an invalid ID token.");
  }

  if (!/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    throw linkedinError("LinkedIn returned an invalid ID token.");
  }

  return {
    header,
    claims,
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: Buffer.from(encodedSignature, "base64url"),
  };
}

export function createLinkedInAuthService({
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = fetch,
  now = () => Date.now(),
  makeState = () => randomBytes(32).toString("base64url"),
}) {
  if (
    typeof clientId !== "string" ||
    !clientId.trim() ||
    typeof clientSecret !== "string" ||
    !clientSecret.trim()
  ) {
    throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are required.");
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(redirectUri);
  } catch {
    throw new Error("LINKEDIN_REDIRECT_URI must be an absolute HTTPS URL.");
  }
  if (
    callbackUrl.protocol !== "https:" ||
    !callbackUrl.hostname ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new Error("LINKEDIN_REDIRECT_URI must be an absolute HTTPS URL.");
  }

  let cachedKeys;
  let keysExpireAt = 0;

  function getAuthorizationParameters() {
    const state = makeState();
    if (typeof state !== "string" || state.length < 16 || state.length > 512) {
      throw linkedinError("Could not start LinkedIn sign-up.", 503);
    }

    return {
      response_type: "code",
      client_id: clientId,
      redirect_uri: callbackUrl.toString(),
      state,
      scope: "openid profile email",
    };
  }

  async function loadJwks(forceRefresh = false) {
    if (!forceRefresh && cachedKeys && now() < keysExpireAt) {
      return cachedKeys;
    }

    let response;
    try {
      response = await fetchImpl(JWKS_ENDPOINT, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }
    if (!response.ok) {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }
    if (!Array.isArray(body?.keys)) {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }

    cachedKeys = body.keys;
    keysExpireAt = now() + JWKS_CACHE_MS;
    return cachedKeys;
  }

  async function findSigningKey(kid) {
    let keys = await loadJwks();
    let jwk = keys.find(
      (key) =>
        key?.kid === kid &&
        key?.kty === "RSA" &&
        (key.use === undefined || key.use === "sig") &&
        (key.alg === undefined || key.alg === "RS256"),
    );
    if (!jwk) {
      keys = await loadJwks(true);
      jwk = keys.find(
        (key) =>
          key?.kid === kid &&
          key?.kty === "RSA" &&
          (key.use === undefined || key.use === "sig") &&
          (key.alg === undefined || key.alg === "RS256"),
      );
    }
    if (!jwk) throw linkedinError("Could not verify the LinkedIn identity.");

    try {
      return createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }
  }

  async function verifyIdToken(idToken) {
    const token = parseJwt(idToken);
    const publicKey = await findSigningKey(token.header.kid);
    let signatureValid = false;
    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(token.signingInput);
      verifier.end();
      signatureValid = verifier.verify(publicKey, token.signature);
    } catch {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }
    if (!signatureValid) {
      throw linkedinError("Could not verify the LinkedIn identity.");
    }

    const claims = token.claims;
    const currentTime = Math.floor(now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== ISSUER ||
      !audiences.includes(clientId) ||
      (audiences.length > 1 && claims.azp !== clientId) ||
      (claims.azp !== undefined && claims.azp !== clientId) ||
      typeof claims.exp !== "number" ||
      claims.exp <= currentTime ||
      typeof claims.iat !== "number" ||
      claims.iat > currentTime + CLOCK_SKEW_SECONDS ||
      claims.exp <= claims.iat ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim()
    ) {
      throw linkedinError("LinkedIn returned an invalid or expired identity.");
    }
    if (
      typeof claims.name !== "string" ||
      !claims.name.trim() ||
      typeof claims.email !== "string" ||
      !claims.email.trim() ||
      claims.email_verified !== true
    ) {
      throw linkedinError(
        "LinkedIn sign-up requires a verified email address and profile name.",
        400,
      );
    }

    return {
      sub: claims.sub,
      name: claims.name,
      given_name: typeof claims.given_name === "string" ? claims.given_name : "",
      family_name:
        typeof claims.family_name === "string" ? claims.family_name : "",
      email: claims.email,
      email_verified: true,
      ...(typeof claims.picture === "string" ? { picture: claims.picture } : {}),
      ...(typeof claims.locale === "string" ? { locale: claims.locale } : {}),
    };
  }

  async function completeAuthorization({ code, state }) {
    if (
      typeof code !== "string" ||
      !code.trim() ||
      code.length > 4096 ||
      typeof state !== "string" ||
      state.length < 16 ||
      state.length > 512
    ) {
      throw linkedinError("LinkedIn callback parameters are invalid.", 400);
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl.toString(),
      client_id: clientId,
      client_secret: clientSecret,
    });

    let response;
    try {
      response = await fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw linkedinError("Could not complete LinkedIn sign-up.");
    }
    if (!response.ok) {
      throw linkedinError("Could not complete LinkedIn sign-up.");
    }

    let tokenResponse;
    try {
      tokenResponse = await response.json();
    } catch {
      throw linkedinError("Could not complete LinkedIn sign-up.");
    }
    return verifyIdToken(tokenResponse?.id_token);
  }

  return { getAuthorizationParameters, completeAuthorization };
}
