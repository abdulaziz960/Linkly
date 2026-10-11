import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getCurrentUser, getIntegrationSettings, consumeRateLimit } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getIntegrationSettings: vi.fn(),
  consumeRateLimit: vi.fn()
}));

vi.mock("../lib/auth", () => ({ getCurrentUser }));
vi.mock("../lib/database", () => ({ getIntegrationSettings }));
vi.mock("../lib/rate-limit", () => ({ consumeRateLimit }));

function request(pin: unknown) {
  return new NextRequest("http://localhost/api/meta/whatsapp-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });
}

describe("WhatsApp number registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCurrentUser.mockResolvedValue({ tenantId: "tenant-1", role: "مالك الحساب" });
    getIntegrationSettings.mockResolvedValue({ phoneNumberId: "12345", wabaId: "waba-1", accessToken: "token" });
    consumeRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects an invalid PIN before calling Meta", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../app/api/meta/whatsapp-register/route");
    const response = await POST(request("00000"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reports Meta's registration cooldown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 133015, message: "Please wait a few minutes" } }), { status: 400 })));
    const { POST } = await import("../app/api/meta/whatsapp-register/route");
    const response = await POST(request("123456"));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("الانتظار");
    vi.unstubAllGlobals();
  });

  it("registers only with the submitted PIN and does not return it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../app/api/meta/whatsapp-register/route");
    const response = await POST(request("123456"));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://graph.facebook.com/v22.0/12345/register", expect.objectContaining({
      body: JSON.stringify({ messaging_product: "whatsapp", pin: "123456" })
    }));
    expect(JSON.stringify(await response.json())).not.toContain("123456");
    vi.unstubAllGlobals();
  });
});
