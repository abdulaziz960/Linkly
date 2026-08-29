import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-conversation-status.db");

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

describe("new conversations and the auto-reply bot", () => {
  it("starts unassigned (open) when the channel's bot is not enabled", async () => {
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const { prisma } = await import("../lib/prisma");

    await storeWhatsAppMessage({ tenantId: "tenant-bot-status", phone: "966500000001", text: "مرحبا", direction: "in" });

    const conversation = await prisma.conversation.findFirst({ where: { customerId: "tenant-bot-status-wa-966500000001" } });
    expect(conversation?.status).toBe("unassigned");
  });

  it("starts closed when the channel has an enabled bot with a real flow", async () => {
    const { setBotEnabled, saveBotNodes } = await import("../lib/bot-engine");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const { prisma } = await import("../lib/prisma");

    await setBotEnabled("tenant-bot-status", "whatsapp", true);
    await saveBotNodes("tenant-bot-status", "whatsapp", [
      { type: "إرسال رسالة", title: "ترحيب", content: { kind: "message", text: "أهلاً بك", next: null } }
    ]);

    await storeWhatsAppMessage({ tenantId: "tenant-bot-status", phone: "966500000002", text: "مرحبا", direction: "in" });

    const conversation = await prisma.conversation.findFirst({ where: { customerId: "tenant-bot-status-wa-966500000002" } });
    expect(conversation?.status).toBe("closed");
  });

  it("does not start closed when the bot is enabled but has no flow saved yet", async () => {
    const { setBotEnabled } = await import("../lib/bot-engine");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const { prisma } = await import("../lib/prisma");

    await setBotEnabled("tenant-bot-status-empty", "whatsapp", true);

    await storeWhatsAppMessage({ tenantId: "tenant-bot-status-empty", phone: "966500000003", text: "مرحبا", direction: "in" });

    const conversation = await prisma.conversation.findFirst({ where: { customerId: "tenant-bot-status-empty-wa-966500000003" } });
    expect(conversation?.status).toBe("unassigned");
  });

  it("reopens the conversation automatically once the bot transfers it to a team", async () => {
    const { setBotEnabled, saveBotNodes, runWhatsAppBot } = await import("../lib/bot-engine");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const { prisma } = await import("../lib/prisma");

    await setBotEnabled("tenant-bot-transfer", "whatsapp", true);
    await saveBotNodes("tenant-bot-transfer", "whatsapp", [
      { type: "تحويل لفريق", title: "تحويل", content: { kind: "team", teamName: "" } }
    ]);

    const stored = await storeWhatsAppMessage({ tenantId: "tenant-bot-transfer", phone: "966500000004", text: "أحتاج مساعدة", direction: "in" });
    const conversationId = stored.conversationId;

    const beforeTransfer = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(beforeTransfer?.status).toBe("closed");

    await runWhatsAppBot({ tenantId: "tenant-bot-transfer", conversationId, phone: "966500000004" });

    const afterTransfer = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(afterTransfer?.status).not.toBe("closed");
  });
});
