import type { SubscriptionRow } from "../types";
import { EXTRA_USER_PRICE, getRenewalAlert } from "../utils";

export type ClientStatusFilter = "الكل" | "نشط" | "تجربة" | "متوقف";
export type ClientSort = "recent" | "name" | "renewal" | "revenue";

export const STATUS_FILTERS: ClientStatusFilter[] = ["الكل", "نشط", "تجربة", "متوقف"];

export const SORT_OPTIONS: Array<{ value: ClientSort; label: string }> = [
  { value: "recent", label: "الأحدث" },
  { value: "name", label: "اسم العميل" },
  { value: "renewal", label: "أقرب تجديد" },
  { value: "revenue", label: "أعلى إيراد" }
];

export type ClientFilters = { query: string; status: ClientStatusFilter; followUpOnly: boolean };

/** Users above the plan limit are billed per head on top of the subscription. */
export function invoiceBreakdown(client: Pick<SubscriptionRow, "amount" | "employeeCount" | "employeeLimit">) {
  const extraUsers = Math.max(0, client.employeeCount - client.employeeLimit);
  const extraAmount = extraUsers * EXTRA_USER_PRICE;
  return { extraUsers, extraAmount, total: client.amount + extraAmount };
}

export function needsFollowUp(client: SubscriptionRow) {
  return getRenewalAlert(client) !== null;
}

export function filterClients(clients: SubscriptionRow[], filters: ClientFilters) {
  const query = filters.query.trim().toLowerCase();
  return clients.filter((client) => {
    if (filters.status !== "الكل" && client.status !== filters.status) return false;
    if (filters.followUpOnly && !needsFollowUp(client)) return false;
    if (!query) return true;
    return (
      client.companyName.toLowerCase().includes(query) ||
      client.ownerName.toLowerCase().includes(query) ||
      client.ownerEmail.toLowerCase().includes(query)
    );
  });
}

export function sortClients(clients: SubscriptionRow[], sort: ClientSort) {
  const sorted = [...clients];
  if (sort === "name") sorted.sort((a, b) => a.companyName.localeCompare(b.companyName, "ar"));
  else if (sort === "renewal") sorted.sort((a, b) => (a.renewalAt || "9999").localeCompare(b.renewalAt || "9999"));
  else if (sort === "revenue") sorted.sort((a, b) => invoiceBreakdown(b).total - invoiceBreakdown(a).total);
  return sorted;
}

export function clientCounts(clients: SubscriptionRow[]) {
  return {
    total: clients.length,
    active: clients.filter((client) => client.status === "نشط").length,
    trial: clients.filter((client) => client.status === "تجربة").length,
    paused: clients.filter((client) => client.status === "متوقف").length,
    followUp: clients.filter(needsFollowUp).length
  };
}
