import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-tiktok-leads.db");
const sendTemplate = vi.fn(async (..._args: unknown[]) => ({ ok: true as boolean, error: "" }));
const settings = { leadAdsEnabled: 1, leadWelcomeTemplateName: "welcome_ar" };

vi.mock("../lib/campaign-engine", () => ({ sendWhatsAppTemplate: (...args: unknown[]) => sendTemplate(...args) }));
vi.mock("../lib/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/database")>()),
  getIntegrationSettings: vi.fn(async () => settings)
}));

const fetchCalls: Array<{ url: string; body: Record<string, unknown>; token: string | null }> = [];

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("TIKTOK_ADS_APP_ID", "app-123");
  vi.stubEnv("TIKTOK_ADS_APP_SECRET", "secret-xyz");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    fetchCalls.push({ url: String(url), body, token: new Headers(init?.headers).get("Access-Token") });
    if (url.endsWith("/oauth2/access_token/")) return Response.json({ code: 0, data: { access_token: "tok-1", advertiser_ids: ["111", "222"] } });
    if (url.includes("/oauth2/advertiser/get/")) return Response.json({ code: 0, data: { list: [{ advertiser_id: "111", advertiser_name: "Alpha Ads" }, { advertiser_id: "222", advertiser_name: "Beta Ads" }] } });
    if (url.endsWith("/subscription/subscribe/")) {
      const advertiserId = String(body.subscription_detail?.advertiser_id);
      return advertiserId === "999" ? Response.json({ code: 40002, message: "no admin" }) : Response.json({ code: 0, data: { subscription_id: `sub-${advertiserId}` } });
    }
    return Response.json({ code: 0, data: {} });
  }));
});

beforeEach(() => {
  sendTemplate.mockClear();
  fetchCalls.length = 0;
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

const leadPayload = (id: number, phone = "0500000222", name = "نورة") => ({
  object: 1,
  entry: [{ id, page_id: 77, page_name: "نموذج الافتتاح", campaign_name: "حملة الافتتاح", ad_name: "إعلان 1", advertiser_id: 111, create_time: 1760000000, lead_source: "INSTANT_FORM", changes: [{ field: "name", value: name }, { field: "phone_number", value: phone }, { field: "email", value: "n@example.com" }] }],
  time: 1760000100
});

async function post(token: string, payload: unknown) {
  const { POST } = await import("../app/api/tiktok-ads/webhook/[token]/route");
  return POST(new NextRequest(`https://linklysa.io/api/tiktok-ads/webhook/${token}`, { method: "POST", body: JSON.stringify(payload) }), { params: Promise.resolve({ token }) });
}

describe("TikTok Ads lead connection", () => {
  it("trades the authorization code for a token and the authorized ad accounts", async () => {
    const { exchangeTikTokAuthCode } = await import("../lib/tiktok-leads");
    const result = await exchangeTikTokAuthCode("auth-code-1");
    expect(result).toEqual({ ok: true, data: { accessToken: "tok-1", advertiserIds: ["111", "222"] } });
    expect(fetchCalls[0].body).toEqual({ app_id: "app-123", secret: "secret-xyz", auth_code: "auth-code-1" });
  });

  it("keeps the authorization and the ad account names, and subscribes to nothing until one is chosen", async () => {
    const { saveTikTokAuthorization, getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    const saved = await saveTikTokAuthorization({ tenantId: "ten-tt", connectedBy: "owner", accessToken: "tok-1", advertiserIds: ["111", "222"] });
    expect(saved).toEqual({ advertisers: [{ id: "111", name: "Alpha Ads" }, { id: "222", name: "Beta Ads" }], selected: [] });
    expect(fetchCalls.some((call) => call.url.endsWith("/subscription/subscribe/"))).toBe(false);
    const { prisma } = await import("../lib/prisma");
    const raw = await prisma.$queryRaw<Array<{ access_token: string }>>`SELECT access_token FROM tiktok_lead_connections WHERE tenant_id = ${"ten-tt"}`;
    expect(raw[0].access_token).not.toContain("tok-1");
    expect((await getTikTokLeadConnection("ten-tt"))?.accessToken).toBe("tok-1");
  });

  it("subscribes only the chosen ad account, with a callback URL that has no query parameters", async () => {
    const { selectTikTokAdvertiser, getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    expect(await selectTikTokAdvertiser("ten-tt", "https://linklysa.io", "111")).toEqual({ ok: true });
    const subscribes = fetchCalls.filter((call) => call.url.endsWith("/subscription/subscribe/"));
    expect(subscribes).toHaveLength(1);
    expect(subscribes[0].body.subscribe_entity).toBe("LEAD");
    expect((subscribes[0].body.subscription_detail as { advertiser_id?: string }).advertiser_id).toBe("111");
    // TikTok rejects callback URLs with query parameters, so the secret is part of the path.
    expect(String(subscribes[0].body.callback_url)).toMatch(/^https:\/\/linklysa\.io\/api\/tiktok-ads\/webhook\/[A-Za-z0-9_-]+$/);
    expect((await getTikTokLeadConnection("ten-tt"))?.subscriptions).toEqual({ "111": "sub-111" });
  });

  it("switching the ad account cancels the old subscription and refuses an account that was not authorized", async () => {
    const { selectTikTokAdvertiser, getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    expect(await selectTikTokAdvertiser("ten-tt", "https://linklysa.io", "333")).toMatchObject({ ok: false });
    expect(await selectTikTokAdvertiser("ten-tt", "https://linklysa.io", "222")).toEqual({ ok: true });
    expect(fetchCalls.some((call) => call.url.endsWith("/subscription/unsubscribe/") && call.body.subscription_id === "sub-111")).toBe(true);
    expect((await getTikTokLeadConnection("ten-tt"))?.subscriptions).toEqual({ "222": "sub-222" });
    // Back to the first for the webhook tests below.
    await selectTikTokAdvertiser("ten-tt", "https://linklysa.io", "111");
  });

  it("reports a refused subscription (for example when the member is not an Admin of the ad account)", async () => {
    const { saveTikTokAuthorization, selectTikTokAdvertiser, getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    await saveTikTokAuthorization({ tenantId: "ten-none", connectedBy: "owner", accessToken: "tok-1", advertiserIds: ["999"] });
    const result = await selectTikTokAdvertiser("ten-none", "https://linklysa.io", "999");
    expect(result.ok).toBe(false);
    expect((await getTikTokLeadConnection("ten-none"))?.subscriptions).toEqual({});
  });
});

describe("TikTok lead webhook", () => {
  it("rejects a token that belongs to no workspace", async () => {
    expect((await post("not-a-real-token", leadPayload(1))).status).toBe(404);
  });

  it("stores the lead from the webhook once, welcomes by the customer's name, and shows it in the conversation", async () => {
    const { getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    const connection = (await getTikTokLeadConnection("ten-tt"))!;
    const response = await post(connection.webhookToken, leadPayload(90001));
    expect(response.status).toBe(200);
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0].slice(0, 5)).toEqual(["ten-tt", "966500000222", "welcome_ar", "ar", "نورة"]);

    const { prisma } = await import("../lib/prisma");
    const lead = await prisma.lead.findUnique({ where: { id: "lead-90001" } });
    expect(lead).toMatchObject({ source: "tiktok", tenantId: "ten-tt", name: "نورة", phone: "0500000222", email: "n@example.com", formName: "نموذج الافتتاح", adAccountId: "111" });
    const source = await prisma.$queryRaw<Array<{ platform: string; headline: string }>>`SELECT platform, headline FROM conversation_ad_source WHERE conversation_id = ${lead!.conversationId}`;
    expect(source[0]).toEqual({ platform: "tiktok", headline: "حملة الافتتاح" });

    // TikTok delivers at least once: the same lead again changes nothing and welcomes nobody twice.
    await post(connection.webhookToken, leadPayload(90001));
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(await prisma.lead.count({ where: { id: "lead-90001" } })).toBe(1);
  });

  it("ignores events that are not leads", async () => {
    const { getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    const connection = (await getTikTokLeadConnection("ten-tt"))!;
    const response = await post(connection.webhookToken, { object: 3, entry: [{ ad_id: 1 }] });
    expect(await response.json()).toMatchObject({ ok: true, ignored: true });
  });

  it("stays a conversation of its own on the TikTok channel when the form has no usable phone", async () => {
    const { getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    const connection = (await getTikTokLeadConnection("ten-tt"))!;
    await post(connection.webhookToken, leadPayload(90002, "abc"));
    const { prisma } = await import("../lib/prisma");
    const lead = await prisma.lead.findUnique({ where: { id: "lead-90002" } });
    const conversation = await prisma.conversation.findUnique({ where: { id: lead!.conversationId } });
    expect(conversation?.channel).toBe("tiktok");
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("forgets the connection when it is disconnected", async () => {
    const { disconnectTikTokLeads, getTikTokLeadConnection } = await import("../lib/tiktok-leads");
    await disconnectTikTokLeads("ten-tt");
    expect(await getTikTokLeadConnection("ten-tt")).toBeNull();
    expect(fetchCalls.some((call) => call.body.subscription_id === "sub-111")).toBe(true);
  });
});
