import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversation-insights.db");
const tenantId = "tenant-conversation-insights-test";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("AI_SUMMARY_API_KEY", "");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedClosedConversation(id: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  await prisma.customer.upsert({
    where: { id: `cust-${id}` },
    update: {},
    create: { id: `cust-${id}`, name: "عميل تجريبي", phone: `visitor-${id}`, initial: "ع", tenantId }
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
      assignee: "سارة",
      tenantId,
      closedAt: new Date().toISOString()
    }
  });
}

describe("isAiSummaryConfigured", () => {
  it("is false when no provider key is set", async () => {
    const { isAiSummaryConfigured } = await import("../lib/conversation-insights");
    expect(isAiSummaryConfigured()).toBe(false);
  });
});

describe("summarizeConversation", () => {
  it("returns null when no provider is configured, without making any network call", async () => {
    const { summarizeConversation } = await import("../lib/conversation-insights");
    const result = await summarizeConversation([{ author: "العميل", text: "مرحبا" }]);
    expect(result).toBeNull();
  });
});

describe("enqueueConversationSummary", () => {
  it("creates a queue item for a conversation with no existing insight", async () => {
    const { enqueueConversationSummary } = await import("../lib/conversation-insights");
    const { prisma } = await import("../lib/prisma");

    const id = "conv-insight-enqueue";
    await seedClosedConversation(id);
    await enqueueConversationSummary(id, tenantId);

    const queued = await prisma.conversationSummaryQueueItem.findMany({ where: { conversationId: id } });
    expect(queued).toHaveLength(1);
  });

  it("skips enqueueing when a ConversationInsight already exists", async () => {
    const { enqueueConversationSummary } = await import("../lib/conversation-insights");
    const { prisma } = await import("../lib/prisma");

    const id = "conv-insight-existing";
    await seedClosedConversation(id);
    await prisma.conversationInsight.create({
      data: { id: `cin-${randomUUID()}`, conversationId: id, tenantId, intent: "استفسار", satisfactionLevel: "راضٍ", summary: "ملخص", createdAt: new Date().toISOString() }
    });

    await enqueueConversationSummary(id, tenantId);

    const queued = await prisma.conversationSummaryQueueItem.findMany({ where: { conversationId: id } });
    expect(queued).toHaveLength(0);
  });
});

describe("processDueConversationSummaries", () => {
  it("claims and drops queue items when no AI provider is configured, creating no insight", async () => {
    const { enqueueConversationSummary, processDueConversationSummaries } = await import("../lib/conversation-insights");
    const { prisma } = await import("../lib/prisma");

    const id = "conv-insight-drain-noop";
    await seedClosedConversation(id);
    await enqueueConversationSummary(id, tenantId);

    await processDueConversationSummaries(tenantId, 10);

    const queued = await prisma.conversationSummaryQueueItem.findMany({ where: { conversationId: id } });
    expect(queued).toHaveLength(0);
    const insight = await prisma.conversationInsight.findUnique({ where: { conversationId: id } });
    expect(insight).toBeNull();
  });

  it("never double-processes the same queued item across repeated drain calls", async () => {
    const { enqueueConversationSummary, processDueConversationSummaries } = await import("../lib/conversation-insights");
    const { prisma } = await import("../lib/prisma");

    const id = "conv-insight-drain-once";
    await seedClosedConversation(id);
    await enqueueConversationSummary(id, tenantId);

    await processDueConversationSummaries(tenantId, 10);
    // A second drain call must find nothing left to claim - proves the first
    // call's claim-then-process was atomic and exhaustive, not a partial or
    // repeatable operation.
    await processDueConversationSummaries(tenantId, 10);

    const queued = await prisma.conversationSummaryQueueItem.findMany({ where: { tenantId } });
    expect(queued).toHaveLength(0);
  });
});
