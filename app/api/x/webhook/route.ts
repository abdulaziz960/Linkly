import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { storeXMessage } from "../../../../lib/x-inbox";

export const runtime = "nodejs";

type XUser = {
  id?: string;
  name?: string;
  username?: string;
};

type ParsedXEvent = {
  xUserId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  receivedAt?: Date;
  source?: {
    type: string;
    id?: string;
    url?: string;
    label?: string;
  };
};

function hmacSha256Base64(secret: string, value: string | Buffer) {
  return createHmac("sha256", secret).update(value).digest("base64");
}

function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return true;
  const expected = `sha256=${hmacSha256Base64(secret, rawBody)}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function parseDate(value: unknown) {
  if (typeof value === "number") return new Date(value);
  if (typeof value !== "string") return new Date();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.length >= 10) {
    return new Date(value.length > 12 ? numeric : numeric * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildUserMap(payload: Record<string, any>) {
  const users = [
    ...(Array.isArray(payload.includes?.users) ? payload.includes.users : []),
    ...(Array.isArray(payload.users) ? payload.users : []),
    ...(Array.isArray(payload.for_user_id) ? payload.for_user_id : [])
  ] as XUser[];

  return new Map(
    users
      .filter((user) => user?.id)
      .map((user) => [String(user.id), user])
  );
}

function getName(userMap: Map<string, XUser>, userId: string) {
  const user = userMap.get(userId);
  return user?.username ? `@${user.username}` : user?.name;
}

function parseDmEvents(payload: Record<string, any>, ownUserId: string): ParsedXEvent[] {
  const userMap = buildUserMap(payload);
  const events = [
    ...(Array.isArray(payload.dm_events) ? payload.dm_events : []),
    ...(Array.isArray(payload.direct_message_events) ? payload.direct_message_events : [])
  ];

  return events.flatMap((event: Record<string, any>) => {
    const legacyMessage = event.message_create;
    const senderId = String(event.sender_id || legacyMessage?.sender_id || "");
    const recipientId = String(legacyMessage?.target?.recipient_id || "");
    const participantIds = Array.isArray(event.participant_ids) ? event.participant_ids.map(String) : [];
    const otherParticipant = participantIds.find((id) => id !== ownUserId);
    const xUserId = senderId && senderId !== ownUserId ? senderId : otherParticipant || recipientId || senderId;
    const text = String(event.text || legacyMessage?.message_data?.text || "").trim();

    if (!xUserId || !text) return [];

    return [{
      xUserId,
      name: getName(userMap, xUserId),
      text,
      direction: senderId && senderId === ownUserId ? "out" : "in",
      messageId: String(event.id || legacyMessage?.message_data?.id || `${xUserId}-${Date.now()}`),
      receivedAt: parseDate(event.created_at || event.created_timestamp),
      source: {
        type: "x_dm",
        id: String(event.dm_conversation_id || event.id || "")
      }
    }];
  });
}

function parsePostEvents(payload: Record<string, any>, ownUserId: string): ParsedXEvent[] {
  const userMap = buildUserMap(payload);
  const posts = [
    ...(Array.isArray(payload.tweet_create_events) ? payload.tweet_create_events : []),
    ...(Array.isArray(payload.data) ? payload.data : payload.data?.id ? [payload.data] : []),
    ...(Array.isArray(payload.posts) ? payload.posts : [])
  ];

  return posts.flatMap((post: Record<string, any>) => {
    const authorId = String(post.author_id || post.user?.id || post.user_id || "");
    if (!authorId || authorId === ownUserId) return [];

    const text = String(post.text || "").trim();
    if (!text) return [];

    const postId = String(post.id || "");
    const username = userMap.get(authorId)?.username;

    return [{
      xUserId: authorId,
      name: getName(userMap, authorId),
      text: `منشن/رد: ${text}`,
      direction: "in",
      messageId: postId || `${authorId}-${Date.now()}`,
      receivedAt: parseDate(post.created_at || post.timestamp_ms),
      source: {
        type: "x_post",
        id: postId || undefined,
        url: username && postId ? `https://x.com/${username}/status/${postId}` : undefined,
        label: "منشن أو رد على X"
      }
    }];
  });
}

function parseXEvents(payload: Record<string, any>, ownUserId: string) {
  return [
    ...parseDmEvents(payload, ownUserId),
    ...parsePostEvents(payload, ownUserId)
  ];
}

export async function GET(request: NextRequest) {
  const settings = await getIntegrationSettings("x");
  const crcToken = request.nextUrl.searchParams.get("crc_token");
  const consumerSecret = settings.xConsumerSecret.trim();

  if (!crcToken) {
    return NextResponse.json({
      ok: true,
      channel: "x",
      webhookUrl: settings.webhookUrl,
      status: settings.status
    });
  }

  if (!consumerSecret) {
    return NextResponse.json({ error: "Missing X Consumer Secret" }, { status: 400 });
  }

  return NextResponse.json({
    response_token: `sha256=${hmacSha256Base64(consumerSecret, crcToken)}`
  });
}

export async function POST(request: NextRequest) {
  const settings = await getIntegrationSettings("x");
  const rawBody = await request.text();
  const signature = request.headers.get("x-twitter-webhooks-signature");
  const consumerSecret = settings.xConsumerSecret.trim();

  if (!verifySignature(rawBody, signature, consumerSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}") as Record<string, any>;
  const events = parseXEvents(payload, settings.wabaId.trim());
  const stored = await Promise.all(events.map((event) => storeXMessage(event)));

  return NextResponse.json({
    ok: true,
    channel: "x",
    received: true,
    saved: stored.length
  });
}
