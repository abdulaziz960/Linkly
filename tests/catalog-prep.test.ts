import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-prep.db");
const tenantId = "tenant-prep";

const texts: string[] = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppTextMessage: vi.fn(async (input: { text: string }) => { texts.push(input.text); return { ok: true }; }),
  sendWhatsAppIdButtons: vi.fn(async () => ({ ok: true })),
  sendWhatsAppCtaUrl: vi.fn(async () => ({ ok: true })),
  sendWhatsAppRowList: vi.fn(async () => ({ ok: true })),
  sendWhatsAppUploadedMedia: vi.fn(async () => ({ ok: true }))
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

async function seedOrder(id: string, status = "paid") {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.customer.create({ data: { id: `c-${id}`, name: "سارة", phone: "966500000111", initial: "س", tenantId } });
  await prisma.conversation.create({ data: { id: `v-${id}`, customerId: `c-${id}`, channel: "whatsapp", lastMessage: "x", status: "assigned", assignee: "أ", lastActivityAt: now, tenantId } });
  await prisma.catalogOrder.create({ data: { id, tenantId, conversationId: `v-${id}`, customerName: "سارة", customerPhone: "966500000111", productId: "p", productName: "وجبة", unitPrice: 25, quantity: 1, total: 25, status, createdAt: now, updatedAt: now } });
}

describe("how the time is said", () => {
  it("writes minutes and hours in Arabic", async () => {
    const { prepPhrase, prepSentence, cleanPrepMinutes } = await import("../lib/catalog-prep");
    expect(prepPhrase(1)).toBe("دقيقة واحدة");
    expect(prepPhrase(2)).toBe("دقيقتين");
    expect(prepPhrase(5)).toBe("5 دقائق");
    expect(prepPhrase(30)).toBe("30 دقيقة");
    expect(prepPhrase(60)).toBe("ساعة");
    expect(prepPhrase(90)).toBe("ساعة ونصف");
    expect(prepPhrase(120)).toBe("ساعتين");
    expect(prepPhrase(75)).toBe("ساعة و15 دقيقة");
    expect(prepSentence(30)).toBe("سيتم تجهيز طلبك خلال 30 دقيقة");
    expect(cleanPrepMinutes("45")).toBe(45);
    expect(cleanPrepMinutes(0)).toBeNull();
    expect(cleanPrepMinutes(5000)).toBeNull();
    expect(cleanPrepMinutes("x")).toBeNull();
  });
});

describe("the usual time", () => {
  it("is off by default and saved with bounds", async () => {
    const { getPrepSettings, savePrepSettings } = await import("../lib/catalog-prep");
    expect(await getPrepSettings(tenantId)).toEqual({ enabled: false, defaultMinutes: 30 });
    expect(await savePrepSettings(tenantId, { enabled: true, defaultMinutes: 20 })).toEqual({ enabled: true, defaultMinutes: 20 });
    expect(await getPrepSettings(tenantId)).toEqual({ enabled: true, defaultMinutes: 20 });
    expect((await savePrepSettings(tenantId, { enabled: true, defaultMinutes: 99999 })).defaultMinutes).toBe(30);
  });

  it("is told in the payment confirmation and kept with the order", async () => {
    const { buildPaidOrderMessage } = await import("../lib/catalog-payments");
    const order = { id: "ord-aaaa1111", customerName: "سارة", customerPhone: "966500000111", productName: "وجبة", quantity: 1, total: 25, currency: "SAR" };
    expect(buildPaidOrderMessage(order, "2026-10-23T10:00:00Z", "", undefined, undefined, undefined, undefined, 30)).toContain("⏱ سيتم تجهيز طلبك خلال 30 دقيقة");
    expect(buildPaidOrderMessage(order, "2026-10-23T10:00:00Z")).not.toContain("⏱");
  });
});

describe("the time and the ready stage on an order", () => {
  it("tells the customer the time set for the order and remembers it", async () => {
    const { saveOrderTracking } = await import("../lib/order-tracking");
    const { getOrderPrep } = await import("../lib/catalog-prep");
    await seedOrder("ord-prep0001");
    texts.length = 0;
    const result = await saveOrderTracking(tenantId, "ord-prep0001", { stage: "preparing", prepMinutes: 45 });
    expect(result.ok && result.notified).toBe(true);
    expect(texts[0]).toContain("قيد التجهيز");
    expect(texts[0]).toContain("⏱ سيتم تجهيز طلبك خلال 45 دقيقة");
    expect((await getOrderPrep(["ord-prep0001"])).get("ord-prep0001")).toBe(45);

    // A new time for the same stage is told again; the same time again is not repeated
    texts.length = 0;
    await saveOrderTracking(tenantId, "ord-prep0001", { stage: "preparing", prepMinutes: 15 });
    expect(texts[0]).toContain("خلال 15 دقيقة");
  });

  it("uses the time the order already has (given at payment) when none is typed", async () => {
    const { saveOrderTracking } = await import("../lib/order-tracking");
    const { setOrderPrep } = await import("../lib/catalog-prep");
    await seedOrder("ord-prep0002");
    await setOrderPrep("ord-prep0002", 25);
    texts.length = 0;
    await saveOrderTracking(tenantId, "ord-prep0002", { stage: "preparing" });
    expect(texts[0]).toContain("خلال 25 دقيقة");
  });

  it("the ready stage says where to collect it: the car with its plate, the store, or plain", async () => {
    const { saveOrderTracking, buildTrackingMessage } = await import("../lib/order-tracking");
    const { recordOrderPickup } = await import("../lib/catalog-pickup");
    await seedOrder("ord-prep0003");
    await recordOrderPickup("ord-prep0003", { kind: "car", plate: "ABC 1234", carDetails: "" });
    texts.length = 0;
    await saveOrderTracking(tenantId, "ord-prep0003", { stage: "ready" });
    expect(texts[0]).toContain("جاهز للاستلام");
    expect(texts[0]).toContain("سيخرج لك الموظف طلبك إلى سيارتك (ABC 1234)");

    expect(buildTrackingMessage("ord-x1234567", { stage: "ready", carrier: "", trackingNumber: "", trackingUrl: "" }, { pickup: { kind: "store", plate: "", carDetails: "" } })).toContain("تفضل بالاستلام من المحل");
    expect(buildTrackingMessage("ord-x1234567", { stage: "ready", carrier: "", trackingNumber: "", trackingUrl: "" })).toContain("طلبك جاهز");
    expect(buildTrackingMessage("ord-x1234567", { stage: "preparing", carrier: "", trackingNumber: "", trackingUrl: "" })).not.toContain("⏱");
  });
});
