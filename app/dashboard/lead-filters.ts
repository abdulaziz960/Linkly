import type { Conversation } from "./types";

/**
 * Filters of the leads page. Pure: the same conversations and filters always give the same list,
 * so it is tested without a browser.
 *
 * - date    : by the day the lead arrived (the first message), falling back to the last activity.
 * - channel : where the conversation lives (WhatsApp, Instagram, Snapchat...).
 * - source  : the ad platform that brought the lead (Meta, TikTok, Snapchat), or "direct" for none.
 * - project : the campaign / ad / form name the lead came from.
 */

export type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

export type LeadFilters = {
  search: string;
  datePreset: DatePreset;
  /** yyyy-mm-dd, used when datePreset is "custom". */
  from: string;
  to: string;
  channel: string;
  source: string;
  project: string;
  stage: string;
  assignee: string;
};

export const EMPTY_LEAD_FILTERS: LeadFilters = { search: "", datePreset: "all", from: "", to: "", channel: "all", source: "all", project: "all", stage: "all", assignee: "all" };

export function hasActiveFilters(filters: LeadFilters): boolean {
  return (Object.keys(EMPTY_LEAD_FILTERS) as Array<keyof LeadFilters>).some((key) => filters[key] !== EMPTY_LEAD_FILTERS[key]);
}

/** "meta" | "tiktok" | "snapchat" for a lead that came from an ad, "direct" otherwise. */
export function sourceOf(conversation: Conversation): string {
  return conversation.adPlatform && conversation.adPlatform !== "unknown" ? conversation.adPlatform : conversation.adPlatform === "unknown" ? "ad" : "direct";
}

/** The name of the campaign / ad / form behind the lead ("" when it came from none). */
export function projectOf(conversation: Conversation): string {
  return (conversation.attrUtmCampaign || conversation.adHeadline || "").trim();
}

/** The moment the lead arrived: the first message, else the last activity. */
export function arrivedAt(conversation: Conversation): number {
  const value = conversation.firstMessageAt || conversation.lastActivityAt || conversation.lastMessageAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : NaN;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dateRange(filters: LeadFilters, now: Date): { from: number; to: number } | null {
  const dayMs = 24 * 60 * 60 * 1000;
  if (filters.datePreset === "today") return { from: startOfDay(now), to: Infinity };
  if (filters.datePreset === "7d") return { from: startOfDay(now) - 6 * dayMs, to: Infinity };
  if (filters.datePreset === "30d") return { from: startOfDay(now) - 29 * dayMs, to: Infinity };
  if (filters.datePreset === "custom") {
    const from = filters.from ? Date.parse(`${filters.from}T00:00:00`) : -Infinity;
    const to = filters.to ? Date.parse(`${filters.to}T23:59:59.999`) : Infinity;
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    return { from, to };
  }
  return null;
}

export function applyLeadFilters(conversations: Conversation[], filters: LeadFilters, stageOf: (conversation: Conversation) => string = (c) => c.pipelineStage || "جديد", now = new Date()): Conversation[] {
  const search = filters.search.trim().toLowerCase();
  const range = dateRange(filters, now);
  return conversations.filter((conversation) => {
    if (search && !`${conversation.customer} ${conversation.phone}`.toLowerCase().includes(search)) return false;
    if (range) {
      const time = arrivedAt(conversation);
      if (!Number.isFinite(time) || time < range.from || time > range.to) return false;
    }
    if (filters.channel !== "all" && conversation.channel !== filters.channel) return false;
    if (filters.source !== "all" && sourceOf(conversation) !== filters.source) return false;
    if (filters.project !== "all" && projectOf(conversation) !== filters.project) return false;
    if (filters.stage !== "all" && stageOf(conversation) !== filters.stage) return false;
    if (filters.assignee !== "all" && conversation.assignee !== filters.assignee) return false;
    return true;
  });
}

export type FilterOptions = {
  channels: Array<{ value: string; count: number }>;
  sources: Array<{ value: string; count: number }>;
  projects: Array<{ value: string; count: number }>;
  assignees: string[];
};

function countBy(values: string[]): Array<{ value: string; count: number }> {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The choices each filter offers, with how many leads each has (counted on the whole list, so the numbers do not jump). */
export function buildFilterOptions(conversations: Conversation[]): FilterOptions {
  return {
    channels: countBy(conversations.map((conversation) => conversation.channel)),
    sources: countBy(conversations.map(sourceOf)),
    projects: countBy(conversations.map(projectOf).filter(Boolean)),
    assignees: [...new Set(conversations.map((conversation) => conversation.assignee).filter(Boolean))].sort()
  };
}
