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

type SavedBranch = { ok: true; branch: { id: string; name: string; mapUrl: string } };

/** Branches live on the Branches page (the `branches` table); the catalog only reads them. */
async function addBranch(input: { name: string; address?: string; mapUrl?: string }): Promise<SavedBranch> {
  const { prisma } = await import("../lib/prisma");
  const { ensureBranchesSchema } = await import("../lib/branches-schema");
  await ensureBranchesSchema();
  const id = `br-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO branches (id, tenant_id, name, address, latitude, longitude, map_url, active, created_at, updated_at) VALUES (${id}, ${tenantId}, ${input.name}, ${input.address ?? ""}, 24.7, 46.6, ${input.mapUrl ?? ""}, 1, ${now}, ${now})`;
  return { ok: true, branch: { id, name: input.name, mapUrl: input.mapUrl ?? "" } };
}

async function setMap(id: string, mapUrl: string) {
  const { prisma } = await import("../lib/prisma");
  await prisma.$executeRaw`UPDATE branches SET map_url = ${mapUrl} WHERE id = ${id}`;
}

describe("branches with their own stock", () => {
  it("saves branches, keeps stock per branch, and reserves / restocks it", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const b = await import("../lib/catalog-branches");
    const north = await addBranch({ name: "فرع الشمال" });
    const south = await addBranch({ name: "فرع الجنوب", address: "حي النخيل" });
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

    const { prisma: db } = await import("../lib/prisma");
    await db.$executeRaw`DELETE FROM branches WHERE id = ${south.branch.id}`;
    await b.deleteBranchStock(tenantId, south.branch.id);
    expect((await b.listBranches(tenantId)).map((x) => x.name)).toEqual(["فرع الشمال"]);
  });

  it("asks the branch at checkout, refuses a branch without the stock, never shows the remaining quantity, and takes the order from the branch", async () => {
    const { prisma } = await import("../lib/prisma");
    const b = await import("../lib/catalog-branches");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    await prisma.conversation.deleteMany({});
    const south = await addBranch({ name: "فرع الجنوب" });
    if (!south.ok) throw new Error("branch");
    // the map link of the branch: https only, shown after the order is placed
    const northId = (await b.listBranches(tenantId)).find((x) => x.name === "فرع الشمال")!.id;
    await setMap(northId, "https://maps.app.goo.gl/north");
    expect((await b.getBranch(tenantId, northId))?.mapUrl).toBe("https://maps.app.goo.gl/north");
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
    expect(ids).toEqual(["brnearest", `br_${north.id}`, `br_${south.branch.id}`]); // the first row finds the nearest branch from a shared location

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

describe("choosing the branch before the products", () => {
  it("asks the branch first, then lists only that branch's products, keeps the branch for checkout, and lets the customer change it", async () => {
    const { prisma } = await import("../lib/prisma");
    const b = await import("../lib/catalog-branches");
    const { sendCatalogMenu, handleCatalogReply } = await import("../lib/catalog-bot");
    const branches = await b.listBranches(tenantId);
    const north = branches.find((x) => x.name === "فرع الشمال")!;
    const south = branches.find((x) => x.name === "فرع الجنوب")!;
    const tea = (await prisma.product.findMany({ where: { tenantId, name: "شاي" } }))[0];
    const cake = (await prisma.product.findMany({ where: { tenantId, name: "كيك" } }))[0];
    await b.setBranchStock(tenantId, south.id, tea.id, 0); // tea is switched off at the south branch
    await b.setBranchStock(tenantId, north.id, tea.id, 5);

    const texts: string[] = [];
    const c = { channel: "whatsapp" as const, tenantId, conversationId: "conv-browse", recipientId: "966500000001", sendText: async (t: string) => { texts.push(t); } };

    // the branch comes first
    sent.length = 0;
    await sendCatalogMenu(c, "أهلًا");
    expect(String(sent.at(-1)!.input.bodyText)).toContain("من أي فرع تريد الطلب");
    expect(sent.some((m) => m.kind === "list" && (m.input.rows as Array<{ id: string }>).some((row) => row.id.startsWith("prod_")))).toBe(false);

    // south: tea is not offered, cake is
    sent.length = 0;
    await handleCatalogReply(c, { id: `br_${south.id}`, text: "" }, "أهلًا");
    const southRows = (sent.find((m) => m.kind === "list")!.input.rows as Array<{ id: string }>).map((row) => row.id);
    expect(southRows).toContain(`prod_${cake.id}`);
    expect(southRows).not.toContain(`prod_${tea.id}`);
    expect(String(sent.find((m) => m.kind === "list")!.input.bodyText)).toContain("فرع الجنوب");
    // the footer offers to change the branch
    const footer = sent.at(-1)!.input.buttons as Array<{ id: string }>;
    expect(footer.map((x) => x.id)).toContain("brchange");

    // tea cannot be opened or added at south
    texts.length = 0;
    await handleCatalogReply(c, { id: `prod_${tea.id}`, text: "" }, "");
    expect(texts.join("\n")).toContain("لم يعد متوفرًا");

    // change to north: tea is back
    sent.length = 0;
    await handleCatalogReply(c, { id: "brchange", text: "" }, "");
    expect(String(sent.at(-1)!.input.bodyText)).toContain("من أي فرع");
    sent.length = 0;
    await handleCatalogReply(c, { id: `br_${north.id}`, text: "" }, "");
    expect((sent.find((m) => m.kind === "list")!.input.rows as Array<{ id: string }>).map((row) => row.id)).toContain(`prod_${tea.id}`);

    // checkout does not ask the branch again
    const { addToCart } = await import("../lib/catalog-cart");
    await addToCart(tenantId, c.conversationId, tea.id, 1);
    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(sent.some((m) => String(m.input.bodyText ?? "").includes("من أي فرع"))).toBe(false);
  });
});

describe("choosing the branches of a product", () => {
  it("lists the Branches page's branches, switches a product off at one and counts it at another", async () => {
    const b = await import("../lib/catalog-branches");
    const tenant = "tenant-product-branches";
    const { prisma } = await import("../lib/prisma");
    const { ensureBranchesSchema } = await import("../lib/branches-schema");
    await ensureBranchesSchema();
    const now = new Date().toISOString();
    for (const [id, name] of [["pb-1", "الرياض"], ["pb-2", "جدة"]]) {
      await prisma.$executeRaw`INSERT INTO branches (id, tenant_id, name, latitude, longitude, active, created_at, updated_at) VALUES (${id}, ${tenant}, ${name}, 24.7, 46.6, 1, ${now}, ${now})`;
    }
    expect((await b.getProductBranches(tenant, "p-x")).map((x) => [x.name, x.available, x.stock])).toEqual([["الرياض", true, -1], ["جدة", true, -1]]);
    await b.setProductBranches(tenant, "p-x", [{ id: "pb-1", available: true, stock: 7 }, { id: "pb-2", available: false, stock: null }, { id: "unknown", available: false, stock: null }]);
    expect((await b.getProductBranches(tenant, "p-x")).map((x) => [x.name, x.available, x.stock])).toEqual([["الرياض", true, 7], ["جدة", false, -1]]);
    expect(await b.getUnavailableAtBranch(tenant, "pb-2")).toEqual(["p-x"]);
    // switching it back on without a count makes it available again
    await b.setProductBranches(tenant, "p-x", [{ id: "pb-2", available: true, stock: null }]);
    expect((await b.getProductBranches(tenant, "p-x"))[1]).toMatchObject({ available: true, stock: -1 });
  });
});
