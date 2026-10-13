import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-media-step.db");
const tenantId = "tenant-bot-media";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("auto-reply picture and video steps", () => {
  it("sends the uploaded video with its caption, then continues to the next step", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { saveAutomationMedia } = await import("../lib/automation-media");
    const { setBotEnabled, saveBotNodes, getBotNodes, runWhatsAppBot } = await import("../lib/bot-engine");
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    await ensureSchema();

    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "pnid-bm", wabaId: "waba-bm",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    const media = await saveAutomationMedia(tenantId, { name: "intro.mp4", dataUrl: `data:video/mp4;base64,${Buffer.from("mp4").toString("base64")}` });
    if (!media.ok) throw new Error("media save failed");

    await setBotEnabled(tenantId, "whatsapp", true);
    await saveBotNodes(tenantId, "whatsapp", [
      { id: "m1", type: "إرسال فيديو", title: "فيديو", content: { kind: "media", mediaId: media.id, mediaName: "intro.mp4", caption: "تعرّف علينا", next: "t1" } },
      { id: "t1", type: "إرسال رسالة", title: "بعده", content: { kind: "message", text: "كيف نخدمك؟", next: null } }
    ]);
    // the first saved step is the entry point; ids are remapped on save
    expect((await getBotNodes(tenantId, "whatsapp")).map((node) => node.type)).toEqual(["إرسال فيديو", "إرسال رسالة"]);

    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: init.body instanceof FormData ? "form" : JSON.parse(String(init.body)) });
      if (String(url).endsWith("/media")) return new Response(JSON.stringify({ id: "vid-1" }));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }));
    }));

    const stored = await storeWhatsAppMessage({ tenantId, phone: "966500000077", text: "مرحبا", direction: "in" });
    await runWhatsAppBot({ tenantId, conversationId: stored.conversationId, phone: "966500000077" });

    const sends = calls.filter((call) => call.url.endsWith("/messages")).map((call) => call.body);
    expect(calls.some((call) => call.url.endsWith("/media"))).toBe(true);
    expect(sends[0]).toMatchObject({ type: "video", video: { id: "vid-1", caption: "تعرّف علينا" } });
    expect(sends[1]).toMatchObject({ type: "text", text: { body: "كيف نخدمك؟" } });
  });
});
