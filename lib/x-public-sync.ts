import { getIntegrationSettings } from "./database";
import { fetchXWithAutoRefresh, getXApiErrorMessage, XApiError } from "./x-api";
import { storeXMessage } from "./x-inbox";
import { prisma } from "./prisma";

type XReferencedPost = {
  type?: "replied_to" | "quoted" | "retweeted" | string;
  id?: string;
};

type XPost = {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  referenced_tweets?: XReferencedPost[];
};

type XUser = {
  id?: string;
  name?: string;
  username?: string;
};

type XMentionsResponse = {
  data?: XPost[];
  includes?: { users?: XUser[] };
  meta?: { newest_id?: string; result_count?: number };
  errors?: Array<{ title?: string; detail?: string; message?: string }>;
  title?: string;
  detail?: string;
};

function displayName(user?: XUser) {
  if (!user) return undefined;
  return user.username ? `@${user.username}` : user.name;
}

function sourceLabel(post: XPost) {
  const refs = post.referenced_tweets || [];
  if (refs.some((item) => item.type === "replied_to")) return "رد على منشور X";
  if (refs.some((item) => item.type === "quoted")) return "اقتباس لمنشور X";
  return "منشن على X";
}

function threadRoot(post: XPost) {
  const repliedTo = post.referenced_tweets?.find((item) => item.type === "replied_to")?.id;
  const quoted = post.referenced_tweets?.find((item) => item.type === "quoted")?.id;
  return post.conversation_id || repliedTo || quoted || post.id || "unknown";
}

export async function syncXMentionsForTenant(tenantId: string) {
  const settings = await getIntegrationSettings("x", tenantId);
  const ownUserId = settings.wabaId.trim();
  if (settings.status !== "connected" || !ownUserId) {
    return { ok: false, skipped: true, synced: 0 };
  }

  // X's mentions endpoint has a tight per-window rate limit that a 1/minute
  // cron across many tenants can blow through easily - a 429 used to look
  // identical to "no new mentions" (silently swallowed), which read as
  // messages just never arriving. Skip calling again until the window X
  // told us about actually resets, instead of wasting (and re-triggering)
  // another 429 every single minute.
  const rateLimitRow = await prisma.integrationSetting.findUnique({
    where: { id: settings.id },
    select: { xMentionsRateLimitedUntil: true }
  });
  const rateLimitedUntil = Date.parse(rateLimitRow?.xMentionsRateLimitedUntil || "");
  if (Number.isFinite(rateLimitedUntil) && rateLimitedUntil > Date.now()) {
    return { ok: false, skipped: true, rateLimited: true, retryAt: rateLimitRow?.xMentionsRateLimitedUntil, synced: 0 };
  }

  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(ownUserId)}/mentions`);
  url.searchParams.set("max_results", "50");
  url.searchParams.set("exclude", "retweets");
  url.searchParams.set("tweet.fields", "id,text,author_id,created_at,conversation_id,referenced_tweets");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,username");

  let response: Response;
  try {
    response = await fetchXWithAutoRefresh(settings, url);
  } catch (error) {
    if (error instanceof XApiError) throw error;
    throw new XApiError(error instanceof Error ? error.message : "تعذر مزامنة منشورات X", 502);
  }

  if (response.status === 429) {
    const resetHeader = response.headers.get("x-rate-limit-reset") || response.headers.get("x-app-limit-24hour-reset");
    const resetAt = resetHeader && Number.isFinite(Number(resetHeader))
      ? new Date(Number(resetHeader) * 1000).toISOString()
      : new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: { xMentionsRateLimitedUntil: resetAt } }).catch(() => {});
    throw new XApiError("تم تجاوز الحد المسموح لطلبات X - سيُعاد المحاولة تلقائياً بعد فترة قصيرة.", 429);
  }

  const payload = await response.json().catch(() => null) as XMentionsResponse | null;
  if (!response.ok || !payload) {
    throw new XApiError(
      getXApiErrorMessage(payload, "تعذر مزامنة الردود والمنشنات من X"),
      response.status || 502
    );
  }

  // A successful call means we're not rate-limited (or the window rolled
  // over) - clear any stale marker so the next cron tick doesn't skip for no
  // reason.
  if (rateLimitRow?.xMentionsRateLimitedUntil) {
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: { xMentionsRateLimitedUntil: "" } }).catch(() => {});
  }

  const users = new Map(
    (payload.includes?.users || [])
      .filter((user) => user.id)
      .map((user) => [String(user.id), user])
  );

  const posts = (payload.data || []).filter((post) => {
    if (!post.id || !post.author_id || !post.text?.trim()) return false;
    return String(post.author_id) !== ownUserId;
  });

  let synced = 0;
  for (const post of posts) {
    const authorId = String(post.author_id);
    const root = threadRoot(post);
    await storeXMessage({
      tenantId,
      xUserId: authorId,
      recipientId: authorId,
      conversationKey: `public:${root}:${authorId}`,
      name: displayName(users.get(authorId)),
      text: post.text || "منشور وارد من X",
      direction: "in",
      messageId: `post-${post.id}`,
      receivedAt: post.created_at ? new Date(post.created_at) : new Date(),
      source: {
        type: "x_post",
        id: post.id,
        url: `https://x.com/i/web/status/${post.id}`,
        label: sourceLabel(post)
      }
    });
    synced += 1;
  }

  return {
    ok: true,
    synced,
    fetched: posts.length,
    newestId: payload.meta?.newest_id || ""
  };
}
