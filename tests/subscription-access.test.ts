import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { computeSubscriptionAccess, isValidRenewalAt, parseRenewalAt } from "../lib/subscription-access";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("parseRenewalAt / isValidRenewalAt", () => {
  it("reads ISO timestamps and plain dates", () => {
    expect(parseRenewalAt("2026-10-14T00:00:00.000Z")).toBe(Date.parse("2026-10-14T00:00:00.000Z"));
    expect(parseRenewalAt("2026-10-14")).toBe(Date.parse("2026-10-14"));
  });

  it("returns null for empty, blank or unreadable values", () => {
    for (const value of ["", "   ", null, undefined, "tomorrow", "2026-13-45", "غدًا"]) {
      expect(parseRenewalAt(value as string)).toBeNull();
      expect(isValidRenewalAt(value)).toBe(false);
    }
    expect(isValidRenewalAt("2026-10-14")).toBe(true);
  });
});

describe("trial subscriptions", () => {
  it("are open until the end date and locked after it", () => {
    expect(computeSubscriptionAccess({ status: "تجربة", renewalAt: iso(DAY) }, NOW, null).expired).toBe(false);
    expect(computeSubscriptionAccess({ status: "تجربة", renewalAt: iso(-1) }, NOW, null).expired).toBe(true);
    expect(computeSubscriptionAccess({ status: "تجربة", renewalAt: iso(0) }, NOW, null).expired).toBe(true);
  });

  it("are treated as ended when the date is missing or unreadable (they used to last forever)", () => {
    for (const renewalAt of ["", "   ", "not-a-date", "2026-99-99"]) {
      const access = computeSubscriptionAccess({ status: "تجربة", renewalAt }, NOW, null);
      expect(access).toMatchObject({ expired: true, invalidRenewalDate: true });
    }
  });
});

describe("paid subscriptions", () => {
  it("are never locked before the renewal date", () => {
    expect(computeSubscriptionAccess({ status: "نشط", renewalAt: iso(5 * DAY) }, NOW, 7)).toMatchObject({ expired: false, overdue: false });
  });

  it("stay open without a grace period, but show as overdue", () => {
    expect(computeSubscriptionAccess({ status: "نشط", renewalAt: iso(-30 * DAY) }, NOW, null)).toMatchObject({ expired: false, overdue: true });
  });

  it("lock once the grace period is over", () => {
    expect(computeSubscriptionAccess({ status: "نشط", renewalAt: iso(-3 * DAY) }, NOW, 7)).toMatchObject({ expired: false, overdue: true });
    expect(computeSubscriptionAccess({ status: "نشط", renewalAt: iso(-8 * DAY) }, NOW, 7)).toMatchObject({ expired: true, overdue: true });
  });

  it("are not locked out because their date is unreadable, but it is flagged", () => {
    expect(computeSubscriptionAccess({ status: "نشط", renewalAt: "" }, NOW, 7)).toMatchObject({ expired: false, overdue: false, invalidRenewalDate: true });
  });
});

describe("suspended subscriptions", () => {
  it("are always locked", () => {
    expect(computeSubscriptionAccess({ status: "متوقف", renewalAt: iso(30 * DAY) }, NOW, null).expired).toBe(true);
  });
});

describe("admin routes refuse a renewal date that is not a date", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../lib/admin-auth");
    vi.doUnmock("../lib/subscriptions");
    vi.doUnmock("../lib/admin-audit");
    vi.doUnmock("../lib/origin-guard");
  });

  it("PATCH /api/admin/clients/:id answers 400 and does not update", async () => {
    const updateSubscription = vi.fn(async () => ({}));
    vi.doMock("../lib/admin-auth", () => ({ requirePlatformAdmin: vi.fn(async () => ({ id: "admin-1", name: "Admin" })) }));
    vi.doMock("../lib/subscriptions", () => ({ updateSubscription, getSubscriptionForTenant: vi.fn(async () => null) }));
    vi.doMock("../lib/admin-audit", () => ({ changeDetails: () => "", recordAdminAction: vi.fn() }));
    vi.doMock("../lib/origin-guard", () => ({ isTrustedOrigin: () => true }));

    const { PATCH } = await import("../app/api/admin/clients/[id]/route");
    const call = (renewalAt: unknown) => PATCH(
      new NextRequest("http://localhost/api/admin/clients/tenant-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ renewalAt }) }),
      { params: Promise.resolve({ id: "tenant-1" }) }
    );

    expect((await call("")).status).toBe(400);
    expect((await call("soon")).status).toBe(400);
    expect(updateSubscription).not.toHaveBeenCalled();
    expect((await call("2026-11-01")).status).toBe(200);
    expect(updateSubscription).toHaveBeenCalledTimes(1);
  });
});
