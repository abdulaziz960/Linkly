import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-engine-knowledge-base.db");

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

async function lastBotMessage(conversationId: string) {
  const { prisma } = await import("../lib/prisma");
  return prisma.message.findFirst({
    where: { conversationId, direction: "out" },
    orderBy: { createdAt: "desc" }
  });
}

// The website channel is used here (rather than whatsapp) because sending a
// reply on it needs no external provider credentials - storeWebsiteMessage/
// sendWebsiteTextMessage just write a Message row directly, so the bot's
// actual reply text can be asserted on without mocking an outbound API.
describe("Knowledge Base bot node", () => {
  it("sends the matched KB answer and advances past the node", async () => {
    const { setBotEnabled, saveBotNodes, runChannelBot } = await import("../lib/bot-engine");
    const { createKbEntry } = await import("../lib/knowledge-base");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { storeWebsiteMessage } = await import("../lib/website-inbox");
    const { prisma } = await import("../lib/prisma");

    const tenantId = "tenant-bot-kb-match";
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 100 ريال شهرياً" });

    await setBotEnabled(tenantId, "website", true);
    await saveBotNodes(tenantId, "website", [
      { type: "رد من قاعدة المعرفة", title: "قاعدة المعرفة", content: { kind: "knowledgeBase", noMatchText: "ما لقيت إجابة مناسبة", next: null } }
    ]);

    const text = "وش سعر الاشتراك بالشهر؟";
    const stored = await storeWebsiteMessage({ tenantId, visitorId: "visitor-kb-match", text });
    await runChannelBot("website", { tenantId, conversationId: stored.conversationId, recipientId: "visitor-kb-match", incomingText: text });

    const reply = await lastBotMessage(stored.conversationId);
    expect(reply?.text).toBe("يبدأ من 100 ريال شهرياً");

    const conversation = await prisma.conversation.findUnique({ where: { id: stored.conversationId } });
    expect(conversation?.botWaitingNodeId).toBe("");
  });

  it("sends noMatchText when nothing in the Knowledge Base matches", async () => {
    const { setBotEnabled, saveBotNodes, runChannelBot } = await import("../lib/bot-engine");
    const { createKbEntry } = await import("../lib/knowledge-base");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { storeWebsiteMessage } = await import("../lib/website-inbox");

    const tenantId = "tenant-bot-kb-nomatch";
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 100 ريال شهرياً" });

    await setBotEnabled(tenantId, "website", true);
    await saveBotNodes(tenantId, "website", [
      { type: "رد من قاعدة المعرفة", title: "قاعدة المعرفة", content: { kind: "knowledgeBase", noMatchText: "ما لقيت إجابة مناسبة، بحولك لموظف", next: null } }
    ]);

    const text = "أبغى أشتكي على التوصيل";
    const stored = await storeWebsiteMessage({ tenantId, visitorId: "visitor-kb-nomatch", text });
    await runChannelBot("website", { tenantId, conversationId: stored.conversationId, recipientId: "visitor-kb-nomatch", incomingText: text });

    const reply = await lastBotMessage(stored.conversationId);
    expect(reply?.text).toBe("ما لقيت إجابة مناسبة، بحولك لموظف");
  });

  it("advances to the linked next node after a KB reply", async () => {
    const { setBotEnabled, saveBotNodes, runChannelBot } = await import("../lib/bot-engine");
    const { createKbEntry } = await import("../lib/knowledge-base");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { storeWebsiteMessage } = await import("../lib/website-inbox");
    const { prisma } = await import("../lib/prisma");

    const tenantId = "tenant-bot-kb-next";
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 100 ريال شهرياً" });

    await setBotEnabled(tenantId, "website", true);
    await saveBotNodes(tenantId, "website", [
      { id: "kb-node", type: "رد من قاعدة المعرفة", title: "قاعدة المعرفة", content: { kind: "knowledgeBase", noMatchText: "ما وجدت إجابة", next: "close-node" } },
      { id: "close-node", type: "إغلاق المحادثة", title: "إغلاق", content: { kind: "close", text: "شكراً لتواصلك" } }
    ]);

    const text = "وش سعر الاشتراك؟";
    const stored = await storeWebsiteMessage({ tenantId, visitorId: "visitor-kb-next", text });
    await runChannelBot("website", { tenantId, conversationId: stored.conversationId, recipientId: "visitor-kb-next", incomingText: text });

    const conversation = await prisma.conversation.findUnique({ where: { id: stored.conversationId } });
    expect(conversation?.status).toBe("closed");
  });
});
