import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { getLinkedinRedirectUri, linkedinClientId, linkedinClientSecret, getMyOrganizationInfo } from "../../../../lib/linkedin";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

type LinkedinTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function updatedAt() {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("audiencew_linkedin_state")?.value;
  const redirectTo = new URL("/dashboard", getAppOrigin(request));
  redirectTo.searchParams.set("view", "settings");
  redirectTo.searchParams.set("channel", "linkedin");

  if (!code || !state || state !== savedState) {
    redirectTo.searchParams.set("linkedin", "invalid-state");
    return NextResponse.redirect(redirectTo);
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const clientId = linkedinClientId();
  const clientSecret = linkedinClientSecret();
  if (!clientId || !clientSecret) {
    redirectTo.searchParams.set("linkedin", "missing-credentials");
    return NextResponse.redirect(redirectTo);
  }

  const settings = await getIntegrationSettings("linkedin", user.tenantId);
  const redirectUri = getLinkedinRedirectUri(request);
  const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const tokenPayload = await tokenResponse.json().catch(() => null) as LinkedinTokenPayload | null;

  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    redirectTo.searchParams.set("linkedin", "token-error");
    return NextResponse.redirect(redirectTo);
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: user.tenantId },
    data: {
      provider: "linkedin",
      accessToken: encryptSecret(tokenPayload.access_token),
      // LinkedIn only returns a refresh_token if the app has separate
      // "Programmatic Refresh Tokens" approval - falls back to keeping
      // whatever was already stored (usually nothing, on a first connect).
      linkedinRefreshToken: tokenPayload.refresh_token ? encryptSecret(tokenPayload.refresh_token) : settings.linkedinRefreshToken,
      linkedinTokenExpiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString(),
      updatedAt: updatedAt()
    }
  });

  let status: "connected" | "pending" = "pending";
  try {
    const refreshedSettings = await getIntegrationSettings("linkedin", user.tenantId);
    const organization = await getMyOrganizationInfo(refreshedSettings);
    if (organization) {
      await prisma.integrationSetting.updateMany({
        where: { id: settings.id, tenantId: user.tenantId },
        data: {
          status: "connected",
          linkedinOrgId: organization.id,
          linkedinOrgName: organization.name,
          businessName: organization.name,
          updatedAt: updatedAt()
        }
      });
      status = "connected";
    }
  } catch (error) {
    console.error("LinkedIn callback: failed to read organization info", error);
  }

  redirectTo.searchParams.set("linkedin", status);
  return NextResponse.redirect(redirectTo);
}
