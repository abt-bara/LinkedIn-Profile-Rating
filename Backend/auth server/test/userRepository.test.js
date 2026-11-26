import assert from "node:assert/strict";
import test from "node:test";
import { createUserRepository } from "../services/userRepository.js";

test("LinkedIn signup persists the verified identity with an authenticated POST", async () => {
  let request;
  const repository = createUserRepository({
    dbUrl: "http://db.example",
    serviceToken: () => "db-service-token",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json(
        {
          user: {
            id: "42",
            email: "ada@example.com",
            password_hash: "scrypt-hash",
            credential_version: 1,
            display_name: "Ada Lovelace",
            role: "unpaid",
          },
        },
        { status: 201 },
      );
    },
  });

  const user = await repository.createFromLinkedIn({
    identity: {
      sub: "linkedin-sub-1",
      email: "ada@example.com",
      email_verified: true,
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
    },
    passwordHash: "scrypt-hash",
  });

  assert.equal(request.url, "http://db.example/internal/v1/auth/signup");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.authorization, "Bearer db-service-token");
  assert.deepEqual(JSON.parse(request.init.body), {
    identity: {
      linkedin_sub: "linkedin-sub-1",
      email: "ada@example.com",
      email_verified: true,
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
    },
    password_hash: "scrypt-hash",
  });
  assert.equal(user.id, "42");
  assert.equal(user.displayName, "Ada Lovelace");
  assert.equal(user.role, "unpaid");
});

test("LinkedIn signup does not hide DB persistence failures", async () => {
  const repository = createUserRepository({
    dbUrl: "http://db.example",
    serviceToken: () => "db-service-token",
    fetchImpl: async () => new Response(null, { status: 503 }),
  });

  await assert.rejects(
    repository.createFromLinkedIn({
      identity: {
        sub: "linkedin-sub-1",
        email: "ada@example.com",
        email_verified: true,
        name: "Ada Lovelace",
      },
      passwordHash: "scrypt-hash",
    }),
    { status: 502 },
  );
});
