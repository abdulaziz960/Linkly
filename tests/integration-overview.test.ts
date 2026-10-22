import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-integration-overview.db");
const tenantId = "tenant-integration-overview";
let allowed = true;
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", name: "Owner", role: "مالك الحساب", tenantId })) }));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => allowed) }));
vi.setConfig({ testTimeout: 120_000 });

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("GET /api/settings/integration?channels=", () => {
  it("returns every requested channel's settings in one response, secrets masked", async () => {
    const { ensureSchema, getIntegrationSettings } = await import("../lib/database");
    await ensureSchema();
    await getIntegrationSettings("instagram", tenantId);
    const { prisma } = await import("../lib/prisma");
    const { encryptSecret } = await import("../lib/secret-storage");
    await prisma.integrationSetting.updateMany({ where: { tenantId, provider: { contains: "instagram" } }, data: { status: "connected", wabaName: "rheinolksa", accessToken: encryptSecret("real-token") } });

    const { GET } = await import("../app/api/settings/integration/route");
    const response = await GET(new NextRequest("https://linklysa.io/api/settings/integration?channels=whatsapp,instagram,email,not-a-channel"));
    expect(response.status).toBe(200);
    const body = await response.json() as { channels: Record<string, { status: string; wabaName: string; accessToken: string }> };
    expect(Object.keys(body.channels).sort()).toEqual(["email", "instagram", "whatsapp"]);
    expect(body.channels.instagram).toMatchObject({ status: "connected", wabaName: "rheinolksa" });
    expect(body.channels.instagram.accessToken).not.toContain("real-token");
    expect(body.channels.whatsapp.status).not.toBe("connected");
  });

  it("keeps the same permission check as the single-channel request", async () => {
    allowed = false;
    const { GET } = await import("../app/api/settings/integration/route");
    expect((await GET(new NextRequest("https://linklysa.io/api/settings/integration?channels=whatsapp"))).status).toBe(403);
    allowed = true;
  });
});
