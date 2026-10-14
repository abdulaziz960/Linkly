import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-store-settings.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("store integration settings (Salla / Zid / Shopify)", () => {
  it("normalizes anything into valid settings and clamps the numbers", async () => {
    const { normalizeStoreSettings, DEFAULT_STORE_SETTINGS } = await import("../lib/store-settings");
    expect(normalizeStoreSettings(null)).toEqual(DEFAULT_STORE_SETTINGS);
    expect(normalizeStoreSettings("junk")).toEqual(DEFAULT_STORE_SETTINGS);
    const s = normalizeStoreSettings({
      orderNotifications: { shipped: { enabled: true, template: "  shipped_ar " }, bogus: { enabled: true } },
      abandonedCart: { enabled: true, delayMinutes: 5, maxReminders: 9, intervalHours: 0, minCartValue: -50, discountCode: "WE LCOME!10", quietHours: { enabled: true, start: "25:99", end: "07:30" }, templates: ["a", "b"], skipIfOrderedDays: 500 },
      dailyCap: "250"
    });
    expect(s.orderNotifications.shipped).toEqual({ enabled: true, template: "shipped_ar" });
    expect(s.orderNotifications.created).toEqual({ enabled: false, template: "" });
    expect(s.abandonedCart).toMatchObject({ enabled: true, delayMinutes: 10, maxReminders: 3, intervalHours: 1, minCartValue: 0, discountCode: "WELCOME10", skipIfOrderedDays: 90 });
    expect(s.abandonedCart.quietHours).toEqual({ enabled: true, start: "22:00", end: "07:30" });
    expect(s.abandonedCart.templates).toEqual(["a", "b", ""]);
    expect(s.dailyCap).toBe(250);
  });

  it("warns when a switched-on notification has no template", async () => {
    const { normalizeStoreSettings, storeSettingsWarnings } = await import("../lib/store-settings");
    const s = normalizeStoreSettings({ orderNotifications: { created: { enabled: true, template: "" } }, abandonedCart: { enabled: true, maxReminders: 2, templates: ["t1", ""] } });
    expect(storeSettingsWarnings(s)).toEqual(["order:created", "cart:2"]);
    expect(storeSettingsWarnings(normalizeStoreSettings({}))).toEqual([]);
  });

  it("saves per workspace and per store", async () => {
    const { saveStoreSettings, getStoreSettings, DEFAULT_STORE_SETTINGS } = await import("../lib/store-settings");
    expect((await getStoreSettings("ten-a", "salla")).settings).toEqual(DEFAULT_STORE_SETTINGS);
    await saveStoreSettings("ten-a", "salla", { abandonedCart: { enabled: true, delayMinutes: 45, templates: ["cart_ar"] } });
    expect((await getStoreSettings("ten-a", "salla")).settings.abandonedCart).toMatchObject({ enabled: true, delayMinutes: 45 });
    await saveStoreSettings("ten-a", "salla", { abandonedCart: { enabled: true, delayMinutes: 90 } });
    expect((await getStoreSettings("ten-a", "salla")).settings.abandonedCart.delayMinutes).toBe(90);
    expect((await getStoreSettings("ten-a", "zid")).settings.abandonedCart.enabled).toBe(false);
    expect((await getStoreSettings("ten-b", "salla")).settings.abandonedCart.enabled).toBe(false);
  });

  it("only knows the supported stores", async () => {
    const { isStoreKey } = await import("../lib/store-settings");
    expect(isStoreKey("salla")).toBe(true);
    expect(isStoreKey("zid")).toBe(true);
    expect(isStoreKey("shopify")).toBe(true);
    expect(isStoreKey("woocommerce")).toBe(false);
  });
});
