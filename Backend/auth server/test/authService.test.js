import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_REVALIDATION_MS,
  createAuthService,
} from "../services/authService.js";

class MemoryRedis {
  values = new Map();

  async set(key, value, options = {}) {
    if (options.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async getDel(key) {
    const value = await this.get(key);
    this.values.delete(key);
    return value;
  }

  async del(key) {
    return this.values.delete(key) ? 1 : 0;
  }
}

const existingUser = {
  id: "user-1",
  email: "ada@example.com",
  passwordHash: "stored:correct-pass",
  credentialVersion: 1,
  displayName: "Ada Lovelace",
  role: "USER",
};

function createHarness(overrides = {}) {
  const redis = new MemoryRedis();
  const repository = {
    findByEmail: async () => existingUser,
    findById: async () => existingUser,
    createFromLinkedIn: async () => existingUser,
    ...overrides.repository,
  };
  let time = 1_000;
  let tokenCounter = 0;
  const service = createAuthService({
    redis,
    userRepository: repository,
    now: () => time,
    makeToken: () => `session-token-${++tokenCounter}`,
    hash: async () => "test-password-hash",
    verify: async (password, passwordHash) => passwordHash === `stored:${password}`,
  });
  return {
    redis,
    repository,
    service,
    advanceTime(ms) {
      time += ms;
    },
  };
}

test("signup stores only a password hash and consumes it on verified LinkedIn completion", async () => {
  let created;
  const { redis, service } = createHarness({
    repository: {
      createFromLinkedIn: async (value) => {
        created = value;
        return existingUser;
      },
    },
  });
  const state = "random-linkedin-state-123";

  await service.startSignup({ state, password: "my-app-password" });
  assert.equal(await redis.get(`pending-signup:${state}`), "test-password-hash");
  assert.ok(
    [...redis.values.values()].every((value) => !value.includes("my-app-password")),
  );

  const token = await service.completeSignup({
    state,
    identity: {
      sub: "linkedin-sub",
      email: "ADA@example.com",
      email_verified: true,
      name: "Ada Lovelace",
    },
  });

  assert.equal(token, "session-token-1");
  assert.equal(await redis.get(`pending-signup:${state}`), null);
  assert.equal(created.passwordHash, "test-password-hash");
  assert.equal(created.identity.email, "ada@example.com");
  assert.equal(await service.checkToken(token).then((session) => session.displayName), "Ada Lovelace");
});

test("unknown email and wrong password return the same safe error", async () => {
  const { service } = createHarness({
    repository: {
      findByEmail: async (email) => (email === "ada@example.com" ? existingUser : null),
    },
  });

  const wrongPassword = await service.signIn({
    email: "ada@example.com",
    password: "wrong-pass",
  }).catch((error) => error);
  const missingEmail = await service.signIn({
    email: "missing@example.com",
    password: "wrong-pass",
  }).catch((error) => error);

  assert.equal(wrongPassword.status, 401);
  assert.equal(missingEmail.status, 401);
  assert.equal(wrongPassword.message, missingEmail.message);
  assert.equal(wrongPassword.message, "Incorrect email or password.");
});

test("session revalidation refreshes cached account data after 24 hours", async () => {
  let currentUser = existingUser;
  const { redis, service, advanceTime } = createHarness({
    repository: {
      findById: async () => currentUser,
    },
  });
  const token = await service.signIn({
    email: "ada@example.com",
    password: "correct-pass",
  });
  const key = [...redis.values.keys()].find((value) => value.startsWith("session:"));
  assert.ok(key);

  currentUser = {
    ...existingUser,
    credentialVersion: 2,
    displayName: "Ada Byron",
    role: "ADMIN",
  };
  advanceTime(ACCOUNT_REVALIDATION_MS);

  const session = await service.checkToken(token);
  assert.equal(session.displayName, "Ada Byron");
  assert.equal(session.credentialVersion, 2);
  assert.equal(session.role, "ADMIN");
  assert.equal(session.checkedAt, 1_000 + ACCOUNT_REVALIDATION_MS);
  assert.ok(await redis.get(key));
});

test("signout revokes the Redis session", async () => {
  const { service } = createHarness();
  const token = await service.signIn({
    email: "ada@example.com",
    password: "correct-pass",
  });

  await service.signOut(token);

  assert.equal(await service.checkToken(token), null);
});

test("successful sign-in replaces an existing session", async () => {
  const { service } = createHarness();
  const oldToken = await service.signIn({
    email: "ada@example.com",
    password: "correct-pass",
  });
  const newToken = await service.signIn({
    email: "ada@example.com",
    password: "correct-pass",
    currentToken: oldToken,
  });

  assert.notEqual(newToken, oldToken);
  assert.equal(await service.checkToken(oldToken), null);
  assert.ok(await service.checkToken(newToken));
});
