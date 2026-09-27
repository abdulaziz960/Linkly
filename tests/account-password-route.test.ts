import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const createSessionToken = vi.fn((..._args: unknown[]) => "signed-token");
const getUserAccountById = vi.fn();
const hashPassword = vi.fn((password: string) => `hashed:${password}`);
const verifyPassword = vi.fn();
const getPasswordValidationError = vi.fn();
const consumeRateLimit = vi.fn();
const updateUserAccount = vi.fn();
const logAdminAction = vi.fn();
const getTenantCompanyName = vi.fn(async (..._args: unknown[]) => "Acme");

vi.mock("../lib/auth", () => ({
  authCookieName: "audiencew_session",
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
  createSessionToken: (...args: unknown[]) => createSessionToken(...args)
}));

vi.mock("../lib/database", () => ({
  getUserAccountById: (...args: unknown[]) => getUserAccountById(...args),
  hashPassword: (...args: unknown[]) => hashPassword(...(args as [string]))
}));

vi.mock("../lib/passwords", () => ({
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
  getPasswordValidationError: (...args: unknown[]) => getPasswordValidationError(...args)
}));

vi.mock("../lib/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
  requestIdentifier: () => "1.2.3.4:user-1"
}));

vi.mock("../lib/prisma", () => ({
  prisma: { userAccount: { update: (...args: unknown[]) => updateUserAccount(...args) } }
}));

vi.mock("../lib/subscriptions", () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  getTenantCompanyName: (...args: unknown[]) => getTenantCompanyName(...args)
}));

import { POST } from "../app/api/account/password/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

const baseUser = { id: "user-1", tenantId: "tenant-1", name: "Owner", email: "o@x.example", isPlatformAdmin: 0 };

describe("POST /api/account/password", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    createSessionToken.mockClear();
    getUserAccountById.mockReset();
    hashPassword.mockClear();
    verifyPassword.mockReset();
    getPasswordValidationError.mockReset();
    consumeRateLimit.mockReset();
    updateUserAccount.mockReset();
    logAdminAction.mockReset();
    getTenantCompanyName.mockClear();
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 1 });
  });

  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await POST(request({ currentPassword: "a", newPassword: "b" }));
    expect(response.status).toBe(401);
    expect(updateUserAccount).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    getCurrentUser.mockResolvedValue(baseUser);
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 30 });
    const response = await POST(request({ currentPassword: "a", newPassword: "b" }));
    expect(response.status).toBe(429);
    expect(updateUserAccount).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password", async () => {
    getCurrentUser.mockResolvedValue(baseUser);
    getUserAccountById.mockResolvedValue({ id: "user-1", passwordHash: "scrypt$salt$key" });
    verifyPassword.mockReturnValue({ valid: false, needsRehash: false, legacy: false });
    const response = await POST(request({ currentPassword: "wrong", newPassword: "NewPassword1" }));
    expect(response.status).toBe(400);
    expect(updateUserAccount).not.toHaveBeenCalled();
  });

  it("rejects a weak new password without touching the database", async () => {
    getCurrentUser.mockResolvedValue(baseUser);
    getUserAccountById.mockResolvedValue({ id: "user-1", passwordHash: "scrypt$salt$key" });
    verifyPassword.mockReturnValue({ valid: true, needsRehash: false, legacy: false });
    getPasswordValidationError.mockReturnValue("كلمة السر ضعيفة");
    const response = await POST(request({ currentPassword: "correct", newPassword: "weak" }));
    expect(response.status).toBe(400);
    expect(updateUserAccount).not.toHaveBeenCalled();
  });

  it("updates the password hash, bumps the session version, re-issues the cookie, and logs it", async () => {
    getCurrentUser.mockResolvedValue(baseUser);
    getUserAccountById.mockResolvedValue({ id: "user-1", passwordHash: "scrypt$salt$key" });
    verifyPassword.mockReturnValue({ valid: true, needsRehash: false, legacy: false });
    getPasswordValidationError.mockReturnValue(null);
    updateUserAccount.mockResolvedValue({ id: "user-1", sessionVersion: 4 });

    const response = await POST(request({ currentPassword: "correct", newPassword: "NewPassword1" }));

    expect(response.status).toBe(200);
    expect(updateUserAccount).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "hashed:NewPassword1", sessionVersion: { increment: 1 } }
    });
    expect(createSessionToken).toHaveBeenCalledWith("user-1", 60 * 60 * 24, 4);
    expect(logAdminAction).toHaveBeenCalledWith("tenant-1", "Acme", expect.stringContaining("Owner"), "معلومة", "الأمان");
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain("audiencew_session=signed-token");
  });

  it("does not log the change for a platform admin", async () => {
    getCurrentUser.mockResolvedValue({ ...baseUser, isPlatformAdmin: 1 });
    getUserAccountById.mockResolvedValue({ id: "user-1", passwordHash: "scrypt$salt$key" });
    verifyPassword.mockReturnValue({ valid: true, needsRehash: false, legacy: false });
    getPasswordValidationError.mockReturnValue(null);
    updateUserAccount.mockResolvedValue({ id: "user-1", sessionVersion: 1 });

    const response = await POST(request({ currentPassword: "correct", newPassword: "NewPassword1" }));

    expect(response.status).toBe(200);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
