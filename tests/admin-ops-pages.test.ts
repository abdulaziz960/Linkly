import { describe, expect, it } from "vitest";
import { inBucket, isFollowUp, parseStoredFollowUps } from "../app/linkly-admin007/alerts/alerts-data";
import { filterTeam, teamExtremes, validateInvite } from "../app/linkly-admin007/team/team-data";
import { actionLabel, actionTone, filterActions, paginate, parseDetails } from "../app/linkly-admin007/admin-actions/actions-data";
import { buildFilterQuery, EMPTY_LOG_FILTERS, enrich, filterLogs, groupLogs, levelCounts, parseInitialFilters, prepareLogs, relativeTime } from "../app/linkly-admin007/logs/logs-data";
import type { RenewalAlert } from "../app/linkly-admin007/utils";

const alertAt = (daysRemaining: number) => ({ daysRemaining }) as RenewalAlert;

describe("renewal alerts", () => {
  it("buckets by days remaining without overlap", () => {
    expect(inBucket(alertAt(-2), "overdue")).toBe(true);
    expect(inBucket(alertAt(0), "1")).toBe(true);
    expect(inBucket(alertAt(1), "1")).toBe(true);
    expect(inBucket(alertAt(2), "3")).toBe(true);
    expect(inBucket(alertAt(4), "7")).toBe(true);
    expect(inBucket(alertAt(8), "14")).toBe(true);
    expect(inBucket(alertAt(15), "30")).toBe(true);
    expect(inBucket(alertAt(31), "30")).toBe(false);
    expect(inBucket(alertAt(5), "all")).toBe(true);
  });

  it("parses stored follow-ups defensively", () => {
    expect(parseStoredFollowUps(null)).toEqual({});
    expect(parseStoredFollowUps("{bad")).toEqual({});
    expect(parseStoredFollowUps('{"a":"closed","b":"nope"}')).toEqual({ a: "closed" });
    expect(isFollowUp("new")).toBe(true);
    expect(isFollowUp("x")).toBe(false);
  });
});

describe("team", () => {
  const team = [
    { id: "1", name: "سعد", email: "saad@x.com", createdAt: "2026-01-01" },
    { id: "2", name: "منى", email: "mona@x.com", createdAt: "2026-03-01" }
  ];
  it("filters and finds extremes", () => {
    expect(filterTeam(team, "MONA")).toHaveLength(1);
    expect(filterTeam(team, " ")).toHaveLength(2);
    expect(teamExtremes(team).oldest?.id).toBe("1");
    expect(teamExtremes(team).newest?.id).toBe("2");
    expect(teamExtremes(team.slice(0, 1)).oldest).toBeNull();
  });
  it("validates invites", () => {
    expect(validateInvite("", "a@b.co", team)).toMatch(/اسم/);
    expect(validateInvite("x", "bad", team)).toMatch(/بريد/);
    expect(validateInvite("x", "SAAD@x.com", team)).toMatch(/مضاف/);
    expect(validateInvite("x", "new@x.com", team)).toBeNull();
  });
});

describe("admin actions", () => {
  const row = (action: string, adminEmail = "a@x.com") => ({ id: action, adminEmail, adminName: "", action, targetType: "plan", targetId: "p1", details: "", createdAt: "2026-01-01T00:00:00Z" });
  it("labels and tones", () => {
    expect(actionLabel("create-plan")).toBe("إنشاء باقة");
    expect(actionLabel("unknown-key")).toBe("unknown-key");
    expect(actionTone("delete-faq")).toBe("danger");
    expect(actionTone("create-plan")).toBe("success");
    expect(actionTone("update-plan")).toBe("info");
  });
  it("filters, parses and paginates", () => {
    const rows = [row("create-plan"), row("delete-faq", "b@x.com")];
    expect(filterActions(rows, { admin: "b@x.com", action: "all", query: "" })).toHaveLength(1);
    expect(filterActions(rows, { admin: "all", action: "all", query: "إنشاء باقة" })).toHaveLength(1);
    expect(parseDetails("")).toEqual([]);
    expect(parseDetails('{"a":1,"b":"x"}')).toEqual([["a", "1"], ["b", "x"]]);
    expect(parseDetails("plain")).toEqual([["التفاصيل", "plain"]]);
    expect(paginate([1, 2, 3], 9, 2)).toEqual({ rows: [3], page: 2, pageCount: 2 });
  });
});

describe("logs", () => {
  const base = { clientId: "c1", clientName: "عميل", source: "النظام", level: "معلومة" as const };
  const now = Date.parse("2026-06-10T12:00:00Z");
  const mk = (id: string, message: string, minsAgo: number, extra: Record<string, unknown> = {}) =>
    enrich({ ...base, id, message, at: new Date(now - minsAgo * 60000).toISOString(), ...extra } as never);

  it("drops error logs and counts levels", () => {
    const logs = prepareLogs([
      { ...base, id: "1", message: "a", at: "" },
      { ...base, id: "2", message: "b", at: "", level: "خطأ" },
      { ...base, id: "3", message: "c", at: "", level: "تنبيه" }
    ] as never);
    expect(logs).toHaveLength(2);
    expect(levelCounts(logs)).toEqual({ الكل: 2, معلومة: 1, تنبيه: 1 });
  });

  it("filters by text and groups consecutive CRM events", () => {
    const logs = [mk("1", "عميل محتمل جديد", 5, { source: "crm" }), mk("2", "عميل محتمل تحديث", 10, { source: "crm" }), mk("3", "دفع فاتورة", 20)];
    const sorted = filterLogs(logs, EMPTY_LOG_FILTERS, now);
    expect(sorted.map((l) => l.id)).toEqual(["1", "2", "3"]);
    const groups = groupLogs(sorted);
    expect(groups).toHaveLength(2);
    expect(groups[0].isGrouped).toBe(true);
    expect(filterLogs(logs, { ...EMPTY_LOG_FILTERS, query: "فاتورة" }, now)).toHaveLength(1);
    expect(filterLogs(logs, { ...EMPTY_LOG_FILTERS, dateRange: "today" }, now).length).toBeGreaterThan(0);
  });

  it("round-trips filters through the query string", () => {
    const filters = { ...EMPTY_LOG_FILTERS, client: "c1", level: "تنبيه" as const, query: "x" };
    const params = Object.fromEntries(new URLSearchParams(buildFilterQuery(filters)));
    expect(parseInitialFilters(params)).toEqual(filters);
  });

  it("formats relative time", () => {
    const f = (n: number) => String(n);
    expect(relativeTime(0, now, f)).toBe("وقت غير محدد");
    expect(relativeTime(now - 30000, now, f)).toBe("الآن");
    expect(relativeTime(now - 5 * 60000, now, f)).toBe("منذ 5 دقيقة");
    expect(relativeTime(now - 3 * 3600000, now, f)).toBe("منذ 3 ساعة");
    expect(relativeTime(now - 2 * 86400000, now, f)).toBe("منذ 2 يوم");
  });
});

import { summarizeAiUsage } from "../lib/ai-usage-summary";
describe("ai usage summary", () => {
  it("aggregates success, source, cost", () => {
    const e = (userId: string, operation: string, status: string, estimatedCost: number | null) => ({ userId, operation, status, inputTokens: null, outputTokens: null, estimatedCost });
    const s = summarizeAiUsage([e("bot-ai-reply", "reply", "succeeded", 0.01), e("u1", "reply", "failed", null), e("u1", "summarize", "pending", 0.02), e("bot-ai-reply", "reply", "handoff", 0.01)]);
    expect(s).toMatchObject({ total: 4, succeeded: 1, failed: 1, handoff: 1, successRate: 67, autoReply: 2, employee: 2, costUnknown: 1 });
    expect(s.costUsd).toBeCloseTo(0.04);
    expect(s.byOperation[0]).toEqual({ operation: "reply", count: 3 });
    expect(summarizeAiUsage([]).successRate).toBeNull();
  });
});

import { matchTagLabel } from "../lib/ai-classify";
describe("ai classify", () => {
  it("only returns existing tags", () => {
    expect(matchTagLabel(' "شكوى". ', ["شكوى", "استفسار"])).toBe("شكوى");
    expect(matchTagLabel("NONE", ["شكوى"])).toBeNull();
    expect(matchTagLabel("اختراع", ["شكوى"])).toBeNull();
    expect(matchTagLabel(null, ["شكوى"])).toBeNull();
  });
});

import { formatRenewalDate } from "../app/linkly-admin007/clients/clients-data";
describe("renewal date display", () => {
  it("shows only the date for trial timestamps", () => {
    expect(formatRenewalDate("")).toBe("غير محدد");
    expect(formatRenewalDate("2026-10-08")).toBe("2026-10-08");
    expect(formatRenewalDate("2026-10-08T13:07:04.891Z")).not.toContain("T13");
    expect(formatRenewalDate("2026-10-08T13:07:04.891Z")).toContain("2026");
  });
});
