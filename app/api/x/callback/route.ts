import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";

export const runtime = "nodejs";

type XTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type XMeResponse = {
  data?: {
    id?: string;
    name?: string;
    username?: string;
  };
  errors?: Array<{ detail?: string; message?: string }>;
};

function dashboardRedirect(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/dashboard?x=${status}`, request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("audiencew_x_state")?.value;
  const verifier = request.cookies.get("audiencew_x_verifier")?.value;

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    return dashboardRedirect(request, "invalid-callback");
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const settings = await getIntegrationSettings("x", user.tenantId);
  const clientId = settings.appId.trim();
  const clientSecret = settings.configId.trim();
  const redirectUri = `${request.nextUrl.origin}/api/x/callback`;

  if (!clientId || !clientSecret) {
    return dashboardRedirect(request, "missing-app-keys");
  }

  const tokenForm = new URLSearchParams();
  tokenForm.set("grant_type", "authorization_code");
  tokenForm.set("code", code);
  tokenForm.set("redirect_uri", redirectUri);
  tokenForm.set("code_verifier", verifier);

  const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: tokenForm.toString()
  });
  const tokenData = await tokenResponse.json().catch(() => null) as XTokenResponse | null;

  if (!tokenResponse.ok || !tokenData?.access_token) {
    return dashboardRedirect(request, "token-failed");
  }

  const meResponse = await fetch("https://api.x.com/2/users/me?user.fields=username,name", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  });
  const meData = await meResponse.json().catch(() => null) as XMeResponse | null;

  if (!meResponse.ok || !meData?.data?.id) {
    return dashboardRedirect(request, "account-failed");
  }

  await prisma.integrationSetting.update({
    where: { id: settings.id },
    data: {
      provider: "x",
      status: "connected",
      wabaName: meData.data.username || meData.data.name || "X",
      wabaId: meData.data.id,
      phoneNumber: meData.data.username ? `@${meData.data.username}` : meData.data.id,
      accessToken: encryptSecret(tokenData.access_token),
      xAccessToken: encryptSecret(tokenData.access_token),
      xAccessTokenSecret: encryptSecret(tokenData.refresh_token || settings.xAccessTokenSecret || ""),
      updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Riyadh",
        numberingSystem: "latn",
        calendar: "gregory"
      }).format(new Date())
    }
  });

  const response = dashboardRedirect(request, "connected");
  response.cookies.set("audiencew_x_state", "", { maxAge: 0, path: "/" });
  response.cookies.set("audiencew_x_verifier", "", { maxAge: 0, path: "/" });

  return response;
}
