import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany, getCookie, verifySessionToken } = vi.hoisted(() => ({
  updateMany: vi.fn(),
  getCookie: vi.fn(),
  verifySessionToken: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie }) }));
vi.mock("../lib/prisma", () => ({ prisma: { userAccount: { updateMany } } }));
vi.mock("../lib/auth", () => ({ authCookieName: "audiencew_session", verifySessionToken }));

import { POST } from "../app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    getCookie.mockReset().mockReturnValue({ value: "signed-session" });
    verifySessionToken.mockReset().mockReturnValue({ userId: "user-1", sessionVersion: 3 });
  });

  it("invalidates the signed session on the server and clears the cookie", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", sessionVersion: 3 },
      data: { sessionVersion: { increment: 1 } }
    });
    expect(response.headers.get("set-cookie")).toContain("audiencew_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("clears an already invalid local cookie without changing another account", async () => {
    verifySessionToken.mockReturnValue(null);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not claim success if server-side revocation fails", async () => {
    updateMany.mockRejectedValue(new Error("database unavailable"));
    await expect(POST()).rejects.toThrow("database unavailable");
  });
});
