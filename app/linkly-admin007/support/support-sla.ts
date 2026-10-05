// Support SLA helpers. Targets are defaults kept in code (no per-plan config
// exists yet): how long a customer may wait for a support reply.

export const SLA_TARGET_MINUTES: Record<string, number> = { urgent: 60, high: 240, normal: 480, low: 1440 };

// Tickets in these statuses are waiting for the support team to answer.
const AWAITING_SUPPORT = new Set(["new", "open", "waiting_support"]);

export type SlaState = "none" | "ok" | "at_risk" | "breached";

export type SlaTicket = { status: string; priority: string; createdAt: string; lastCustomerReplyAt: string };

export type SlaInfo = { state: SlaState; waitingMinutes: number; targetMinutes: number };

function toMs(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function slaInfo(ticket: SlaTicket, now: number): SlaInfo {
  const targetMinutes = SLA_TARGET_MINUTES[ticket.priority] ?? SLA_TARGET_MINUTES.normal;
  if (!AWAITING_SUPPORT.has(ticket.status)) return { state: "none", waitingMinutes: 0, targetMinutes };
  const since = Math.max(toMs(ticket.lastCustomerReplyAt), toMs(ticket.createdAt));
  if (!since) return { state: "none", waitingMinutes: 0, targetMinutes };
  const waitingMinutes = Math.max(0, Math.round((now - since) / 60_000));
  const ratio = waitingMinutes / targetMinutes;
  return { state: ratio >= 1 ? "breached" : ratio >= 0.75 ? "at_risk" : "ok", waitingMinutes, targetMinutes };
}

/** "45 د" / "3 س 20 د" / "2 ي 4 س" - compact Arabic duration. */
export function formatWaiting(minutes: number): string {
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} س${minutes % 60 ? ` ${minutes % 60} د` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} ي${hours % 24 ? ` ${hours % 24} س` : ""}`;
}

export const KANBAN_COLUMNS = ["new", "open", "in_progress", "waiting_support", "waiting_customer", "resolved"] as const;
