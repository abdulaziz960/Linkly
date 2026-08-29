import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-x-conversation.db");

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-x-test",
    name: "Agent",
    email: "agent@x-test.example",
    role: "مالك الحساب",
    tenantId: "tenant-x-test"
  }))
}));

let postReplyCounter = 0;
const sendXPostReply = vi.fn(async () => ({ id: `reply-tweet-id-${++postReplyCounter}` }));
const sendXDirectMessage = vi.fn(async () => ({ dm_event_id: "dm-1", dm_conversation_id: "dmconv-1" }));

vi.mock("../lib/x-api", async () => {
  const actual = await vi.importActual<typeof import("../lib/x-api")>("../lib/x-api");
  return {
    ...actual,
    sendXPostReply,
    sendXDirectMessage
  };
});

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterEach(() => {
  sendXPostReply.mockClear();
  sendXDirectMessage.mockClear();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedConversation(id: string, messages: Array<{ id: string; direction: string; text: string; createdAt: string; sourceType?: string; sourceId?: string }>) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  const tenantId = "tenant-x-test";
  await prisma.customer.upsert({
    where: { id: `cust-${id}` },
    update: {},
    create: { id: `cust-${id}`, name: "X Customer", phone: "x_customer_1", initial: "X", tenantId }
  });
  await prisma.conversation.upsert({
    where: { id },
    update: {},
    create: { id, customerId: `cust-${id}`, channel: "x", lastMessage: "", status: "مفتوحة", assignee: "بدون موظف", tenantId }
  });

  // Insert intentionally out of chronological order to mirror the real bug:
  // a periodic mention/DM sync can insert an older message after a newer
  // one already exists.
  for (const message of [...messages].reverse()) {
    await prisma.message.create({
      data: {
        id: message.id,
        conversationId: id,
        direction: message.direction,
        text: message.text,
        time: "12:00",
        createdAt: message.createdAt,
        author: "",
        sourceType: message.sourceType || "",
        sourceId: message.sourceId || ""
      }
    });
  }
}

describe("X conversation message ordering", () => {
  it("returns messages sorted chronologically regardless of insertion order", async () => {
    const { getConversations } = await import("../lib/database");

    await seedConversation("conv-order-test", [
      { id: "msg-order-1", direction: "in", text: "first", createdAt: "2026-01-01T10:00:00.000Z" },
      { id: "msg-order-2", direction: "out", text: "second", createdAt: "2026-01-01T10:05:00.000Z" },
      { id: "msg-order-3", direction: "in", text: "third", createdAt: "2026-01-01T10:10:00.000Z" }
    ]);

    const conversations = await getConversations("tenant-x-test");
    const conversation = conversations.find((item) => item.id === "conv-order-test");
    expect(conversation).toBeTruthy();
    expect(conversation!.messages.map((message) => message.text)).toEqual(["first", "second", "third"]);
  });
});

describe("X reply routing (public post vs DM)", () => {
  it("replies publicly on the post when the conversation's latest message is a public mention", async () => {
    await seedConversation("conv-post-reply", [
      { id: "msg-post-1", direction: "in", text: "من فضلكم ردوا", createdAt: "2026-01-02T09:00:00.000Z", sourceType: "x_post", sourceId: "tweet-123" }
    ]);

    const { POST } = await import("../app/api/conversations/[id]/messages/route");
    const response = await POST(
      new NextRequest("http://localhost/api/conversations/conv-post-reply/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "شكرًا لتواصلكم" })
      }),
      { params: Promise.resolve({ id: "conv-post-reply" }) }
    );

    expect(response.status).toBe(200);
    expect(sendXPostReply).toHaveBeenCalledTimes(1);
    expect(sendXPostReply).toHaveBeenCalledWith(expect.anything(), "tweet-123", "شكرًا لتواصلكم");
    expect(sendXDirectMessage).not.toHaveBeenCalled();

    const { prisma } = await import("../lib/prisma");
    const stored = await prisma.message.findFirst({ where: { conversationId: "conv-post-reply", direction: "out" } });
    expect(stored?.sourceType).toBe("x_post_reply");
  });

  it("keeps anchoring every follow-up reply to the customer's original comment, not to our own previous reply", async () => {
    await seedConversation("conv-post-chain", [
      { id: "msg-chain-1", direction: "in", text: "تعليق العميل الأصلي", createdAt: "2026-01-02T09:00:00.000Z", sourceType: "x_post", sourceId: "tweet-original" },
      // A reply we already sent - this is now the conversation's most
      // recent message, exactly like after the first "POST /messages"
      // call above. Anchoring to this instead of the original comment is
      // the bug: every following reply would nest one level deeper.
      { id: "msg-chain-2", direction: "out", text: "ردنا الأول", createdAt: "2026-01-02T09:05:00.000Z", sourceType: "x_post_reply", sourceId: "tweet-our-first-reply" }
    ]);

    const { POST } = await import("../app/api/conversations/[id]/messages/route");
    const response = await POST(
      new NextRequest("http://localhost/api/conversations/conv-post-chain/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "ردنا الثاني" })
      }),
      { params: Promise.resolve({ id: "conv-post-chain" }) }
    );

    expect(response.status).toBe(200);
    expect(sendXPostReply).toHaveBeenCalledWith(expect.anything(), "tweet-original", "ردنا الثاني");
    expect(sendXDirectMessage).not.toHaveBeenCalled();
  });

  it("sends a private DM when the conversation's latest message is a DM, even if an older mention exists", async () => {
    await seedConversation("conv-dm-after-post", [
      { id: "msg-mix-1", direction: "in", text: "منشن قديم", createdAt: "2026-01-02T09:00:00.000Z", sourceType: "x_post", sourceId: "tweet-old" },
      { id: "msg-mix-2", direction: "in", text: "رسالة خاصة جديدة", createdAt: "2026-01-02T10:00:00.000Z", sourceType: "x_dm" }
    ]);

    const { POST } = await import("../app/api/conversations/[id]/messages/route");
    const response = await POST(
      new NextRequest("http://localhost/api/conversations/conv-dm-after-post/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "أهلاً بك" })
      }),
      { params: Promise.resolve({ id: "conv-dm-after-post" }) }
    );

    expect(response.status).toBe(200);
    expect(sendXDirectMessage).toHaveBeenCalledTimes(1);
    expect(sendXPostReply).not.toHaveBeenCalled();
  });

  it("honors an explicitly selected reply target even when the latest message is a DM", async () => {
    await seedConversation("conv-explicit-reply", [
      { id: "msg-explicit-1", direction: "in", text: "منشن للرد عليه", createdAt: "2026-01-02T09:00:00.000Z", sourceType: "x_post", sourceId: "tweet-explicit" },
      { id: "msg-explicit-2", direction: "in", text: "رسالة خاصة لاحقة", createdAt: "2026-01-02T10:00:00.000Z", sourceType: "x_dm" }
    ]);

    const { POST } = await import("../app/api/conversations/[id]/messages/route");
    const response = await POST(
      new NextRequest("http://localhost/api/conversations/conv-explicit-reply/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "رد عام محدد", replyToMessageId: "msg-explicit-1" })
      }),
      { params: Promise.resolve({ id: "conv-explicit-reply" }) }
    );

    expect(response.status).toBe(200);
    expect(sendXPostReply).toHaveBeenCalledWith(expect.anything(), "tweet-explicit", "رد عام محدد");
    expect(sendXDirectMessage).not.toHaveBeenCalled();
  });
});
