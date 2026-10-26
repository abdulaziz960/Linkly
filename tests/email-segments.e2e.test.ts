import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-email-segments.db");
const tenantId = "tenant-email-segments";

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

describe("email segments", () => {
  it("buckets email recipients, builds segments and resolves them as a campaign audience", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { ensureEmailPromotionsSchema } = await import("../lib/email-promotions-schema");
    const { emailEngagementBucket, validateEmailSegment, saveEmailSegment, listEmailSegments, resolveEmailSegmentMembers, getEmailSegmentRow, deleteEmailSegment } = await import("../lib/email-segments");
    const { resolveEmailRecipients } = await import("../lib/email-promotions");
    await ensureSchema();
    await ensureEmailPromotionsSchema();

    expect(emailEngagementBucket({ status: "sent", openCount: 0, clickCount: 0 })).toBe("notOpened");
    expect(emailEngagementBucket({ status: "sent", openCount: 2, clickCount: 0 })).toBe("opened");
    expect(emailEngagementBucket({ status: "clicked", openCount: 1, clickCount: 1 })).toBe("clicked");
    expect(emailEngagementBucket({ status: "bounced", openCount: 0, clickCount: 0 })).toBe("notReceived");
    expect(emailEngagementBucket({ status: "sent", openCount: 1, clickCount: 1, unsubscribedAt: "x" })).toBe("unsubscribed");
    expect(emailEngagementBucket({ status: "pending", openCount: 0, clickCount: 0 })).toBeNull();

    await prisma.customer.createMany({ data: [
      { id: "c1", name: "أ", phone: "a@x.com", initial: "أ", tenantId },
      { id: "c2", name: "ب", phone: "b@x.com", initial: "ب", tenantId },
      { id: "c3", name: "ج", phone: "966500000001", initial: "ج", tenantId }
    ] });
    const now = new Date().toISOString();
    await prisma.emailCampaign.create({ data: { id: "ec1", tenantId, name: "حملة", subject: "s", senderName: "n", senderEmail: "n@x.com", bodyHtml: "b", createdAt: now, updatedAt: now } });
    await prisma.emailCampaignRecipient.createMany({ data: [
      { id: "r1", campaignId: "ec1", tenantId, email: "a@x.com", status: "clicked", clickCount: 1, createdAt: now },
      { id: "r2", campaignId: "ec1", tenantId, email: "b@x.com", status: "sent", createdAt: now }
    ] });

    expect("error" in await validateEmailSegment(tenantId, { name: "" })).toBe(true);
    expect("error" in await validateEmailSegment(tenantId, { name: "x", sourceCampaignId: "ec1" })).toBe(true);
    const checked = await validateEmailSegment(tenantId, { name: "متفاعلون", engagementBucket: "clicked", sourceCampaignId: "ec1" });
    if ("error" in checked) throw new Error(checked.error);
    const id = await saveEmailSegment(tenantId, checked.value);
    expect(id).toBeTruthy();

    const list = await listEmailSegments(tenantId);
    expect(list).toHaveLength(1);
    expect(list[0].recipientCount).toBe(1);
    const members = await resolveEmailSegmentMembers(tenantId, list[0]);
    expect(members.map((member) => member.email)).toEqual(["a@x.com"]);
    expect(members[0].campaignName).toBe("حملة");

    const audience = await resolveEmailRecipients(tenantId, { mode: "segment", segmentId: id! });
    expect(audience.map((target) => target.email)).toEqual(["a@x.com"]);
    expect(await resolveEmailRecipients(tenantId, { mode: "segment", segmentId: "missing" })).toEqual([]);

    await prisma.emailMarketingOptOut.create({ data: { id: "o1", tenantId, email: "a@x.com", createdAt: now } });
    expect(await resolveEmailRecipients(tenantId, { mode: "segment", segmentId: id! })).toEqual([]);

    expect(await getEmailSegmentRow("other-tenant", id!)).toBeNull();
    expect(await deleteEmailSegment("other-tenant", id!)).toBe(false);
    expect(await deleteEmailSegment(tenantId, id!)).toBe(true);
  });
});
