import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTrialSignupNotification } from "../lib/email";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("trial signup email", () => {
  it("sends escaped Arabic RTL content only to the configured operations address", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-only");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email-test" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendTrialSignupNotification({ tenantId: "tenant-1", companyName: "<script>bad</script>", ownerName: "A & B", ownerEmail: "owner@example.com" })).toBe(true);
    const options = fetchMock.mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.to).toBe("xcoode25@gmail.com");
    expect(body.html).toContain('lang="ar" dir="rtl"');
    expect(body.html).toContain('body dir="rtl"');
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("A &amp; B");
    expect(body.html).not.toContain("token=");
    expect(options.headers["Idempotency-Key"]).toBe("trial-signup/tenant-1");
  });
});
