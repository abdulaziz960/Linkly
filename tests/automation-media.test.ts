import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-automation-media.db");
const tenantId = "tenant-amedia";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const png = `data:image/png;base64,${Buffer.from("fake-png-bytes").toString("base64")}`;
const mp4 = `data:video/mp4;base64,${Buffer.from("fake-mp4-bytes").toString("base64")}`;

describe("automation pictures and videos", () => {
  it("accepts JPG/PNG/MP4 and refuses other types or oversized files", async () => {
    const { saveAutomationMedia } = await import("../lib/automation-media");

    expect(await saveAutomationMedia(tenantId, { name: "a.png", dataUrl: png })).toMatchObject({ ok: true, kind: "image" });
    expect(await saveAutomationMedia(tenantId, { name: "a.mp4", dataUrl: mp4 })).toMatchObject({ ok: true, kind: "video" });
    expect(await saveAutomationMedia(tenantId, { name: "a.pdf", dataUrl: `data:application/pdf;base64,${Buffer.from("%PDF-1.4").toString("base64")}` })).toMatchObject({ ok: true, kind: "document" });
    expect(await saveAutomationMedia(tenantId, { name: "a.svg", dataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}` })).toMatchObject({ ok: false });
    expect(await saveAutomationMedia(tenantId, { name: "a.png", dataUrl: "not-a-data-url" })).toMatchObject({ ok: false });

    const big = `data:image/png;base64,${Buffer.alloc(6 * 1024 * 1024).toString("base64")}`;
    expect(await saveAutomationMedia(tenantId, { name: "big.png", dataUrl: big })).toMatchObject({ ok: false });
  });

  it("is tenant-scoped when loading", async () => {
    const { saveAutomationMedia, loadAutomationMedia } = await import("../lib/automation-media");
    const saved = await saveAutomationMedia(tenantId, { name: "own.png", dataUrl: png });
    if (!saved.ok) throw new Error("save failed");
    expect(await loadAutomationMedia(tenantId, saved.id)).toMatchObject({ id: saved.id, kind: "image" });
    expect(await loadAutomationMedia("other-tenant", saved.id)).toBeNull();
  });

  it("a rule with a send-image action uploads to Meta then sends the media id with the caption", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { saveAutomationMedia } = await import("../lib/automation-media");
    const { runAutomationRuleManually } = await import("../lib/automation-engine");
    await ensureSchema();

    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "pnid-1", wabaId: "waba-1",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    await prisma.customer.create({ data: { id: "cust-am", name: "سارة", phone: "966500001111", initial: "س", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-am", customerId: "cust-am", channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف", tenantId } });

    const saved = await saveAutomationMedia(tenantId, { name: "offer.png", dataUrl: png });
    if (!saved.ok) throw new Error("save failed");
    await prisma.automationRule.create({
      data: {
        id: "auto-am", tenantId, name: "صورة العرض", description: "", trigger: "رد العميل", action: "إرسال صورة", target: saved.id,
        delayMinutes: 0, conditionsJson: "[]", createdAt: "Oct 13, 2026", enabled: 1,
        actionsJson: JSON.stringify([{ type: "إرسال صورة", target: saved.id, caption: "أهلاً {{name}}، هذا العرض", mediaName: "offer.png" }])
      }
    });

    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: init.body instanceof FormData ? "form" : JSON.parse(String(init.body)) });
      if (String(url).endsWith("/media")) return new Response(JSON.stringify({ id: "media-77" }));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.AM1" }] }));
    }));

    await runAutomationRuleManually("auto-am", tenantId, "conv-am");

    expect(calls[0].url).toContain("/pnid-1/media");
    expect(calls[1].url).toContain("/pnid-1/messages");
    expect(calls[1].body).toMatchObject({ to: "966500001111", type: "image", image: { id: "media-77", caption: "أهلاً سارة، هذا العرض" } });
    const message = await prisma.message.findFirst({ where: { conversationId: "conv-am", direction: "out" } });
    expect(message).toMatchObject({ text: "أهلاً سارة، هذا العرض", attachmentType: "image", author: "الأتمتة" });
  });

  it("a send-document action uploads the file and sends it with its file name", async () => {
    const { prisma } = await import("../lib/prisma");
    const { saveAutomationMedia } = await import("../lib/automation-media");
    const { runAutomationRuleManually } = await import("../lib/automation-engine");

    const saved = await saveAutomationMedia(tenantId, { name: "price-list.pdf", dataUrl: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}` });
    if (!saved.ok) throw new Error("save failed");
    await prisma.automationRule.create({
      data: {
        id: "auto-doc", tenantId, name: "قائمة الأسعار", description: "", trigger: "رد العميل", action: "إرسال مستند", target: saved.id,
        delayMinutes: 0, conditionsJson: "[]", createdAt: "Oct 13, 2026", enabled: 1,
        actionsJson: JSON.stringify([{ type: "إرسال مستند", target: saved.id, caption: "قائمة الأسعار", mediaName: "price-list.pdf" }])
      }
    });

    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: init.body instanceof FormData ? "form" : JSON.parse(String(init.body)) });
      if (String(url).endsWith("/media")) return new Response(JSON.stringify({ id: "doc-9" }));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.DOC1" }] }));
    }));

    await runAutomationRuleManually("auto-doc", tenantId, "conv-am");

    expect(calls[1].body).toMatchObject({ type: "document", document: { id: "doc-9", filename: "price-list.pdf", caption: "قائمة الأسعار" } });
    const message = await prisma.message.findFirst({ where: { conversationId: "conv-am", attachmentType: "document" } });
    expect(message).toMatchObject({ attachmentName: "price-list.pdf", attachmentMime: "application/pdf" });
  });
});
