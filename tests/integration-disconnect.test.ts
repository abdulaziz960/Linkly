import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-integration-disconnect.db");
const tenantId = "tenant-disconnect";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "مالك", email: "o@b.sa", tenantId: "tenant-disconnect", role: "مالك الحساب" }))
}));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));

describe("unlinking an ad platform", () => {
  it("forgets the Snapchat tokens and account, and stops lead intake", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema, getTenantIntegrationId } = await import("../lib/database");
    const { POST } = await import("../app/api/settings/integration/disconnect/route");
    await ensureSchema();
    await prisma.integrationSetting.create({
      data: {
        id: getTenantIntegrationId("snapchat", tenantId), tenantId, provider: "snapchat", status: "connected",
        businessName: "شركة", wabaName: "", phoneNumber: "", phoneNumberId: "", wabaId: "", appId: "", configId: "", verifyToken: "",
        accessToken: "tok", webhookUrl: "", updatedAt: "-", leadAdsEnabled: 1,
        snapchatAdAccountId: "acc-1", snapchatRefreshToken: "ref", snapchatOrganizationId: "org-1", snapchatOrgName: "شركة"
      }
    });

    const call = (channel: string) =>
      POST(new NextRequest("http://localhost/api/settings/integration/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ channel })
      }));

    expect((await call("whatsapp")).status).toBe(400);
    expect((await call("snapchat")).status).toBe(200);

    const row = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "snapchat" } });
    expect(row).toMatchObject({ status: "pending", accessToken: "", leadAdsEnabled: 0, snapchatAdAccountId: "", snapchatRefreshToken: "", snapchatOrganizationId: "" });
  });
});
