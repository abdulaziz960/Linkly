import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-shifts.db");
const tenantId = "tenant-shifts";

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

describe("cashier shifts", () => {
  it("opens once, counts the cash orders of the shift and reports the difference on close", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const s = await import("../lib/catalog-shifts");
    const { createProduct, cleanProductInput, createCartOrder, updateOrderStatus, getProduct } = await import("../lib/catalog");
    expect(s.cleanAmount("abc")).toBeNull();
    expect(s.cleanAmount(-5)).toBeNull();
    expect(s.cleanAmount("150.456")).toBe(150.46);

    expect((await s.closeShift(tenantId, "علي", 10, "")).ok).toBe(false);
    const opened = await s.openShift(tenantId, "علي", 200);
    expect(opened.ok).toBe(true);
    expect((await s.openShift(tenantId, "علي", 50)).ok).toBe(false);

    const clean = cleanProductInput({ name: "قهوة", price: 30 });
    if (!clean.ok) throw new Error(clean.error);
    const product = (await getProduct(tenantId, (await createProduct(tenantId, clean.data)).id))!;
    const cash = await createCartOrder({ tenantId, conversationId: "", customerName: "أ", customerPhone: "1", lines: [{ product, quantity: 2 }], status: "new" });
    const online = await createCartOrder({ tenantId, conversationId: "", customerName: "ب", customerPhone: "2", lines: [{ product, quantity: 1 }], status: "new" });
    await updateOrderStatus(tenantId, online.id, "paid");
    expect(cash.total).toBe(60);

    const live = await s.shiftSummary(tenantId, (await s.getOpenShift(tenantId))!);
    expect(live.report.sales).toBe(90);
    expect(live.expectedCash).toBe(260); // 200 opening + 60 to collect

    const closed = await s.closeShift(tenantId, "علي", 250, "ناقص عشرة");
    if (!closed.ok) throw new Error(closed.error);
    expect(closed.shift).toMatchObject({ expectedCash: 260, countedCash: 250, difference: -10, note: "ناقص عشرة" });
    expect(await s.getOpenShift(tenantId)).toBeNull();
    expect((await s.listRecentShifts(tenantId))[0].difference).toBe(-10);
  });
});
