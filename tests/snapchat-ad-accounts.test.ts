import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-snapchat-ad-accounts.db");
const tenantId = "tenant-snap-accounts";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "مالك", email: "o@b.sa", tenantId: "tenant-snap-accounts", role: "مالك الحساب" }))
}));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));

describe("Snapchat: choosing the ad account", () => {
  it("lists every account across organizations and only accepts one of them", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { GET, PUT } = await import("../app/api/snapchat/ad-accounts/route");
    await ensureSchema();

    await prisma.integrationSetting.create({
      data: {
        id: `snap-${tenantId}`, tenantId, provider: "snapchat", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "", wabaId: "",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("snap-token"),
        webhookUrl: "", updatedAt: new Date().toISOString(),
        snapchatAdAccountId: "acc-1", snapchatTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString()
      }
    });

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.endsWith("/me/organizations")) {
        return new Response(JSON.stringify({ organizations: [{ organization: { id: "org-a", name: "شركة أ" } }, { organization: { id: "org-b", name: "شركة ب" } }] }));
      }
      if (target.includes("/organizations/org-a/adaccounts")) return new Response(JSON.stringify({ adaccounts: [{ adaccount: { id: "acc-1", name: "حملات الرياض" } }, { adaccount: { id: "acc-2", name: "حملات جدة" } }] }));
      if (target.includes("/organizations/org-b/adaccounts")) return new Response(JSON.stringify({ adaccounts: [{ adaccount: { id: "acc-3", name: "حساب ب" } }] }));
      return new Response("{}", { status: 404 });
    }));

    const listed = await (await GET()).json();
    expect(listed.data.accounts.map((account: { id: string }) => account.id)).toEqual(["acc-1", "acc-2", "acc-3"]);
    expect(listed.data.selectedId).toBe("acc-1");

    const put = (adAccountId: string) =>
      PUT(new NextRequest("http://localhost/api/snapchat/ad-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ adAccountId })
      }));

    expect((await put("acc-3")).status).toBe(200);
    const row = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "snapchat" } });
    expect(row).toMatchObject({ snapchatAdAccountId: "acc-3", snapchatOrganizationId: "org-b", snapchatOrgName: "شركة ب" });

    expect((await put("acc-not-mine")).status).toBe(400);
    const unchanged = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "snapchat" } });
    expect(unchanged?.snapchatAdAccountId).toBe("acc-3");
  });
});
