import { NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { fetchXWithAutoRefresh, getXApiErrorMessage, XApiError } from "../../../../lib/x-api";
import { storeXMessage } from "../../../../lib/x-inbox";

export const runtime = "nodejs";

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

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });

  const settings = await getIntegrationSettings("x", user.tenantId);
  const ownUserId = settings.wabaId.trim();

  if (!ownUserId) {
    return NextResponse.json({ ok: false, error: "X غير مربوط بالكامل" }, { status: 400 });
  }

  const url = new URL("https://api.x.com/2/dm_events");
  url.searchParams.set("max_results", "50");
  url.searchParams.set("dm_event.fields", "id,text,event_type,created_at,sender_id,dm_conversation_id,participant_ids");
  url.searchParams.set("expansions", "sender_id,participant_ids");
  url.searchParams.set("user.fields", "name,username");

  let response: Response;
  try {
    response = await fetchXWithAutoRefresh(settings, url);
  } catch (error) {
    if (error instanceof XApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
  const payload = await response.json().catch(() => null) as XDmEventsResponse | null;

  if (!response.ok || !payload) {
    return NextResponse.json({
      ok: false,
      error: getXApiErrorMessage(payload || null, "تعذر مزامنة رسائل X")
    }, { status: response.status || 502 });
  }

  const users = new Map(
    (payload.includes?.users || [])
      .filter((user) => user.id)
      .map((user) => [String(user.id), user])
  );
  const incomingEvents = (payload.data || []).filter((event) => {
    if (event.event_type && event.event_type !== "MessageCreate") return false;
    if (!event.text?.trim() || !event.sender_id) return false;
    return String(event.sender_id) !== ownUserId;
  });

  const stored = await Promise.all(incomingEvents.map((event) => storeXMessage({
    tenantId: user.tenantId,
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

  return NextResponse.json({
    ok: true,
    synced: stored.length
  });
}

export async function GET() {
  return POST();
}
