import { describe, expect, it } from "vitest";
import type { UsageRow } from "../app/linkly-admin007/types";
import { applyClientFilter, buildListQuery, formatTicketTime } from "../app/linkly-admin007/support/support-data";
import { costShare, filterUsage, sortUsage, usageTotals } from "../app/linkly-admin007/usage/usage-data";
import { availableActions, normalizeStatus, totalCount } from "../app/linkly-admin007/development/development-data";

describe("support list query", () => {
  it("maps filters to API params and trims the search", () => {
    expect(buildListQuery("all", "", "a1")).toBe("");
    expect(buildListQuery("unassigned", "", "a1")).toBe("assignedAgentId=unassigned");
    expect(buildListQuery("assigned_to_me", "", "a1")).toBe("assignedAgentId=a1");
    expect(buildListQuery("in_progress", "  فاتورة ", "a1")).toBe("status=in_progress&search=%D9%81%D8%A7%D8%AA%D9%88%D8%B1%D8%A9");
    expect(buildListQuery("waiting", "", "a1")).toBe("");
    expect(buildListQuery("urgent", "", "a1")).toBe("");
  });

  it("filters waiting and urgent tickets client-side; urgent excludes finished ones", () => {
    const tickets = [
      { id: 1, status: "waiting_customer", priority: "normal" },
      { id: 2, status: "waiting_support", priority: "urgent" },
      { id: 3, status: "open", priority: "urgent" },
      { id: 4, status: "resolved", priority: "urgent" },
      { id: 5, status: "open", priority: "low" }
    ];
    expect(applyClientFilter("waiting", tickets).map((t) => t.id)).toEqual([1, 2]);
    expect(applyClientFilter("urgent", tickets).map((t) => t.id)).toEqual([2, 3]);
    expect(applyClientFilter("all", tickets)).toHaveLength(5);
  });

  it("returns an empty string for an unparsable date", () => {
    expect(formatTicketTime("")).toBe("");
    expect(formatTicketTime("not a date")).toBe("");
  });
});

function row(overrides: Partial<UsageRow>): UsageRow {
  return {
    id: "s", tenantId: "t", companyName: "شركة", ownerName: "م", ownerEmail: "o@x.sa", plan: "ب", status: "نشط", employeeLimit: 3, amount: 0, billingCycle: "شهري",
    renewalAt: "", createdAt: "", updatedAt: "", employeeCount: 1, conversationCount: 0, campaignBalance: 0, messagesLast30d: 0, aiEventsLast30d: 0, aiCostLast30dSar: 0, ...overrides
  };
}

describe("usage data", () => {
  const rows = [
    row({ tenantId: "a", companyName: "أ", ownerEmail: "a@x.sa", messagesLast30d: 100, aiEventsLast30d: 10, aiCostLast30dSar: 5, conversationCount: 3 }),
    row({ tenantId: "b", companyName: "ب", ownerEmail: "b@x.sa", messagesLast30d: 500, aiEventsLast30d: 0, aiCostLast30dSar: 0, conversationCount: 9 }),
    row({ tenantId: "c", companyName: "ج", ownerEmail: "c@x.sa", messagesLast30d: 50, aiEventsLast30d: 30, aiCostLast30dSar: 15.555, conversationCount: 1 })
  ];

  it("totals messages, AI requests, cost and cost per request", () => {
    expect(usageTotals(rows)).toEqual({ messages: 650, aiEvents: 40, aiCost: 20.56, clients: 3, activeAiClients: 2, costPerRequest: 0.51 });
    expect(usageTotals([]).costPerRequest).toBe(0);
  });

  it("filters by company or email and sorts without mutating", () => {
    expect(filterUsage(rows, "B@X").map((r) => r.tenantId)).toEqual(["b"]);
    expect(sortUsage(rows, "aiCost").map((r) => r.tenantId)).toEqual(["c", "a", "b"]);
    expect(sortUsage(rows, "messages").map((r) => r.tenantId)).toEqual(["b", "a", "c"]);
    expect(sortUsage(rows, "aiEvents").map((r) => r.tenantId)).toEqual(["c", "a", "b"]);
    expect(sortUsage(rows, "conversations").map((r) => r.tenantId)).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.tenantId)).toEqual(["a", "b", "c"]);
  });

  it("scales cost bars against the most expensive client", () => {
    expect(costShare({ aiCostLast30dSar: 5 }, 10)).toBe(50);
    expect(costShare({ aiCostLast30dSar: 5 }, 0)).toBe(0);
  });
});

describe("development requests", () => {
  it("offers the right next actions per status", () => {
    expect(availableActions("pending")).toEqual(["accept", "reject"]);
    expect(availableActions("in_progress")).toEqual(["resolve"]);
    expect(availableActions("resolved")).toEqual([]);
    expect(availableActions("rejected")).toEqual([]);
    expect(availableActions("weird")).toEqual(["accept", "reject"]);
  });

  it("normalizes unknown statuses to pending and sums counts", () => {
    expect(normalizeStatus("xyz")).toBe("pending");
    expect(normalizeStatus("resolved")).toBe("resolved");
    expect(totalCount({ pending: 2, in_progress: 1, resolved: 4, rejected: 3, other: 99 })).toBe(10);
  });
});
