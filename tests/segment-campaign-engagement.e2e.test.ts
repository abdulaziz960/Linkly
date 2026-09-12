import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-segment-campaign-engagement.db");
const tenantId = "tenant-segment-engagement";
const otherTenantId = "tenant-segment-engagement-other";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
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

describe("Segment targeting by a past campaign's engagement", () => {
  it("resolves only the customers matching the chosen engagement bucket", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { resolveSegmentRecipients, resolveEngagementFields } = await import("../lib/segments");

    await ensureSchema();

    const campaign = await prisma.campaign.create({
      data: {
        id: "camp-engagement-segment", tenantId, name: "حملة الاختبار", channel: "whatsapp",
        templateName: "t", language: "ar", sent: 3, total: 3, progress: "100%", status: "الحملة أنجزت",
        updatedAt: new Date().toLocaleString("en-US")
      }
    });

    // Three customers, one per engagement bucket, plus a fourth who was
    // never part of this campaign at all (must never match any bucket).
    await prisma.customer.createMany({
      data: [
        { id: "cust-clicked", name: "عميل ضغط الرابط", phone: "966500000011", initial: "ع", tenantId },
        { id: "cust-opened", name: "عميل فتح فقط", phone: "966500000012", initial: "ع", tenantId },
        { id: "cust-not-opened", name: "عميل لم يفتح", phone: "966500000013", initial: "ع", tenantId },
        { id: "cust-unrelated", name: "عميل غير مرتبط", phone: "966500000014", initial: "ع", tenantId }
      ]
    });

    await prisma.campaignRecipient.createMany({
      data: [
        { id: "cr-1", campaignId: campaign.id, tenantId, phone: "966500000011", name: "عميل ضغط الرابط", status: "تم الإرسال", messageId: "wamid-1", readAt: "2026-09-12T10:00:00.000Z", clickedAt: "2026-09-12T10:05:00.000Z", createdAt: new Date().toISOString() },
        { id: "cr-2", campaignId: campaign.id, tenantId, phone: "966500000012", name: "عميل فتح فقط", status: "تم الإرسال", messageId: "wamid-2", readAt: "2026-09-12T10:00:00.000Z", clickedAt: "", createdAt: new Date().toISOString() },
        { id: "cr-3", campaignId: campaign.id, tenantId, phone: "966500000013", name: "عميل لم يفتح", status: "تم الإرسال", messageId: "wamid-3", readAt: "", clickedAt: "", createdAt: new Date().toISOString() }
      ]
    });

    const baseCriteria = { tagNames: [], inactiveDays: 0 };

    const clicked = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "clicked" });
    expect(clicked.map((recipient) => recipient.phone)).toEqual(["966500000011"]);

    const opened = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "opened" });
    expect(opened.map((recipient) => recipient.phone)).toEqual(["966500000012"]);

    const notOpened = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "notOpened" });
    expect(notOpened.map((recipient) => recipient.phone)).toEqual(["966500000013"]);

    // No campaign condition at all - every customer with a valid phone.
    const everyone = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: "", engagementBucket: "" });
    expect(everyone.map((recipient) => recipient.phone).sort()).toEqual([
      "966500000011", "966500000012", "966500000013", "966500000014"
    ]);

    // Validation: the two fields must be set or cleared together.
    const onlyCampaign = await resolveEngagementFields(tenantId, { sourceCampaignId: campaign.id, engagementBucket: "" });
    expect(onlyCampaign.error).toBeTruthy();

    const onlyBucket = await resolveEngagementFields(tenantId, { sourceCampaignId: "", engagementBucket: "clicked" });
    expect(onlyBucket.error).toBeTruthy();

    const neither = await resolveEngagementFields(tenantId, { sourceCampaignId: "", engagementBucket: "" });
    expect(neither.error).toBeUndefined();
    expect(neither.sourceCampaignId).toBe("");

    const valid = await resolveEngagementFields(tenantId, { sourceCampaignId: campaign.id, engagementBucket: "clicked" });
    expect(valid.error).toBeUndefined();
    expect(valid.sourceCampaignId).toBe(campaign.id);

    // A segment must never be pointable at another tenant's campaign.
    const crossTenant = await resolveEngagementFields(otherTenantId, { sourceCampaignId: campaign.id, engagementBucket: "clicked" });
    expect(crossTenant.error).toBeTruthy();
  });
});
