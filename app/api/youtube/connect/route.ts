import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { getYoutubeRedirectUri, youtubeClientId, youtubeScope } from "../../../../lib/youtube";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const clientId = youtubeClientId();
  if (!clientId) {
    return NextResponse.redirect(new URL("/dashboard?view=settings&channel=youtube&youtube=missing-credentials", getAppOrigin(request)));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = getYoutubeRedirectUri(request);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", youtubeScope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("audiencew_youtube_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
