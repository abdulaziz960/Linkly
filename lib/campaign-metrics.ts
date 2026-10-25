/**
 * Campaign numbers in one place, so the page, the table and the engine agree. Everything here is pure.
 *
 * A recipient is in exactly one of four states, and the four always add up to the audience:
 *   total = sent + failed + optedOut + pending
 * "failed" and "optedOut" are our own send-time outcomes; a message WhatsApp accepted ("sent") can still be
 * reported undeliverable later (deliveryFailed), which is counted separately and removes it from "delivered".
 * The funnel is  sent -> delivered -> read -> replied.
 */

/** The text stored on a recipient the customer had opted out of (lib/campaign-engine.ts writes it). */
export const OPT_OUT_ERROR = "ألغى العميل اشتراكه من رسائل الحملات";
export const INSUFFICIENT_BALANCE_ERROR = "الرصيد غير كافٍ";

export type RecipientStatusCount = { status: string; count: number };

export type FailureReasonKey = "unregistered" | "rejected" | "outside_window" | "insufficient_balance" | "meta_limit" | "recipient_blocked" | "other";

export type FailureReason = { key: FailureReasonKey; count: number };

export type CampaignStats = {
  total: number;
  /** Accepted by WhatsApp. */
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  /** Failed at send time, plus accepted-then-undeliverable. Opt-outs are not counted here. */
  failed: number;
  optedOut: number;
  /** Still waiting in the queue (including the ones being sent right now). */
  pending: number;
  /** sent / total as a percentage with one decimal, never rounded up to 100 unless every recipient was sent. */
  sendRate: number;
  /** Nothing is waiting any more: sent + failed + optedOut = total. */
  complete: boolean;
  failureReasons: FailureReason[];
};

export type CampaignStatsInput = {
  total: number;
  /** Recipient rows per status. */
  statusCounts: RecipientStatusCount[];
  /** Of the sent rows: how many have a delivered / read / replied time, and how many were reported undeliverable later. */
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  deliveryFailedCount?: number;
  /** Failed rows' stored error text, with how many rows carry it. */
  failureErrors?: Array<{ error: string; count: number }>;
};

export const STATUS_PENDING = "قيد الإرسال";
export const STATUS_SENDING = "جارٍ الإرسال";
export const STATUS_SENT = "تم الإرسال";
export const STATUS_FAILED = "فشل الإرسال";

/** Percentage with one decimal, rounded DOWN so 2,774 of 2,781 reads 99.7% and never 100%. */
export function formatRate(part: number, whole: number): number {
  if (!whole || whole < 0 || part <= 0) return 0;
  if (part >= whole) return 100;
  return Math.floor((part / whole) * 1000) / 10;
}

export function classifyFailure(error: string): FailureReasonKey {
  const text = error.trim();
  if (!text) return "other";
  if (text === INSUFFICIENT_BALANCE_ERROR || /غير كاف|insufficient/i.test(text)) return "insufficient_balance";
  if (/131026|not (a )?whatsapp|undeliverable|not registered|غير مسجل/i.test(text)) return "unregistered";
  if (/131047|131051|24 hours|re-?engagement|outside.*window|خارج/i.test(text)) return "outside_window";
  if (/131049|ecosystem|limit.*marketing|marketing.*limit|130429|rate/i.test(text)) return "meta_limit";
  if (/131050|stopped|blocked|opted|unsubscri|حظر|ألغى/i.test(text)) return "recipient_blocked";
  if (/reject|invalid|131008|131009|132\d{3}|unsupported|مرفوض/i.test(text)) return "rejected";
  return "other";
}

export function groupFailureReasons(errors: Array<{ error: string; count: number }>): FailureReason[] {
  const totals = new Map<FailureReasonKey, number>();
  for (const { error, count } of errors) {
    if (error === OPT_OUT_ERROR) continue;
    const key = classifyFailure(error);
    totals.set(key, (totals.get(key) ?? 0) + count);
  }
  return [...totals.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function computeCampaignStats(input: CampaignStatsInput): CampaignStats {
  const byStatus = new Map<string, number>();
  for (const { status, count } of input.statusCounts) byStatus.set(status, (byStatus.get(status) ?? 0) + count);

  const sent = byStatus.get(STATUS_SENT) ?? 0;
  const pending = (byStatus.get(STATUS_PENDING) ?? 0) + (byStatus.get(STATUS_SENDING) ?? 0);
  const failedRows = byStatus.get(STATUS_FAILED) ?? 0;

  const failureErrors = input.failureErrors ?? [];
  const optedOut = Math.min(failedRows, failureErrors.filter((item) => item.error === OPT_OUT_ERROR).reduce((sum, item) => sum + item.count, 0));
  const sendFailed = failedRows - optedOut;
  const deliveryFailed = Math.min(sent, input.deliveryFailedCount ?? 0);

  // Accepted-then-undeliverable messages are not delivered; a read or replied receipt implies delivery.
  const read = Math.min(sent, input.readCount ?? 0);
  const replied = Math.min(sent, input.repliedCount ?? 0);
  const delivered = Math.max(read, Math.min(sent - deliveryFailed, input.deliveredCount ?? 0));

  const reasons = groupFailureReasons(failureErrors);
  if (deliveryFailed) {
    const existing = reasons.find((reason) => reason.key === "recipient_blocked");
    if (existing) existing.count += deliveryFailed;
    else reasons.push({ key: "recipient_blocked", count: deliveryFailed });
    reasons.sort((a, b) => b.count - a.count);
  }

  const total = Math.max(input.total, sent + sendFailed + optedOut + pending);
  return {
    total,
    sent,
    delivered,
    read,
    replied,
    failed: sendFailed + deliveryFailed,
    optedOut,
    pending,
    sendRate: formatRate(sent, total),
    complete: pending === 0 && total > 0,
    failureReasons: reasons
  };
}

/** Adds campaigns' stats together for the cards at the top of the page. */
export function sumCampaignStats(all: CampaignStats[]): CampaignStats {
  const sum = all.reduce(
    (acc, stats) => ({
      total: acc.total + stats.total,
      sent: acc.sent + stats.sent,
      delivered: acc.delivered + stats.delivered,
      read: acc.read + stats.read,
      replied: acc.replied + stats.replied,
      failed: acc.failed + stats.failed,
      optedOut: acc.optedOut + stats.optedOut,
      pending: acc.pending + stats.pending
    }),
    { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, optedOut: 0, pending: 0 }
  );
  const reasonTotals = new Map<FailureReasonKey, number>();
  for (const stats of all) for (const reason of stats.failureReasons) reasonTotals.set(reason.key, (reasonTotals.get(reason.key) ?? 0) + reason.count);
  return {
    ...sum,
    sendRate: formatRate(sum.sent, sum.total),
    complete: sum.pending === 0 && sum.total > 0,
    failureReasons: [...reasonTotals.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
  };
}

/**
 * What one sent message costs, in riyals: the average of what the workspace actually paid per message across its
 * completed top-ups, so a campaign's cost follows the volume tier it bought. Falls back to the given default.
 */
export function effectiveMessageRate(payments: Array<{ messages: number; amount: number; status: string }>, fallback: number): number {
  const completed = payments.filter((payment) => payment.status === "مكتمل" && payment.messages > 0 && payment.amount > 0);
  const messages = completed.reduce((sum, payment) => sum + payment.messages, 0);
  const amount = completed.reduce((sum, payment) => sum + payment.amount, 0);
  return messages > 0 ? amount / messages : fallback;
}

export function campaignCost(sent: number, rate: number): number {
  return Math.round(sent * rate * 100) / 100;
}
