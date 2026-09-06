import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secret-storage";
import { getAppOrigin } from "./app-url";
import type { IntegrationSettings } from "../app/dashboard/types";

export const youtubeScope = "https://www.googleapis.com/auth/youtube.force-ssl";

export function getYoutubeRedirectUri(request: NextRequest) {
  return `${getAppOrigin(request)}/api/youtube/callback`;
}

function envValue(value?: string) {
  return value?.split(/\s+/).find(Boolean)?.trim() || "";
}

export function youtubeClientId() {
  return envValue(process.env.GOOGLE_CLIENT_ID);
}

export function youtubeClientSecret() {
  return envValue(process.env.GOOGLE_CLIENT_SECRET);
}

function decryptStoredToken(value: string) {
  try {
    return decryptSecret(value);
  } catch (error) {
    console.error("YouTube: failed to decrypt a stored token", error);
    return "";
  }
}

export async function refreshYoutubeAccessToken(settings: IntegrationSettings): Promise<string> {
  const clientId = youtubeClientId();
  const clientSecret = youtubeClientSecret();
  const refreshToken = decryptStoredToken(settings.youtubeRefreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube credentials are incomplete");
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
  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Unable to refresh YouTube token");
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: settings.tenantId },
    data: {
      accessToken: encryptSecret(payload.access_token),
      youtubeTokenExpiresAt: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
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
  const expiresAt = settings.youtubeTokenExpiresAt ? new Date(settings.youtubeTokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return decryptStoredToken(settings.accessToken);
  return refreshYoutubeAccessToken(settings);
}

export async function fetchYoutubeWithAutoRefresh(settings: IntegrationSettings, input: string | URL, init: RequestInit = {}) {
  const token = await getValidAccessToken(settings);
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status !== 401) return response;

  const freshToken = await refreshYoutubeAccessToken(settings);
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${freshToken}`
    }
  });
}

type YoutubeChannelInfo = {
  id: string;
  title: string;
  uploadsPlaylistId: string;
};

export async function getMyChannelInfo(settings: IntegrationSettings): Promise<YoutubeChannelInfo | null> {
  const response = await fetchYoutubeWithAutoRefresh(
    settings,
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true"
  );
  const payload = await response.json().catch(() => null) as {
    items?: Array<{ id: string; snippet?: { title?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Unable to read the YouTube channel");
  const channel = payload?.items?.[0];
  if (!channel) return null;
  return {
    id: channel.id,
    title: channel.snippet?.title || "",
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || ""
  };
}

export async function listRecentVideoIds(settings: IntegrationSettings, uploadsPlaylistId: string, maxResults = 10): Promise<string[]> {
  if (!uploadsPlaylistId) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(maxResults));
  const response = await fetchYoutubeWithAutoRefresh(settings, url);
  const payload = await response.json().catch(() => null) as {
    items?: Array<{ contentDetails?: { videoId?: string } }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Unable to list recent videos");
  return (payload?.items || []).map((item) => item.contentDetails?.videoId || "").filter(Boolean);
}

export type YoutubeCommentThread = {
  topLevelCommentId: string;
  authorChannelId: string;
  authorDisplayName: string;
  authorProfileImageUrl: string;
  textOriginal: string;
  publishedAt: string;
  videoId: string;
};

export async function listCommentThreads(settings: IntegrationSettings, videoId: string, maxResults = 20): Promise<YoutubeCommentThread[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("order", "time");
  url.searchParams.set("maxResults", String(maxResults));
  const response = await fetchYoutubeWithAutoRefresh(settings, url);
  const payload = await response.json().catch(() => null) as {
    items?: Array<{
      id: string;
      snippet?: {
        topLevelComment?: {
          snippet?: {
            authorChannelId?: { value?: string };
            authorDisplayName?: string;
            authorProfileImageUrl?: string;
            textOriginal?: string;
            publishedAt?: string;
          };
        };
      };
    }>;
    error?: { message?: string };
  } | null;
  // Comments can be disabled per-video, or the video can have none yet -
  // both are normal states for a channel's back catalog, not failures.
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) return [];
    throw new Error(payload?.error?.message || "Unable to list comments");
  }

  return (payload?.items || []).map((item) => {
    const snippet = item.snippet?.topLevelComment?.snippet;
    return {
      topLevelCommentId: item.id,
      authorChannelId: snippet?.authorChannelId?.value || "",
      authorDisplayName: snippet?.authorDisplayName || "",
      authorProfileImageUrl: snippet?.authorProfileImageUrl || "",
      textOriginal: snippet?.textOriginal || "",
      publishedAt: snippet?.publishedAt || "",
      videoId
    };
  });
}

export async function postCommentReply(settings: IntegrationSettings, parentId: string, text: string) {
  const response = await fetchYoutubeWithAutoRefresh(
    settings,
    "https://www.googleapis.com/youtube/v3/comments?part=snippet",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { parentId, textOriginal: text } })
    }
  );
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Unable to reply to the YouTube comment");
  return payload;
}
