import { createHmac } from "crypto";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-whatsapp-media-order.db");
const tenantId = "tenant-media-order";
const secret = "test-whatsapp-app-secret";
const phoneNumberId = "pnid-media";

vi.setConfig({ testTimeout: 120_000 });

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", secret);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

function imageRequest(id: string) {
  const rawBody = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba-media", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId },
      contacts: [{ wa_id: "966555000111", profile: { name: "عميل الصور" } }],
      messages: [{ id, from: "966555000111", timestamp: String(Math.floor(Date.now() / 1000)), type: "image", image: { id: `media-${id}`, mime_type: "image/jpeg" } }]
    } }] }]
  });
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return new NextRequest("http://localhost/api/meta/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": signature }, body: rawBody });
}

describe("incoming WhatsApp images", () => {
  it("the message is stored and visible at once; the file is attached when the download finishes", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    await ensureSchema();
    await prisma.integrationSetting.create({ data: {
      id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "", wabaName: "", phoneNumber: "",
      phoneNumberId, wabaId: "waba-media", appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"),
      webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
    } });

    // Meta's file download is held until the test lets it go (a slow download).
    let releaseDownload: () => void = () => {};
    const downloadHeld = new Promise<void>((resolve) => { releaseDownload = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const address = String(url);
      if (address.includes("graph.facebook.com") && address.includes("/media-")) return new Response(JSON.stringify({ url: "https://lookaside.example/file", mime_type: "image/jpeg" }), { status: 200 });
      if (address.startsWith("https://lookaside.example")) {
        await downloadHeld;
        return new Response(Buffer.from("fake-jpeg-bytes"), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }));

    const { POST } = await import("../app/api/meta/webhook/route");
    const pending = POST(imageRequest("wamid.IMG1"));

    // While the download is still blocked, the message is already in the inbox - without its file yet.
    let row = null as Awaited<ReturnType<typeof prisma.message.findFirst>>;
    for (let i = 0; i < 100 && !row; i++) {
      row = await prisma.message.findFirst({ where: { id: "wa-wamid.IMG1" } });
      if (!row) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(row).not.toBeNull();
    expect(row?.text).toBe("صورة واردة");
    expect(row?.attachmentUrl).toBe("");

    releaseDownload();
    const response = await pending;
    expect(response.status).toBe(200);

    const after = await prisma.message.findFirstOrThrow({ where: { id: "wa-wamid.IMG1" } });
    expect(after.attachmentType).toBe("image");
    expect(after.attachmentUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(after.metaMediaId).toBe("media-wamid.IMG1");
  });

  it("a failed download leaves the message as text, as before", async () => {
    const { prisma } = await import("../lib/prisma");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { POST } = await import("../app/api/meta/webhook/route");
    expect((await POST(imageRequest("wamid.IMG2"))).status).toBe(200);
    const row = await prisma.message.findFirstOrThrow({ where: { id: "wa-wamid.IMG2" } });
    expect(row.text).toBe("صورة واردة");
    expect(row.attachmentUrl).toBe("");
  });
});
