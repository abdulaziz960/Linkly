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
    errors?: Array<{ title?: string; detail?: string; message?: string; parameter?: string; value?: string }>;
  };
  const message = value.detail
    || value.error_description
    || value.error
    || value.title
    || value.errors?.[0]?.detail
    || value.errors?.[0]?.message
    || value.errors?.[0]?.title
    || fallback;
  // X's error objects can name exactly which field/value was rejected -
  // when present, that's far more actionable than the generic title/detail
  // text alone (e.g. "One or more parameters ... was invalid" everywhere).
  const firstError = value.errors?.[0];
  const detail = [
    firstError?.parameter ? `parameter=${firstError.parameter}` : null,
    firstError?.value !== undefined ? `value=${JSON.stringify(firstError.value)}` : null
  ].filter(Boolean).join(" ");
  if (detail) return `${message} (${detail})`;
  // Two prior fixes targeted at the documented errors[].parameter/value
  // fields changed nothing, and this field never actually appeared in a
  // real response - fall back to the raw body so the next report shows
  // X's actual response shape instead of another guess.
  const raw = JSON.stringify(payload);
  return raw.length > 4 ? `${message} [raw=${raw.slice(0, 300)}]` : message;
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
    throw new Error(`[webhooks:list] ${apiError(listPayload, "تعذر قراءة Webhooks من X")}`);
  }

  const existingList = listPayload?.data || [];
  const existing = existingList.find((item) => item.url === webhookUrl && item.id);
  if (existing?.id) {
    if (!existing.valid) {
      const validateResponse = await fetch(`${X_API}/webhooks/${existing.id}`, {
        method: "PUT",
        headers: authorization(bearerToken)
      });
      const validatePayload = await readJson<unknown>(validateResponse);
      if (!validateResponse.ok) {
        throw new Error(`[webhooks:validate] ${apiError(validatePayload, "تعذر إعادة تفعيل Webhook في X")}`);
      }
    }
    return existing.id;
  }

  // X caps how many webhooks a single App may register (confirmed live via
  // a WebhookLimitExceeded error) - this platform only ever needs one, so a
  // stale registration left over from a previous webhook URL (e.g. before
  // the ?tenant= fix) must be removed first or creation below fails.
  for (const stale of existingList) {
    if (!stale.id) continue;
    await fetch(`${X_API}/webhooks/${stale.id}`, {
      method: "DELETE",
      headers: authorization(bearerToken)
    }).catch(() => {});
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
    throw new Error(`[webhooks:create url=${webhookUrl}] ${apiError(createPayload, "تعذر إنشاء Webhook في X")}`);
  }

  return created.id;
}

// Every event type this app subscribes to is documented as either
// explicitly "Private" or requiring the dm.read scope - both mean an
// OAuth2 user-context token, which an app-only Bearer token structurally
// cannot be. Falling back to the Bearer token on failure used to mask the
// real error: it always fails too (with a *different*, less useful
// message: "OAuth user access token is required for this event type"),
// and since that second failure was the one surfaced, it looked like the
// user token itself was never even being tried.
function activityRequest(input: string, init: RequestInit, userAccessToken: string) {
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...authorization(userAccessToken)
    },
    cache: "no-store"
  });
}

export async function ensureXActivitySubscriptions(input: {
  userId: string;
  webhookId: string;
  userAccessToken?: string;
}) {
  if (!input.userAccessToken) {
    throw new Error("[subscriptions] يلزم رمز وصول المستخدم (OAuth) - أعد ربط حساب X");
  }
  const userAccessToken = input.userAccessToken;

  const listResponse = await activityRequest(
    `${X_API}/activity/subscriptions`,
    { method: "GET" },
    userAccessToken
  );
  const listPayload = await readJson<{ data?: XSubscription[] }>(listResponse);
  if (!listResponse.ok) {
    throw new Error(`[subscriptions:list] ${apiError(listPayload, "تعذر قراءة اشتراكات X Activity")}`);
  }

  const existing = listPayload?.data || [];
  // Keep polling only as a fallback. These subscriptions are the primary,
  // low-latency delivery path for customer conversations in Linkly.
  const requiredEvents = [
    "dm.received",
    "dm.sent",
    "post.mention.create",
    "post.reply.create",
    "post.quote.create"
  ] as const;
  const created: string[] = [];

  for (const eventType of requiredEvents) {
    const found = existing.find((item) =>
      item.event_type === eventType
      && item.webhook_id === input.webhookId
      && item.filter?.user_id === input.userId
    );
    if (found) continue;

    // X's real (undocumented-in-practice) validation is "exactly one filter
    // (userId or keyword) must be provided" for every event type, including
    // dm.* - confirmed via the raw error body X returned when filter was
    // left empty ("FilterInvalid: Exactly one filter (userId or keyword)
    // must be provided"). The docs' phrasing ("for mute.*/block.* this must
    // be the authenticated source user") only describes an extra constraint
    // on those two types, not an exemption for everyone else.
    const response = await activityRequest(
      `${X_API}/activity/subscriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          filter: { user_id: input.userId },
          tag: `linkly-${eventType.replaceAll(".", "-")}-${input.userId}`,
          webhook_id: input.webhookId
        })
      },
      userAccessToken
    );
    const payload = await readJson<unknown>(response);
    if (!response.ok) {
      throw new Error(`[subscriptions:create ${eventType} webhook_id=${input.webhookId} status=${response.status}] ${apiError(payload, `تعذر تفعيل ${eventType} في X Activity`)}`);
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
  const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://linklysa.io").replace(/\/$/, "");
  const webhookUrl = input.webhookUrl || `${baseUrl}/api/x/webhook`;
  const webhookId = await ensureXWebhook(webhookUrl);
  const subscriptions = await ensureXActivitySubscriptions({
    userId: input.userId,
    webhookId,
    userAccessToken: input.userAccessToken
  });

  return { webhookUrl, ...subscriptions };
}
