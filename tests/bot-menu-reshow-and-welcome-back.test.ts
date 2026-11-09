import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-menu-reshow.db");
const sent: string[] = [];

vi.mock("../lib/telegram-send", () => ({
  sendTelegramTextMessage: vi.fn(async (args: { text: string }) => {
    sent.push(args.text);
    return { ok: true };
  })
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
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

async function setup(tenantId: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  const { setBotEnabled, saveBotNodes } = await import("../lib/bot-engine");
  await ensureSchema();
  await setBotEnabled(tenantId, "telegram", true);
  await saveBotNodes(tenantId, "telegram", [
    { id: `${tenantId}-menu`, type: "إرسال قائمة قصيرة", title: "القائمة", content: { kind: "list", text: "اختر الخدمة", options: [{ id: "o1", label: "الأسعار", next: `${tenantId}-answer` }, { id: "o2", label: "الموقع", next: `${tenantId}-answer` }] } },
    { id: `${tenantId}-answer`, type: "إرسال رسالة", title: "الأسعار", content: { kind: "message", text: "أسعارنا كذا", next: null } }
  ]);
  await prisma.customer.create({ data: { id: `c-${tenantId}`, name: "سلمان", phone: "966500000555", initial: "س", tenantId } });
  await prisma.conversation.create({ data: { id: `v-${tenantId}`, customerId: `c-${tenantId}`, channel: "telegram", lastMessage: "x", status: "closed", assignee: "بدون موظف", tenantId } });
  return { prisma, conversationId: `v-${tenantId}` };
}

async function customerSays(prisma: Awaited<ReturnType<typeof setup>>["prisma"], conversationId: string, text: string) {
  await prisma.message.create({ data: { id: `m-${Math.random()}`, conversationId, direction: "in", text, author: "سلمان", time: "10:00", createdAt: new Date().toISOString() } });
}

describe("the menu comes back until the customer chooses", () => {
  it("re-sends the menu when the customer types instead of choosing, and answers once they choose", async () => {
    const tenantId = "t-reshow";
    const { prisma, conversationId } = await setup(tenantId);
    const { runTelegramBot } = await import("../lib/bot-engine");
    sent.length = 0;

    await customerSays(prisma, conversationId, "السلام عليكم");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat1", incomingText: "السلام عليكم" });
    expect(sent.filter((text) => text.includes("اختر الخدمة"))).toHaveLength(1);

    await customerSays(prisma, conversationId, "ابي استفسار");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat1", incomingText: "ابي استفسار" });
    expect(sent.filter((text) => text.includes("اختر الخدمة"))).toHaveLength(2);

    await customerSays(prisma, conversationId, "كلام ثاني");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat1", incomingText: "كلام ثاني" });
    expect(sent.filter((text) => text.includes("اختر الخدمة"))).toHaveLength(3);

    await customerSays(prisma, conversationId, "1");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat1", incomingText: "1" });
    expect(sent.filter((text) => text.includes("اختر الخدمة"))).toHaveLength(3);
    expect(sent).toContain("أسعارنا كذا");
  });

  it("stops re-sending once a team member has replied", async () => {
    const tenantId = "t-human";
    const { prisma, conversationId } = await setup(tenantId);
    const { runTelegramBot } = await import("../lib/bot-engine");
    sent.length = 0;
    await customerSays(prisma, conversationId, "مرحبا");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat2", incomingText: "مرحبا" });
    await prisma.message.create({ data: { id: "m-human", conversationId, direction: "out", text: "هلا", author: "سارة", time: "10:01", createdAt: new Date().toISOString() } });
    sent.length = 0;
    await customerSays(prisma, conversationId, "ابي موظف");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat2", incomingText: "ابي موظف" });
    expect(sent).toHaveLength(0);
  });
});

describe("a returning customer is welcomed back", () => {
  it("greets a customer who messages again after the conversation closed, but not a new one", async () => {
    const tenantId = "t-back";
    const { prisma, conversationId } = await setup(tenantId);
    const { runTelegramBot } = await import("../lib/bot-engine");
    const { restartBotFlowIfClosed } = await import("../lib/conversation-lifecycle");
    sent.length = 0;

    await customerSays(prisma, conversationId, "مرحبا");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat3", incomingText: "مرحبا" });
    expect(sent.some((text) => text.includes("بعودتك"))).toBe(false);
    expect(sent.some((text) => text.includes("اختر الخدمة"))).toBe(true);

    // The chat ends and closes; the customer writes again days later.
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "closed", botWaitingNodeId: "" } });
    await prisma.$transaction((tx) => restartBotFlowIfClosed(tx, conversationId));
    sent.length = 0;
    await customerSays(prisma, conversationId, "هلا مرة ثانية");
    await runTelegramBot({ tenantId, conversationId, chatId: "chat3", incomingText: "هلا مرة ثانية" });
    expect(sent[0]).toContain("أهلًا بعودتك يا سلمان");
    expect(sent.some((text) => text.includes("اختر الخدمة"))).toBe(true);
  });
});
