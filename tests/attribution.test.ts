import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-attribution.db");

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

describe("storeWhatsAppMessage attribution", () => {
  it("strips the [REF:id] marker, matches the LinkClick, and stamps attribution on a genuinely new conversation", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    await ensureSchema();

    await prisma.linkClick.create({
      data: {
        id: "click-abc123",
        tenantId: "tenant-attr-test",
        pageId: "home",
        linkId: "hero-whatsapp",
        buttonId: "hero-primary-whatsapp",
        referrer: "https://example.com",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "launch",
        utmContent: "",
        createdAt: new Date().toISOString()
      }
    });

    const result = await storeWhatsAppMessage({
      phone: "966500000001",
      name: "عميل تجريبي",
      text: "مرحباً، أبغى أعرف أكثر عن Linkly\n​[REF:click-abc123]",
      direction: "in",
      tenantId: "tenant-attr-test"
    });

    const conversation = await prisma.conversation.findUnique({ where: { id: result.conversationId } });
    expect(conversation?.attrPageId).toBe("home");
    expect(conversation?.attrLinkId).toBe("hero-whatsapp");
    expect(conversation?.attrButtonId).toBe("hero-primary-whatsapp");
    expect(conversation?.attrUtmSource).toBe("google");
    expect(conversation?.lastMessage).toBe("مرحباً، أبغى أعرف أكثر عن Linkly");
    expect(conversation?.lastMessage).not.toContain("REF:");

    const message = await prisma.message.findUnique({ where: { id: result.message.id } });
    expect(message?.text).not.toContain("REF:");

    const customer = await prisma.customer.findUnique({ where: { id: conversation?.customerId } });
    expect(customer?.attrPageId).toBe("home");
    expect(customer?.attrButtonId).toBe("hero-primary-whatsapp");

    const click = await prisma.linkClick.findUnique({ where: { id: "click-abc123" } });
    expect(click?.matchedConversationId).toBe(result.conversationId);
  });

  it("does not overwrite attribution on a second message from the same phone", async () => {
    const { prisma } = await import("../lib/prisma");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");

    await prisma.linkClick.create({
      data: {
        id: "click-second-msg",
        tenantId: "tenant-attr-test",
        pageId: "home",
        linkId: "hero-whatsapp",
        buttonId: "hero-primary-whatsapp",
        referrer: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        utmContent: "",
        createdAt: new Date().toISOString()
      }
    });

    const first = await storeWhatsAppMessage({
      phone: "966500000002",
      text: "مرحباً",
      direction: "in",
      tenantId: "tenant-attr-test"
    });
    // A second, unrelated click id arrives on the phone's follow-up message -
    // it must never retroactively change attribution already recorded on
    // the conversation's creation.
    await storeWhatsAppMessage({
      phone: "966500000002",
      text: "سؤال ثاني\n​[REF:click-second-msg]",
      direction: "in",
      tenantId: "tenant-attr-test"
    });

    const conversation = await prisma.conversation.findUnique({ where: { id: first.conversationId } });
    expect(conversation?.attrPageId).toBe("");
    expect(conversation?.attrLinkId).toBe("");
  });

  it("falls back cleanly when there is no marker or no matching click", async () => {
    const { prisma } = await import("../lib/prisma");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");

    const noMarker = await storeWhatsAppMessage({ phone: "966500000003", text: "رسالة عادية", direction: "in", tenantId: "tenant-attr-test" });
    const noMarkerConversation = await prisma.conversation.findUnique({ where: { id: noMarker.conversationId } });
    expect(noMarkerConversation?.attrPageId).toBe("");
    expect(noMarkerConversation?.lastMessage).toBe("رسالة عادية");

    const badRef = await storeWhatsAppMessage({ phone: "966500000004", text: "رسالة\n​[REF:does-not-exist]", direction: "in", tenantId: "tenant-attr-test" });
    const badRefConversation = await prisma.conversation.findUnique({ where: { id: badRef.conversationId } });
    expect(badRefConversation?.attrPageId).toBe("");
    expect(badRefConversation?.lastMessage).toBe("رسالة");
  });

  it("does not apply a click token belonging to another workspace", async () => {
    const { prisma } = await import("../lib/prisma");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    await prisma.linkClick.create({
      data: {
        id: "click-other-workspace",
        tenantId: "tenant-other",
        pageId: "private-page",
        linkId: "private-link",
        buttonId: "private-button",
        createdAt: new Date().toISOString()
      }
    });

    const result = await storeWhatsAppMessage({
      phone: "966500000005",
      text: "رسالة\n​[REF:click-other-workspace]",
      direction: "in",
      tenantId: "tenant-attr-test"
    });
    const conversation = await prisma.conversation.findUnique({ where: { id: result.conversationId } });
    expect(conversation?.attrPageId).toBe("");
    expect(conversation?.attrButtonId).toBe("");
  });
});
