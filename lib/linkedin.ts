import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secret-storage";
import { getAppOrigin } from "./app-url";
import type { IntegrationSettings } from "../app/dashboard/types";

// LinkedIn's Community Management API - the only realistic way to read/reply
// to activity on a LinkedIn Company Page from a third-party app. Unlike
// YouTube's Data API, this product is gated: it must be requested and
// approved per-app in the LinkedIn Developer Portal, tied to a verified
// Company Page. There is no LinkedIn equivalent of DMs for third parties at
// all - only comments on the page's own posts are reachable here.
const linkedinVersion = "202401"; // LinkedIn REST APIs require a YYYYMM version header - bump periodically per LinkedIn's release notes.
export const linkedinScope = "r_organization_social w_organization_social rw_organization_admin";

export function getLinkedinRedirectUri(request: NextRequest) {
  return `${getAppOrigin(request)}/api/linkedin/callback`;
}

function envValue(value?: string) {
  return value?.split(/\s+/).find(Boolean)?.trim() || "";
}

export function linkedinClientId() {
  return envValue(process.env.LINKEDIN_CLIENT_ID);
}

export function linkedinClientSecret() {
  return envValue(process.env.LINKEDIN_CLIENT_SECRET);
}

function decryptStoredToken(value: string) {
  try {
    return decryptSecret(value);
  } catch (error) {
    console.error("LinkedIn: failed to decrypt a stored token", error);
    return "";
  }
}

function restHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": linkedinVersion,
    "X-Restli-Protocol-Version": "2.0.0"
  };
}

/**
 * LinkedIn only issues a refresh token if the app has been separately
 * approved for "Programmatic Refresh Tokens" - without that, the access
 * token from the initial OAuth grant is valid ~60 days with no way to
 * silently renew it, and the tenant has to reconnect from Settings once it
 * expires. This throws in that case rather than pretending a refresh
 * happened - callers should surface "reconnect LinkedIn" to the user.
 */
export async function refreshLinkedinAccessToken(settings: IntegrationSettings): Promise<string> {
  const clientId = linkedinClientId();
  const clientSecret = linkedinClientSecret();
  const refreshToken = decryptStoredToken(settings.linkedinRefreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("LinkedIn credentials are incomplete, or this connection has no refresh token - reconnect LinkedIn from Settings.");
  }

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
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
    throw new Error(payload?.error_description || payload?.error || "Unable to refresh the LinkedIn token");
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: settings.tenantId },
    data: {
      accessToken: encryptSecret(payload.access_token),
      linkedinTokenExpiresAt: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
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
  const expiresAt = settings.linkedinTokenExpiresAt ? new Date(settings.linkedinTokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return decryptStoredToken(settings.accessToken);
  return refreshLinkedinAccessToken(settings);
}

export async function fetchLinkedinWithAutoRefresh(settings: IntegrationSettings, input: string | URL, init: RequestInit = {}) {
  const token = await getValidAccessToken(settings);
  const response = await fetch(input, {
    ...init,
    headers: { ...restHeaders(token), ...(init.headers || {}) }
  });

  if (response.status !== 401) return response;

  const freshToken = await refreshLinkedinAccessToken(settings);
  return fetch(input, {
    ...init,
    headers: { ...restHeaders(freshToken), ...(init.headers || {}) }
  });
}

type LinkedinOrganizationInfo = {
  id: string;
  urn: string;
  name: string;
};

/**
 * Lists Company Pages the authenticated member administers, then reads the
 * first one's display name. rw_organization_admin is what grants access to
 * organizationAcls; verify the exact query params against the live
 * Developer Portal docs once the app is approved - LinkedIn has changed
 * this endpoint's shape across API versions before.
 */
export async function getMyOrganizationInfo(settings: IntegrationSettings): Promise<LinkedinOrganizationInfo | null> {
  const aclsUrl = "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED";
  const aclsResponse = await fetchLinkedinWithAutoRefresh(settings, aclsUrl);
  const aclsPayload = await aclsResponse.json().catch(() => null) as {
    elements?: Array<{ organization?: string }>;
    message?: string;
  } | null;
  if (!aclsResponse.ok) throw new Error(aclsPayload?.message || "Unable to list managed LinkedIn Company Pages");

  const orgUrn = aclsPayload?.elements?.[0]?.organization;
  if (!orgUrn) return null;
  const orgId = orgUrn.split(":").pop() || "";

  const orgResponse = await fetchLinkedinWithAutoRefresh(settings, `https://api.linkedin.com/rest/organizations/${orgId}`);
  const orgPayload = await orgResponse.json().catch(() => null) as {
    localizedName?: string;
    message?: string;
  } | null;
  if (!orgResponse.ok) throw new Error(orgPayload?.message || "Unable to read the LinkedIn Company Page");

  return { id: orgId, urn: orgUrn, name: orgPayload?.localizedName || "" };
}

export async function listRecentPostUrns(settings: IntegrationSettings, orgUrn: string, count = 10): Promise<string[]> {
  const url = new URL("https://api.linkedin.com/rest/posts");
  url.searchParams.set("q", "author");
  url.searchParams.set("author", orgUrn);
  url.searchParams.set("count", String(count));
  const response = await fetchLinkedinWithAutoRefresh(settings, url);
  const payload = await response.json().catch(() => null) as {
    elements?: Array<{ id?: string }>;
    message?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.message || "Unable to list recent LinkedIn posts");
  return (payload?.elements || []).map((item) => item.id || "").filter(Boolean);
}

export type LinkedinComment = {
  commentId: string;
  actorUrn: string;
  actorName: string;
  text: string;
  createdAt: string;
  postUrn: string;
};

export async function listPostComments(settings: IntegrationSettings, postUrn: string, count = 20): Promise<LinkedinComment[]> {
  const encodedPostUrn = encodeURIComponent(postUrn);
  const url = new URL(`https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`);
  url.searchParams.set("count", String(count));
  const response = await fetchLinkedinWithAutoRefresh(settings, url);
  const payload = await response.json().catch(() => null) as {
    elements?: Array<{
      $URN?: string;
      object?: string;
      actor?: string;
      message?: { text?: string };
      created?: { time?: number };
    }>;
    message?: string;
  } | null;
  // Comments can be disabled per-post, or a post can have none yet - both
  // are normal states, not failures (mirrors the YouTube 403/404 handling).
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) return [];
    throw new Error(payload?.message || "Unable to list LinkedIn comments");
  }

  return (payload?.elements || []).map((item) => ({
    commentId: item.$URN || "",
    actorUrn: item.actor || "",
    actorName: "", // Resolving a member/org display name needs a separate lookup by actorUrn - not fetched eagerly to keep the polling cron cheap.
    text: item.message?.text || "",
    createdAt: item.created?.time ? new Date(item.created.time).toISOString() : "",
    postUrn
  }));
}

export async function postCommentReply(settings: IntegrationSettings, orgUrn: string, postUrn: string, parentCommentUrn: string, text: string) {
  const encodedPostUrn = encodeURIComponent(postUrn);
  const response = await fetchLinkedinWithAutoRefresh(
    settings,
    `https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: orgUrn, object: postUrn, parentComment: parentCommentUrn, message: { text } })
    }
  );
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(payload?.message || "Unable to reply to the LinkedIn comment");
  return payload;
}
