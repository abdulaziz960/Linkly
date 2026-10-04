import type { UsageRow } from "../types";

export type UsageSort = "aiCost" | "messages" | "aiEvents" | "conversations";

export const SORT_OPTIONS: Array<{ value: UsageSort; label: string }> = [
  { value: "aiCost", label: "الأعلى تكلفة" },
  { value: "messages", label: "الأكثر رسائل" },
  { value: "aiEvents", label: "الأكثر استخدام AI" },
  { value: "conversations", label: "الأكثر محادثات" }
];

const round2 = (value: number) => Math.round(value * 100) / 100;

export function usageTotals(rows: UsageRow[]) {
  const messages = rows.reduce((sum, row) => sum + row.messagesLast30d, 0);
  const aiEvents = rows.reduce((sum, row) => sum + row.aiEventsLast30d, 0);
  const aiCost = round2(rows.reduce((sum, row) => sum + row.aiCostLast30dSar, 0));
  return {
    messages,
    aiEvents,
    aiCost,
    clients: rows.length,
    activeAiClients: rows.filter((row) => row.aiEventsLast30d > 0).length,
    costPerRequest: aiEvents > 0 ? round2(aiCost / aiEvents) : 0
  };
}

export function filterUsage(rows: UsageRow[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.companyName.toLowerCase().includes(needle) || row.ownerEmail.toLowerCase().includes(needle));
}

export function sortUsage(rows: UsageRow[], sort: UsageSort) {
  const sorted = [...rows];
  if (sort === "messages") sorted.sort((a, b) => b.messagesLast30d - a.messagesLast30d);
  else if (sort === "aiEvents") sorted.sort((a, b) => b.aiEventsLast30d - a.aiEventsLast30d);
  else if (sort === "conversations") sorted.sort((a, b) => b.conversationCount - a.conversationCount);
  else sorted.sort((a, b) => b.aiCostLast30dSar - a.aiCostLast30dSar);
  return sorted;
}

/** Each client's cost relative to the most expensive one (0-100), for a bar. */
export function costShare(row: Pick<UsageRow, "aiCostLast30dSar">, maxCost: number) {
  if (maxCost <= 0) return 0;
  return Math.min(100, Math.round((row.aiCostLast30dSar / maxCost) * 100));
}
