import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;
const SCRYPT_PREFIX = "scrypt";

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${SCRYPT_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string) {
  if (!storedHash) return { valid: false, needsRehash: false };

  const [algorithm, salt, encodedKey] = storedHash.split("$");
  if (algorithm === SCRYPT_PREFIX && salt && encodedKey) {
    try {
      const expected = Buffer.from(encodedKey, "hex");
      const actual = scryptSync(password, salt, expected.length);
      return { valid: safeEqual(actual, expected), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Transitional compatibility for existing SHA-256 rows. A successful
  // login immediately upgrades the row to scrypt.
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacy = createHash("sha256").update(password).digest();
    const expected = Buffer.from(storedHash, "hex");
    const valid = safeEqual(legacy, expected);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}
