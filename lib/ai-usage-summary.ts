export type UsageEventLike = { userId: string; operation: string; status: string; inputTokens: number | null; outputTokens: number | null; estimatedCost: number | null };

export const AUTO_REPLY_USER_ID = "bot-ai-reply";

export type AiUsageSummary = {
  total: number;
  succeeded: number;
  failed: number;
  /** Auto-replies that found no answer in the knowledge base and passed the chat to a person. */
  handoff: number;
  /** 0-100, null when no finished request exists yet. */
  successRate: number | null;
  autoReply: number;
  employee: number;
  costUsd: number;
  /** Requests whose cost could not be estimated (no rates configured / no token counts). */
  costUnknown: number;
  byOperation: Array<{ operation: string; count: number }>;
};

export function summarizeAiUsage(events: UsageEventLike[]): AiUsageSummary {
  const byOperation = new Map<string, number>();
  let succeeded = 0, failed = 0, handoff = 0, autoReply = 0, costUsd = 0, costUnknown = 0;
  for (const event of events) {
    if (event.status === "succeeded") succeeded += 1;
    else if (event.status === "handoff") handoff += 1;
    else if (event.status === "failed") failed += 1;
    if (event.userId === AUTO_REPLY_USER_ID) autoReply += 1;
    byOperation.set(event.operation, (byOperation.get(event.operation) || 0) + 1);
    if (event.estimatedCost === null) costUnknown += 1;
    else costUsd += event.estimatedCost;
  }
  const finished = succeeded + handoff + failed;
  return {
    total: events.length, succeeded, failed, handoff,
    successRate: finished ? Math.round(((succeeded + handoff) / finished) * 100) : null,
    autoReply, employee: events.length - autoReply, costUsd, costUnknown,
    byOperation: [...byOperation.entries()].map(([operation, count]) => ({ operation, count })).sort((a, b) => b.count - a.count)
  };
}
