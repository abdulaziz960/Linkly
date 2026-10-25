import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-client-tax.db");
const requirePlatformAdmin = vi.fn();
const recordAdminAction = vi.fn();
vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: (...a: unknown[]) => requirePlatformAdmin(...a) }));
vi.mock("../lib/admin-audit", () => ({ recordAdminAction: (...a: unknown[]) => recordAdminAction(...a), changeDetails: () => "" }));

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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) => new NextRequest("http://localhost/api/admin/clients/t-1/tax-profile", { method: "PUT", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body) });

describe("admin sets a client's VAT number", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1", name: "Admin" });
    recordAdminAction.mockReset();
  });

  it("saves it, reads it back, logs the change, and refuses a malformed number or an unauthorised caller", async () => {
    const { GET, PUT } = await import("../app/api/admin/clients/[id]/tax-profile/route");

    const bad = await PUT(put({ vatNumber: "123" }), ctx("t-1"));
    expect(bad.status).toBe(400);

    const ok = await PUT(put({ vatNumber: "311643962400003", address: "الرياض" }), ctx("t-1"));
    expect(ok.status).toBe(200);
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    expect(recordAdminAction.mock.calls[0][1]).toBe("update-client-tax-profile");

    const read = await GET(new NextRequest("http://localhost/api/admin/clients/t-1/tax-profile"), ctx("t-1"));
    expect((await read.json()).data).toEqual({ vatNumber: "311643962400003", address: "الرياض" });

    requirePlatformAdmin.mockResolvedValue(null);
    expect((await PUT(put({ vatNumber: "311643962400003" }), ctx("t-1"))).status).toBe(403);
    expect((await GET(new NextRequest("http://localhost/x"), ctx("t-1"))).status).toBe(403);
    // the billing permission is what the route asks for
    expect(requirePlatformAdmin).toHaveBeenCalledWith("billing");
  });
});
