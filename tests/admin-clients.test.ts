import { describe, expect, it } from "vitest";
import type { SubscriptionRow } from "../app/linkly-admin007/types";
import { clientCounts, filterClients, invoiceBreakdown, sortClients } from "../app/linkly-admin007/clients/clients-data";

const day = 86_400_000;
const date = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

function client(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "s", tenantId: "t", companyName: "شركة", ownerName: "مالك", ownerEmail: "owner@example.com", plan: "باقة", status: "نشط",
    employeeLimit: 3, amount: 100, billingCycle: "شهري", renewalAt: date(90), createdAt: "", updatedAt: "",
    employeeCount: 2, conversationCount: 0, campaignBalance: 0, ...overrides
  };
}

const rows = [
  client({ tenantId: "a", companyName: "الأمل", ownerEmail: "amal@x.sa", status: "نشط", amount: 300, renewalAt: date(5) }),
  client({ tenantId: "b", companyName: "بيان", ownerEmail: "bayan@x.sa", status: "تجربة", amount: 50, renewalAt: date(20) }),
  client({ tenantId: "c", companyName: "جود", ownerEmail: "joud@x.sa", status: "متوقف", amount: 500, renewalAt: "" }),
  client({ tenantId: "d", companyName: "دانة", ownerEmail: "dana@x.sa", status: "نشط", amount: 100, renewalAt: date(-3) })
];

describe("invoiceBreakdown", () => {
  it("bills users above the plan limit on top of the subscription", () => {
    expect(invoiceBreakdown(client({ amount: 200, employeeCount: 5, employeeLimit: 3 }))).toEqual({ extraUsers: 2, extraAmount: 130, total: 330 });
    expect(invoiceBreakdown(client({ amount: 200, employeeCount: 2, employeeLimit: 3 }))).toEqual({ extraUsers: 0, extraAmount: 0, total: 200 });
  });
});

describe("filterClients", () => {
  it("filters by status and by name/owner/email, case-insensitively", () => {
    expect(filterClients(rows, { query: "", status: "نشط", followUpOnly: false }).map((c) => c.tenantId)).toEqual(["a", "d"]);
    expect(filterClients(rows, { query: "JOUD", status: "الكل", followUpOnly: false }).map((c) => c.tenantId)).toEqual(["c"]);
    expect(filterClients(rows, { query: "  بيان ", status: "الكل", followUpOnly: false }).map((c) => c.tenantId)).toEqual(["b"]);
  });

  it("follow-up keeps only active clients with a soon or overdue renewal", () => {
    expect(filterClients(rows, { query: "", status: "الكل", followUpOnly: true }).map((c) => c.tenantId)).toEqual(["a", "d"]);
  });
});

describe("sortClients", () => {
  it("sorts by name, nearest renewal (no date last) and highest invoice without mutating the input", () => {
    const before = rows.map((c) => c.tenantId);
    expect(sortClients(rows, "name").map((c) => c.tenantId)).toEqual(["a", "b", "c", "d"]);
    expect(sortClients(rows, "renewal").map((c) => c.tenantId)).toEqual(["d", "a", "b", "c"]);
    expect(sortClients(rows, "revenue").map((c) => c.tenantId)).toEqual(["c", "a", "d", "b"]);
    expect(sortClients(rows, "recent").map((c) => c.tenantId)).toEqual(before);
    expect(rows.map((c) => c.tenantId)).toEqual(before);
  });
});

describe("clientCounts", () => {
  it("counts each status and the clients needing follow-up", () => {
    expect(clientCounts(rows)).toEqual({ total: 4, active: 2, trial: 1, paused: 1, followUp: 2 });
  });
});
