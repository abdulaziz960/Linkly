import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-branches.db");
const tenantId = "tenant-branches";

const sent: Array<{ kind: string; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "cta", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; })
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

async function makeProduct(name: string) {
  const { createProduct, cleanProductInput } = await import("../lib/catalog");
  const clean = cleanProductInput({ name, price: 10 });
  if (!clean.ok) throw new Error(clean.error);
  return createProduct(tenantId, clean.data);
}

describe("branches with their own stock", () => {
  it("saves branches, keeps stock per branch, and reserves / restocks it", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const b = await import("../lib/catalog-branches");
    expect((await b.saveBranch(tenantId, { name: " " })).ok).toBe(false);
    const north = await b.saveBranch(tenantId, { name: "فرع الشمال" });
    const south = await b.saveBranch(tenantId, { name: "فرع الجنوب", address: "حي النخيل" });
    if (!north.ok || !south.ok) throw new Error("branch");
    const tea = await makeProduct("شاي");
    const cake = await makeProduct("كيك");

    await b.setBranchStock(tenantId, north.branch.id, tea.id, 3);
    await b.setBranchStock(tenantId, south.branch.id, tea.id, 0);
    expect((await b.getBranchStock(tenantId, north.branch.id)).get(tea.id)).toBe(3);
    expect((await b.getBranchStock(tenantId, north.branch.id)).get(cake.id)).toBeUndefined();

    // no row = not tracked: always works; a tracked row that is too low fails and gives back what was taken
    const ok = await b.reserveBranchStock(tenantId, north.branch.id, [{ productId: tea.id, name: "شاي", quantity: 2 }, { productId: cake.id, name: "كيك", quantity: 5 }]);
    expect(ok.ok).toBe(true);
    expect((await b.getBranchStock(tenantId, north.branch.id)).get(tea.id)).toBe(1);
    const fail = await b.reserveBranchStock(tenantId, north.branch.id, [{ productId: cake.id, name: "كيك", quantity: 1 }, { productId: tea.id, name: "شاي", quantity: 2 }]);
    expect(fail).toEqual({ ok: false, productName: "شاي" });
    expect((await b.getBranchStock(tenantId, north.branch.id)).get(tea.id)).toBe(1);
    await b.restockBranch(tenantId, north.branch.id, tea.id, 2);
    expect((await b.getBranchStock(tenantId, north.branch.id)).get(tea.id)).toBe(3);

    expect(b.shortfalls([{ productId: tea.id, name: "شاي", quantity: 2 }], await b.getBranchStock(tenantId, south.branch.id))).toEqual([{ name: "شاي", wanted: 2, available: 0 }]);
    expect(b.shortfalls([{ productId: cake.id, name: "كيك", quantity: 9 }], await b.getBranchStock(tenantId, south.branch.id))).toEqual([]);

    await b.deleteBranch(tenantId, south.branch.id);
    expect((await b.listBranches(tenantId)).map((x) => x.name)).toEqual(["فرع الشمال"]);
  });

  it("asks the branch at checkout, refuses a branch without the stock, never shows the remaining quantity, and takes the order from the branch", async () => {
    const { prisma } = await import("../lib/prisma");
    const b = await import("../lib/catalog-branches");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    await prisma.conversation.deleteMany({});
    const south = await b.saveBranch(tenantId, { name: "فرع الجنوب" });
    if (!south.ok) throw new Error("branch");
    // the map link of the branch: https only, shown after the order is placed
    expect((await b.saveBranch(tenantId, { id: (await b.listBranches(tenantId)).find((x) => x.name === "فرع الشمال")!.id, name: "فرع الشمال", mapUrl: "http://maps.example/1" })).ok).toBe(false);
    const withMap = await b.saveBranch(tenantId, { id: (await b.listBranches(tenantId)).find((x) => x.name === "فرع الشمال")!.id, name: "فرع الشمال", mapUrl: "https://maps.app.goo.gl/north" });
    expect(withMap.ok && withMap.branch.mapUrl).toBe("https://maps.app.goo.gl/north");
    const tea = (await prisma.product.findMany({ where: { tenantId, name: "شاي" } }))[0];
    await b.setBranchStock(tenantId, south.branch.id, tea.id, 0);
    const north = (await b.listBranches(tenantId)).find((x) => x.name === "فرع الشمال")!;

    const texts: string[] = [];
    const c = { channel: "whatsapp" as const, tenantId, conversationId: "conv-branch", recipientId: "966500000000", sendText: async (t: string) => { texts.push(t); } };
    await addToCart(tenantId, c.conversationId, tea.id, 2);

    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    const asked = sent.at(-1)!;
    expect(String(asked.input.bodyText)).toContain("من أي فرع");
    const ids = (asked.kind === "buttons" ? (asked.input.buttons as Array<{ id: string }>) : (asked.input.rows as Array<{ id: string }>)).map((x) => x.id);
    expect(ids).toEqual([`br_${north.id}`, `br_${south.branch.id}`]);

    // the branch without the stock is refused, without any number, and the question comes again
    sent.length = 0;
    await handleCatalogReply(c, { id: `br_${south.branch.id}`, text: "" }, "");
    const refused = String(sent.at(-1)!.input.bodyText);
    expect(refused).toContain("لا يتوفر في فرع «فرع الجنوب»");
    expect(refused).toContain("شاي");
    expect(refused).not.toMatch(/\d/);

    // the branch with stock is accepted and checkout carries on (no delivery / pickup set up: straight to payment, i.e. an order for staff)
    await handleCatalogReply(c, { id: `br_${north.id}`, text: "" }, "");
    const order = await prisma.catalogOrder.findFirst({ where: { tenantId } });
    expect(order).toBeTruthy();
    expect(texts.join("\n")).toContain("موقع الفرع: https://maps.app.goo.gl/north");
    expect((await b.getBranchStock(tenantId, north.id)).get(tea.id)).toBe(1);
    const { listOrders, updateOrderStatus } = await import("../lib/catalog");
    expect((await listOrders(tenantId))[0].branchName).toBe("فرع الشمال");

    // the branch is named in the tracking message, the "paid" message and the receipt data
    const { buildTrackingMessage, buildCustomerTrackingReply } = await import("../lib/order-tracking");
    expect(buildTrackingMessage("ord-x1234567", { stage: "preparing", carrier: "", trackingNumber: "", trackingUrl: "" }, { branch: "فرع الشمال" })).toContain("الفرع: فرع الشمال");
    expect(buildTrackingMessage("ord-x1234567", { stage: "preparing", carrier: "", trackingNumber: "", trackingUrl: "" })).not.toContain("الفرع");
    const { buildPaidOrderMessage } = await import("../lib/catalog-payments");
    expect(buildPaidOrderMessage({ id: order!.id, customerName: "", customerPhone: "", productName: "x", quantity: 1, total: 10, currency: "SAR" }, new Date().toISOString(), "", undefined, undefined, undefined, undefined, undefined, { name: "فرع الشمال", mapUrl: "https://maps.app.goo.gl/north" })).toContain("موقع الفرع: https://maps.app.goo.gl/north");
    await prisma.catalogOrder.update({ where: { id: order!.id }, data: { status: "paid" } });
    expect(await buildCustomerTrackingReply(tenantId, "conv-branch", "")).toContain("الفرع: فرع الشمال");

    // cancelling gives the units back to the branch
    await updateOrderStatus(tenantId, order!.id, "cancelled");
    expect((await b.getBranchStock(tenantId, north.id)).get(tea.id)).toBe(3);
  });
});
