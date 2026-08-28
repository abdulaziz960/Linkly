import type { NextRequest } from "next/server";
import type { IntegrationSettings } from "../app/dashboard/types";
import { prisma } from "./prisma";
import { encryptSecret } from "./secret-storage";

export const googleBusinessScope = "https://www.googleapis.com/auth/business.manage";
const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://audiencew.audience.sa";

export function getGoogleRedirectUri(request: NextRequest) {
  const origin = request.nextUrl.hostname === "localhost" ? publicAppUrl : request.nextUrl.origin;
  return `${origin}/api/google/callback`;
}

export function normalizeGoogleResourceId(value?: string) {
  return value?.trim().replace(/^accounts\//, "").replace(/^locations\//, "") ?? "";
}

export async function refreshGoogleAccessToken(settings: IntegrationSettings) {
  const clientId = settings.appId.trim();
  const clientSecret = settings.configId.trim();
  const refreshToken = settings.googleRefreshToken.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google credentials are incomplete");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; error_description?: string; error?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Unable to refresh Google token");
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: settings.tenantId },
    data: {
      accessToken: encryptSecret(payload.access_token),
      updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "medium",
        timeStyle: "short",
        numberingSystem: "latn",
        calendar: "gregory",
        timeZone: "Asia/Riyadh"
      }).format(new Date())
    }
  });

  return payload.access_token;
}

export async function fetchGoogleWithAutoRefresh(settings: IntegrationSettings, input: string | URL, init: RequestInit = {}) {
  const token = settings.accessToken.trim();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status !== 401) return response;

  const freshToken = await refreshGoogleAccessToken(settings);
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${freshToken}`
    }
  });
}

export async function replyToGoogleReview(settings: IntegrationSettings, reviewId: string, comment: string) {
  const accountId = normalizeGoogleResourceId(settings.googleAccountId);
  const locationId = normalizeGoogleResourceId(settings.googleLocationId);
  const cleanReviewId = normalizeGoogleResourceId(reviewId);

  if (!accountId || !locationId || !cleanReviewId) {
    throw new Error("Google review target is incomplete");
  }

  const response = await fetchGoogleWithAutoRefresh(settings, `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${cleanReviewId}/reply`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment })
  });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Unable to reply to Google review");
  }

  return payload;
}
