import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTenantWithSubscription = vi.fn();
const sendTrialSignupNotification = vi.fn();
vi.mock("../lib/email", () => ({ sendTrialSignupNotification: (...args: unknown[]) => sendTrialSignupNotification(...args) }));

vi.mock("../lib/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIdentifier: () => "test-identifier"
}));

vi.mock("../lib/plans", () => ({
  getActivePlans: vi.fn(async () => [{ id: "plan-1", name: "باقة البداية", monthlyPrice: 0, employeeLimit: 1 }])
}));

vi.mock("../lib/subscriptions", () => ({
  createTenantWithSubscription: (...args: unknown[]) => createTenantWithSubscription(...args)
}));

const saveTaxProfile = vi.fn();
vi.mock("../lib/tax-profile", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/tax-profile")>()), saveTaxProfile: (...args: unknown[]) => saveTaxProfile(...args) }));

import { POST } from "../app/api/trial/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/trial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

const validBody = {
  companyName: "Acme Co",
  businessType: "real_estate",
  ownerName: "Owner Name",
  ownerEmail: "owner@acme.example",
  phone: "0501234567"
};

describe("POST /api/trial", () => {
  beforeEach(() => {
    createTenantWithSubscription.mockReset();
    saveTaxProfile.mockReset().mockResolvedValue({ ok: true });
    sendTrialSignupNotification.mockReset().mockResolvedValue(true);
    createTenantWithSubscription.mockResolvedValue({ created: true, subscription: { tenantId: "tenant-new" }, inviteDelivery: { sent: true, activationUrl: "", message: "" } });
  });

  it("keeps an optional VAT number from the signup form, and refuses a malformed one", async () => {
    const bad = await POST(request({ ...validBody, termsAccepted: true, vatNumber: "12345" }));
    expect(bad.status).toBe(400);
    expect(createTenantWithSubscription).not.toHaveBeenCalled();

    const ok = await POST(request({ ...validBody, termsAccepted: true, vatNumber: "٣١١٦٤٣٩٦٢٤٠٠٠٠٣" }));
    expect(ok.status).toBe(200);
    expect(saveTaxProfile).toHaveBeenCalledWith("tenant-new", { vatNumber: "311643962400003", address: "" });

    saveTaxProfile.mockClear();
    const none = await POST(request({ ...validBody, termsAccepted: true }));
    expect(none.status).toBe(200);
    expect(saveTaxProfile).not.toHaveBeenCalled();
  });

  it("refuses to create a trial account without accepting the terms", async () => {
    const response = await POST(request({ ...validBody, termsAccepted: false }));
    expect(response.status).toBe(400);
    expect(createTenantWithSubscription).not.toHaveBeenCalled();
  });

  it("refuses a signup without a valid business type", async () => {
    for (const businessType of ["", "spaceships"]) {
      const response = await POST(request({ ...validBody, businessType, termsAccepted: true }));
      expect(response.status).toBe(400);
    }
    expect(createTenantWithSubscription).not.toHaveBeenCalled();
  });

  it("passes the business type on so real-estate and medical signups get the leads page", async () => {
    await POST(request({ ...validBody, businessType: "healthcare", termsAccepted: true }));
    expect(createTenantWithSubscription).toHaveBeenCalledWith(expect.objectContaining({ businessType: "healthcare" }));
  });

  it("refuses when termsAccepted is missing entirely (not just falsy)", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(400);
    expect(createTenantWithSubscription).not.toHaveBeenCalled();
  });

  it("creates the trial account once the terms are accepted", async () => {
    const response = await POST(request({ ...validBody, termsAccepted: true }));
    expect(response.status).toBe(200);
    expect(createTenantWithSubscription).toHaveBeenCalledTimes(1);
    expect(sendTrialSignupNotification).toHaveBeenCalledWith({ tenantId: "tenant-new", companyName: validBody.companyName, ownerName: validBody.ownerName, ownerEmail: validBody.ownerEmail });
  });

  it("does not notify again when resending activation for an existing signup", async () => {
    createTenantWithSubscription.mockResolvedValue({ created: false, subscription: { tenantId: "tenant-old" }, inviteDelivery: { sent: true } });
    expect((await POST(request({ ...validBody, termsAccepted: true }))).status).toBe(200);
    expect(sendTrialSignupNotification).not.toHaveBeenCalled();
  });

  it("preserves successful signup when the notification provider fails", async () => {
    sendTrialSignupNotification.mockRejectedValue(new Error("provider unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await POST(request({ ...validBody, termsAccepted: true }))).status).toBe(200);
    } finally { warning.mockRestore(); }
  });

  it("does not notify on a rejected signup", async () => {
    createTenantWithSubscription.mockRejectedValue(new Error("duplicate"));
    expect((await POST(request({ ...validBody, termsAccepted: true }))).status).toBe(400);
    expect(sendTrialSignupNotification).not.toHaveBeenCalled();
  });

  describe("activationUrl fallback (a production email-provider outage must not strand a new signup)", () => {
    const originalEnv = process.env.NODE_ENV;
    afterEach(() => {
      vi.stubEnv("NODE_ENV", originalEnv ?? "test");
    });

    it("omits activationUrl in production when the invite email actually sent", async () => {
      vi.stubEnv("NODE_ENV", "production");
      createTenantWithSubscription.mockResolvedValue({ created: true, subscription: { tenantId: "tenant-new" }, inviteDelivery: { sent: true, activationUrl: "https://linklysa.io/activate?token=x", message: "" } });

      const body = await (await POST(request({ ...validBody, termsAccepted: true }))).json();
      expect(body.data.activationUrl).toBeUndefined();
    });

    it("returns activationUrl in production when the invite email failed to send", async () => {
      vi.stubEnv("NODE_ENV", "production");
      createTenantWithSubscription.mockResolvedValue({ created: true, subscription: { tenantId: "tenant-new" }, inviteDelivery: { sent: false, activationUrl: "https://linklysa.io/activate?token=x", message: "" } });

      const body = await (await POST(request({ ...validBody, termsAccepted: true }))).json();
      expect(body.data.activationUrl).toBe("https://linklysa.io/activate?token=x");
    });

    it("always returns activationUrl outside production, sent or not", async () => {
      vi.stubEnv("NODE_ENV", "development");
      createTenantWithSubscription.mockResolvedValue({ created: true, subscription: { tenantId: "tenant-new" }, inviteDelivery: { sent: true, activationUrl: "https://linklysa.io/activate?token=x", message: "" } });

      const body = await (await POST(request({ ...validBody, termsAccepted: true }))).json();
      expect(body.data.activationUrl).toBe("https://linklysa.io/activate?token=x");
    });
  });
});
