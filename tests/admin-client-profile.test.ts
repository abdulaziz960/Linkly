import { describe, expect, it } from "vitest";
import type { SubscriptionRow } from "../app/linkly-admin007/types";
import { billingSummary, newestFirst } from "../app/linkly-admin007/clients/[id]/profile-data";

const client = {
  id: "s", tenantId: "t", companyName: "ش", ownerName: "م", ownerEmail: "o@x.sa", plan: "ب", status: "نشط", employeeLimit: 3, amount: 599,
  billingCycle: "شهري", renewalAt: "", createdAt: "", updatedAt: "", employeeCount: 5, conversationCount: 0, campaignBalance: 0
} as SubscriptionRow;

describe("billingSummary", () => {
  it("counts only completed payments as collected and only pending ones as outstanding", () => {
    const payments = [
      { amount: 599, status: "مكتمل", createdAt: "2026-10-02" },
      { amount: 599, status: "فشل", createdAt: "2026-09-28" },
      { amount: 150, status: "منتهي الصلاحية", createdAt: "2026-09-29" },
      { amount: 150, status: "قيد الانتظار", createdAt: "2026-10-03" }
    ];
    const summary = billingSummary(client, payments);
    expect(summary.collected).toBe(599);
    expect(summary.outstanding).toBe(150);
    expect(summary.paymentCount).toBe(4);
    expect(summary.completedCount).toBe(1);
  });

  it("adds extra-user billing to the monthly invoice", () => {
    expect(billingSummary(client, []).invoice).toEqual({ extraUsers: 2, extraAmount: 130, total: 729 });
  });
});

describe("newestFirst", () => {
  it("sorts by createdAt descending without mutating the input", () => {
    const rows = [{ createdAt: "2026-09-01" }, { createdAt: "2026-10-01" }, { createdAt: "" }];
    expect(newestFirst(rows).map((row) => row.createdAt)).toEqual(["2026-10-01", "2026-09-01", ""]);
    expect(rows[0].createdAt).toBe("2026-09-01");
  });
});
