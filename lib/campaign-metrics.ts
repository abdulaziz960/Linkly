/**
 * Campaign numbers in one place, so the page, the table, the report and the engine agree. Everything here is pure.
 *
 * Every recipient row lands in exactly one of these places, checked in this order (the same order the campaign report
 * uses, see lib/campaign-engagement.ts), so the places always add up to the audience:
 *   1. read       - a read receipt or a tracked click: proof the customer got the message, whatever else is recorded
 *   2. failed     - we could not send it (or the customer opted out)
 *   3. pending    - still waiting in the queue
 *   4. accepted by WhatsApp and then one of: undeliverable later (failed), delivered (a delivered receipt),
 *      or "unconfirmed" - no receipt either way. Older campaigns have many of these: delivered receipts were not
 *      stored before the funnel was added, and customers who turn read receipts off never produce a read.
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
  /** Confirmed by a delivered or read receipt. */
  delivered: number;
  read: number;
  replied: number;
  /** Accepted by WhatsApp with no delivered, read or failed receipt: most likely delivered, but not confirmed. */
  unconfirmed: number;
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
  /** The audience size stored on the campaign: only used when there are no recipient rows to count. */
  total: number;
  /** Recipient rows per status, NOT counting the rows that already proved receipt (read or clicked). */
  statusCounts: RecipientStatusCount[];
  /** Rows with a read receipt or a click, whatever their status. */
  readCount?: number;
  /** Of the accepted rows with no read proof: how many have a delivered receipt, and how many were reported undeliverable. */
  deliveredCount?: number;
  deliveryFailedCount?: number;
  /** Rows the customer replied to. */
  repliedCount?: number;
  /** Failed rows' stored error text (rows without a read proof), with how many rows carry it. */
  failureErrors?: Array<{ error: string; count: number }>;
  /** The reason WhatsApp gave later for the accepted rows it then reported undeliverable, with how many rows carry it. */
  deliveryFailureErrors?: Array<{ error: string; count: number }>;
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
  if (/131049|130472|ecosystem|healthy|limit.*marketing|marketing.*limit|130429|rate/i.test(text)) return "meta_limit";
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

  const read = Math.max(0, input.readCount ?? 0);
  const acceptedUnread = byStatus.get(STATUS_SENT) ?? 0;
  const pending = (byStatus.get(STATUS_PENDING) ?? 0) + (byStatus.get(STATUS_SENDING) ?? 0);
  const failedRows = byStatus.get(STATUS_FAILED) ?? 0;

  const failureErrors = input.failureErrors ?? [];
  const optedOut = Math.min(failedRows, failureErrors.filter((item) => item.error === OPT_OUT_ERROR).reduce((sum, item) => sum + item.count, 0));
  const sendFailed = failedRows - optedOut;
  const failedAfterAccept = Math.min(acceptedUnread, Math.max(0, input.deliveryFailedCount ?? 0));
  const deliveredUnread = Math.min(acceptedUnread - failedAfterAccept, Math.max(0, input.deliveredCount ?? 0));
  const unconfirmed = acceptedUnread - failedAfterAccept - deliveredUnread;

  // Why they failed comes from what WhatsApp or the send itself said, never guessed: an undeliverable message the
  // customer's settings caused and one WhatsApp held back are different things.
  const reasonTotals = new Map<FailureReasonKey, number>();
  for (const reason of groupFailureReasons(failureErrors)) reasonTotals.set(reason.key, (reasonTotals.get(reason.key) ?? 0) + reason.count);
  let explained = 0;
  for (const reason of groupFailureReasons(input.deliveryFailureErrors ?? [])) {
    reasonTotals.set(reason.key, (reasonTotals.get(reason.key) ?? 0) + reason.count);
    explained += reason.count;
  }
  // Rows flagged undeliverable with no reason recorded at all.
  if (failedAfterAccept > explained) reasonTotals.set("other", (reasonTotals.get("other") ?? 0) + (failedAfterAccept - explained));
  const reasons = [...reasonTotals.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

  const rows = read + acceptedUnread + pending + failedRows;
  // The recipient rows are the truth. The stored audience size can be off (a counter that drifted, rows removed later).
  const total = rows > 0 ? rows : Math.max(0, input.total);
  const sent = read + acceptedUnread;
  return {
    total,
    sent,
    delivered: read + deliveredUnread,
    read,
    replied: Math.min(sent, Math.max(0, input.repliedCount ?? 0)),
    unconfirmed,
    failed: sendFailed + failedAfterAccept,
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
      unconfirmed: acc.unconfirmed + stats.unconfirmed,
      failed: acc.failed + stats.failed,
      optedOut: acc.optedOut + stats.optedOut,
      pending: acc.pending + stats.pending
    }),
    { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, unconfirmed: 0, failed: 0, optedOut: 0, pending: 0 }
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
