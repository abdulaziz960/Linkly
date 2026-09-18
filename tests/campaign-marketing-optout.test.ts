import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-campaign-marketing-optout.db");
const tenantId = "tenant-marketing-optout";
const optedOutPhone = "966500000002";
const regularPhone = "966500000003";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("campaign sends skip customers who opted out via STOP", () => {
  it("skips the opted-out recipient without spending credit, and still sends to a regular one", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { spawnCampaignOccurrence, processCampaignBatch } = await import("../lib/campaign-engine");
    await ensureSchema();

    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "test-phone-number-id", wabaId: "",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("test-access-token"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    await prisma.campaignBalance.create({ data: { tenantId, balance: 10, updatedAt: new Date().toISOString() } });
    await prisma.template.create({
      data: {
        id: `tmpl-${tenantId}`, tenantId, name: "promo", message: "عرض خاص!",
        type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", headerType: "NONE",
        headerText: "", headerMedia: "", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "",
        syncedAt: "-", lastUsed: "-"
      }
    });
    // The customer row a STOP reply would have updated - marketingOptOut is
    // matched by phone, not by any relation to the CampaignRecipient row.
    await prisma.customer.create({
      data: { id: `cust-${tenantId}-opted-out`, name: "Opted-out customer", phone: optedOutPhone, initial: "O", tenantId, marketingOptOut: 1, marketingOptOutAt: new Date().toISOString() }
    });

    const campaignId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
      tenantId, name: "حملة اختبار", templateName: "promo", language: "ar", headerMediaDataUrl: "",
      recipients: [
        { phone: optedOutPhone, name: "Opted-out customer" },
        { phone: regularPhone, name: "Regular customer" }
      ],
      status: "قيد الإرسال", linkTrackingEnabled: false, destinationUrl: ""
    }));

    // No fetch mock is stubbed here at all - if the opted-out recipient's
    // send were ever attempted, the real (unmocked) fetch to graph.facebook.com
    // would blow up the test, making that failure mode loud rather than silent.
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await processCampaignBatch(tenantId, 5);
    vi.unstubAllGlobals();

    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId }, orderBy: { phone: "asc" } });
    const optedOutRecipient = recipients.find((r) => r.phone === optedOutPhone);
    const regularRecipient = recipients.find((r) => r.phone === regularPhone);

    expect(optedOutRecipient).toMatchObject({ status: "فشل الإرسال", error: "ألغى العميل اشتراكه من رسائل الحملات" });
    expect(regularRecipient?.status).toBe("تم الإرسال");

    // Only the regular send should have reserved (and never refunded) credit -
    // 10 - 1 = 9, not 8, proving the opted-out one was skipped before
    // reserveCampaignCredit ever ran for it.
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(9);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
