import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-company-name.db");
const tenantId = "tenant-company-name";
let currentUser: { id: string; name: string; role: string; tenantId: string } | null = null;
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => currentUser) }));
vi.setConfig({ testTimeout: 120_000 });

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const { prisma } = await import("../lib/prisma");
  const now = new Date().toISOString();
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: "شركة رينول", ownerName: "الحمراني", ownerEmail: "owner@example.test", plan: "الباقة العادية", status: "تجربة", employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt: now, createdAt: now, updatedAt: now } });
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const patch = (body: unknown, origin = "https://linklysa.io") => new NextRequest("https://linklysa.io/api/account/company", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json", origin } });

describe("company name", () => {
  it("cleans the name and refuses empty or overlong ones", async () => {
    const { normalizeCompanyName } = await import("../lib/company-name");
    expect(normalizeCompanyName("  شركة   الحمراني \n")).toEqual({ name: "شركة الحمراني" });
    expect(normalizeCompanyName(" ")).toHaveProperty("error");
    expect(normalizeCompanyName("x".repeat(81))).toHaveProperty("error");
  });

  it("the account owner renames the company; nobody else can", async () => {
    const { PATCH } = await import("../app/api/account/company/route");
    const { prisma } = await import("../lib/prisma");

    currentUser = { id: "u-agent", name: "موظف", role: "موظف", tenantId };
    expect((await PATCH(patch({ companyName: "اسم آخر" }))).status).toBe(403);
    currentUser = null;
    expect((await PATCH(patch({ companyName: "اسم آخر" }))).status).toBe(401);

    currentUser = { id: "u-owner", name: "الحمراني", role: "مالك الحساب", tenantId };
    expect((await PATCH(patch({ companyName: "" }))).status).toBe(400);
    expect((await PATCH(patch({ companyName: "شركة الحمراني" }, "https://evil.example"))).status).toBe(403);
    const response = await PATCH(patch({ companyName: "  شركة الحمراني " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, companyName: "شركة الحمراني" });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).companyName).toBe("شركة الحمراني");
    const log = await prisma.adminLog.findFirst({ where: { clientId: tenantId, message: { contains: "اسم الشركة" } } });
    expect(log?.message).toContain("شركة رينول");
  });

  it("the platform team renames it from the client page, logged with the old and new names", async () => {
    const { updateSubscription } = await import("../lib/subscriptions");
    const { prisma } = await import("../lib/prisma");
    await updateSubscription(tenantId, { companyName: "مؤسسة الحمراني" }, "أدمن");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).companyName).toBe("مؤسسة الحمراني");
    const log = await prisma.adminLog.findFirst({ where: { clientId: tenantId, message: { contains: "مؤسسة الحمراني" } }, orderBy: { createdAt: "desc" } });
    expect(log?.message).toContain("بواسطة أدمن");
    await expect(updateSubscription(tenantId, { companyName: " " }, "أدمن")).rejects.toThrow();
  });
});
