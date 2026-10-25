import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-campaign-stats-db.db");
const tenantId = "tenant-campaign-stats";

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

describe("campaign numbers come from the recipient rows", () => {
  it("reports failed recipients as failed (not pending), a ledger entry per deduction, and replies", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema, getCampaigns } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { spawnCampaignOccurrence, processCampaignBatch } = await import("../lib/campaign-engine");
    const { markCampaignReply } = await import("../lib/campaign-reply");
    await ensureSchema();

    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "test-phone-number-id", wabaId: "",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("test-access-token"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    await prisma.campaignBalance.create({ data: { tenantId, balance: 100, updatedAt: new Date().toISOString() } });
    await prisma.template.create({
      data: {
        id: `tmpl-${tenantId}`, tenantId, name: "promo", message: "عرض خاص!",
        type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", headerType: "NONE",
        headerText: "", headerMedia: "", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "",
        syncedAt: "-", lastUsed: "-"
      }
    });
    await prisma.customer.create({
      data: { id: `cust-${tenantId}`, name: "Opted out", phone: "966500000009", initial: "O", tenantId, marketingOptOut: 1, marketingOptOutAt: new Date().toISOString() }
    });

    const phones = ["966500000001", "966500000002", "966500000003", "966500000004", "966500000009"];
    const campaignId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
      tenantId, name: "حملة الأرقام", templateName: "promo", language: "ar", headerMediaDataUrl: "",
      recipients: phones.map((phone, index) => ({ phone, name: `عميل ${index}` })),
      status: "قيد الإرسال", linkTrackingEnabled: false, destinationUrl: ""
    }));

    // Two numbers are not on WhatsApp; the rest are accepted.
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const to = JSON.parse(String(init?.body ?? "{}")).to as string;
      if (to === "966500000003" || to === "966500000004") {
        return new Response(JSON.stringify({ error: { message: "(#131026) Message undeliverable", code: 131026 } }), { status: 400 });
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${to}` }] }), { status: 200 });
    }));
    await processCampaignBatch(tenantId, 50);
    vi.unstubAllGlobals();

    // One accepted message is later delivered, read, and answered.
    const accepted = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId, phone: "966500000001" } });
    await prisma.campaignRecipient.update({ where: { id: accepted.id }, data: { deliveredAt: new Date().toISOString(), readAt: new Date().toISOString() } });
    await markCampaignReply(tenantId, "966500000001");

    const [campaign] = await getCampaigns(tenantId);
    expect(campaign.status).toBe("الحملة أنجزت");
    expect(campaign.stats).toMatchObject({ total: 5, sent: 2, failed: 2, optedOut: 1, pending: 0, complete: true, delivered: 1, read: 1, replied: 1 });
    expect(campaign.stats?.failureReasons).toEqual([{ key: "unregistered", count: 2 }]);
    expect(campaign.sent).toBe(2);
    expect(campaign.progress).toBe("40%");
    expect(campaign.cost).toBeGreaterThan(0);

    // Two credits were spent (the failed sends were refunded) and the ledger has the matching entry.
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(98);
    expect(await prisma.campaignBalanceEntry.findUnique({ where: { id: `usage-${campaignId}` } })).toMatchObject({ messages: -2, kind: "usage", campaignId });
  });

  it("backfills a ledger entry for campaigns that sent before the ledger existed", async () => {
    const { prisma } = await import("../lib/prisma");
    const { backfillCampaignBalanceEntries } = await import("../lib/database");
    const now = new Date().toISOString();
    await prisma.campaign.create({
      data: { id: "old-campaign", tenantId, name: "حملة قديمة", templateName: "promo", sent: 7, total: 7, progress: "100%", status: "الحملة أنجزت", updatedAt: now }
    });
    expect(await prisma.campaignBalanceEntry.findUnique({ where: { id: "usage-old-campaign" } })).toBeNull();

    await backfillCampaignBalanceEntries();
    await backfillCampaignBalanceEntries();

    const entries = await prisma.campaignBalanceEntry.findMany({ where: { campaignId: "old-campaign" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ messages: -7, note: "حملة قديمة" });
  });
});
