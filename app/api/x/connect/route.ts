import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { getXPlatformCredentials } from "../../../../lib/x-platform";

export const runtime = "nodejs";

function base64Url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const settings = await getIntegrationSettings("x", user.tenantId);
  const { clientId, clientSecret } = getXPlatformCredentials(settings);
  const redirectUri = `${request.nextUrl.origin}/api/x/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/dashboard?x=missing-app-keys", request.url));
  }

  const state = base64Url(randomBytes(24));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  // twitter.com redirects to x.com for this endpoint, and that extra hop is
  // a known trigger for Cloudflare's bot-block page ("Sorry, you have been
  // blocked") on some networks - authorizing directly against x.com avoids
  // the redirect entirely.
  const authorizeUrl = new URL("https://x.com/i/oauth2/authorize");

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "tweet.read tweet.write users.read offline.access dm.read dm.write");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("audiencew_x_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  response.cookies.set("audiencew_x_verifier", verifier, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });

  return response;
}
