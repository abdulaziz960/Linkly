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

type XTweetsResponse = {
  data?: Array<{
    id?: string;
    text?: string;
    created_at?: string;
    author_id?: string;
    conversation_id?: string;
    referenced_tweets?: Array<{ type?: string; id?: string }>;
  }>;
  includes?: {
    users?: XUser[];
  };
  errors?: Array<{ detail?: string; message?: string }>;
};

function getUserName(users: Map<string, XUser>, id: string) {
  const user = users.get(id);
  return user?.username ? `@${user.username}` : user?.name;
}

function getPostUrl(username: string | undefined, postId: string) {
  if (!postId) return undefined;
  return username ? `https://x.com/${username}/status/${postId}` : `https://x.com/i/web/status/${postId}`;
}

function getReferencedPostId(tweet: NonNullable<XTweetsResponse["data"]>[number]) {
  const repliedTo = tweet.referenced_tweets?.find((item) => item.type === "replied_to" && item.id);
  const quoted = tweet.referenced_tweets?.find((item) => item.type === "quoted" && item.id);
  return repliedTo?.id || quoted?.id || tweet.conversation_id || "";
}

export async function syncXTenant(settings: IntegrationSettings) {
  const tenantId = settings.tenantId;
  const ownUserId = settings.wabaId.trim();

  if (!ownUserId) {
    return { ok: false, error: "X غير مربوط بالكامل", synced: 0, syncedDms: 0, syncedMentions: 0, status: 400 };
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
      return { ok: false, error: error.message, synced: 0, syncedDms: 0, syncedMentions: 0, status: error.status };
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
      syncedMentions: 0,
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

  const mentionsUrl = new URL(`https://api.x.com/2/users/${encodeURIComponent(ownUserId)}/mentions`);
  mentionsUrl.searchParams.set("max_results", "50");
  mentionsUrl.searchParams.set("tweet.fields", "id,text,created_at,author_id,conversation_id,referenced_tweets");
  mentionsUrl.searchParams.set("expansions", "author_id");
  mentionsUrl.searchParams.set("user.fields", "name,username");

  let storedMentions: Awaited<ReturnType<typeof storeXMessage>>[] = [];
  const mentionsResponse = await fetchXWithAutoRefresh(settings, mentionsUrl);
  const mentionsPayload = await mentionsResponse.json().catch(() => null) as XTweetsResponse | null;
  if (mentionsResponse.ok && mentionsPayload) {
    const mentionUsers = new Map(
      (mentionsPayload.includes?.users || [])
        .filter((mentionUser) => mentionUser.id)
        .map((mentionUser) => [String(mentionUser.id), mentionUser])
    );
    const mentionEvents = (mentionsPayload.data || []).filter((tweet) => {
      if (!tweet.id || !tweet.text?.trim() || !tweet.author_id) return false;
      return String(tweet.author_id) !== ownUserId;
    });
    storedMentions = await Promise.all(mentionEvents.map((tweet) => {
      const authorId = String(tweet.author_id);
      const tweetId = String(tweet.id);
      const relatedPostId = getReferencedPostId(tweet);
      const username = mentionUsers.get(authorId)?.username;
      return storeXMessage({
        tenantId,
        xUserId: authorId,
        name: getUserName(mentionUsers, authorId),
        text: `منشن/رد: ${tweet.text || ""}`,
        direction: "in",
        messageId: tweetId,
        receivedAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
        source: {
          type: "x_post",
          id: relatedPostId || tweetId,
          url: getPostUrl(username, relatedPostId || tweetId),
          label: relatedPostId ? "البوست المرتبط بالتعليق" : "منشن أو رد على X"
        }
      });
    }));
  }

  return {
    ok: true,
    synced: storedDms.length + storedMentions.length,
    syncedDms: storedDms.length,
    syncedMentions: storedMentions.length,
    status: 200
  };
}
