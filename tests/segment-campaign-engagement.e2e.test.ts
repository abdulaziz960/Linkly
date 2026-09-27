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

    // Four customers, one per engagement bucket, plus a fifth who was never
    // part of this campaign at all (must never match any bucket).
    await prisma.customer.createMany({
      data: [
        { id: "cust-clicked", name: "عميل ضغط الرابط", phone: "966500000011", initial: "ع", tenantId },
        { id: "cust-opened", name: "عميل فتح فقط", phone: "966500000012", initial: "ع", tenantId },
        { id: "cust-not-opened", name: "عميل لم يفتح", phone: "966500000013", initial: "ع", tenantId },
        { id: "cust-not-received", name: "عميل مقفل الرسائل الترويجية", phone: "966500000015", initial: "ع", tenantId },
        { id: "cust-unrelated", name: "عميل غير مرتبط", phone: "966500000014", initial: "ع", tenantId }
      ]
    });

    await prisma.campaignRecipient.createMany({
      data: [
        { id: "cr-1", campaignId: campaign.id, tenantId, phone: "966500000011", name: "عميل ضغط الرابط", status: "تم الإرسال", messageId: "wamid-1", sentAt: "2026-09-12T09:00:00.000Z", readAt: "2026-09-12T10:00:00.000Z", clickedAt: "2026-09-12T10:05:00.000Z", createdAt: new Date().toISOString() },
        { id: "cr-2", campaignId: campaign.id, tenantId, phone: "966500000012", name: "عميل فتح فقط", status: "تم الإرسال", messageId: "wamid-2", sentAt: "2026-09-12T09:00:00.000Z", readAt: "2026-09-12T10:00:00.000Z", clickedAt: "", createdAt: new Date().toISOString() },
        { id: "cr-3", campaignId: campaign.id, tenantId, phone: "966500000013", name: "عميل لم يفتح", status: "تم الإرسال", messageId: "wamid-3", sentAt: "2026-09-12T09:00:00.000Z", readAt: "", clickedAt: "", createdAt: new Date().toISOString() },
        // WhatsApp accepted this send but later reported async delivery
        // failure (e.g. marketing messages disabled for this recipient).
        { id: "cr-4", campaignId: campaign.id, tenantId, phone: "966500000015", name: "عميل مقفل الرسائل الترويجية", status: "تم الإرسال", messageId: "wamid-4", sentAt: "2026-09-12T09:00:00.000Z", readAt: "", clickedAt: "", deliveryFailed: 1, deliveryError: "Message undeliverable", createdAt: new Date().toISOString() }
      ]
    });

    const baseCriteria = { tagNames: [], inactiveDays: 0, engagementDateFrom: "", engagementDateTo: "", engagementClickCount: 0 };

    const clicked = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "clicked" });
    expect(clicked.map((recipient) => recipient.phone)).toEqual(["966500000011"]);

    const opened = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "opened" });
    expect(opened.map((recipient) => recipient.phone)).toEqual(["966500000012"]);

    const notOpened = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "notOpened" });
    expect(notOpened.map((recipient) => recipient.phone)).toEqual(["966500000013"]);

    const notReceived = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: campaign.id, engagementBucket: "notReceived" });
    expect(notReceived.map((recipient) => recipient.phone)).toEqual(["966500000015"]);

    // No campaign condition at all - every customer with a valid phone.
    const everyone = await resolveSegmentRecipients(tenantId, { ...baseCriteria, sourceCampaignId: "", engagementBucket: "" });
    expect(everyone.map((recipient) => recipient.phone).sort()).toEqual([
      "966500000011", "966500000012", "966500000013", "966500000014", "966500000015"
    ]);

    // Validation: engagementBucket is the trigger - a leftover campaign or
    // date with no bucket is an error, but the bucket alone (targeting every
    // campaign) is valid on its own.
    const onlyCampaign = await resolveEngagementFields(tenantId, { sourceCampaignId: campaign.id, engagementBucket: "" });
    expect(onlyCampaign.error).toBeTruthy();

    const bucketAlone = await resolveEngagementFields(tenantId, { sourceCampaignId: "", engagementBucket: "clicked" });
    expect(bucketAlone.error).toBeUndefined();
    expect(bucketAlone.sourceCampaignId).toBe("");

    const neither = await resolveEngagementFields(tenantId, { sourceCampaignId: "", engagementBucket: "" });
    expect(neither.error).toBeUndefined();
    expect(neither.sourceCampaignId).toBe("");

    const valid = await resolveEngagementFields(tenantId, { sourceCampaignId: campaign.id, engagementBucket: "clicked" });
    expect(valid.error).toBeUndefined();
    expect(valid.sourceCampaignId).toBe(campaign.id);

    // A bad date range (start after end) is rejected.
    const badRange = await resolveEngagementFields(tenantId, { engagementBucket: "clicked", engagementDateFrom: "2026-09-15", engagementDateTo: "2026-09-01" });
    expect(badRange.error).toBeTruthy();

    // A segment must never be pointable at another tenant's campaign.
    const crossTenant = await resolveEngagementFields(otherTenantId, { sourceCampaignId: campaign.id, engagementBucket: "clicked" });
    expect(crossTenant.error).toBeTruthy();

    // getCrossCampaignEngagement aggregates every campaign at once, deduping
    // each customer down to their single best bucket.
    const { getCrossCampaignEngagement } = await import("../lib/segments");
    const overview = await getCrossCampaignEngagement(tenantId, "", "");
    expect(overview.counts).toEqual({ notReceived: 1, notOpened: 1, opened: 1, clicked: 1 });
    expect(overview.rows.clicked.map((row) => row.phone)).toEqual(["966500000011"]);
    expect(overview.rows.opened.map((row) => row.phone)).toEqual(["966500000012"]);
    expect(overview.rows.notOpened.map((row) => row.phone)).toEqual(["966500000013"]);
    expect(overview.rows.notReceived.map((row) => row.phone)).toEqual(["966500000015"]);
    // Each row names the campaign that produced its engagement.
    expect(overview.rows.clicked[0].campaignName).toBe("حملة الاختبار");
    // clickCount defaults to 0 (never backfilled for a click predating the
    // counter), which is exactly what the row carries here.
    expect(overview.rows.clicked[0].clickCount).toBe(0);

    // A date range that includes this campaign's send date still finds them...
    const inRange = await getCrossCampaignEngagement(tenantId, "2026-09-12", "2026-09-12");
    expect(inRange.counts).toEqual({ notReceived: 1, notOpened: 1, opened: 1, clicked: 1 });

    // ...but a range that excludes it yields nothing.
    const outOfRange = await getCrossCampaignEngagement(tenantId, "2026-01-01", "2026-01-02");
    expect(outOfRange.counts).toEqual({ notReceived: 0, notOpened: 0, opened: 0, clicked: 0 });
  });
});

describe("Segment targeting by an exact click count", () => {
  const clickCountTenantId = "tenant-segment-click-count";

  it("only matches recipients whose clickCount equals the exact number given", async () => {
    const { prisma } = await import("../lib/prisma");
    const { resolveSegmentRecipients, resolveEngagementFields, getSegmentRecipientDetails } = await import("../lib/segments");

    const campaign = await prisma.campaign.create({
      data: {
        id: "camp-click-count-segment", tenantId: clickCountTenantId, name: "حملة عدد النقرات", channel: "whatsapp",
        templateName: "t", language: "ar", sent: 2, total: 2, progress: "100%", status: "الحملة أنجزت",
        updatedAt: new Date().toLocaleString("en-US")
      }
    });
    await prisma.customer.createMany({
      data: [
        { id: "cust-clicked-once", name: "عميل ضغط مرة", phone: "966500000021", initial: "ع", tenantId: clickCountTenantId },
        { id: "cust-clicked-thrice", name: "عميل ضغط ثلاث مرات", phone: "966500000022", initial: "ع", tenantId: clickCountTenantId }
      ]
    });
    await prisma.campaignRecipient.createMany({
      data: [
        { id: "cr-click-1", campaignId: campaign.id, tenantId: clickCountTenantId, phone: "966500000021", name: "عميل ضغط مرة", status: "تم الإرسال", sentAt: "2026-09-12T09:00:00.000Z", clickedAt: "2026-09-12T10:00:00.000Z", clickCount: 1, createdAt: new Date().toISOString() },
        { id: "cr-click-3", campaignId: campaign.id, tenantId: clickCountTenantId, phone: "966500000022", name: "عميل ضغط ثلاث مرات", status: "تم الإرسال", sentAt: "2026-09-12T09:00:00.000Z", clickedAt: "2026-09-12T10:00:00.000Z", clickCount: 3, createdAt: new Date().toISOString() }
      ]
    });

    // Rejected: a click-count condition without the "clicked" bucket makes
    // no sense (opened/notOpened/notReceived recipients have no meaningful
    // click count to match).
    const wrongBucket = await resolveEngagementFields(clickCountTenantId, { engagementBucket: "opened", engagementClickCount: 1 });
    expect(wrongBucket.error).toBeTruthy();

    const noBucket = await resolveEngagementFields(clickCountTenantId, { engagementBucket: "", engagementClickCount: 1 });
    expect(noBucket.error).toBeTruthy();

    // Accepted alongside "clicked".
    const resolved = await resolveEngagementFields(clickCountTenantId, { engagementBucket: "clicked", engagementClickCount: 1 });
    expect(resolved.error).toBeUndefined();
    expect(resolved.engagementClickCount).toBe(1);

    const baseCriteria = { tagNames: [], inactiveDays: 0, sourceCampaignId: campaign.id, engagementBucket: "clicked" as const, engagementDateFrom: "", engagementDateTo: "" };

    const exactlyOnce = await resolveSegmentRecipients(clickCountTenantId, { ...baseCriteria, engagementClickCount: 1 });
    expect(exactlyOnce.map((recipient) => recipient.phone)).toEqual(["966500000021"]);

    const exactlyThrice = await resolveSegmentRecipients(clickCountTenantId, { ...baseCriteria, engagementClickCount: 3 });
    expect(exactlyThrice.map((recipient) => recipient.phone)).toEqual(["966500000022"]);

    // No count condition (0) means every "clicked" recipient, regardless of
    // how many times.
    const anyClicker = await resolveSegmentRecipients(clickCountTenantId, { ...baseCriteria, engagementClickCount: 0 });
    expect(anyClicker.map((recipient) => recipient.phone).sort()).toEqual(["966500000021", "966500000022"]);

    // A count with no matching recipient returns nothing, not everyone.
    const noMatch = await resolveSegmentRecipients(clickCountTenantId, { ...baseCriteria, engagementClickCount: 7 });
    expect(noMatch).toEqual([]);

    // The detail view (Segments page) carries each recipient's actual
    // clickCount, not just their phone/name - this is what the "Clicks"
    // column on the page renders.
    const details = await getSegmentRecipientDetails(clickCountTenantId, { ...baseCriteria, engagementClickCount: 0 });
    expect(details.find((row) => row.phone === "966500000021")?.clickCount).toBe(1);
    expect(details.find((row) => row.phone === "966500000022")?.clickCount).toBe(3);
  });
});
