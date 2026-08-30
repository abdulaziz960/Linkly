import type { IntegrationSettings } from "../app/dashboard/types";
import { fetchXWithAutoRefresh, getXApiErrorMessage, XApiError } from "./x-api";
import { storeXMessage } from "./x-inbox";

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

  const users = new Map(
    (dmPayload.includes?.users || [])
      .filter((user) => user.id)
      .map((user) => [String(user.id), user])
  );
  const incomingEvents = (dmPayload.data || []).filter((event) => {
    if (event.event_type && event.event_type !== "MessageCreate") return false;
    if (!event.text?.trim() || !event.sender_id) return false;
    return String(event.sender_id) !== ownUserId;
  });

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
