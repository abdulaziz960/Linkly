import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { getGoogleRedirectUri } from "../../../../lib/google-business";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";

type GoogleTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleAccount = {
  name?: string;
  accountName?: string;
};

type GoogleLocation = {
  name?: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
  };
};

function updatedAt() {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh"
  }).format(new Date());
}

async function fetchJson<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => null) as T & { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "تعذر قراءة بيانات Google Business");
  return payload;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("audiencew_google_state")?.value;
  const redirectTo = new URL("/dashboard", request.nextUrl.origin);

  if (!code || !state || state !== savedState) {
    redirectTo.searchParams.set("google", "invalid-state");
    return NextResponse.redirect(redirectTo);
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  const settings = await getIntegrationSettings("google_maps", user.tenantId);
  const redirectUri = getGoogleRedirectUri(request);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.appId,
      client_secret: settings.configId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const tokenPayload = await tokenResponse.json().catch(() => null) as GoogleTokenPayload | null;

  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    redirectTo.searchParams.set("google", "token-error");
    redirectTo.searchParams.set("message", tokenPayload?.error_description || tokenPayload?.error || "تعذر ربط Google");
    return NextResponse.redirect(redirectTo);
  }

  let googleAccountId = "";
  let googleLocationId = "";
  let businessName = settings.businessName;
  let locationName = settings.wabaName;
  let locationAddress = settings.phoneNumber;
  let status: "connected" | "pending" = "pending";

  try {
    const accountsPayload = await fetchJson<{ accounts?: GoogleAccount[] }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", tokenPayload.access_token);
    const account = accountsPayload?.accounts?.[0];
    googleAccountId = account?.name || "";
    businessName = account?.accountName || businessName || "Google Business Profile";

    if (googleAccountId) {
      const locationsPayload = await fetchJson<{ locations?: GoogleLocation[] }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${googleAccountId}/locations?readMask=name,title,storefrontAddress`,
        tokenPayload.access_token
      );
      const location = locationsPayload?.locations?.[0];
      googleLocationId = location?.name || "";
      locationName = location?.title || locationName || businessName;
      locationAddress = [
        ...(location?.storefrontAddress?.addressLines || []),
        location?.storefrontAddress?.locality || ""
      ].filter(Boolean).join("، ");
      status = googleLocationId ? "connected" : "pending";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر قراءة بيانات Google Business";
    const isQuotaBlocked = message.toLowerCase().includes("quota") || message.includes("RESOURCE_EXHAUSTED");
    status = "pending";
    businessName = businessName || "Google Business Profile";
    locationName = locationName || "بانتظار تفعيل الوصول";
    locationAddress = isQuotaBlocked
      ? "مشروع Google Cloud لم يحصل على موافقة Google Business Profile API بعد. تظهر الحصة الحالية 0، لذلك لا يمكن قراءة الحسابات أو المواقع حالياً."
      : message;
  }

  await prisma.integrationSetting.update({
    where: { id: settings.id },
    data: {
      provider: "google_maps",
      status,
      businessName,
      wabaName: locationName,
      phoneNumber: locationAddress,
      googleAccountId,
      googleLocationId,
      accessToken: encryptSecret(tokenPayload.access_token),
      googleRefreshToken: encryptSecret(tokenPayload.refresh_token || settings.googleRefreshToken),
      webhookUrl: "/api/google/reviews/sync",
      updatedAt: updatedAt()
    }
  });

  redirectTo.searchParams.set("google", status === "connected" ? "connected" : "needs-location");
  return NextResponse.redirect(redirectTo);
}
