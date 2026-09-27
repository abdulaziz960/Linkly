import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;
const SCRYPT_PREFIX = "scrypt";
export const MIN_PASSWORD_LENGTH = 12;

export function getPasswordValidationError(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `كلمة السر يجب أن تكون ${MIN_PASSWORD_LENGTH} حرفاً على الأقل`;
  }
  if (!/\p{L}/u.test(password) || !/\d/u.test(password)) {
    return "كلمة السر يجب أن تحتوي على حرف واحد ورقم واحد على الأقل";
  }
  return null;
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${SCRYPT_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string) {
  if (!storedHash) return { valid: false, needsRehash: false, legacy: false };

  const [algorithm, salt, encodedKey] = storedHash.split("$");
  if (algorithm === SCRYPT_PREFIX && salt && encodedKey) {
    try {
      const expected = Buffer.from(encodedKey, "hex");
      const actual = scryptSync(password, salt, expected.length);
      return { valid: safeEqual(actual, expected), needsRehash: false, legacy: false };
    } catch {
      return { valid: false, needsRehash: false, legacy: false };
    }
  }

  // Transitional compatibility for existing unsalted SHA-256 rows (weak on
  // its own - crackable via rainbow tables if the DB ever leaked). A
  // successful login immediately upgrades the row to scrypt; `legacy: true`
  // lets the caller log this so any row that never re-authenticates stays
  // visible instead of silently lingering on the weaker hash. See
  // pre-launch audit F-02 and scripts/diagnose-legacy-password-hashes.mjs.
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacy = createHash("sha256").update(password).digest();
    const expected = Buffer.from(storedHash, "hex");
    const valid = safeEqual(legacy, expected);
    return { valid, needsRehash: valid, legacy: valid };
  }

  return { valid: false, needsRehash: false, legacy: false };
}
