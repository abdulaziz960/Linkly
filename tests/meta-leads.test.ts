import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-meta-leads.db");
const sendTemplate = vi.fn(async (..._args: unknown[]) => ({ ok: true as boolean, error: "" }));
let leadsSettings = { leadAdsEnabled: 0, leadWelcomeTemplateName: "" };
let whatsappSettings = { phoneNumberId: "pn-1", accessToken: "token" };

vi.mock("../lib/campaign-engine", () => ({ sendWhatsAppTemplate: (...args: unknown[]) => sendTemplate(...args) }));
vi.mock("../lib/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/database")>()),
  getIntegrationSettings: vi.fn(async (channel: string) => (channel === "meta_leads" ? leadsSettings : whatsappSettings))
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

beforeEach(() => {
  sendTemplate.mockClear();
  leadsSettings = { leadAdsEnabled: 0, leadWelcomeTemplateName: "" };
  whatsappSettings = { phoneNumberId: "pn-1", accessToken: "token" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "lg-1",
    ad_id: "ad-77",
    ad_name: "إعلان الفلل",
    campaign_name: "حملة الصيف",
    form_id: "form-5",
    platform: "fb",
    field_data: [{ name: "full_name", values: ["ماجد"] }, { name: "phone_number", values: ["+966500000321"] }]
  }), { status: 200 })));
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

describe("Meta Lead Ads form leads", () => {
  it("saves the lead and its campaign even when no welcome is set up", async () => {
    const { handleMetaLeadgenEvent } = await import("../lib/meta-leads");
    const { prisma } = await import("../lib/prisma");
    const { getAdSource } = await import("../lib/ad-source");
    await handleMetaLeadgenEvent("ten-leads", "page-token", "lg-1");

    const conversation = await prisma.conversation.findFirst({ where: { tenantId: "ten-leads", customer: { phone: "966500000321" } }, include: { customer: true } });
    expect(conversation?.customer.name).toBe("ماجد");
    expect(conversation?.pipelineStage).toBe("جديد");
    expect(sendTemplate).not.toHaveBeenCalled();

    const source = await getAdSource("ten-leads", conversation!.id);
    expect(source).toMatchObject({ platform: "meta", adId: "ad-77", headline: "حملة الصيف · إعلان الفلل", matchedBy: "lead_form" });
  });

  it("sends the welcome once when it is set up, even if the lead is delivered twice", async () => {
    leadsSettings = { leadAdsEnabled: 1, leadWelcomeTemplateName: "lead_welcome" };
    const { handleMetaLeadgenEvent } = await import("../lib/meta-leads");
    await handleMetaLeadgenEvent("ten-leads2", "page-token", "lg-2");
    await handleMetaLeadgenEvent("ten-leads2", "page-token", "lg-2");
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0].slice(0, 4)).toEqual(["ten-leads2", "966500000321", "lead_welcome", "ar"]);
  });

  it("still saves the lead when WhatsApp is not connected", async () => {
    leadsSettings = { leadAdsEnabled: 1, leadWelcomeTemplateName: "lead_welcome" };
    whatsappSettings = { phoneNumberId: "", accessToken: "" };
    const { handleMetaLeadgenEvent } = await import("../lib/meta-leads");
    const { prisma } = await import("../lib/prisma");
    await handleMetaLeadgenEvent("ten-leads3", "page-token", "lg-3");
    expect(await prisma.conversation.count({ where: { tenantId: "ten-leads3" } })).toBe(1);
    expect(sendTemplate).not.toHaveBeenCalled();
  });
});
