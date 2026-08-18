import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { getGoogleRedirectUri, googleBusinessScope } from "../../../../lib/google-business";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  const settings = await getIntegrationSettings("google_maps", user.tenantId);
  const clientId = settings.appId.trim();

  if (!clientId || !settings.configId.trim()) {
    return NextResponse.redirect(new URL("/dashboard?google=missing-credentials", request.nextUrl.origin));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = getGoogleRedirectUri(request);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", googleBusinessScope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("audiencew_google_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
