import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../services/passwords.js";

test("password hashes are salted and can be verified", async () => {
  const firstHash = await hashPassword("correct horse battery");
  const secondHash = await hashPassword("correct horse battery");

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword("correct horse battery", firstHash), true);
  assert.equal(await verifyPassword("incorrect horse battery", firstHash), false);
  assert.equal(await verifyPassword("correct horse battery", "malformed"), false);
});
