import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-campaign-send-speed.db");
const tenantId = "tenant-send-speed";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
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

async function setup(recipientCount: number, balance: number) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  const { encryptSecret } = await import("../lib/secret-storage");
  const { spawnCampaignOccurrence } = await import("../lib/campaign-engine");
  await ensureSchema();
  await prisma.integrationSetting.upsert({
    where: { id: `wa-${tenantId}` },
    update: {},
    create: {
      id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
      businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "test-phone-number-id", wabaId: "",
      appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("test-access-token"),
      webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
    }
  });
  await prisma.campaignBalance.upsert({
    where: { tenantId },
    update: { balance },
    create: { tenantId, balance, updatedAt: new Date().toISOString() }
  });
  const existing = await prisma.template.findFirst({ where: { tenantId, name: "promo" } });
  if (!existing) {
    await prisma.template.create({
      data: {
        id: `tmpl-${tenantId}`, tenantId, name: "promo", message: "عرض خاص!",
        type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", headerType: "NONE",
        headerText: "", headerMedia: "", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "",
        syncedAt: "-", lastUsed: "-"
      }
    });
  }
  const campaignId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
    tenantId, name: "حملة السرعة", templateName: "promo", language: "ar", headerMediaDataUrl: "",
    recipients: Array.from({ length: recipientCount }, (_, index) => ({ phone: `96650${String(1000000 + index)}`, name: `عميل ${index}` })),
    status: "قيد الإرسال", linkTrackingEnabled: false, destinationUrl: ""
  }));
  return { prisma, campaignId };
}

describe("campaign sending is concurrent and resilient", () => {
  it("sends several recipients at once and counts every one", async () => {
    const { prisma, campaignId } = await setup(40, 100);
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 });
    }));
    const { processCampaignBatch } = await import("../lib/campaign-engine");

    await processCampaignBatch(tenantId, 500);

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(campaign).toMatchObject({ sent: 40, status: "الحملة أنجزت" });
    expect(await prisma.campaignRecipient.count({ where: { campaignId, status: "تم الإرسال" } })).toBe(40);
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(60);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
    vi.unstubAllGlobals();
  });

  it("puts recipients back in the queue and stops when Meta says too many messages", async () => {
    const { prisma, campaignId } = await setup(30, 100);
    await prisma.campaignBalance.update({ where: { tenantId }, data: { balance: 100 } });
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls > 3) return new Response(JSON.stringify({ error: { message: "rate", code: 130429 } }), { status: 429 });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 });
    }));
    const { processCampaignBatch } = await import("../lib/campaign-engine");

    await processCampaignBatch(tenantId, 500, { concurrency: 1 });

    const sent = await prisma.campaignRecipient.count({ where: { campaignId, status: "تم الإرسال" } });
    const failed = await prisma.campaignRecipient.count({ where: { campaignId, status: "فشل الإرسال" } });
    const waiting = await prisma.campaignRecipient.count({ where: { campaignId, status: "قيد الإرسال" } });
    expect(sent).toBe(3);
    expect(failed).toBe(0);
    expect(waiting).toBe(27);
    expect((await prisma.campaign.findUnique({ where: { id: campaignId } }))?.status).toBe("قيد الإرسال");
    // The credit of the throttled send was given back: only the 3 delivered ones were spent.
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(97);
    vi.unstubAllGlobals();
  });

  it("stops starting new sends after the deadline and leaves the rest pending", async () => {
    const { prisma, campaignId } = await setup(20, 100);
    await prisma.campaignBalance.update({ where: { tenantId }, data: { balance: 100 } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 })));
    const { processCampaignBatch } = await import("../lib/campaign-engine");

    await processCampaignBatch(tenantId, 500, { deadlineAt: Date.now() - 1 });

    expect(await prisma.campaignRecipient.count({ where: { campaignId, status: "تم الإرسال" } })).toBe(0);
    expect(await prisma.campaignRecipient.count({ where: { campaignId, status: "قيد الإرسال" } })).toBe(20);
    vi.unstubAllGlobals();
  });
});
