import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "shpss_callback_secret";
const user = { id: "u1", name: "Owner", role: "مالك الحساب", tenantId: "tenant-shopify-callback" };

vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));

const saveStoreTokens = vi.fn(async () => undefined);
const findTenantByMerchant = vi.fn(async (): Promise<string | null> => null);
vi.mock("../lib/store-connections", () => ({
  saveStoreTokens,
  findTenantByMerchant,
  readStoreTokens: vi.fn(async () => null),
  disconnectStore: vi.fn(async () => undefined)
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("SHOPIFY_CLIENT_ID", "client-cb");
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", SECRET);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  saveStoreTokens.mockClear();
  findTenantByMerchant.mockReset();
  findTenantByMerchant.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function callbackRequest(options: { shop?: string; tamper?: boolean; cookieNonce?: string; stateShop?: string } = {}) {
  const { createOAuthState } = await import("../lib/oauth-state");
  const shop = options.shop ?? "cb-store.myshopify.com";
  const state = createOAuthState("shopify", { tenantId: user.tenantId, shop: options.stateShop ?? shop });
  const fields: Record<string, string> = { code: "the-code", shop, state: state.state, timestamp: "1700000000" };
  const message = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join("&");
  const hmac = createHmac("sha256", options.tamper ? "wrong-secret" : SECRET).update(message).digest("hex");
  const query = new URLSearchParams({ ...fields, hmac }).toString();
  return new NextRequest(`https://linklysa.io/api/shopify/callback?${query}`, {
    headers: { cookie: `linkly_shopify_state=${options.cookieNonce ?? state.nonce}` }
  });
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("GET /api/shopify/callback", () => {
  it("connects the shop, stores the token for the workspace and registers the webhooks", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/oauth/access_token")) return okJson({ access_token: "shpat_new", scope: "read_orders,read_customers" });
      if (String(url).includes("/shop.json")) return okJson({ shop: { name: "CB Store", myshopify_domain: "cb-store.myshopify.com" } });
      return okJson({ webhook: { id: 1 } });
    });
    const { GET } = await import("../app/api/shopify/callback/route");
    const response = await GET(await callbackRequest());
    const html = await response.text();

    expect(html).toContain("تم ربط متجر شوبيفاي بنجاح");
    expect(saveStoreTokens).toHaveBeenCalledWith(expect.objectContaining({ tenantId: user.tenantId, store: "shopify", accessToken: "shpat_new", merchantId: "cb-store.myshopify.com", merchantName: "CB Store" }));
    const webhookCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/webhooks.json"));
    expect(webhookCalls).toHaveLength(5);
    expect(JSON.parse(String(webhookCalls[0][1].body)).webhook.address).toBe("https://linklysa.io/api/shopify/webhook");
  });

  it("refuses a redirect that Shopify did not sign", async () => {
    const { GET } = await import("../app/api/shopify/callback/route");
    const html = await (await GET(await callbackRequest({ tamper: true }))).text();
    expect(html).toContain("تعذر التحقق من توقيع شوبيفاي");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveStoreTokens).not.toHaveBeenCalled();
  });

  it("refuses a flow this browser did not start (state cookie mismatch) or one started for another shop", async () => {
    const { GET } = await import("../app/api/shopify/callback/route");
    const wrongCookie = await (await GET(await callbackRequest({ cookieNonce: "not-the-nonce" }))).text();
    expect(wrongCookie).toContain("تعذر التحقق من طلب الربط");
    const otherShop = await (await GET(await callbackRequest({ stateShop: "someone-else.myshopify.com" }))).text();
    expect(otherShop).toContain("تعذر التحقق من طلب الربط");
    expect(saveStoreTokens).not.toHaveBeenCalled();
  });

  it("does not let a second workspace take over a shop that is already connected", async () => {
    findTenantByMerchant.mockResolvedValue("tenant-someone-else");
    const { GET } = await import("../app/api/shopify/callback/route");
    const html = await (await GET(await callbackRequest())).text();
    expect(html).toContain("مربوط بحساب آخر");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveStoreTokens).not.toHaveBeenCalled();
  });

  it("lets the same workspace reconnect its own shop", async () => {
    findTenantByMerchant.mockResolvedValue(user.tenantId);
    fetchMock.mockImplementation(async (url: string) => (String(url).includes("/oauth/access_token") ? okJson({ access_token: "shpat_again" }) : okJson({ shop: { name: "CB", myshopify_domain: "cb-store.myshopify.com" }, webhook: {} })));
    const { GET } = await import("../app/api/shopify/callback/route");
    const html = await (await GET(await callbackRequest())).text();
    expect(html).toContain("تم ربط متجر شوبيفاي بنجاح");
  });
});
