import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-campaign-actions.db");
const tenantId = "tenant-campaign-actions";
const user = { id: "user-campaign-actions", name: "Owner", email: "owner@campaign-actions.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));

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

const patch = (id: string, body: Record<string, unknown>) => new NextRequest(`http://localhost/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("campaign row actions", () => {
  it("normalises tags", async () => {
    const { parseCampaignTags } = await import("../lib/campaign-engine");
    expect(parseCampaignTags(" vip ,رمضان، vip ,, ")).toBe("vip,رمضان");
    expect(parseCampaignTags("a,b,c,d,e,f,g,h,i,j").split(",")).toHaveLength(8);
  });

  it("archives, rejects unknown statuses, resends only the failed, and duplicates unsent", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { spawnCampaignOccurrence } = await import("../lib/campaign-engine");
    const { PATCH } = await import("../app/api/campaigns/[id]/route");
    const { POST: duplicate } = await import("../app/api/campaigns/[id]/duplicate/route");
    await ensureSchema();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 })));

    await prisma.template.create({
      data: {
        id: `tmpl-${tenantId}`, tenantId, name: "promo", message: "عرض خاص!",
        type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", headerType: "NONE",
        headerText: "", headerMedia: "", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "",
        syncedAt: "-", lastUsed: "-"
      }
    });
    const campaignId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
      tenantId, name: "حملة الإجراءات", templateName: "promo", language: "ar", headerMediaDataUrl: "",
      recipients: [{ phone: "966500000001", name: "أ" }, { phone: "966500000002", name: "ب" }, { phone: "966500000003", name: "ج" }],
      status: "الحملة أنجزت", description: "ملاحظة", tags: "vip"
    }));
    await prisma.campaignRecipient.updateMany({ where: { campaignId, phone: "966500000001" }, data: { status: "تم الإرسال" } });
    await prisma.campaignRecipient.updateMany({ where: { campaignId, phone: "966500000002" }, data: { status: "فشل الإرسال", error: "boom" } });
    await prisma.campaignRecipient.updateMany({ where: { campaignId, phone: "966500000003" }, data: { status: "فشل الإرسال", error: "ألغى العميل اشتراكه من رسائل الحملات" } });

    // An unknown status is refused; archiving a finished campaign works.
    expect((await PATCH(patch(campaignId, { status: "whatever" }), context(campaignId))).status).toBe(400);
    expect((await PATCH(patch(campaignId, { status: "مؤرشفة" }), context(campaignId))).status).toBe(200);
    expect((await prisma.campaign.findUnique({ where: { id: campaignId } }))?.status).toBe("مؤرشفة");

    // Resend to the failed only: the opted-out recipient is never put back in the queue.
    expect((await PATCH(patch(campaignId, { retryFailed: true }), context(campaignId))).status).toBe(200);
    const byPhone = Object.fromEntries((await prisma.campaignRecipient.findMany({ where: { campaignId } })).map((row) => [row.phone, row.status]));
    expect(byPhone["966500000002"]).not.toBe("فشل الإرسال");
    expect(byPhone["966500000003"]).toBe("فشل الإرسال");
    expect(byPhone["966500000001"]).toBe("تم الإرسال");

    // A running campaign cannot be archived.
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "قيد الإرسال" } });
    expect((await PATCH(patch(campaignId, { status: "مؤرشفة" }), context(campaignId))).status).toBe(400);

    // Notes can be edited.
    expect((await PATCH(patch(campaignId, { description: "جديد", tags: "a, b" }), context(campaignId))).status).toBe(200);
    expect(await prisma.campaign.findUnique({ where: { id: campaignId } })).toMatchObject({ description: "جديد", tags: "a,b" });

    // Rescheduling: only scheduled campaigns, only to a valid time in the future (Riyadh wall-clock from the page).
    const scheduledId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
      tenantId, name: "حملة مجدولة", templateName: "promo", language: "ar", headerMediaDataUrl: "",
      recipients: [{ phone: "966500000011", name: "د" }], status: "مجدولة", scheduledAt: new Date(Date.now() + 86_400_000).toISOString()
    }));
    expect((await PATCH(patch(scheduledId, { scheduledAt: "2020-01-01T10:00" }), context(scheduledId))).status).toBe(400);
    expect((await PATCH(patch(scheduledId, { scheduledAt: "not a time" }), context(scheduledId))).status).toBe(400);
    const nextWeek = new Date(Date.now() + 7 * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 16);
    expect((await PATCH(patch(scheduledId, { scheduledAt: nextWeek }), context(scheduledId))).status).toBe(200);
    const moved = await prisma.campaign.findUnique({ where: { id: scheduledId } });
    expect(new Date(moved?.scheduledAt ?? "").getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(moved?.status).toBe("مجدولة");
    expect((await PATCH(patch(campaignId, { scheduledAt: nextWeek }), context(campaignId))).status).toBe(400);

    // Duplicate: same audience and template, saved unsent with every recipient back in the queue.
    const response = await duplicate(new NextRequest(`http://localhost/api/campaigns/${campaignId}/duplicate`, { method: "POST" }), context(campaignId));
    expect(response.status).toBe(200);
    const copy = (await response.json()).data;
    expect(copy).toMatchObject({ name: "حملة الإجراءات (نسخة)", status: "مجدولة", total: 3, templateName: "promo" });
    expect(await prisma.campaignRecipient.count({ where: { campaignId: copy.id, status: "قيد الإرسال" } })).toBe(3);
    vi.unstubAllGlobals();
  });
});
