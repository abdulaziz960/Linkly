import { describe, expect, it } from "vitest";
import { clientsToCsv, countAdvancedFilters, deriveClient, matchesAdvanced, NO_ADVANCED_FILTERS, paginate } from "../app/linkly-admin007/clients/clients-filters";
import type { SubscriptionRow } from "../app/linkly-admin007/types";

const NOW = new Date("2026-10-15T12:00:00").getTime();
const iso = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString();
const day = (offset: number) => iso(offset).slice(0, 10);

function row(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "s", tenantId: "t", companyName: "شركة", ownerName: "مالك", ownerEmail: "o@x.sa", plan: "الباقة العادية", status: "نشط",
    employeeLimit: 4, amount: 349, billingCycle: "شهري", renewalAt: day(20), createdAt: iso(-40), updatedAt: iso(-1),
    employeeCount: 2, conversationCount: 5, campaignBalance: 0, ...overrides
  };
}

const list = [
  row({ id: "a", companyName: "ألفا", renewalAt: day(-2), employeeCount: 4 }),
  row({ id: "b", companyName: "بيتا", renewalAt: day(3), employeeCount: 3, plan: "باقة الأفراد", conversationCount: 0 }),
  row({ id: "c", companyName: "جاما", renewalAt: "", status: "تجربة", employeeCount: 5, createdAt: iso(-3) })
];
const match = (filters: Partial<typeof NO_ADVANCED_FILTERS>) =>
  list.filter((client) => matchesAdvanced(client, deriveClient(client, NOW), { ...NO_ADVANCED_FILTERS, ...filters })).map((client) => client.id);

describe("deriveClient", () => {
  it("computes renewal days, usage and join time", () => {
    const [alpha, , gamma] = list.map((client) => deriveClient(client, NOW));
    expect(alpha.renewalDays).toBe(-2);
    expect(alpha.usersPct).toBe(100);
    expect(gamma.renewalDays).toBeNull();
    expect(gamma.extraUsers).toBe(1);
    expect(gamma.joinedTs).toBeGreaterThan(0);
  });
});

describe("matchesAdvanced", () => {
  it("filters by plan, renewal window and usage band", () => {
    expect(match({ plans: ["باقة الأفراد"] })).toEqual(["b"]);
    expect(match({ renewal: "overdue" })).toEqual(["a"]);
    expect(match({ renewal: "7d" })).toEqual(["b"]);
    expect(match({ renewal: "none" })).toEqual(["c"]);
    expect(match({ usage: "idle" })).toEqual(["b"]);
    expect(match({ usage: "full" })).toEqual(["a", "c"]);
  });

  it("filters by join date and counts active groups", () => {
    expect(match({ joinedFrom: day(-10) })).toEqual(["c"]);
    expect(match({ joinedTo: day(-10) })).toEqual(["a", "b"]);
    expect(countAdvancedFilters({ ...NO_ADVANCED_FILTERS, plans: ["x"], joinedFrom: day(-1), usage: "idle" })).toBe(3);
    expect(countAdvancedFilters(NO_ADVANCED_FILTERS)).toBe(0);
  });

  it("does not count an overdue renewal for a paused account", () => {
    const paused = row({ status: "متوقف", renewalAt: day(-5) });
    expect(matchesAdvanced(paused, deriveClient(paused, NOW), { ...NO_ADVANCED_FILTERS, renewal: "overdue" })).toBe(false);
  });
});

describe("paginate", () => {
  it("clamps the page and slices", () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    expect(paginate(items, 1, 10)).toMatchObject({ page: 1, pageCount: 3, rows: items.slice(0, 10) });
    expect(paginate(items, 9, 10)).toMatchObject({ page: 3, rows: items.slice(20) });
    expect(paginate([], 1, 10)).toMatchObject({ page: 1, pageCount: 1, rows: [] });
  });
});

describe("clientsToCsv", () => {
  it("escapes quotes and neutralises spreadsheet formulas", () => {
    const csv = clientsToCsv([row({ companyName: '=HYPERLINK("x")', ownerName: "اسم, بفاصلة" })]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain('"اسم, بفاصلة"');
  });
});
