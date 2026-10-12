import { describe, expect, it } from "vitest";
import { EMPTY_LEAD_FILTERS, applyLeadFilters, buildFilterOptions, hasActiveFilters, projectOf, sourceOf, type LeadFilters } from "../app/dashboard/lead-filters";
import type { Conversation } from "../app/dashboard/types";

const NOW = new Date("2026-10-14T12:00:00");

function lead(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id, customerId: `c-${id}`, channel: "whatsapp", customer: `عميل ${id}`, phone: `96650000${id.padStart(4, "0")}`, initial: "ع",
    lastMessage: "", status: "unassigned", assignee: "بدون موظف", tags: [], messages: [], pipelineStage: "جديد",
    firstMessageAt: "2026-10-14T09:00:00", ...overrides
  } as Conversation;
}

const leads: Conversation[] = [
  lead("1", { firstMessageAt: "2026-10-14T08:00:00", adPlatform: "meta", adHeadline: "فلل الشمال", assignee: "سارة" }),
  lead("2", { firstMessageAt: "2026-10-10T08:00:00", channel: "snapchat", adPlatform: "snapchat", adHeadline: "نموذج الصيف" }),
  lead("3", { firstMessageAt: "2026-09-01T08:00:00", attrUtmCampaign: "فلل الشمال", assignee: "سارة", pipelineStage: "مؤهل" }),
  lead("4", { firstMessageAt: "2026-10-14T10:00:00", channel: "instagram" }),
  lead("5", { firstMessageAt: undefined, lastActivityAt: "2026-10-13T10:00:00", adPlatform: "tiktok" })
];

const filtered = (patch: Partial<LeadFilters>) => applyLeadFilters(leads, { ...EMPTY_LEAD_FILTERS, ...patch }, undefined, NOW).map((item) => item.id);

describe("lead filters", () => {
  it("shows everything with no filter, and knows when one is active", () => {
    expect(filtered({})).toEqual(["1", "2", "3", "4", "5"]);
    expect(hasActiveFilters(EMPTY_LEAD_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_LEAD_FILTERS, channel: "snapchat" })).toBe(true);
  });

  it("filters by arrival date: presets and a custom range", () => {
    expect(filtered({ datePreset: "today" })).toEqual(["1", "4"]);
    expect(filtered({ datePreset: "7d" })).toEqual(["1", "2", "4", "5"]);
    expect(filtered({ datePreset: "30d" })).toEqual(["1", "2", "4", "5"]);
    expect(filtered({ datePreset: "custom", from: "2026-09-01", to: "2026-09-30" })).toEqual(["3"]);
    expect(filtered({ datePreset: "custom", from: "2026-10-11" })).toEqual(["1", "4", "5"]);
  });

  it("filters by platform (channel) and by ad source", () => {
    expect(filtered({ channel: "snapchat" })).toEqual(["2"]);
    expect(filtered({ channel: "instagram" })).toEqual(["4"]);
    expect(filtered({ source: "meta" })).toEqual(["1"]);
    expect(filtered({ source: "tiktok" })).toEqual(["5"]);
    expect(filtered({ source: "direct" })).toEqual(["3", "4"]);
  });

  it("filters by project (campaign or ad name), stage, employee and search, and combines them", () => {
    expect(filtered({ project: "فلل الشمال" })).toEqual(["1", "3"]);
    expect(filtered({ stage: "مؤهل" })).toEqual(["3"]);
    expect(filtered({ assignee: "سارة" })).toEqual(["1", "3"]);
    expect(filtered({ search: "عميل 4" })).toEqual(["4"]);
    expect(filtered({ search: "0002" })).toEqual(["2"]);
    expect(filtered({ project: "فلل الشمال", assignee: "سارة", datePreset: "today" })).toEqual(["1"]);
  });

  it("uses the stage the page shows (a card just dragged) rather than the stored one", () => {
    const result = applyLeadFilters(leads, { ...EMPTY_LEAD_FILTERS, stage: "فاز" }, (item) => (item.id === "2" ? "فاز" : "جديد"), NOW);
    expect(result.map((item) => item.id)).toEqual(["2"]);
  });

  it("derives sources and projects, and counts the options on the whole list", () => {
    expect(sourceOf(leads[0])).toBe("meta");
    expect(sourceOf(leads[3])).toBe("direct");
    expect(projectOf(leads[2])).toBe("فلل الشمال");
    const options = buildFilterOptions(leads);
    expect(options.channels).toEqual([{ value: "whatsapp", count: 3 }, { value: "instagram", count: 1 }, { value: "snapchat", count: 1 }]);
    expect(options.projects).toEqual([{ value: "فلل الشمال", count: 2 }, { value: "نموذج الصيف", count: 1 }]);
    expect(options.assignees).toEqual(["بدون موظف", "سارة"]);
  });
});
