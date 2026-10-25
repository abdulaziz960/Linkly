import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWabaVerification, mapVerificationStatus, securityCenterUrl } from "../lib/business-verification";

describe("business verification", () => {
  it("maps Meta statuses", () => {
    expect(mapVerificationStatus("verified")).toBe("verified");
    expect(mapVerificationStatus("pending")).toBe("pending");
    expect(mapVerificationStatus("rejected")).toBe("rejected");
    expect(mapVerificationStatus("not_verified")).toBe("not_verified");
    expect(mapVerificationStatus(undefined)).toBe("unknown");
  });
  it("builds the security center link", () => {
    expect(securityCenterUrl("123")).toContain("business_id=123");
    expect(securityCenterUrl("")).toBe("https://business.facebook.com/settings/security");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads the status from the WhatsApp account itself, with the business that owns it", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      urls.push(`${url.pathname}?${url.searchParams.get("fields")}`);
      return new Response(JSON.stringify({ business_verification_status: "not_verified", owner_business_info: { id: "998877", name: "x" } }), { status: 200 });
    }));
    const result = await fetchWabaVerification("waba-1", "tok");
    expect(result).toEqual({ ok: true, state: "not_verified", raw: "not_verified", businessId: "998877" });
    expect(urls).toEqual(["/v22.0/waba-1?business_verification_status,owner_business_info"]);
    expect(mapVerificationStatus("expired")).toBe("not_verified");
  });

  it("reports why the status could not be read instead of staying silent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "(#200) Requires business_management permission" } }), { status: 403 })));
    expect(await fetchWabaVerification("waba-1", "tok")).toEqual({ ok: false, error: "(#200) Requires business_management permission" });
  });
});
