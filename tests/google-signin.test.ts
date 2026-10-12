import { describe, expect, it, vi } from "vitest";

vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");

import { createGoogleSignupToken, identityFromIdToken, verifyGoogleSignupToken } from "../lib/google-signin";

function idToken(claims: Record<string, unknown>) {
  return `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
}

const valid = { iss: "https://accounts.google.com", aud: "client-1", exp: Math.floor(Date.now() / 1000) + 600, email: "Owner@Acme.example", email_verified: true, name: "Owner" };

describe("identityFromIdToken", () => {
  it("returns the lower-cased verified email", () => {
    expect(identityFromIdToken(idToken(valid), "client-1")).toEqual({ email: "owner@acme.example", name: "Owner" });
  });

  it("rejects an unverified email, wrong audience, wrong issuer or expired token", () => {
    expect(identityFromIdToken(idToken({ ...valid, email_verified: false }), "client-1")).toBeNull();
    expect(identityFromIdToken(idToken(valid), "other-client")).toBeNull();
    expect(identityFromIdToken(idToken({ ...valid, iss: "https://evil.example" }), "client-1")).toBeNull();
    expect(identityFromIdToken(idToken({ ...valid, exp: Math.floor(Date.now() / 1000) - 5 }), "client-1")).toBeNull();
    expect(identityFromIdToken(undefined, "client-1")).toBeNull();
    expect(identityFromIdToken("garbage", "client-1")).toBeNull();
  });
});

describe("google signup token", () => {
  it("round-trips a profile", () => {
    const token = createGoogleSignupToken({ email: "a@b.example", name: "A" });
    expect(verifyGoogleSignupToken(token)).toEqual({ email: "a@b.example", name: "A" });
  });

  it("rejects a tampered or missing token", () => {
    const token = createGoogleSignupToken({ email: "a@b.example", name: "A" });
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "victim@x.example", name: "", expiresAt: Date.now() + 60000 })).toString("base64url");
    expect(verifyGoogleSignupToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyGoogleSignupToken(`${payload}.bad`)).toBeNull();
    expect(verifyGoogleSignupToken(undefined)).toBeNull();
  });
});
