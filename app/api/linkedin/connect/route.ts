import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { getLinkedinRedirectUri, linkedinClientId, linkedinScope } from "../../../../lib/linkedin";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const clientId = linkedinClientId();
  if (!clientId) {
    return NextResponse.redirect(new URL("/dashboard?view=settings&channel=linkedin&linkedin=missing-credentials", getAppOrigin(request)));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = getLinkedinRedirectUri(request);
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", linkedinScope);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("audiencew_linkedin_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
