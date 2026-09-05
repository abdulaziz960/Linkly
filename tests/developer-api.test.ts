import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-developer-api.db");
const tenantId = "tenant-developer-api-test";

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

describe("generateApiKey / resolveApiKeyTenant", () => {
  it("resolves a freshly generated key back to the right tenant", async () => {
    const { generateApiKey, resolveApiKeyTenant } = await import("../lib/developer-api");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const { rawKey } = await generateApiKey(tenantId, "test key");
    expect(rawKey.startsWith("lk_")).toBe(true);

    const resolved = await resolveApiKeyTenant(rawKey);
    expect(resolved).toBe(tenantId);
  });

  it("does not resolve a tampered key", async () => {
    const { generateApiKey, resolveApiKeyTenant } = await import("../lib/developer-api");
    const { rawKey } = await generateApiKey(tenantId, "tamper test");

    const tampered = `${rawKey.slice(0, -1)}${rawKey.at(-1) === "a" ? "b" : "a"}`;
    const resolved = await resolveApiKeyTenant(tampered);
    expect(resolved).toBeNull();
  });

  it("updates lastUsedAt on a successful resolve", async () => {
    const { generateApiKey, resolveApiKeyTenant, listApiKeys } = await import("../lib/developer-api");
    const { rawKey } = await generateApiKey(tenantId, "last used test");

    await resolveApiKeyTenant(rawKey);
    const keys = await listApiKeys(tenantId);
    const created = keys.find((key) => key.name === "last used test");
    expect(created?.lastUsedAt).not.toBe("");
  });
});

describe("revokeApiKey", () => {
  it("makes a key stop resolving once revoked", async () => {
    const { generateApiKey, resolveApiKeyTenant, revokeApiKey } = await import("../lib/developer-api");
    const { id, rawKey } = await generateApiKey(tenantId, "revoke test");

    expect(await resolveApiKeyTenant(rawKey)).toBe(tenantId);

    const revoked = await revokeApiKey(tenantId, id);
    expect(revoked).toBe(true);
    expect(await resolveApiKeyTenant(rawKey)).toBeNull();
  });

  it("returns false for a key belonging to a different tenant", async () => {
    const { generateApiKey, revokeApiKey } = await import("../lib/developer-api");
    const { id } = await generateApiKey(tenantId, "cross-tenant test");

    const revoked = await revokeApiKey("some-other-tenant", id);
    expect(revoked).toBe(false);
  });
});
