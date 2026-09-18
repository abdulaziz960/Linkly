import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const findUniqueSubscription = vi.fn();
const deleteTenant = vi.fn();
const logAdminAction = vi.fn();

vi.mock("../lib/auth", () => ({
  authCookieName: "audiencew_session",
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args)
}));

vi.mock("../lib/prisma", () => ({
  prisma: { subscription: { findUnique: (...args: unknown[]) => findUniqueSubscription(...args) } }
}));

vi.mock("../lib/subscriptions", () => ({
  deleteTenant: (...args: unknown[]) => deleteTenant(...args),
  logAdminAction: (...args: unknown[]) => logAdminAction(...args)
}));

import { POST } from "../app/api/account/delete/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    findUniqueSubscription.mockReset();
    deleteTenant.mockReset();
    logAdminAction.mockReset();
  });

  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await POST(request({ confirmCompanyName: "Anything" }));
    expect(response.status).toBe(401);
    expect(deleteTenant).not.toHaveBeenCalled();
  });

  it("refuses a non-owner even with the right confirmation text", async () => {
    getCurrentUser.mockResolvedValue({ role: "موظف دعم", tenantId: "tenant-1", name: "Employee", email: "e@x.example" });
    findUniqueSubscription.mockResolvedValue({ companyName: "Acme" });
    const response = await POST(request({ confirmCompanyName: "Acme" }));
    expect(response.status).toBe(403);
    expect(deleteTenant).not.toHaveBeenCalled();
  });

  it("refuses when the typed company name doesn't match, even as an owner", async () => {
    getCurrentUser.mockResolvedValue({ role: "مالك الحساب", tenantId: "tenant-1", name: "Owner", email: "o@x.example" });
    findUniqueSubscription.mockResolvedValue({ companyName: "Acme" });
    const response = await POST(request({ confirmCompanyName: "acme" }));
    expect(response.status).toBe(400);
    expect(deleteTenant).not.toHaveBeenCalled();
  });

  it("deletes the tenant, logs it under system (not the deleted tenant), and clears the session cookie", async () => {
    getCurrentUser.mockResolvedValue({ role: "مالك الحساب", tenantId: "tenant-1", name: "Owner", email: "o@x.example" });
    findUniqueSubscription.mockResolvedValue({ companyName: "Acme" });
    deleteTenant.mockResolvedValue({ companyName: "Acme" });

    const response = await POST(request({ confirmCompanyName: "Acme" }));

    expect(response.status).toBe(200);
    expect(deleteTenant).toHaveBeenCalledWith("tenant-1");
    expect(logAdminAction).toHaveBeenCalledWith("system", "النظام", expect.stringContaining("Acme"), "تنبيه");
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain("audiencew_session=;");
  });
});
