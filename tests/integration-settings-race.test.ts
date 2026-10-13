import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-integration-settings-race.db");

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

// A tenant's first dashboard load asks for the same settings from several
// places at once; every request sees "no row yet" and tries to create it.
describe("first-visit settings requests that arrive together", () => {
  it("all get the integration settings, and only one row is created", async () => {
    const { ensureSchema, getIntegrationSettings } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const tenantId = "tenant-settings-race";

    const results = await Promise.all(Array.from({ length: 6 }, () => getIntegrationSettings("telegram", tenantId)));

    expect(results).toHaveLength(6);
    expect(new Set(results.map((settings) => settings.id)).size).toBe(1);
    expect(await prisma.integrationSetting.count({ where: { tenantId, provider: "telegram" } })).toBe(1);
  });

  it("all get the email integration, and only one row is created", async () => {
    const { ensureSchema, getEmailIntegrationSettings } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const tenantId = "tenant-email-race";

    const results = await Promise.all(Array.from({ length: 6 }, () => getEmailIntegrationSettings(tenantId)));

    expect(results).toHaveLength(6);
    expect(new Set(results.map((settings) => settings.id)).size).toBe(1);
    expect(await prisma.emailIntegration.count({ where: { tenantId } })).toBe(1);
  });
});
