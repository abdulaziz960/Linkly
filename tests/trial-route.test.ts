import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  ownerName: "Owner Name",
  ownerEmail: "owner@acme.example",
  phone: "0501234567"
};

describe("POST /api/trial", () => {
  beforeEach(() => {
    createTenantWithSubscription.mockReset();
    sendTrialSignupNotification.mockReset().mockResolvedValue(true);
    createTenantWithSubscription.mockResolvedValue({ created: true, subscription: { tenantId: "tenant-new" }, inviteDelivery: { sent: true, activationUrl: "", message: "" } });
  });

  it("refuses to create a trial account without accepting the terms", async () => {
    const response = await POST(request({ ...validBody, termsAccepted: false }));
    expect(response.status).toBe(400);
    expect(createTenantWithSubscription).not.toHaveBeenCalled();
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
});
