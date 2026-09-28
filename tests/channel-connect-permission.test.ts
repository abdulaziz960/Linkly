import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const user = { id: "user-channel-connect", name: "Support Employee", email: "support@channel-connect.example", role: "موظف دعم", tenantId: "tenant-channel-connect" };

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => user)
}));

const userHasViewPermission = vi.fn(async () => false);
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission }));

vi.mock("../lib/database", () => ({
  getIntegrationSettings: vi.fn(async () => ({ id: "settings-1", appId: "", configId: "", businessName: "" }))
}));

// Out of scope for this file (it only tests employee-permission gating) -
// always allow, so the plan/channel-restriction check added separately
// never interferes here.
vi.mock("../lib/plan-channel-access", () => ({
  isChannelAllowedForTenant: vi.fn(async () => true)
}));

afterEach(() => {
  userHasViewPermission.mockReset();
  userHasViewPermission.mockResolvedValue(false);
});

function externalHost(location: string | null) {
  if (!location) return "";
  try {
    return new URL(location).host;
  } catch {
    return "";
  }
}

describe("channel connect/callback routes require settings permission", () => {
  it("meta/connect closes with a forbidden message instead of redirecting to Facebook", async () => {
    const { GET } = await import("../app/api/meta/connect/route");
    const response = await GET(new NextRequest("http://localhost/api/meta/connect?channel=whatsapp"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("لا تملك صلاحية");
    expect(userHasViewPermission).toHaveBeenCalledWith(user, "settings");
  });

  it("meta/connect proceeds to Facebook once settings permission is granted", async () => {
    userHasViewPermission.mockResolvedValue(true);
    const { GET } = await import("../app/api/meta/connect/route");
    const response = await GET(new NextRequest("http://localhost/api/meta/connect?channel=whatsapp"));
    expect(response.status).toBe(307);
    expect(externalHost(response.headers.get("location"))).toBe("www.facebook.com");
  });

  it("meta/whatsapp-signup-state returns 403 without minting a state/cookie", async () => {
    const { GET } = await import("../app/api/meta/whatsapp-signup-state/route");
    const response = await GET(new NextRequest("http://localhost/api/meta/whatsapp-signup-state"));
    expect(response.status).toBe(403);
    expect(response.cookies.get("audiencew_meta_state")).toBeUndefined();
  });

  it("meta/callback rejects a code exchange attempt with 403 (JSON)", async () => {
    const { createOAuthState } = await import("../lib/oauth-state");
    const oauthState = createOAuthState("meta", { channel: "whatsapp" });
    const { GET } = await import("../app/api/meta/callback/route");
    const request = new NextRequest(`http://localhost/api/meta/callback?channel=whatsapp&code=abc&state=${encodeURIComponent(oauthState.state)}`, {
      headers: { Accept: "application/json", Cookie: `audiencew_meta_state=${oauthState.nonce}` }
    });
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("x/connect redirects back to the dashboard instead of x.com", async () => {
    const { GET } = await import("../app/api/x/connect/route");
    const response = await GET(new NextRequest("http://localhost/api/x/connect"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(externalHost(location)).not.toBe("x.com");
    expect(location).toContain("x=forbidden");
  });

  it("tiktok/connect now requires a session and settings permission (previously required neither)", async () => {
    const { GET } = await import("../app/api/tiktok/connect/route");
    const response = await GET(new NextRequest("http://localhost/api/tiktok/connect"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(externalHost(location)).not.toBe("www.tiktok.com");
    expect(location).toContain("tiktok=forbidden");
  });

  it("linkedin/connect, youtube/connect, google/connect, snapchat/connect all block without settings permission", async () => {
    const cases: Array<[string, string]> = [
      ["../app/api/linkedin/connect/route", "http://localhost/api/linkedin/connect"],
      ["../app/api/youtube/connect/route", "http://localhost/api/youtube/connect"],
      ["../app/api/google/connect/route", "http://localhost/api/google/connect"],
      ["../app/api/snapchat/connect/route", "http://localhost/api/snapchat/connect"]
    ];
    for (const [modulePath, url] of cases) {
      const { GET } = await import(modulePath);
      const response = await GET(new NextRequest(url));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("forbidden");
    }
  });

  it("email gmail oauth connect blocks without settings permission", async () => {
    const { GET } = await import("../app/api/email/oauth/[provider]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/email/oauth/gmail"),
      { params: Promise.resolve({ provider: "gmail" }) }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("gmail=forbidden");
  });
});
