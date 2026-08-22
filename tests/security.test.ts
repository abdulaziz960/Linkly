import { createHash, createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { decryptSecret, encryptSecret } from "../lib/secret-storage";
import { verifyPrefixedHmac } from "../lib/webhook-security";

describe("password storage", () => {
  it("uses a unique salted scrypt hash and verifies the right password", () => {
    const first = hashPassword("Strong-password-123");
    const second = hashPassword("Strong-password-123");
    expect(first).toMatch(/^scrypt\$/);
    expect(first).not.toBe(second);
    expect(verifyPassword("Strong-password-123", first)).toEqual({ valid: true, needsRehash: false });
    expect(verifyPassword("wrong", first).valid).toBe(false);
  });

  it("accepts a legacy SHA-256 hash once and marks it for migration", () => {
    const legacy = createHash("sha256").update("Old-password-123").digest("hex");
    expect(verifyPassword("Old-password-123", legacy)).toEqual({ valid: true, needsRehash: true });
    expect(verifyPassword("wrong", legacy).valid).toBe(false);
  });
});

describe("integration secret storage", () => {
  beforeEach(() => vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-key-that-is-not-used-in-production"));

  it("encrypts with authenticated encryption and decrypts the original value", () => {
    const encrypted = encryptSecret("provider-secret-value");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("provider-secret-value");
    expect(decryptSecret(encrypted)).toBe("provider-secret-value");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("provider-secret-value");
    expect(() => decryptSecret(`${encrypted.slice(0, -1)}A`)).toThrow();
  });
});

describe("webhook signatures", () => {
  it("fails closed when the secret or signature is missing", () => {
    expect(verifyPrefixedHmac("{}", null, ["secret"], "hex")).toBe(false);
    expect(verifyPrefixedHmac("{}", "sha256=abc", [], "hex")).toBe(false);
  });

  it("accepts a valid provider signature and rejects a modified payload", () => {
    const payload = JSON.stringify({ event: "message" });
    const signature = `sha256=${createHmac("sha256", "secret").update(payload).digest("hex")}`;
    expect(verifyPrefixedHmac(payload, signature, ["secret"], "hex")).toBe(true);
    expect(verifyPrefixedHmac(`${payload} `, signature, ["secret"], "hex")).toBe(false);
  });
});
