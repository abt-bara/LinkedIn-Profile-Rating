import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized && normalized.length <= 320 ? normalized : null;
}

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    Buffer.byteLength(password, "utf8") >= 8 &&
    Buffer.byteLength(password, "utf8") <= 128
  );
}

export async function hashPassword(password) {
  if (!isValidPassword(password)) {
    const error = new Error("Password must be between 8 and 128 bytes.");
    error.status = 400;
    throw error;
  }

  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });

  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, encodedHash) {
  if (!isValidPassword(password) || typeof encodedHash !== "string") return false;

  const [algorithm, saltHex, keyHex, ...extra] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/i.test(saltHex ?? "") ||
    !/^[a-f0-9]{128}$/i.test(keyHex ?? "") ||
    extra.length > 0
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });

  return timingSafeEqual(expected, actual);
}
