import type { AdminLog } from "../../../lib/database";
import { parseTimestamp } from "../utils";

export type LevelFilter = AdminLog["level"] | "الكل";
export type DateRange = "all" | "today" | "7d" | "30d" | "custom";
export type EnrichedLog = AdminLog & { timestamp: number; actor: string; eventType: string; before: string; after: string; ip: string; device: string };
export type LogGroup = { id: string; primary: EnrichedLog; items: EnrichedLog[]; isGrouped: boolean };

export const LEVELS: LevelFilter[] = ["الكل", "معلومة", "تنبيه"];
export const PAGE_SIZE = 15;
export const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: "all", label: "كل الوقت" },
  { value: "today", label: "اليوم" },
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يومًا" },
  { value: "custom", label: "نطاق مخصص" }
];

export type LogFilters = {
  client: string;
  query: string;
  level: LevelFilter;
  dateRange: DateRange;
  from: string;
  to: string;
  eventType: string;
  source: string;
  actor: string;
};

export const EMPTY_LOG_FILTERS: LogFilters = { client: "all", query: "", level: "الكل", dateRange: "all", from: "", to: "", eventType: "all", source: "all", actor: "all" };

export function parseInitialFilters(initial: Record<string, string | undefined>): LogFilters {
  return {
    client: initial.client || "all",
    query: initial.q || "",
    level: LEVELS.includes(initial.level as LevelFilter) ? (initial.level as LevelFilter) : "الكل",
    dateRange: DATE_RANGES.some((range) => range.value === initial.range) ? (initial.range as DateRange) : "all",
    from: initial.from || "",
    to: initial.to || "",
    eventType: initial.event || "all",
    source: initial.source || "all",
    actor: initial.actor || "all"
  };
}

/** Query string that reproduces the active filters (used by "copy filter link"). */
export function buildFilterQuery(filters: LogFilters) {
  const params = new URLSearchParams();
  if (filters.client !== "all") params.set("client", filters.client);
  if (filters.level !== "الكل") params.set("level", filters.level);
  if (filters.eventType !== "all") params.set("event", filters.eventType);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.actor !== "all") params.set("actor", filters.actor);
  if (filters.dateRange !== "all") params.set("range", filters.dateRange);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.query) params.set("q", filters.query);
  return params.toString();
}

function extract(patterns: RegExp[], text: string, fallback = "") {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return fallback;
}

export function enrich(log: AdminLog): EnrichedLog {
  const text = log.message || "";
  const source = log.source || "النظام";
  // The English fallback patterns need \b word boundaries - without them
  // "to"/"by"/etc. match as a bare substring anywhere in the text, which
  // false-positives constantly on the Latin text every log carries (emails,
  // domains, IPs): "motorshussin.com" contains "to", so the naive pattern
  // grabbed everything after it as a bogus "after" value. \b works here
  // because Latin letters are \w in JS regex - it deliberately isn't used
  // on the Arabic patterns above, where \b doesn't apply the same way.
  const actor = extract([/(?:بواسطة|نفّذ بواسطة|المنفذ|المستخدم)[:：]?\s*([^،|]+)/i, /\b(?:by|actor|user)\b[:：]?\s*([^,|]+)/i], text, source.includes("@") ? source : "النظام");
  const before = extract([/(?:من|القيمة السابقة|قبل)[:：]?\s*["']?([^،|→]+)["']?/i, /\b(?:from|before)\b[:：]?\s*["']?([^,|→]+)["']?/i], text);
  const after = extract([/(?:إلى|القيمة الجديدة|بعد)[:：]?\s*["']?([^،|]+)["']?/i, /\b(?:to|after)\b[:：]?\s*["']?([^,|]+)["']?/i], text);
  const ip = extract([/(?:IP|عنوان IP)[:：]?\s*([\da-f:.]+)/i], text);
  const device = extract([/(?:الجهاز|device)[:：]?\s*([^،|]+)/i], text);
  const haystack = `${source} ${text}`.toLowerCase();
  const eventType = /crm|عميل محتمل|lead/.test(haystack)
    ? "CRM"
    : /دفع|فاتورة|اشتراك|payment|billing/.test(haystack)
      ? "الفوترة"
      : /دخول|تسجيل|صلاحية|login|auth/.test(haystack)
        ? "الأمان"
        : /إعداد|ربط|integration|setting/.test(haystack)
          ? "الإعدادات"
          : /حملة|campaign/.test(haystack)
            ? "الحملات"
            : "تشغيل";
  return { ...log, clientName: log.clientName?.trim() || "حدث عام", source, timestamp: parseTimestamp(log.at), actor, eventType, before, after, ip, device };
}

/** Error-level rows are never shown on this page (they have their own alerting). */
export function prepareLogs(logs: AdminLog[]) {
  return logs.filter((log) => log.level !== "خطأ").map(enrich);
}

export function filterLogs(logs: EnrichedLog[], filters: LogFilters, now: number) {
  const needle = filters.query.trim().toLowerCase();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const from =
    filters.dateRange === "today" ? dayStart.getTime()
    : filters.dateRange === "7d" ? now - 7 * 86400000
    : filters.dateRange === "30d" ? now - 30 * 86400000
    : filters.dateRange === "custom" && filters.from ? new Date(`${filters.from}T00:00:00`).getTime()
    : 0;
  const to = filters.dateRange === "custom" && filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : Infinity;
  return logs
    .filter((log) => {
      if (filters.client !== "all" && log.clientId !== filters.client) return false;
      if (filters.level !== "الكل" && log.level !== filters.level) return false;
      if (filters.eventType !== "all" && log.eventType !== filters.eventType) return false;
      if (filters.source !== "all" && log.source !== filters.source) return false;
      if (filters.actor !== "all" && log.actor !== filters.actor) return false;
      if (from && (!log.timestamp || log.timestamp < from)) return false;
      if (log.timestamp > to) return false;
      return !needle || [log.message, log.clientName, log.source, log.actor, log.eventType].some((value) => value.toLowerCase().includes(needle));
    })
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}

/** Consecutive CRM events by the same actor on the same client within 30 minutes collapse into one group. */
export function groupLogs(logs: EnrichedLog[]): LogGroup[] {
  const result: LogGroup[] = [];
  for (const log of logs) {
    const previous = result[result.length - 1];
    const sameSequence =
      previous &&
      log.eventType === "CRM" &&
      previous.primary.eventType === "CRM" &&
      previous.primary.clientId === log.clientId &&
      previous.primary.actor === log.actor &&
      Math.abs(previous.primary.timestamp - log.timestamp) <= 30 * 60000;
    if (sameSequence) {
      previous.items.push(log);
      previous.isGrouped = true;
    } else {
      result.push({ id: log.id, primary: log, items: [log], isGrouped: false });
    }
  }
  return result;
}

export function levelCounts(logs: EnrichedLog[]) {
  return {
    الكل: logs.length,
    معلومة: logs.filter((log) => log.level === "معلومة").length,
    تنبيه: logs.filter((log) => log.level === "تنبيه").length
  } as Record<"الكل" | "معلومة" | "تنبيه", number>;
}

export function relativeTime(timestamp: number, now: number, format: (value: number) => string) {
  if (!timestamp) return "وقت غير محدد";
  const mins = Math.floor(Math.max(0, now - timestamp) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${format(mins)} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${format(hours)} ساعة`;
  return `منذ ${format(Math.floor(hours / 24))} يوم`;
}

export function fullDate(timestamp: number, fallback: string) {
  if (timestamp) return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(timestamp);
  return fallback.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function duplicateCompanyNames(subscriptions: Array<{ companyName: string }>) {
  const counts = new Map<string, number>();
  for (const item of subscriptions) counts.set(item.companyName, (counts.get(item.companyName) || 0) + 1);
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
}
