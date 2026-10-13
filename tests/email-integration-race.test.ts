import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
vi.mock("../lib/prisma", () => ({ prisma: { emailIntegration: { findUnique, findFirst, create } } }));

afterEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  create.mockReset();
});

const data = { id: "email:tenant-race", tenantId: "tenant-race", provider: "gmail", status: "not_connected", updatedAt: "2026-10-13T00:00:00.000Z" };
const row = { ...data, senderName: "", emailAddress: "", webhookSecret: "", accessToken: "", refreshToken: "", tokenExpiresAt: "", lastSyncedAt: "" };

describe("getOrCreateTenantEmailIntegration", () => {
  it("returns the row another request created at the same moment instead of failing", async () => {
    const { getOrCreateTenantEmailIntegration } = await import("../lib/email-integration-lookup");
    // First look-up: no row yet. The create loses the race (unique tenant_id). Second look-up finds the winner's row.
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    findFirst.mockResolvedValueOnce(null);
    create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(getOrCreateTenantEmailIntegration("tenant-race", data)).resolves.toMatchObject({ id: "email:tenant-race" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("creates the row when nobody has", async () => {
    const { getOrCreateTenantEmailIntegration } = await import("../lib/email-integration-lookup");
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    create.mockResolvedValueOnce(row);

    await expect(getOrCreateTenantEmailIntegration("tenant-race", data)).resolves.toBe(row);
  });

  it("does not create a second row when one already exists", async () => {
    const { getOrCreateTenantEmailIntegration } = await import("../lib/email-integration-lookup");
    findUnique.mockResolvedValueOnce(row);

    await expect(getOrCreateTenantEmailIntegration("tenant-race", data)).resolves.toBe(row);
    expect(create).not.toHaveBeenCalled();
  });

  it("still throws errors that are not a lost race", async () => {
    const { getOrCreateTenantEmailIntegration } = await import("../lib/email-integration-lookup");
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    create.mockRejectedValueOnce(new Error("connection refused"));

    await expect(getOrCreateTenantEmailIntegration("tenant-race", data)).rejects.toThrow("connection refused");
  });

  it("rethrows a unique violation when the row still cannot be found", async () => {
    const { getOrCreateTenantEmailIntegration } = await import("../lib/email-integration-lookup");
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(getOrCreateTenantEmailIntegration("tenant-race", data)).rejects.toThrow("Unique constraint failed");
  });
});

describe("email integration route", () => {
  it("answers JSON, not an HTML error page, when loading the settings fails", async () => {
    vi.resetModules();
    vi.doMock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", name: "Owner", role: "مالك الحساب", tenantId: "tenant-race" })) }));
    vi.doMock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));
    vi.doMock("../lib/database", () => ({ getEmailIntegrationSettings: vi.fn(async () => { throw new Error("db down"); }) }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET, PATCH } = await import("../app/api/email/integration/route");
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toHaveProperty("error");

    const patched = await PATCH(new NextRequest("http://localhost/api/email/integration", { method: "PATCH", body: "{not json", headers: { "Content-Type": "application/json" } }));
    expect(patched.status).toBe(500);
    vi.doUnmock("../lib/auth");
    vi.doUnmock("../lib/permissions-server");
    vi.doUnmock("../lib/database");
  });

  it("rejects a PATCH whose body is not JSON with a 400", async () => {
    vi.resetModules();
    vi.doMock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", name: "Owner", role: "مالك الحساب", tenantId: "tenant-race" })) }));
    vi.doMock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));
    vi.doMock("../lib/database", () => ({ getEmailIntegrationSettings: vi.fn(async () => ({ id: "email:tenant-race" })) }));

    const { PATCH } = await import("../app/api/email/integration/route");
    const response = await PATCH(new NextRequest("http://localhost/api/email/integration", { method: "PATCH", body: "{not json", headers: { "Content-Type": "application/json" } }));
    expect(response.status).toBe(400);
    vi.doUnmock("../lib/auth");
    vi.doUnmock("../lib/permissions-server");
    vi.doUnmock("../lib/database");
  });
});
