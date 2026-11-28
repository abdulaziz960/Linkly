import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-client-cards.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const payment = (id: string, amount: number, status: string, createdAt: string) => ({
  id, tenantId: "ten-cards", amount, status, createdAt, gateway: "moyasar", gatewayPaymentId: `pay_${id}`, paymentMethod: "creditcard/mada"
});
const moyasar = (last4: string, company = "mada") => ({ id: "x", status: "paid", amount: 0, currency: "SAR", metadata: {}, sourceType: "creditcard", sourceCompany: company, message: "", cardToken: "token_secret", cardLast4: last4 });

describe("admin view of a client's cards", () => {
  it("groups the cards behind the payments, marks the saved one, and never returns the token", async () => {
    const { prisma } = await import("../lib/prisma");
    const { getClientCards } = await import("../lib/admin-client-cards");
    const now = new Date().toISOString();
    await prisma.subscription.create({ data: { id: "sub-cards", tenantId: "ten-cards", companyName: "شركة", ownerName: "م", ownerEmail: "c@x.test", createdAt: now, updatedAt: now, autoRenewEnabled: 1, savedCardToken: "enc-token", savedCardLast4: "1111", savedCardBrand: "mada" } });
    await prisma.subscriptionPayment.create({ data: payment("a", 100, "مكتمل", "2026-03-01T00:00:00.000Z") });
    await prisma.subscriptionPayment.create({ data: payment("b", 100, "فشل", "2026-02-01T00:00:00.000Z") });
    await prisma.campaignPayment.create({ data: { ...payment("c", 50, "مكتمل", "2026-01-01T00:00:00.000Z"), messages: 100 } });

    const result = await getClientCards("ten-cards", async (id) => (id === "pay_c" ? null : moyasar("1111")));
    expect(result?.saved).toEqual({ brand: "mada", last4: "1111", autoRenewEnabled: true, failCount: 0 });
    expect(result?.cards).toEqual([{ brand: "mada", last4: "1111", payments: 2, paidCount: 1, paidAmount: 100, lastUsed: "2026-03-01T00:00:00.000Z", saved: true }]);
    expect(result?.payments.map((row) => row.lookup)).toEqual(["found", "found", "unavailable"]);
    expect(JSON.stringify(result)).not.toContain("token");
    expect(await getClientCards("nobody", async () => null)).toBeNull();
  });

  it("stops auto-renew but keeps the card for a retry when Moyasar does not delete it", async () => {
    const { prisma } = await import("../lib/prisma");
    const { removeSavedCard } = await import("../lib/admin-client-cards");
    const asked: string[] = [];
    expect(await removeSavedCard("ten-cards", async (token) => { asked.push(token); return false; })).toEqual({ brand: "mada", last4: "1111", gateway: "failed" });
    expect(asked).toEqual(["enc-token"]);
    const after = await prisma.subscription.findUnique({ where: { tenantId: "ten-cards" } });
    expect(after).toMatchObject({ autoRenewEnabled: 0, savedCardToken: "enc-token", savedCardLast4: "1111" });
  });

  it("deletes the token at Moyasar, then forgets the card", async () => {
    const { prisma } = await import("../lib/prisma");
    const { removeSavedCard } = await import("../lib/admin-client-cards");
    const { encryptSecret } = await import("../lib/secret-storage");
    await prisma.subscription.update({ where: { tenantId: "ten-cards" }, data: { autoRenewEnabled: 1, savedCardToken: encryptSecret("token_real") } });
    const asked: string[] = [];
    expect(await removeSavedCard("ten-cards", async (token) => { asked.push(token); return true; })).toEqual({ brand: "mada", last4: "1111", gateway: "deleted" });
    // Moyasar gets the real token, not the encrypted form kept in the database.
    expect(asked).toEqual(["token_real"]);
    const after = await prisma.subscription.findUnique({ where: { tenantId: "ten-cards" } });
    expect(after).toMatchObject({ autoRenewEnabled: 0, savedCardToken: "", savedCardLast4: "", savedCardBrand: "" });
    expect(await removeSavedCard("ten-cards", async () => true)).toBeNull();
  });

  it("asks Moyasar to delete a token and treats an unknown one as already gone", async () => {
    const { deleteMoyasarToken } = await import("../lib/moyasar");
    vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_local_only");
    const calls: Array<{ url: string; method?: string }> = [];
    const answers = [204, 404, 500];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, method: init?.method }); return new Response(null, { status: answers.shift()! }); }));
    expect(await deleteMoyasarToken("token_a")).toBe(true);
    expect(await deleteMoyasarToken("token_b")).toBe(true);
    expect(await deleteMoyasarToken("token_c")).toBe(false);
    expect(calls[0]).toEqual({ url: "https://api.moyasar.com/v1/tokens/token_a", method: "DELETE" });
    expect(await deleteMoyasarToken("")).toBe(false);
    vi.unstubAllGlobals();
    vi.stubEnv("MOYASAR_SECRET_KEY", "");
  });
});
