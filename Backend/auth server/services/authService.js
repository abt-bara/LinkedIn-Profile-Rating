import { createHash, randomBytes } from "node:crypto";
import {
  hashPassword,
  isValidPassword,
  normalizeEmail,
  verifyPassword,
} from "./passwords.js";

export const SESSION_COOKIE = "profile_rater_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SIGNUP_TTL_SECONDS = 10 * 60;
export const ACCOUNT_REVALIDATION_MS = 24 * 60 * 60 * 1000;

const sessionKey = (token) =>
  `session:${createHash("sha256").update(token).digest("hex")}`;
const signupKey = (state) => `pending-signup:${state}`;

function authError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseIdentity(identity) {
  if (
    typeof identity !== "object" ||
    identity === null ||
    typeof identity.sub !== "string" ||
    !identity.sub ||
    identity.email_verified !== true ||
    !normalizeEmail(identity.email) ||
    typeof identity.name !== "string" ||
    !identity.name.trim()
  ) {
    throw authError(
      "LinkedIn sign-up requires a verified email address and profile name.",
      400,
    );
  }
  return {
    ...identity,
    email: normalizeEmail(identity.email),
    name: identity.name.trim(),
  };
}

function parseSession(raw) {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (
      typeof session.userId !== "string" ||
      typeof session.displayName !== "string" ||
      typeof session.role !== "string" ||
      typeof session.email !== "string" ||
      typeof session.credentialVersion !== "number" ||
      typeof session.checkedAt !== "number" ||
      typeof session.expiresAt !== "number"
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function toSession(user, now, expiresAt) {
  return {
    userId: user.id,
    displayName: user.displayName,
    role: user.role,
    email: user.email,
    credentialVersion: user.credentialVersion,
    checkedAt: now,
    expiresAt,
  };
}

export function createAuthService({
  redis,
  userRepository,
  now = () => Date.now(),
  makeToken = () => randomBytes(32).toString("base64url"),
  hash = hashPassword,
  verify = verifyPassword,
}) {
  async function createSession(user) {
    const token = makeToken();
    const issuedAt = now();
    const session = toSession(
      user,
      issuedAt,
      issuedAt + SESSION_TTL_SECONDS * 1000,
    );
    const stored = await redis.set(sessionKey(token), JSON.stringify(session), {
      EX: SESSION_TTL_SECONDS,
      NX: true,
    });
    if (stored !== "OK") {
      throw authError("Could not create an authentication session.", 503);
    }
    return token;
  }

  async function startSignup({ state, password }) {
    if (typeof state !== "string" || state.length < 16 || state.length > 512) {
      throw authError("Sign-up state is invalid.", 400);
    }
    if (!isValidPassword(password)) {
      throw authError("Password must be between 8 and 128 bytes.", 400);
    }

    const passwordHash = await hash(password);
    const stored = await redis.set(signupKey(state), passwordHash, {
      EX: SIGNUP_TTL_SECONDS,
      NX: true,
    });
    if (stored !== "OK") throw authError("Sign-up could not be started.", 409);
  }

  async function cancelSignup(state) {
    if (typeof state === "string" && state) {
      await redis.del(signupKey(state));
    }
  }

  async function completeSignup({ state, identity }) {
    if (typeof state !== "string" || !state) {
      throw authError("Sign-up state is invalid.", 400);
    }
    const verifiedIdentity = parseIdentity(identity);
    const passwordHash = await redis.getDel(signupKey(state));
    if (!passwordHash) {
      throw authError("The sign-up request expired. Please start again.", 401);
    }

    let user;
    try {
      user = await userRepository.createFromLinkedIn({
        identity: verifiedIdentity,
        passwordHash,
      });
    } catch (error) {
      if (error?.status === 409) {
        throw authError(
          "This LinkedIn account is already registered. Sign in instead.",
          409,
        );
      }
      throw error;
    }

    return createSession(user);
  }

  async function signIn({ email, password, currentToken }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isValidPassword(password)) {
      
      throw authError("Incorrect email or password.", 401);
    }

    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user || !(await verify(password, user.passwordHash))) {
      throw authError("Incorrect email or password.", 401);
    }
    const token = await createSession(user);
    if (typeof currentToken === "string" && currentToken) {
      await signOut(currentToken);
    }
    return token;
  }

  async function checkToken(token) {
    if (typeof token !== "string" || !token) return null;

    const key = sessionKey(token);
    const session = parseSession(await redis.get(key));
    if (!session) {
      await redis.del(key);
      return null;
    }

    const currentTime = now();
    if (
      currentTime < session.expiresAt &&
      currentTime - session.checkedAt < ACCOUNT_REVALIDATION_MS
    ) {
      return session;
    }

    if (currentTime >= session.expiresAt) {
      await redis.del(key);
      return null;
    }

    const user = await userRepository.findById(session.userId);
    if (!user) {
      await redis.del(key);
      return null;
    }

    const refreshed = toSession(user, currentTime, session.expiresAt);
    const ttl = Math.max(
      1,
      Math.ceil((session.expiresAt - currentTime) / 1000),
    );
    await redis.set(key, JSON.stringify(refreshed), { EX: ttl });
    return refreshed;
  }

  async function signOut(token) {
    if (typeof token === "string" && token) {
      await redis.del(sessionKey(token));
    }
  }

  return {
    startSignup,
    cancelSignup,
    completeSignup,
    signIn,
    checkToken,
    signOut,
  };
}
