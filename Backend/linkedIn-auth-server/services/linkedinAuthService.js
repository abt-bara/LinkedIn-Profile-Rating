import {
  createPublicKey,
  createVerify,
  randomBytes,
} from "node:crypto";

const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_ENDPOINT = "https://api.linkedin.com/v2/userinfo";
const JWKS_ENDPOINT = "https://www.linkedin.com/oauth/openid/jwks";
const ISSUER = "https://www.linkedin.com/oauth";
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
  allowHttpLoopback = process.env.NODE_ENV !== "production",
  fetchImpl = fetch,
  logger = console,
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
    throw new Error("LINKEDIN_REDIRECT_URI must be an absolute URL.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isHttpLoopback =
    allowHttpLoopback &&
    callbackUrl.protocol === "http:" &&
    loopbackHosts.has(callbackUrl.hostname);
  if (
     
    !callbackUrl.hostname ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new Error(
      "LINKEDIN_REDIRECT_URI must use HTTPS, except for loopback HTTP in non-production.",
    );
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
        signal: AbortSignal.timeout(20_000),
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
    const invalidClaims = [];
    if (claims.iss !== ISSUER) invalidClaims.push("issuer");
    if (!audiences.includes(clientId)) invalidClaims.push("audience");
    if (
      (audiences.length > 1 && claims.azp !== clientId) ||
      (claims.azp !== undefined && claims.azp !== clientId)
    ) {
      invalidClaims.push("authorized party");
    }
    if (typeof claims.exp !== "number" || claims.exp <= currentTime) {
      invalidClaims.push("expiration");
    }
    if (
      typeof claims.iat !== "number" ||
      claims.iat > currentTime + CLOCK_SKEW_SECONDS
    ) {
      invalidClaims.push("issued-at");
    }
    if (
      typeof claims.exp === "number" &&
      typeof claims.iat === "number" &&
      claims.exp <= claims.iat
    ) {
      invalidClaims.push("claim lifetime");
    }
    if (typeof claims.sub !== "string" || !claims.sub.trim()) {
      invalidClaims.push("subject");
    }
    if (invalidClaims.length) {
      throw linkedinError(
        `LinkedIn returned an invalid identity (failed checks: ${invalidClaims.join(", ")}).`,
      );
    }
    return claims;
  }

  function createVerifiedIdentity(claims) {
    if (
      typeof claims.name !== "string" ||
      !claims.name.trim() ||
      typeof claims.email !== "string" ||
      !claims.email.trim() ||
      claims.email_verified !== true
    ) {
      logger.warn("LinkedIn identity rejected.", {
        reason: "verified_profile_claims_missing",
      });
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

  async function loadUserInfo(accessToken) {
    let response;
    try {
      response = await fetchImpl(USERINFO_ENDPOINT, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const causeCode =
        typeof error === "object" &&
        error !== null &&
        "cause" in error &&
        typeof error.cause === "object" &&
        error.cause !== null &&
        "code" in error.cause &&
        typeof error.cause.code === "string"
          ? error.cause.code
          : undefined;
      logger.error("LinkedIn UserInfo request failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        ...(causeCode ? { causeCode } : {}),
      });
      throw linkedinError("Could not retrieve LinkedIn profile details.");
    }
    if (!response.ok) {
      logger.error("LinkedIn UserInfo request rejected.", {
        status: response.status,
      });
      throw linkedinError("Could not retrieve LinkedIn profile details.");
    }

    let userInfo;
    try {
      userInfo = await response.json();
    } catch {
      logger.error("LinkedIn UserInfo returned invalid JSON.", {
        status: response.status,
      });
      throw linkedinError("Could not retrieve LinkedIn profile details.");
    }
    if (
      typeof userInfo !== "object" ||
      userInfo === null ||
      Array.isArray(userInfo)
    ) {
      logger.error("LinkedIn UserInfo returned an invalid response.");
      throw linkedinError("Could not retrieve LinkedIn profile details.");
    }
    return userInfo;
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
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const causeCode =
        typeof error === "object" &&
        error !== null &&
        "cause" in error &&
        typeof error.cause === "object" &&
        error.cause !== null &&
        "code" in error.cause &&
        typeof error.cause.code === "string"
          ? error.cause.code
          : undefined;
      logger.error("LinkedIn token endpoint request failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        ...(causeCode ? { causeCode } : {}),
      });
      throw linkedinError("Could not complete LinkedIn sign-up.");
    }
    if (!response.ok) {
      let tokenError;
      let errorDescription = "";
      try {
        const errorBody = await response.json();
        if (
          typeof errorBody?.error === "string" &&
          /^[a-zA-Z0-9._-]{1,64}$/.test(errorBody.error)
        ) {
          tokenError = errorBody.error;
        }
        if (typeof errorBody?.error_description === "string") {
          errorDescription = errorBody.error_description;
        }
      } catch {
        // The status remains useful even when the provider error isn't JSON.
      }

      const normalizedError = tokenError?.toLowerCase();
      const reason = /redirect_uri/i.test(errorDescription)
        ? "redirect_uri_mismatch"
        : normalizedError === "invalid_client"
          ? "invalid_client"
          : normalizedError === "invalid_grant"
            ? "invalid_grant"
            : normalizedError === "unauthorized_client"
              ? "unauthorized_client"
              : "provider_rejected_request";
      logger.error("LinkedIn token exchange rejected.", {
        status: response.status,
        reason,
        ...(tokenError ? { providerError: tokenError } : {}),
      });
      throw linkedinError("Could not complete LinkedIn sign-up.");
    }

    let tokenResponse;
    try {
      tokenResponse = await response.json();
    } catch {
      logger.error(
        "LinkedIn token endpoint returned a non-JSON success response.",
        { status: response.status },
      );
      throw linkedinError("Could not complete LinkedIn sign-up.");
    }
    const claims = await verifyIdToken(tokenResponse?.id_token);
    if (claims.email_verified === false) return createVerifiedIdentity(claims);
    if (
      typeof claims.name === "string" &&
      claims.name.trim() &&
      typeof claims.email === "string" &&
      claims.email.trim() &&
      claims.email_verified === true
    ) {
      return createVerifiedIdentity(claims);
    }

    const accessToken = tokenResponse?.access_token;
    if (typeof accessToken !== "string" || !accessToken.trim()) {
      logger.error("LinkedIn token response lacks an access token for UserInfo.");
      throw linkedinError("Could not retrieve LinkedIn profile details.");
    }

    const userInfo = await loadUserInfo(accessToken);
    if (userInfo.sub !== claims.sub) {
      logger.error("LinkedIn UserInfo subject did not match the ID token.");
      throw linkedinError("Could not verify the LinkedIn identity.");
    }
    if (
      typeof claims.email === "string" &&
      claims.email.trim() &&
      typeof userInfo.email === "string" &&
      claims.email.trim().toLowerCase() !== userInfo.email.trim().toLowerCase()
    ) {
      logger.error("LinkedIn UserInfo email did not match the ID token.");
      throw linkedinError("Could not verify the LinkedIn identity.");
    }

    const resolvedEmail =
      typeof claims.email === "string" && claims.email.trim()
        ? claims.email
        : userInfo.email;
    const userInfoEmailMatches =
      typeof userInfo.email === "string" &&
      typeof resolvedEmail === "string" &&
      userInfo.email.trim().toLowerCase() ===
        resolvedEmail.trim().toLowerCase();
    const mergedClaims = {
      ...claims,
      name:
        typeof claims.name === "string" && claims.name.trim()
          ? claims.name
          : userInfo.name,
      email: resolvedEmail,
      email_verified:
        (typeof claims.email === "string" &&
          claims.email.trim().length > 0 &&
          claims.email_verified === true) ||
        (userInfoEmailMatches && userInfo.email_verified === true),
      given_name:
        typeof claims.given_name === "string"
          ? claims.given_name
          : userInfo.given_name,
      family_name:
        typeof claims.family_name === "string"
          ? claims.family_name
          : userInfo.family_name,
      picture:
        typeof claims.picture === "string" ? claims.picture : userInfo.picture,
      locale:
        typeof claims.locale === "string" ? claims.locale : userInfo.locale,
    };
    return createVerifiedIdentity(mergedClaims);
  }

  return { getAuthorizationParameters, completeAuthorization };
}
