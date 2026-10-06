import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-hidden-clients.db");

const requirePlatformAdmin = vi.fn();
const getSubscriptions = vi.fn();
const recordAdminAction = vi.fn();
vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: (...a: unknown[]) => requirePlatformAdmin(...a) }));
vi.mock("../lib/subscriptions", () => ({ getSubscriptions: (...a: unknown[]) => getSubscriptions(...a) }));
vi.mock("../lib/admin-audit", () => ({ recordAdminAction: (...a: unknown[]) => recordAdminAction(...a) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
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

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/clients/hidden", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("hidden clients store", () => {
  it("hides, lists and un-hides workspaces without touching anything else", async () => {
    const { getHiddenTenantIds, setClientsHidden } = await import("../lib/admin-hidden-clients");
    expect((await getHiddenTenantIds()).size).toBe(0);

    await setClientsHidden(["t-a", "t-b", "t-a"], true, "admin");
    expect(Array.from(await getHiddenTenantIds()).sort()).toEqual(["t-a", "t-b"]);

    await setClientsHidden(["t-a"], false, "admin");
    expect(Array.from(await getHiddenTenantIds())).toEqual(["t-b"]);
  });
});

describe("POST /api/admin/clients/hidden", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1", name: "Admin" });
    getSubscriptions.mockReset().mockResolvedValue([{ tenantId: "t-real" }]);
    recordAdminAction.mockReset();
  });

  it("refuses a wrong Origin and a caller without the clients permission", async () => {
    const { POST } = await import("../app/api/admin/clients/hidden/route");
    expect((await POST(post({ tenantIds: ["t-real"], hidden: true }, { Origin: "https://evil.example.com" }))).status).toBe(403);
    requirePlatformAdmin.mockResolvedValue(null);
    expect((await POST(post({ tenantIds: ["t-real"], hidden: true }))).status).toBe(403);
    expect(requirePlatformAdmin).toHaveBeenCalledWith("clients");
  });

  it("validates the body and ignores ids that are not real workspaces", async () => {
    const { POST } = await import("../app/api/admin/clients/hidden/route");
    expect((await POST(post({ tenantIds: [], hidden: true }))).status).toBe(400);
    expect((await POST(post({ tenantIds: ["t-real"], hidden: "yes" }))).status).toBe(400);
    expect((await POST(post({ tenantIds: ["t-ghost"], hidden: true }))).status).toBe(404);
  });

  it("hides a real workspace and records the action", async () => {
    const { POST } = await import("../app/api/admin/clients/hidden/route");
    const { getHiddenTenantIds } = await import("../lib/admin-hidden-clients");
    const response = await POST(post({ tenantIds: ["t-real", "t-ghost"], hidden: true }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.count).toBe(1);
    expect((await getHiddenTenantIds()).has("t-real")).toBe(true);
    expect((await getHiddenTenantIds()).has("t-ghost")).toBe(false);
    expect(recordAdminAction).toHaveBeenCalledWith(expect.anything(), "hide-clients", expect.anything(), expect.any(String));
  });
});
