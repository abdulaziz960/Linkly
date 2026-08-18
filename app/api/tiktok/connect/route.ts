import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function base64UrlEncode(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(request: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";

  if (!clientKey) {
    return NextResponse.json({ error: "TIKTOK_CLIENT_KEY غير مضبوط في إعدادات Vercel" }, { status: 500 });
  }

  const state = base64UrlEncode(crypto.randomBytes(16));
  const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
  const codeChallenge = base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());

  const redirectUri = `${request.nextUrl.origin}/api/tiktok/callback`;
  const authorizeUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authorizeUrl.searchParams.set("client_key", clientKey);
  authorizeUrl.searchParams.set("response_type", "code");
  // Only the scope(s) actually approved/active on the TikTok app's Production
  // Scopes page will be accepted here - requesting an unapproved scope (even
  // one added during app review, before it's approved) makes TikTok reject
  // the whole authorize request. user.info.stats is what's currently active;
  // switch to user.info.profile once TikTok approves it.
  authorizeUrl.searchParams.set("scope", "user.info.stats");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/api/tiktok" };
  response.cookies.set("tiktok_oauth_state", state, cookieOptions);
  response.cookies.set("tiktok_oauth_verifier", codeVerifier, cookieOptions);
  return response;
}
