import type { NextRequest } from "next/server";
import { getAppOrigin } from "./app-url";

// "Continue with Google" for Linkly's own login (existing accounts only). Uses the platform's
// Google OAuth client (the same GOOGLE_CLIENT_ID/SECRET the YouTube and email
// channels use) with the basic openid/email/profile scopes only.

export const GOOGLE_SIGNIN_STATE_COOKIE = "linkly_google_state";

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

export type GoogleProfile = { email: string; name: string };

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
