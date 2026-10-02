import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-ai-reply-grounding.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "bot-ai-reply-test-key-not-production");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// BYOK tenant (own key) so the managed-plan checks don't apply; fetch is
// mocked so the "model" answer is whatever the test needs.
async function setupTenant(tenantId: string, modelAnswer: string) {
  const { prisma } = await import("../lib/prisma");
  const { encryptSecret } = await import("../lib/secret-storage");
  await prisma.aiWorkspaceSetting.create({
    data: { tenantId, provider: "openai", model: "gpt-test", enabled: 1, apiKey: encryptSecret("sk-test"), dailyLimit: 100, monthlyLimit: 1000, updatedAt: new Date().toISOString() }
  });
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: modelAnswer } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })));
  vi.stubGlobal("fetch", fetchMock);
  const { setBotEnabled, saveBotNodes, runChannelBot } = await import("../lib/bot-engine");
  await setBotEnabled(tenantId, "website", true);
  await saveBotNodes(tenantId, "website", [
    { id: "ai-node", type: "رد AI تلقائي", title: "رد AI", content: { kind: "aiReply", next: "handoff" } },
    { id: "handoff", type: "إرسال رسالة", title: "تحويل", content: { kind: "message", text: "بحولك لموظف", next: null } }
  ]);
  return { fetchMock, runChannelBot };
}

async function send(tenantId: string, visitorId: string, text: string, runChannelBot: (...args: never[]) => unknown) {
  const { storeWebsiteMessage } = await import("../lib/website-inbox");
  const { prisma } = await import("../lib/prisma");
  const stored = await storeWebsiteMessage({ tenantId, visitorId, text });
  await (runChannelBot as (channel: string, input: Record<string, string>) => Promise<void>)("website", { tenantId, conversationId: stored.conversationId, recipientId: visitorId, incomingText: text });
  const reply = await prisma.message.findFirst({ where: { conversationId: stored.conversationId, direction: "out" }, orderBy: { createdAt: "desc" } });
  return reply?.text;
}

describe("AI auto-reply bot node is grounded in the knowledge base", () => {
  it("answers from the KB and sends the model's grounded answer", async () => {
    const tenantId = "tenant-ai-bot-answer";
    const { createKbEntry } = await import("../lib/knowledge-base");
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 199 ريال شهريا" });
    const { fetchMock, runChannelBot } = await setupTenant(tenantId, "الاشتراك الشهري يبدأ من 199 ريال.");

    const reply = await send(tenantId, "v-answer", "كم سعر الاشتراك الشهري عندكم؟", runChannelBot as never);

    expect(reply).toBe("الاشتراك الشهري يبدأ من 199 ريال.");
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.messages[0].content).toContain("199");
    expect(body.messages[0].content).toContain("NO_ANSWER");
  });

  it("hands off without calling the model when the KB has nothing relevant", async () => {
    const tenantId = "tenant-ai-bot-nokb";
    const { createKbEntry } = await import("../lib/knowledge-base");
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 199 ريال شهريا" });
    const { fetchMock, runChannelBot } = await setupTenant(tenantId, "سأخترع جوابا");

    const reply = await send(tenantId, "v-nokb", "xyz qwerty zzz", runChannelBot as never);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply).toBe("بحولك لموظف");
  });

  it("hands off when the model reports NO_ANSWER instead of sending it to the customer", async () => {
    const tenantId = "tenant-ai-bot-noanswer";
    const { createKbEntry } = await import("../lib/knowledge-base");
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 199 ريال شهريا" });
    const { runChannelBot } = await setupTenant(tenantId, "NO_ANSWER");

    const reply = await send(tenantId, "v-noanswer", "كم سعر الاشتراك السنوي؟", runChannelBot as never);

    expect(reply).toBe("بحولك لموظف");
    expect(reply).not.toContain("NO_ANSWER");
  });
});
