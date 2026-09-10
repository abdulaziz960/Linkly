import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secret-storage";
import { getAppOrigin } from "./app-url";
import type { IntegrationSettings } from "../app/dashboard/types";
import type { NextRequest } from "next/server";

// Snapchat's Marketing API - the only realistic way to read Lead Generation
// Ads form submissions from a third-party app. This product is gated: it
// must be requested and approved per-app in the Snapchat Business Manager,
// tied to a verified Ad Account. There is no confirmed, universally-available
// real-time push webhook for individual lead submissions the way Meta/
// LinkedIn offer for comments - the reliable mechanism is polling the
// lead-forms/leads endpoints (see app/api/cron/snapchat-leads), so that is
// the path this integration relies on. Re-verify against Snap's live docs
// once the app is actually approved before trusting anything beyond that.
export const snapchatScope = "snapchat-marketing-api";

export function getSnapchatRedirectUri(request: NextRequest) {
  return `${getAppOrigin(request)}/api/snapchat/callback`;
}

function envValue(value?: string) {
  return value?.split(/\s+/).find(Boolean)?.trim() || "";
}

export function snapchatClientId() {
  return envValue(process.env.SNAPCHAT_CLIENT_ID);
}

export function snapchatClientSecret() {
  return envValue(process.env.SNAPCHAT_CLIENT_SECRET);
}

function decryptStoredToken(value: string) {
  try {
    return decryptSecret(value);
  } catch (error) {
    console.error("Snapchat: failed to decrypt a stored token", error);
    return "";
  }
}

function restHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function refreshSnapchatAccessToken(settings: IntegrationSettings): Promise<string> {
  const clientId = snapchatClientId();
  const clientSecret = snapchatClientSecret();
  const refreshToken = decryptStoredToken(settings.snapchatRefreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Snapchat credentials are incomplete, or this connection has no refresh token - reconnect Snapchat from Settings.");
  }

  const response = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Unable to refresh the Snapchat token");
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: settings.tenantId },
    data: {
      accessToken: encryptSecret(payload.access_token),
      snapchatTokenExpiresAt: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
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

async function getValidAccessToken(settings: IntegrationSettings): Promise<string> {
  const expiresAt = settings.snapchatTokenExpiresAt ? new Date(settings.snapchatTokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return decryptStoredToken(settings.accessToken);
  return refreshSnapchatAccessToken(settings);
}

export async function fetchSnapchatWithAutoRefresh(settings: IntegrationSettings, input: string | URL, init: RequestInit = {}) {
  const token = await getValidAccessToken(settings);
  const response = await fetch(input, {
    ...init,
    headers: { ...restHeaders(token), ...(init.headers || {}) }
  });

  if (response.status !== 401) return response;

  const freshToken = await refreshSnapchatAccessToken(settings);
  return fetch(input, {
    ...init,
    headers: { ...restHeaders(freshToken), ...(init.headers || {}) }
  });
}

type SnapchatAdAccountInfo = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
};

/**
 * Lists organizations the authenticated member belongs to, then the first
 * one's first ad account. Verify the exact query params/response shape
 * against the live Business Manager docs once the app is approved -
 * Snapchat has changed this API's shape across versions before.
 */
export async function getMyAdAccountInfo(settings: IntegrationSettings): Promise<SnapchatAdAccountInfo | null> {
  const orgsResponse = await fetchSnapchatWithAutoRefresh(settings, "https://adsapi.snapchat.com/v1/me/organizations");
  const orgsPayload = await orgsResponse.json().catch(() => null) as {
    organizations?: Array<{ organization?: { id?: string; name?: string } }>;
    message?: string;
  } | null;
  if (!orgsResponse.ok) throw new Error(orgsPayload?.message || "Unable to list managed Snapchat organizations");

  const organization = orgsPayload?.organizations?.[0]?.organization;
  if (!organization?.id) return null;

  const adAccountsResponse = await fetchSnapchatWithAutoRefresh(settings, `https://adsapi.snapchat.com/v1/organizations/${organization.id}/adaccounts`);
  const adAccountsPayload = await adAccountsResponse.json().catch(() => null) as {
    adaccounts?: Array<{ adaccount?: { id?: string; name?: string } }>;
    message?: string;
  } | null;
  if (!adAccountsResponse.ok) throw new Error(adAccountsPayload?.message || "Unable to list Snapchat ad accounts");

  const adAccount = adAccountsPayload?.adaccounts?.[0]?.adaccount;
  if (!adAccount?.id) return null;

  return {
    id: adAccount.id,
    organizationId: organization.id,
    organizationName: organization.name || "",
    name: adAccount.name || ""
  };
}

export type SnapchatLeadForm = {
  id: string;
  name: string;
};

export async function listLeadForms(settings: IntegrationSettings, adAccountId: string): Promise<SnapchatLeadForm[]> {
  const response = await fetchSnapchatWithAutoRefresh(settings, `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/leadforms`);
  const payload = await response.json().catch(() => null) as {
    leadforms?: Array<{ leadform?: { id?: string; name?: string } }>;
    message?: string;
  } | null;
  // A brand-new ad account may have no lead forms yet - a normal state, not
  // a failure (mirrors the YouTube/LinkedIn 403/404 handling elsewhere).
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) return [];
    throw new Error(payload?.message || "Unable to list Snapchat lead forms");
  }

  return (payload?.leadforms || [])
    .map((item) => ({ id: item.leadform?.id || "", name: item.leadform?.name || "" }))
    .filter((form) => form.id);
}

export type SnapchatLeadAnswer = {
  question: string;
  answer: string;
};

export type SnapchatLead = {
  leadId: string;
  formId: string;
  answers: SnapchatLeadAnswer[];
  submittedAt: string;
};

export async function listRecentLeads(settings: IntegrationSettings, formId: string, sinceIso?: string): Promise<SnapchatLead[]> {
  const url = new URL(`https://adsapi.snapchat.com/v1/leadforms/${formId}/leads`);
  if (sinceIso) url.searchParams.set("start_time", sinceIso);
  const response = await fetchSnapchatWithAutoRefresh(settings, url);
  const payload = await response.json().catch(() => null) as {
    leads?: Array<{
      lead?: {
        id?: string;
        create_time?: string;
        form_data?: Array<{ question?: string; answer?: string }>;
      };
    }>;
    message?: string;
  } | null;
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) return [];
    throw new Error(payload?.message || "Unable to list Snapchat leads");
  }

  return (payload?.leads || [])
    .map((item) => ({
      leadId: item.lead?.id || "",
      formId,
      answers: (item.lead?.form_data || []).map((field) => ({ question: field.question || "", answer: field.answer || "" })),
      submittedAt: item.lead?.create_time || ""
    }))
    .filter((lead) => lead.leadId);
}
