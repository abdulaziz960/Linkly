import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// email_integrations.tenant_id must hold one row per tenant: migration
// 20260828170000 adds a unique index, and production's tenant-demo once had
// both `primary-email` (old seed) and `email:tenant-demo` (Gmail OAuth),
// which failed that migration and made lookups pick a row at random.

const testDbPath = join(process.cwd(), "tests", ".tmp-email-integration.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

function row(id: string, tenantId: string, overrides: Record<string, string> = {}) {
  return { id, tenantId, provider: "gmail", status: "not_connected", webhookSecret: "", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("email integration lookup", () => {
  it("prefers the canonical email:<tenant> row even when another row was updated later", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { findTenantEmailIntegration } = await import("../lib/email-integration-lookup");
    await ensureSchema();

    await prisma.emailIntegration.create({ data: row("legacy-row", "tenant-lookup-a", { provider: "webhook", updatedAt: "2026-09-01T00:00:00.000Z" }) });
    await prisma.emailIntegration.create({ data: row("email:tenant-lookup-a", "tenant-lookup-a", { status: "connected", updatedAt: "2026-08-01T00:00:00.000Z" }) });
    expect((await findTenantEmailIntegration("tenant-lookup-a"))?.id).toBe("email:tenant-lookup-a");
  });

  it("falls back to the most recently updated row when there is no canonical one", async () => {
    const { prisma } = await import("../lib/prisma");
    const { findTenantEmailIntegration } = await import("../lib/email-integration-lookup");

    await prisma.emailIntegration.create({ data: row("old-b", "tenant-lookup-b", { updatedAt: "2026-08-01T00:00:00.000Z" }) });
    await prisma.emailIntegration.create({ data: row("new-b", "tenant-lookup-b", { updatedAt: "2026-09-01T00:00:00.000Z" }) });
    expect((await findTenantEmailIntegration("tenant-lookup-b"))?.id).toBe("new-b");
    expect(await findTenantEmailIntegration("tenant-without-email")).toBeNull();
  });

  it("ignores a canonical-looking id that belongs to another tenant", async () => {
    const { prisma } = await import("../lib/prisma");
    const { findTenantEmailIntegration } = await import("../lib/email-integration-lookup");

    await prisma.emailIntegration.create({ data: row("email:tenant-lookup-c", "someone-else") });
    expect(await findTenantEmailIntegration("tenant-lookup-c")).toBeNull();
  });
});

describe("Gmail OAuth connection", () => {
  function mockGoogle(email: string) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ email, name: "Owner" }), { status: 200 });
    }));
  }

  it("updates the tenant's existing row instead of creating a second one", async () => {
    const { prisma } = await import("../lib/prisma");
    const { saveOAuthConnection } = await import("../lib/email-channel");

    await prisma.emailIntegration.create({ data: row("primary-email-like", "tenant-oauth-a", { provider: "webhook" }) });
    mockGoogle("owner@a.example");
    await saveOAuthConnection("gmail", "code-1", "tenant-oauth-a");

    const rows = await prisma.emailIntegration.findMany({ where: { tenantId: "tenant-oauth-a" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "primary-email-like", provider: "gmail", status: "connected", emailAddress: "owner@a.example" });
    expect(rows[0].accessToken).not.toBe("access-1");
    expect(rows[0].accessToken).not.toBe("");
  });

  it("creates the canonical row when the tenant has none", async () => {
    const { prisma } = await import("../lib/prisma");
    const { saveOAuthConnection } = await import("../lib/email-channel");

    mockGoogle("owner@b.example");
    await saveOAuthConnection("gmail", "code-2", "tenant-oauth-b");
    const rows = await prisma.emailIntegration.findMany({ where: { tenantId: "tenant-oauth-b" } });
    expect(rows.map((entry) => entry.id)).toEqual(["email:tenant-oauth-b"]);
  });
});

describe("tenant-demo email seed", () => {
  it("never adds a second tenant-demo row, whatever the existing row's id", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema, getEmailIntegrationSettings } = await import("../lib/database");
    await ensureSchema();

    // Production state after the fix: the Gmail row is tenant-demo's only
    // row and the old `primary-email` row was moved to a placeholder tenant.
    await prisma.emailIntegration.create({ data: row("email:tenant-demo", "tenant-demo", { status: "connected", emailAddress: "demo@example.com" }) });
    await prisma.emailIntegration.create({ data: row("primary-email", "legacy-primary-email", { provider: "webhook" }) });

    const settings = await getEmailIntegrationSettings("tenant-demo");
    expect(settings).toMatchObject({ id: "email:tenant-demo", status: "connected", emailAddress: "demo@example.com" });
    expect(await prisma.emailIntegration.count({ where: { tenantId: "tenant-demo" } })).toBe(1);
    expect(await prisma.emailIntegration.findUnique({ where: { id: "primary-email" } })).toMatchObject({ tenantId: "legacy-primary-email" });
  });
});
