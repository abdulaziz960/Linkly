import { getXPlatformCredentials } from "./x-platform";

const X_API = "https://api.x.com/2";

type XWebhook = {
  id?: string;
  url?: string;
  valid?: boolean;
};

type XSubscription = {
  subscription_id?: string;
  event_type?: string;
  filter?: { user_id?: string };
  webhook_id?: string;
};

function authorization(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>;
}

function apiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as {
    title?: string;
    detail?: string;
    error?: string;
    error_description?: string;
    errors?: Array<{ title?: string; detail?: string; message?: string }>;
  };
  return value.detail
    || value.error_description
    || value.error
    || value.title
    || value.errors?.[0]?.detail
    || value.errors?.[0]?.message
    || value.errors?.[0]?.title
    || fallback;
}

export async function ensureXWebhook(webhookUrl: string) {
  const { bearerToken } = getXPlatformCredentials();
  if (!bearerToken) throw new Error("X_BEARER_TOKEN is not configured");

  const listResponse = await fetch(`${X_API}/webhooks`, {
    headers: authorization(bearerToken),
    cache: "no-store"
  });
  const listPayload = await readJson<{ data?: XWebhook[] }>(listResponse);
  if (!listResponse.ok) {
    throw new Error(apiError(listPayload, "تعذر قراءة Webhooks من X"));
  }

  const existing = (listPayload?.data || []).find((item) => item.url === webhookUrl && item.id);
  if (existing?.id) {
    if (!existing.valid) {
      const validateResponse = await fetch(`${X_API}/webhooks/${existing.id}`, {
        method: "PUT",
        headers: authorization(bearerToken)
      });
      const validatePayload = await readJson<unknown>(validateResponse);
      if (!validateResponse.ok) {
        throw new Error(apiError(validatePayload, "تعذر إعادة تفعيل Webhook في X"));
      }
    }
    return existing.id;
  }

  const createResponse = await fetch(`${X_API}/webhooks`, {
    method: "POST",
    headers: {
      ...authorization(bearerToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url: webhookUrl })
  });
  const createPayload = await readJson<XWebhook & { data?: XWebhook }>(createResponse);
  const created = createPayload?.data || createPayload;
  if (!createResponse.ok || !created?.id) {
    throw new Error(apiError(createPayload, "تعذر إنشاء Webhook في X"));
  }

  return created.id;
}

async function activityRequest(
  input: string,
  init: RequestInit,
  appBearerToken: string,
  userAccessToken?: string
) {
  const send = (token: string) => fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...authorization(token)
    },
    cache: "no-store"
  });

  let response = await send(appBearerToken);
  if ((response.status === 401 || response.status === 403) && userAccessToken) {
    response = await send(userAccessToken);
  }
  return response;
}

export async function ensureXActivitySubscriptions(input: {
  userId: string;
  webhookId: string;
  userAccessToken?: string;
}) {
  const { bearerToken } = getXPlatformCredentials();
  if (!bearerToken) throw new Error("X_BEARER_TOKEN is not configured");

  const listResponse = await activityRequest(
    `${X_API}/activity/subscriptions`,
    { method: "GET" },
    bearerToken,
    input.userAccessToken
  );
  const listPayload = await readJson<{ data?: XSubscription[] }>(listResponse);
  if (!listResponse.ok) {
    throw new Error(apiError(listPayload, "تعذر قراءة اشتراكات X Activity"));
  }

  const existing = listPayload?.data || [];
  const requiredEvents = ["dm.received", "dm.sent"] as const;
  const created: string[] = [];

  for (const eventType of requiredEvents) {
    const found = existing.find((item) =>
      item.event_type === eventType
      && item.filter?.user_id === input.userId
      && item.webhook_id === input.webhookId
    );
    if (found) continue;

    const response = await activityRequest(
      `${X_API}/activity/subscriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          filter: { user_id: input.userId },
          tag: `linkly-${eventType.replace(".", "-")}-${input.userId}`,
          webhook_id: input.webhookId
        })
      },
      bearerToken,
      input.userAccessToken
    );
    const payload = await readJson<unknown>(response);
    if (!response.ok) {
      throw new Error(apiError(payload, `تعذر تفعيل ${eventType} في X Activity`));
    }
    created.push(eventType);
  }

  return { created, webhookId: input.webhookId };
}

export async function ensureXRealtimeDelivery(input: {
  userId: string;
  userAccessToken?: string;
  webhookUrl?: string;
}) {
  const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://audiencew.audience.sa").replace(/\/$/, "");
  const webhookUrl = input.webhookUrl || `${baseUrl}/api/x/webhook`;
  const webhookId = await ensureXWebhook(webhookUrl);
  const subscriptions = await ensureXActivitySubscriptions({
    userId: input.userId,
    webhookId,
    userAccessToken: input.userAccessToken
  });

  return { webhookUrl, webhookId, ...subscriptions };
}
