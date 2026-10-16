import { describe, expect, it } from "vitest";
import { getRenewalNotice } from "../lib/renewal-notice";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const day = 86_400_000;
const sub = (over: Record<string, unknown>) => ({ status: "نشط", renewalAt: new Date(NOW + 10 * day).toISOString(), cancelledAt: "", autoRenewEnabled: 0, autoRenewFailCount: 0, ...over });

describe("renewal notice for a paid workspace", () => {
  it("says nothing while the renewal is far away", () => {
    expect(getRenewalNotice(sub({}), NOW)).toBeNull();
  });
  it("warns in the last three days when there is no auto-renew", () => {
    expect(getRenewalNotice(sub({ renewalAt: new Date(NOW + 2.5 * day).toISOString() }), NOW)).toEqual({ kind: "ending-soon", daysLeft: 3 });
    expect(getRenewalNotice(sub({ renewalAt: new Date(NOW + 0.5 * day).toISOString() }), NOW)).toEqual({ kind: "ending-soon", daysLeft: 1 });
  });
  it("stays quiet near the date when the card is charged automatically", () => {
    expect(getRenewalNotice(sub({ autoRenewEnabled: 1, renewalAt: new Date(NOW + day).toISOString() }), NOW)).toBeNull();
  });
  it("tells about a failed automatic charge even before the date", () => {
    expect(getRenewalNotice(sub({ autoRenewEnabled: 1, autoRenewFailCount: 1 }), NOW)).toEqual({ kind: "charge-failed" });
  });
  it("flags a lapsed renewal, counting the days", () => {
    expect(getRenewalNotice(sub({ renewalAt: new Date(NOW - 2.2 * day).toISOString() }), NOW)).toEqual({ kind: "overdue", daysOverdue: 2 });
  });
  it("ignores trials, cancelled and missing subscriptions", () => {
    expect(getRenewalNotice(sub({ status: "تجربة", renewalAt: new Date(NOW - day).toISOString() }), NOW)).toBeNull();
    expect(getRenewalNotice(sub({ cancelledAt: "2026-10-01", renewalAt: new Date(NOW - day).toISOString() }), NOW)).toBeNull();
    expect(getRenewalNotice(null, NOW)).toBeNull();
  });
});
