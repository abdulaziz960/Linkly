import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-tenant-branding.db");
const tenantId = "tenant-branding-test";

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

describe("getTenantBranding", () => {
  it("returns Linkly's own default branding for a tenant with no preference row", async () => {
    const { getTenantBranding, DEFAULT_BRANDING } = await import("../lib/tenant-branding");
    const branding = await getTenantBranding("tenant-branding-no-row");
    expect(branding).toEqual(DEFAULT_BRANDING);
  });
});

describe("updateTenantBranding", () => {
  it("creates a preference row for a brand-new tenant and returns the saved values", async () => {
    const { updateTenantBranding, getTenantBranding } = await import("../lib/tenant-branding");

    const saved = await updateTenantBranding(tenantId, { name: "وكالة التسويق", logoDataUrl: "data:image/png;base64,AAAA", color: "#ff0000" });
    expect(saved).toEqual({ name: "وكالة التسويق", logoDataUrl: "data:image/png;base64,AAAA", color: "#ff0000" });

    const fetched = await getTenantBranding(tenantId);
    expect(fetched).toEqual(saved);
  });

  it("updates an existing tenant's branding on a second call", async () => {
    const { updateTenantBranding } = await import("../lib/tenant-branding");

    const updated = await updateTenantBranding(tenantId, { name: "اسم جديد", logoDataUrl: "data:image/png;base64,BBBB", color: "#00ff00" });
    expect(updated.name).toBe("اسم جديد");
    expect(updated.color).toBe("#00ff00");
  });

  it("falls back to the default again once cleared back to empty", async () => {
    const { updateTenantBranding, DEFAULT_BRANDING } = await import("../lib/tenant-branding");

    const cleared = await updateTenantBranding(tenantId, { name: "", logoDataUrl: "", color: "" });
    expect(cleared).toEqual(DEFAULT_BRANDING);
  });
});
