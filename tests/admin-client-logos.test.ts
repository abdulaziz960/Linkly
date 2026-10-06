import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-client-logos.db");
const requirePlatformAdmin = vi.fn();
vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: (...a: unknown[]) => requirePlatformAdmin(...a) }));

const png = Buffer.from("fake-logo-bytes").toString("base64");

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

const request = () => new NextRequest("http://localhost/api/admin/clients/t-logo/logo");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("client logos in the admin panel", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1" });
  });

  it("lists only clients that have a logo and serves it as an image", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    const { getClientLogoTenantIds } = await import("../lib/admin-client-logos");
    const { GET } = await import("../app/api/admin/clients/[id]/logo/route");
    await ensureSchema();

    const now = new Date().toISOString();
    await prisma.tenantPreference.create({ data: { tenantId: "t-logo", brandLogoDataUrl: `data:image/png;base64,${png}`, updatedAt: now } });
    await prisma.tenantPreference.create({ data: { tenantId: "t-none", brandLogoDataUrl: "", updatedAt: now } });

    expect(await getClientLogoTenantIds()).toEqual(["t-logo"]);

    const response = await GET(request(), ctx("t-logo"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("fake-logo-bytes");

    expect((await GET(request(), ctx("t-none"))).status).toBe(404);
  });

  it("is admin-only", async () => {
    const { GET } = await import("../app/api/admin/clients/[id]/logo/route");
    requirePlatformAdmin.mockResolvedValue(null);
    expect((await GET(request(), ctx("t-logo"))).status).toBe(403);
    expect(requirePlatformAdmin).toHaveBeenCalledWith("clients");
  });

  it("never serves a non-image logo as its own type", async () => {
    const { prisma } = await import("../lib/prisma");
    const { GET } = await import("../app/api/admin/clients/[id]/logo/route");
    await prisma.tenantPreference.create({ data: { tenantId: "t-svg", brandLogoDataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)/>").toString("base64")}`, updatedAt: new Date().toISOString() } });
    const response = await GET(request(), ctx("t-svg"));
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});
