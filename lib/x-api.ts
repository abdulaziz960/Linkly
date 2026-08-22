import { prisma } from "./prisma";
import { encryptSecret } from "./secret-storage";
import type { IntegrationSettings } from "../app/dashboard/types";

type XApiErrorPayload = {
  title?: string;
  detail?: string;
  type?: string;
  errors?: Array<{
    title?: string;
    detail?: string;
    message?: string;
    code?: string | number;
  }>;
};

type XTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export class XApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "XApiError";
    this.status = status;
  }
}

export function getXApiErrorMessage(payload: XApiErrorPayload | null, fallback: string) {
  return payload?.detail
    || payload?.title
    || payload?.errors?.[0]?.detail
    || payload?.errors?.[0]?.message
    || payload?.errors?.[0]?.title
    || fallback;
}

function getXOAuthCredentials(settings: IntegrationSettings) {
  return {
    clientId: settings.appId.trim(),
    clientSecret: settings.configId.trim(),
    refreshToken: settings.xAccessTokenSecret.trim()
  };
}

export async function refreshXAccessToken(settings: IntegrationSettings) {
  const { clientId, clientSecret, refreshToken } = getXOAuthCredentials(settings);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new XApiError("ربط X يحتاج إعادة تسجيل دخول.", 401);
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId
    })
  });
  const payload = await response.json().catch(() => null) as XTokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    throw new XApiError(payload?.error_description || payload?.error || "تعذر تحديث ربط X.", response.status || 401);
  }

  await prisma.integrationSetting.update({
    where: { id: settings.id },
    data: {
      accessToken: encryptSecret(payload.access_token),
      xAccessToken: encryptSecret(payload.access_token),
      xAccessTokenSecret: encryptSecret(payload.refresh_token || refreshToken)
    }
  });

  return payload.access_token;
}

export async function fetchXWithAutoRefresh(settings: IntegrationSettings, input: string | URL, init: RequestInit = {}) {
  const send = (accessToken: string) => fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });

  let accessToken = settings.accessToken.trim() || settings.xAccessToken.trim();
  if (!accessToken) {
    accessToken = await refreshXAccessToken(settings);
  }

  let response = await send(accessToken);
  if (response.status === 401) {
    const refreshedToken = await refreshXAccessToken(settings);
    response = await send(refreshedToken);
  }

  return response;
}

export async function sendXDirectMessage(settings: IntegrationSettings, recipientId: string, text: string) {
  const cleanRecipientId = recipientId.replace(/^@/, "").trim();
  if (!cleanRecipientId) throw new XApiError("معرّف عميل X غير موجود في ملف المحادثة.", 400);

  const response = await fetchXWithAutoRefresh(
    settings,
    `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(cleanRecipientId)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    }
  );
  const payload = await response.json().catch(() => null) as (XApiErrorPayload & {
    data?: {
      dm_event_id?: string;
      dm_conversation_id?: string;
    };
  }) | null;

  if (!response.ok || !payload?.data?.dm_event_id) {
    throw new XApiError(getXApiErrorMessage(payload, "تعذر إرسال الرسالة عبر X."), response.status || 502);
  }

  return payload.data;
}
