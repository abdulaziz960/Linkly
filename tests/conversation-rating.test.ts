import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversation-rating.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedClosedConversation(id: string, assignee: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  await prisma.customer.upsert({
    where: { id: `cust-${id}` },
    update: {},
    create: { id: `cust-${id}`, name: "عميل تجريبي", phone: `visitor-${id}`, initial: "ع", tenantId: "tenant-rating-test" }
  });
  await prisma.conversation.upsert({
    where: { id },
    update: {},
    create: {
      id,
      customerId: `cust-${id}`,
      channel: "website",
      lastMessage: "",
      status: "closed",
      assignee,
      tenantId: "tenant-rating-test"
    }
  });
}

describe("requestRatingIfNeeded", () => {
  it("sends a rating request and marks it once, only when a real employee is assigned", async () => {
    const { requestRatingIfNeeded } = await import("../lib/conversation-rating");
    const { prisma } = await import("../lib/prisma");

    await seedClosedConversation("conv-rating-request", "سارة");
    await requestRatingIfNeeded("conv-rating-request", "tenant-rating-test");

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-rating-request" } });
    expect(conversation?.ratingRequestedAt).not.toBe("");

    const messages = await prisma.message.findMany({ where: { conversationId: "conv-rating-request" } });
    expect(messages.some((message) => message.author === "نظام التقييم")).toBe(true);

    // Calling it again shouldn't send a second request.
    const before = messages.length;
    await requestRatingIfNeeded("conv-rating-request", "tenant-rating-test");
    const after = await prisma.message.findMany({ where: { conversationId: "conv-rating-request" } });
    expect(after.length).toBe(before);
  });

  it("does not request a rating when nobody was actually assigned", async () => {
    const { requestRatingIfNeeded } = await import("../lib/conversation-rating");
    const { prisma } = await import("../lib/prisma");

    await seedClosedConversation("conv-rating-unassigned", "بدون موظف");
    await requestRatingIfNeeded("conv-rating-unassigned", "tenant-rating-test");

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-rating-unassigned" } });
    expect(conversation?.ratingRequestedAt).toBe("");
  });
});

describe("maybeRecordRatingReply", () => {
  it("records a bare 1-5 reply as the rating, snapshotting the current assignee", async () => {
    const { maybeRecordRatingReply } = await import("../lib/conversation-rating");
    const { prisma } = await import("../lib/prisma");

    await seedClosedConversation("conv-rating-reply", "سارة");
    await prisma.conversation.update({ where: { id: "conv-rating-reply" }, data: { ratingRequestedAt: new Date().toISOString() } });

    const consumed = await maybeRecordRatingReply("conv-rating-reply", "5");
    expect(consumed).toBe(true);

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-rating-reply" } });
    expect(conversation?.rating).toBe(5);
    expect(conversation?.ratingEmployee).toBe("سارة");
    expect(conversation?.ratingAt).not.toBe("");
  });

  it("ignores replies when no rating was requested", async () => {
    const { maybeRecordRatingReply } = await import("../lib/conversation-rating");

    await seedClosedConversation("conv-rating-no-request", "سارة");
    const consumed = await maybeRecordRatingReply("conv-rating-no-request", "5");
    expect(consumed).toBe(false);
  });

  it("ignores non-rating text", async () => {
    const { maybeRecordRatingReply } = await import("../lib/conversation-rating");
    const { prisma } = await import("../lib/prisma");

    await seedClosedConversation("conv-rating-text", "سارة");
    await prisma.conversation.update({ where: { id: "conv-rating-text" }, data: { ratingRequestedAt: new Date().toISOString() } });

    const consumed = await maybeRecordRatingReply("conv-rating-text", "شكرا لكم جزيلا");
    expect(consumed).toBe(false);
  });

  it("does not overwrite an already-recorded rating", async () => {
    const { maybeRecordRatingReply } = await import("../lib/conversation-rating");
    const { prisma } = await import("../lib/prisma");

    await seedClosedConversation("conv-rating-twice", "سارة");
    await prisma.conversation.update({
      where: { id: "conv-rating-twice" },
      data: { ratingRequestedAt: new Date().toISOString(), rating: 3, ratingAt: new Date().toISOString() }
    });

    const consumed = await maybeRecordRatingReply("conv-rating-twice", "5");
    expect(consumed).toBe(false);

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-rating-twice" } });
    expect(conversation?.rating).toBe(3);
  });
});

describe("end-to-end via storeWebsiteMessage", () => {
  it("captures a rating reply on a closed conversation instead of restarting the bot", async () => {
    const { storeWebsiteMessage, websiteConversationId } = await import("../lib/website-inbox");
    const { requestRatingIfNeeded } = await import("../lib/conversation-rating");
    const { prisma } = await import("../lib/prisma");

    const tenantId = "tenant-rating-e2e";
    const visitorId = "visitor-e2e-1";
    const conversationId = websiteConversationId(tenantId, visitorId);

    await storeWebsiteMessage({ tenantId, visitorId, name: "زائر", text: "أحتاج مساعدة" });
    await prisma.conversation.update({
      where: { id: conversationId },
      // A non-empty sentinel here proves restartBotFlowIfClosed does NOT run
      // for this message - it would reset botRanAt back to "" if it did.
      data: { status: "closed", assignee: "محمد", botRanAt: "already-ran-sentinel" }
    });
    await requestRatingIfNeeded(conversationId, tenantId);

    await storeWebsiteMessage({ tenantId, visitorId, name: "زائر", text: "4" });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(conversation?.rating).toBe(4);
    expect(conversation?.ratingEmployee).toBe("محمد");
    expect(conversation?.botRanAt).toBe("already-ran-sentinel");
  });
});
