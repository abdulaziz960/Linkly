import { NextRequest, NextResponse } from "next/server";
import { finalizeLogin } from "../../../../../lib/auth";
import { getAppOrigin } from "../../../../../lib/app-url";
import { verifyOAuthState } from "../../../../../lib/oauth-state";
import { prisma } from "../../../../../lib/prisma";
import { ensureSchema } from "../../../../../lib/database";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import {
  GOOGLE_SIGNIN_STATE_COOKIE, googleSignInCredentials, googleSignInRedirectUri, identityFromIdToken
} from "../../../../../lib/google-signin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  const params = request.nextUrl.searchParams;
  const nonce = request.cookies.get(GOOGLE_SIGNIN_STATE_COOKIE)?.value;
  const values = verifyOAuthState(params.get("state"), "google-signin", nonce);
  const mode = values?.mode === "signup" ? "signup" : "login";
  const fail = (code: string) => {
    const response = NextResponse.redirect(new URL(`/${mode}?google=${code}`, origin));
    response.cookies.delete(GOOGLE_SIGNIN_STATE_COOKIE);
    return response;
  };

  if (!values) return fail("invalid-state");
  const code = params.get("code");
  if (params.get("error") || !code) return fail("cancelled");

  const rateLimit = await consumeRateLimit("google-signin", requestIdentifier(request, ""), 20, 15 * 60 * 1000);
  if (!rateLimit.allowed) return fail("rate-limited");

  const { clientId, clientSecret } = googleSignInCredentials();
  if (!clientId || !clientSecret) return fail("unavailable");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleSignInRedirectUri(request), grant_type: "authorization_code" })
  }).catch(() => null);
  const tokens = (await tokenResponse?.json().catch(() => null)) as { id_token?: string } | null;
  if (!tokenResponse?.ok || !tokens) return fail("failed");

  const identity = identityFromIdToken(tokens.id_token, clientId);
  if (!identity) return fail("unverified-email");

  await ensureSchema();
  const account = await prisma.userAccount.findUnique({ where: { email: identity.email } });

  // Google sign-in is for existing accounts only - accounts are created from the signup form.
  if (!account) return fail("no-account");
  if (account.disabled) return fail("disabled");
  // Platform admins and accounts with two-factor on keep the password + code
  // path - Google sign-in must never be a way around either.
  if (account.isPlatformAdmin === 1) return fail("password-required");
  if (account.twoFactorEnabled) return fail("two-factor");

  const { passwordHash: _passwordHash, ...safeUser } = account;
  void _passwordHash;
  const login = await finalizeLogin(safeUser as Parameters<typeof finalizeLogin>[0], false, request);
  const { redirectTo } = (await login.clone().json().catch(() => ({}))) as { redirectTo?: string };

  const response = NextResponse.redirect(new URL(redirectTo || "/dashboard?view=inbox", origin));
  for (const cookie of login.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  response.cookies.delete(GOOGLE_SIGNIN_STATE_COOKIE);
  return response;
}
