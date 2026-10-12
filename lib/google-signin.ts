import { createHmac } from "crypto";
import type { NextRequest } from "next/server";
import { getAppOrigin } from "./app-url";
import { safeEqual } from "./oauth-state";

// "Continue with Google" for Linkly's own login/signup. Uses the platform's
// Google OAuth client (the same GOOGLE_CLIENT_ID/SECRET the YouTube and email
// channels use) with the basic openid/email/profile scopes only.

export const GOOGLE_SIGNIN_STATE_COOKIE = "linkly_google_state";
export const GOOGLE_SIGNUP_COOKIE = "linkly_google_signup";
export const GOOGLE_SIGNUP_TTL_SECONDS = 15 * 60;

function envValue(value?: string) {
  return value?.split(/\s+/).find(Boolean)?.trim() || "";
}

export function googleSignInCredentials() {
  return { clientId: envValue(process.env.GOOGLE_CLIENT_ID), clientSecret: envValue(process.env.GOOGLE_CLIENT_SECRET) };
}

export function googleSignInConfigured() {
  const { clientId, clientSecret } = googleSignInCredentials();
  return Boolean(clientId && clientSecret);
}

export function googleSignInRedirectUri(request: NextRequest) {
  return `${getAppOrigin(request)}/api/auth/google/callback`;
}

function signingSecret() {
  const configured = process.env.AUTH_SECRET?.trim() || process.env.OAUTH_STATE_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be configured in production");
  return "linkly-development-oauth-state-secret";
}

const sign = (payload: string) => createHmac("sha256", signingSecret()).update(`google-signup:${payload}`).digest("base64url");

export type GoogleProfile = { email: string; name: string };

/** A short-lived signed proof that Google verified this email - carried in an httpOnly cookie from the OAuth callback to the signup form. */
export function createGoogleSignupToken(profile: GoogleProfile) {
  const payload = Buffer.from(JSON.stringify({ ...profile, expiresAt: Date.now() + GOOGLE_SIGNUP_TTL_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyGoogleSignupToken(token: string | null | undefined): GoogleProfile | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown; name?: unknown; expiresAt?: unknown };
    if (typeof parsed.email !== "string" || !parsed.email || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    return { email: parsed.email, name: typeof parsed.name === "string" ? parsed.name : "" };
  } catch {
    return null;
  }
}

/** Reads the verified identity out of the id_token Google returned directly from its token endpoint (TLS + our client secret). */
export function identityFromIdToken(idToken: string | undefined, clientId: string): GoogleProfile | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean | string; name?: string;
    };
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return null;
    if (claims.aud !== clientId) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    if (claims.email_verified !== true && claims.email_verified !== "true") return null;
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!email) return null;
    return { email, name: typeof claims.name === "string" ? claims.name.trim().slice(0, 100) : "" };
  } catch {
    return null;
  }
}
