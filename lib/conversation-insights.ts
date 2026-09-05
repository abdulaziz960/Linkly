import { randomUUID } from "crypto";
import { prisma } from "./prisma";

export type ConversationSummaryResult = {
  summary: string;
  intent: string;
  satisfactionLevel: string;
};

export function isAiSummaryConfigured(): boolean {
  return Boolean(process.env.AI_SUMMARY_API_KEY?.trim());
}

/**
 * Pluggable AI call - returns null (no-op) until a provider is wired in via
 * AI_SUMMARY_API_KEY. Deliberately isolated to this one function so hooking
 * up a real provider later (Anthropic/OpenAI/etc.) is a single self-contained
 * change; nothing else in this file needs to know which provider is used.
 */
export async function summarizeConversation(transcript: Array<{ author: string; text: string }>): Promise<ConversationSummaryResult | null> {
  if (!isAiSummaryConfigured()) return null;
  void transcript;

  // Provider call not wired in yet - see AI_SUMMARY_API_KEY.
  return null;
}

export async function enqueueConversationSummary(conversationId: string, tenantId: string): Promise<void> {
  const existing = await prisma.conversationInsight.findUnique({ where: { conversationId } });
  if (existing) return;

  await prisma.conversationSummaryQueueItem.create({
    data: {
      id: `ciq-${randomUUID()}`,
      conversationId,
      tenantId,
      createdAt: new Date().toISOString()
    }
  });
}

/**
 * Drains due summary-queue items for a tenant. Each item is claimed
 * atomically (deleteMany on its own id+tenantId) before processing, mirroring
 * lib/automation-engine.ts's processDueAutomations, so concurrent cron ticks
 * never double-process the same conversation. If summarizeConversation
 * returns null (unconfigured or failed), the claimed item is simply dropped -
 * no insight is written and no retry loop builds up while unconfigured.
 */
export async function processDueConversationSummaries(tenantId: string, batchSize = 10): Promise<void> {
  const due = await prisma.conversationSummaryQueueItem.findMany({
    where: { tenantId },
    take: batchSize
  });
  if (!due.length) return;

  for (const item of due) {
    const claim = await prisma.conversationSummaryQueueItem.deleteMany({
      where: { id: item.id, tenantId: item.tenantId }
    });
    if (claim.count !== 1) continue;

    const messages = await prisma.message.findMany({
      where: { conversationId: item.conversationId },
      orderBy: { createdAt: "asc" },
      select: { author: true, text: true, direction: true }
    });
    const transcript = messages.map((message) => ({ author: message.author || (message.direction === "out" ? "الفريق" : "العميل"), text: message.text }));

    const result = await summarizeConversation(transcript);
    if (!result) continue;

    await prisma.conversationInsight.upsert({
      where: { conversationId: item.conversationId },
      update: {
        intent: result.intent,
        satisfactionLevel: result.satisfactionLevel,
        summary: result.summary,
        createdAt: new Date().toISOString()
      },
      create: {
        id: `cin-${randomUUID()}`,
        conversationId: item.conversationId,
        tenantId: item.tenantId,
        intent: result.intent,
        satisfactionLevel: result.satisfactionLevel,
        summary: result.summary,
        createdAt: new Date().toISOString()
      }
    });
  }
}
