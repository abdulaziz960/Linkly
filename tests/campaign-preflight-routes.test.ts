import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const f = vi.hoisted(() => ({
  template: { id: "template", tenantId: "workspace", name: "dynamic", status: "معتمد", language: "ar", headerType: "NONE", headerMediaDataUrl: "", buttonType: "URL", buttonUrl: "https://example.com/{{1}}" },
  campaign: { id: "campaign", tenantId: "workspace", name: "Test", templateName: "dynamic", status: "الحملة أنجزت", linkTrackingEnabled: 0, destinationUrl: "" },
  recipientUpdate: vi.fn(), campaignUpdate: vi.fn(), transaction: vi.fn(), process: vi.fn(), spawn: vi.fn()
}));
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner", tenantId: "workspace", name: "Owner" })) }));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));
vi.mock("../lib/plan-access-server", () => ({ getTenantPlanName: vi.fn(async () => "باقة المؤسسات الكبيرة") }));
vi.mock("../lib/plan-grants", () => ({ getTenantGrants: vi.fn(async () => []) }));
vi.mock("../lib/subscriptions", () => ({ logAdminAction: vi.fn(), getTenantCompanyName: vi.fn(async () => "Demo") }));
vi.mock("../lib/database", () => ({ getCampaigns: vi.fn(async () => [{ id: "created" }]) }));
vi.mock("../lib/segments", () => ({ getSegmentById: vi.fn(), resolveSegmentRecipients: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: {
  template: { findFirst: vi.fn(async () => f.template) },
  integrationSetting: { findFirst: vi.fn(async () => ({ status: "connected" })) },
  campaign: { findFirst: vi.fn(async () => f.campaign), updateMany: f.campaignUpdate },
  campaignRecipient: { updateMany: f.recipientUpdate, count: vi.fn(async () => 804) },
  $transaction: f.transaction
} }));
vi.mock("../lib/campaign-engine", () => ({
  MAX_CAMPAIGN_RECIPIENTS: 10000, MAX_CAMPAIGN_FILE_BYTES: 5242880, MAX_CAMPAIGN_MEDIA_BYTES: 16777216,
  parseRecipientFile: vi.fn(), activateDueScheduledCampaigns: vi.fn(), activateDueRecurringCampaigns: vi.fn(),
  processCampaignBatch: f.process, getCampaignBalance: vi.fn(async () => 1000), parseRiyadhDateTime: vi.fn(),
  spawnCampaignOccurrence: f.spawn, createRecurringCampaign: vi.fn(), parseCampaignTags: vi.fn(() => "")
}));

beforeEach(() => {
  vi.clearAllMocks();
  f.transaction.mockResolvedValue("created"); f.recipientUpdate.mockResolvedValue({ count: 804 });
  f.campaignUpdate.mockResolvedValue({ count: 1 }); f.process.mockResolvedValue(undefined);
  f.template.buttonUrl = "https://example.com/{{1}}";
  f.campaign.linkTrackingEnabled = 0; f.campaign.destinationUrl = "";
});

describe("campaign tracking preflight", () => {
  it("refuses a new dynamic-link campaign before creating recipients or starting sends", async () => {
    const { POST } = await import("../app/api/campaigns/route");
    const form = new FormData();
    form.set("name", "Test"); form.set("templateName", "dynamic"); form.set("audienceMode", "paste");
    form.set("pastedNumbers", "966500000001");
    const result = await POST(new NextRequest("http://localhost/api/campaigns", { method: "POST", body: form }));
    expect(result.status).toBe(400);
    expect(await result.text()).toContain("تتبع الروابط");
    expect(f.transaction).not.toHaveBeenCalled(); expect(f.process).not.toHaveBeenCalled();
  });
  for (const action of [{ retryFailed: true }, { sendNow: true }, { status: "قيد الإرسال" }]) {
    it(`rejects ${JSON.stringify(action)} before re-queuing any failed recipient`, async () => {
      const { PATCH } = await import("../app/api/campaigns/[id]/route");
      const response = await PATCH(new NextRequest("http://localhost/api/campaigns/campaign", { method: "PATCH", body: JSON.stringify(action), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "campaign" }) });
      expect(response.status).toBe(400); expect(await response.text()).toContain("تتبع الروابط");
      expect(f.recipientUpdate).not.toHaveBeenCalled(); expect(f.campaignUpdate).not.toHaveBeenCalled(); expect(f.process).not.toHaveBeenCalled();
    });
  }
  it("allows a correctly configured dynamic-link retry", async () => {
    f.campaign.linkTrackingEnabled = 1; f.campaign.destinationUrl = "https://example.com/offer";
    const { PATCH } = await import("../app/api/campaigns/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost/api/campaigns/campaign", { method: "PATCH", body: JSON.stringify({ retryFailed: true }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "campaign" }) });
    expect(response.status).toBe(200); expect(f.recipientUpdate).toHaveBeenCalled(); expect(f.process).toHaveBeenCalled();
  });
  it("keeps static URL templates usable without tracking", async () => {
    f.template.buttonUrl = "https://example.com/offer";
    const { PATCH } = await import("../app/api/campaigns/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost/api/campaigns/campaign", { method: "PATCH", body: JSON.stringify({ retryFailed: true }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "campaign" }) });
    expect(response.status).toBe(200); expect(f.process).toHaveBeenCalled();
  });
  it("rejects invalid tracked destinations without re-queuing recipients", async () => {
    f.campaign.linkTrackingEnabled = 1; f.campaign.destinationUrl = "javascript:alert(1)";
    const { PATCH } = await import("../app/api/campaigns/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost/api/campaigns/campaign", { method: "PATCH", body: JSON.stringify({ retryFailed: true }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "campaign" }) });
    expect(response.status).toBe(400); expect(f.recipientUpdate).not.toHaveBeenCalled(); expect(f.process).not.toHaveBeenCalled();
  });
  it("still allows editing a failed campaign's name without starting sends", async () => {
    const { PATCH } = await import("../app/api/campaigns/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost/api/campaigns/campaign", { method: "PATCH", body: JSON.stringify({ name: "Renamed" }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "campaign" }) });
    expect(response.status).toBe(200); expect(f.process).not.toHaveBeenCalled();
  });
});
