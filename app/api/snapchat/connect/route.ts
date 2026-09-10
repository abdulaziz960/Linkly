import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { getSnapchatRedirectUri, snapchatClientId, snapchatScope } from "../../../../lib/snapchat";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const clientId = snapchatClientId();
  if (!clientId) {
    return NextResponse.redirect(new URL("/dashboard?view=settings&channel=snapchat&snapchat=missing-credentials", getAppOrigin(request)));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = getSnapchatRedirectUri(request);
  const authUrl = new URL("https://accounts.snapchat.com/login/oauth2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", snapchatScope);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("audiencew_snapchat_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
