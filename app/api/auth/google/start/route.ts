import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin } from "../../../../../lib/app-url";
import { createOAuthState } from "../../../../../lib/oauth-state";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { GOOGLE_SIGNIN_STATE_COOKIE, googleSignInConfigured, googleSignInCredentials, googleSignInRedirectUri } from "../../../../../lib/google-signin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  const mode = request.nextUrl.searchParams.get("mode") === "signup" ? "signup" : "login";
  const back = (code: string) => NextResponse.redirect(new URL(`/${mode}?google=${code}`, origin));

  if (!googleSignInConfigured()) return back("unavailable");
  const rateLimit = await consumeRateLimit("google-signin", requestIdentifier(request, ""), 20, 15 * 60 * 1000);
  if (!rateLimit.allowed) return back("rate-limited");

  const { state, nonce, maxAgeSeconds } = createOAuthState("google-signin", { mode });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleSignInCredentials().clientId);
  url.searchParams.set("redirect_uri", googleSignInRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_SIGNIN_STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSeconds });
  return response;
}
