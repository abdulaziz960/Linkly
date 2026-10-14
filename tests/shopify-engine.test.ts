import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-shopify-engine.db");
const shop = "engine-store.myshopify.com";
const tenantId = "tenant-shopify-engine";

vi.setConfig({ testTimeout: 120_000 });

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function connect() {
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const { saveShopifyConnection } = await import("../lib/shopify");
  await saveShopifyConnection(tenantId, shop, "shpat_test_token", "Engine Store");
}

// The engine creates its tables on first use, so before any event the table does not exist yet.
async function eventLogCount(phoneTail?: string) {
  const { prisma } = await import("../lib/prisma");
  try {
    const rows = phoneTail
      ? await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(`SELECT COUNT(*) AS n FROM store_event_log WHERE tenant_id = '${tenantId}' AND phone LIKE '%${phoneTail}'`)
      : await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(`SELECT COUNT(*) AS n FROM store_event_log WHERE tenant_id = '${tenantId}'`);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

describe("handleShopifyWebhook", () => {
  const order = { id: 71, order_number: 1071, name: "#1071", total_price: "99", customer: { first_name: "Huda", phone: "+966501112233" } };

  it("does not know a shop that never connected", async () => {
    await connect();
    const { handleShopifyWebhook } = await import("../lib/store-engine");
    expect(await handleShopifyWebhook("orders/create", "stranger.myshopify.com", order)).toMatchObject({ handled: false, status: 202 });
  });

  it("records a new order of a connected shop for its workspace", async () => {
    await connect();
    const { handleShopifyWebhook } = await import("../lib/store-engine");
    const before = await eventLogCount();
    const outcome = await handleShopifyWebhook("orders/create", shop, order);
    expect(outcome).toMatchObject({ handled: true, status: 200 });
    expect(await eventLogCount()).toBe(before + 1);
  });

  it("ignores a topic it does not read", async () => {
    await connect();
    const { handleShopifyWebhook } = await import("../lib/store-engine");
    expect(await handleShopifyWebhook("products/update", shop, { id: 1 })).toMatchObject({ handled: true, detail: "ignored" });
  });
});

describe("uninstall and the privacy webhooks", () => {
  it("app/uninstalled disconnects the workspace", async () => {
    await connect();
    const { handleShopifyWebhook } = await import("../lib/store-engine");
    const { getStoreConnection } = await import("../lib/store-connections");
    expect((await getStoreConnection(tenantId, "shopify")).status).toBe("connected");
    expect(await handleShopifyWebhook("app/uninstalled", shop, {})).toMatchObject({ handled: true, detail: "disconnected" });
    expect((await getStoreConnection(tenantId, "shopify")).status).toBe("disconnected");
  });

  it("customers/redact removes that shopper only", async () => {
    await connect();
    const { handleShopifyWebhook, handleShopifyPrivacyWebhook } = await import("../lib/store-engine");
    await handleShopifyWebhook("orders/create", shop, { id: 81, order_number: 1081, customer: { phone: "+966501112233" } });
    await handleShopifyWebhook("orders/create", shop, { id: 82, order_number: 1082, customer: { phone: "+966554445566" } });
    expect(await eventLogCount("501112233")).toBeGreaterThan(0);

    const outcome = await handleShopifyPrivacyWebhook("customers/redact", shop, { customer: { id: 5, phone: "+966501112233" } });
    expect(outcome).toMatchObject({ handled: true, status: 200, detail: "customer erased" });
    expect(await eventLogCount("501112233")).toBe(0);
    expect(await eventLogCount("554445566")).toBeGreaterThan(0);
  });

  it("customers/data_request is recorded, not answered to the shopper", async () => {
    await connect();
    const { handleShopifyPrivacyWebhook } = await import("../lib/store-engine");
    expect(await handleShopifyPrivacyWebhook("customers/data_request", shop, { customer: { id: 9, phone: "+966500000009" } })).toMatchObject({ handled: true, detail: "recorded" });
  });

  it("shop/redact erases the shop data even after it was uninstalled", async () => {
    await connect();
    const { handleShopifyWebhook, handleShopifyPrivacyWebhook } = await import("../lib/store-engine");
    const { getStoreConnection } = await import("../lib/store-connections");
    await handleShopifyWebhook("orders/create", shop, { id: 91, order_number: 1091, customer: { phone: "+966509998877" } });
    await handleShopifyWebhook("app/uninstalled", shop, {});

    expect(await handleShopifyPrivacyWebhook("shop/redact", shop, {})).toMatchObject({ detail: "shop erased" });
    expect(await eventLogCount()).toBe(0);
    expect((await getStoreConnection(tenantId, "shopify")).status).toBe("disconnected");
  });

  it("answers 200 for a shop it holds nothing for", async () => {
    const { handleShopifyPrivacyWebhook } = await import("../lib/store-engine");
    expect(await handleShopifyPrivacyWebhook("shop/redact", "never-seen.myshopify.com", {})).toMatchObject({ handled: true, status: 200 });
  });
});
