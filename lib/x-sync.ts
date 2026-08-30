import type { IntegrationSettings } from "../app/dashboard/types";
import { fetchXWithAutoRefresh, getXApiErrorMessage, XApiError } from "./x-api";
import { storeXMessage } from "./x-inbox";
import { prisma } from "./prisma";

type XDmEvent = {
  id?: string;
  event_type?: string;
  text?: string;
  created_at?: string;
  sender_id?: string;
  dm_conversation_id?: string;
  participant_ids?: string[];
};

type XUser = {
  id?: string;
  name?: string;
  username?: string;
};

type XDmEventsResponse = {
  data?: XDmEvent[];
  includes?: {
    users?: XUser[];
  };
  errors?: Array<{ detail?: string; message?: string }>;
};

function getUserName(users: Map<string, XUser>, id: string) {
  const user = users.get(id);
  return user?.username ? `@${user.username}` : user?.name;
}

// Mentions/public replies are synced exclusively by lib/x-public-sync.ts
// (its own cron, /api/cron/x-mentions) - this used to also poll mentions
// here, which doubled the X API calls every minute (a real contributor to
// rate-limit-driven delays) and stored them under a different conversation
// key than the public-sync path, splitting a customer's public thread into
// two separate conversations. It also anchored replies to the *parent*
// tweet instead of the customer's own comment, which sent replies to the
// wrong place on X entirely.
export async function syncXTenant(settings: IntegrationSettings) {
  const tenantId = settings.tenantId;
  const ownUserId = settings.wabaId.trim();

  if (!ownUserId) {
    return { ok: false, error: "X غير مربوط بالكامل", synced: 0, syncedDms: 0, status: 400 };
  }

  // Same reasoning as lib/x-public-sync.ts's mentions backoff: DMs are
  // polled every minute by the campaigns cron *and* every 30s per open
  // dashboard tab (app/dashboard/DashboardClient.tsx), so a rate limit here
  // was being re-triggered constantly instead of ever clearing.
  const rateLimitRow = await prisma.integrationSetting.findUnique({
    where: { id: settings.id },
    select: { xDmRateLimitedUntil: true, xDmSyncedUntilId: true }
  });
  const rateLimitedUntil = Date.parse(rateLimitRow?.xDmRateLimitedUntil || "");
  if (Number.isFinite(rateLimitedUntil) && rateLimitedUntil > Date.now()) {
    return { ok: false, error: "تم تجاوز الحد المسموح لطلبات X مؤقتاً", synced: 0, syncedDms: 0, status: 429 };
  }

  const dmUrl = new URL("https://api.x.com/2/dm_events");
  dmUrl.searchParams.set("max_results", "50");
  dmUrl.searchParams.set("dm_event.fields", "id,text,event_type,created_at,sender_id,dm_conversation_id,participant_ids");
  dmUrl.searchParams.set("expansions", "sender_id,participant_ids");
  dmUrl.searchParams.set("user.fields", "name,username");

  let dmResponse: Response;
  try {
    dmResponse = await fetchXWithAutoRefresh(settings, dmUrl);
  } catch (error) {
    if (error instanceof XApiError) {
      return { ok: false, error: error.message, synced: 0, syncedDms: 0, status: error.status };
    }
    throw error;
  }

  if (dmResponse.status === 429) {
    const resetHeader = dmResponse.headers.get("x-rate-limit-reset") || dmResponse.headers.get("x-app-limit-24hour-reset");
    const resetAt = resetHeader && Number.isFinite(Number(resetHeader))
      ? new Date(Number(resetHeader) * 1000).toISOString()
      : new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: { xDmRateLimitedUntil: resetAt } }).catch(() => {});
    return { ok: false, error: "تم تجاوز الحد المسموح لطلبات X - سيُعاد المحاولة تلقائياً بعد فترة قصيرة.", synced: 0, syncedDms: 0, status: 429 };
  }

  const dmPayload = await dmResponse.json().catch(() => null) as XDmEventsResponse | null;
  if (!dmResponse.ok || !dmPayload) {
    return {
      ok: false,
      error: getXApiErrorMessage(dmPayload || null, "تعذر مزامنة رسائل X"),
      synced: 0,
      syncedDms: 0,
      status: dmResponse.status || 502
    };
  }

  if (rateLimitRow?.xDmRateLimitedUntil) {
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: { xDmRateLimitedUntil: "" } }).catch(() => {});
  }

  const users = new Map(
    (dmPayload.includes?.users || [])
      .filter((user) => user.id)
      .map((user) => [String(user.id), user])
  );
  // Every poll re-fetches the same last-50 window (the endpoint has no
  // usable since_id-style cursor for this app tier), so without a watermark
  // an event already stored - then intentionally deleted by the user in the
  // dashboard - gets reprocessed by the very next poll and the deleted
  // conversation silently comes back. X's ids are snowflake integers, safe
  // to compare as BigInt but too large for a JS Number.
  const syncedUntilId = rateLimitRow?.xDmSyncedUntilId || "";
  const isNewerThanWatermark = (id: string) => {
    if (!id) return false;
    if (!syncedUntilId) return true;
    try {
      return BigInt(id) > BigInt(syncedUntilId);
    } catch {
      return true;
    }
  };

  const incomingEvents = (dmPayload.data || []).filter((event) => {
    if (event.event_type && event.event_type !== "MessageCreate") return false;
    if (!event.text?.trim() || !event.sender_id || !event.id) return false;
    if (String(event.sender_id) === ownUserId) return false;
    return isNewerThanWatermark(event.id);
  });

  const newestId = (dmPayload.data || [])
    .map((event) => event.id)
    .filter((id): id is string => Boolean(id))
    .reduce((max, id) => {
      try {
        return !max || BigInt(id) > BigInt(max) ? id : max;
      } catch {
        return max;
      }
    }, syncedUntilId);
  if (newestId && newestId !== syncedUntilId) {
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: { xDmSyncedUntilId: newestId } }).catch(() => {});
  }

  const storedDms = await Promise.all(incomingEvents.map((event) => storeXMessage({
    tenantId,
    xUserId: String(event.sender_id),
    name: getUserName(users, String(event.sender_id)),
    text: event.text || "رسالة واردة من X",
    direction: "in",
    messageId: event.id,
    receivedAt: event.created_at ? new Date(event.created_at) : new Date(),
    source: {
      type: "x_dm",
      id: event.dm_conversation_id || event.id
    }
  })));

  return {
    ok: true,
    synced: storedDms.length,
    syncedDms: storedDms.length,
    status: 200
  };
}
