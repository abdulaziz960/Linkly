import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PERMISSIONS,
  canAccessPath,
  hasAdminPermission,
  parseAdminPermissions,
  permissionForPath,
  serializeAdminPermissions,
  validatePermissionChange
} from "../lib/admin-permissions";

describe("permission helpers", () => {
  it("treats a missing or wildcard value as full access and ignores unknown keys", () => {
    expect(parseAdminPermissions(undefined)).toEqual([...ADMIN_PERMISSIONS]);
    expect(parseAdminPermissions("*")).toEqual([...ADMIN_PERMISSIONS]);
    expect(parseAdminPermissions("billing, nonsense ,support")).toEqual(["billing", "support"]);
  });

  it("serialises the full set as a wildcard", () => {
    expect(serializeAdminPermissions([...ADMIN_PERMISSIONS])).toBe("*");
    expect(serializeAdminPermissions(["support", "clients", "bogus"])).toBe("clients,support");
  });

  it("maps pages to permissions with the most specific prefix", () => {
    expect(permissionForPath("/linkly-admin007/payments")).toBe("billing");
    expect(permissionForPath("/linkly-admin007/clients/tenant-1")).toBe("clients");
    expect(permissionForPath("/linkly-admin007/discount-codes/abc")).toBe("billing");
    expect(permissionForPath("/linkly-admin007/admin-actions")).toBe("team");
    expect(permissionForPath("/linkly-admin007")).toBeNull();
    expect(permissionForPath("/linkly-admin007/settings")).toBeNull();
    expect(canAccessPath(["support"], "/linkly-admin007/payments")).toBe(false);
    expect(canAccessPath(["support"], "/linkly-admin007/support")).toBe(true);
    expect(canAccessPath(["support"], "/linkly-admin007/logs")).toBe(true);
    expect(hasAdminPermission(["clients"], "billing")).toBe(false);
  });

  it("never lets the last team manager lose the team permission", () => {
    expect(validatePermissionChange({ targetId: "a", next: ["billing"], teamManagerIds: ["a"] })).toMatch(/آخر عضو/);
    expect(validatePermissionChange({ targetId: "a", next: ["billing"], teamManagerIds: ["a", "b"] })).toBeNull();
    expect(validatePermissionChange({ targetId: "a", next: ["team", "billing"], teamManagerIds: ["a"] })).toBeNull();
    expect(validatePermissionChange({ targetId: "a", next: [], teamManagerIds: ["a", "b"] })).toMatch(/صلاحية واحدة/);
  });
});

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-permissions.db");
let currentUser: { id: string; isPlatformAdmin: number } | null = null;

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.doMock("../lib/auth", () => ({ getCurrentUser: async () => currentUser }));
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.doUnmock("../lib/auth");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("server-side enforcement", () => {
  it("rejects non-admins and anonymous callers", async () => {
    const { requirePlatformAdmin } = await import("../lib/admin-auth");
    currentUser = null;
    expect(await requirePlatformAdmin("billing")).toBeNull();
    currentUser = { id: "u-tenant", isPlatformAdmin: 0 };
    expect(await requirePlatformAdmin()).toBeNull();
  });

  it("gives a member with no stored row full access (backward compatible)", async () => {
    const { requirePlatformAdmin } = await import("../lib/admin-auth");
    currentUser = { id: "u-old-admin", isPlatformAdmin: 1 };
    expect(await requirePlatformAdmin("billing")).not.toBeNull();
    expect(await requirePlatformAdmin("team")).not.toBeNull();
  });

  it("enforces a restricted member's permissions", async () => {
    const { requirePlatformAdmin, setAdminPermissions } = await import("../lib/admin-auth");
    await setAdminPermissions("u-support", ["support", "clients"], "owner");
    currentUser = { id: "u-support", isPlatformAdmin: 1 };
    expect(await requirePlatformAdmin("support")).not.toBeNull();
    expect(await requirePlatformAdmin("clients")).not.toBeNull();
    expect(await requirePlatformAdmin("billing")).toBeNull();
    expect(await requirePlatformAdmin("team")).toBeNull();
    // Without a specific permission the member is still a platform admin.
    expect(await requirePlatformAdmin()).not.toBeNull();
  });

  it("applies a change immediately and a wildcard restores full access", async () => {
    const { requirePlatformAdmin, setAdminPermissions } = await import("../lib/admin-auth");
    currentUser = { id: "u-flex", isPlatformAdmin: 1 };
    await setAdminPermissions("u-flex", ["content"], "owner");
    expect(await requirePlatformAdmin("billing")).toBeNull();
    await setAdminPermissions("u-flex", [...ADMIN_PERMISSIONS], "owner");
    expect(await requirePlatformAdmin("billing")).not.toBeNull();
  });
});

describe("team account controls", () => {
  async function seedAdmin(id: string, email: string) {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.userAccount.create({ data: { id, name: id, email, passwordHash: "", role: "مالك الحساب", tenantId: "tenant-demo", isPlatformAdmin: 1, createdAt: new Date().toISOString() } });
  }

  it("suspends a member, invalidating their sessions, and blocks unsafe cases", async () => {
    const { prisma } = await import("../lib/prisma");
    const { setPlatformAdminDisabled } = await import("../lib/platform-team");
    await seedAdmin("m-owner", "owner@x.test");
    await seedAdmin("m-agent", "agent@x.test");

    await expect(setPlatformAdminDisabled("m-owner", true, "m-owner", ["m-owner"])).rejects.toThrow(/بنفسك/);
    await expect(setPlatformAdminDisabled("m-owner", true, "m-agent", ["m-owner"])).rejects.toThrow(/آخر عضو نشط/);

    await setPlatformAdminDisabled("m-agent", true, "m-owner", ["m-owner"]);
    const suspended = await prisma.userAccount.findUnique({ where: { id: "m-agent" } });
    expect(suspended?.disabled).toBe(1);
    expect(suspended?.sessionVersion).toBe(1);

    await setPlatformAdminDisabled("m-agent", false, "m-owner", ["m-owner"]);
    expect((await prisma.userAccount.findUnique({ where: { id: "m-agent" } }))?.disabled).toBe(0);
  });

  it("revokes all sessions of another member but not your own", async () => {
    const { prisma } = await import("../lib/prisma");
    const { revokePlatformAdminSessions } = await import("../lib/platform-team");
    await expect(revokePlatformAdminSessions("m-agent", "m-agent")).rejects.toThrow(/تسجيل الخروج/);
    const before = (await prisma.userAccount.findUnique({ where: { id: "m-agent" } }))?.sessionVersion ?? 0;
    await revokePlatformAdminSessions("m-agent", "m-owner");
    expect((await prisma.userAccount.findUnique({ where: { id: "m-agent" } }))?.sessionVersion).toBe(before + 1);
    await expect(revokePlatformAdminSessions("missing", "m-owner")).rejects.toThrow(/غير موجود/);
  });
});
