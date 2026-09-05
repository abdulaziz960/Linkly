import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { textSimilarity } from "./text-similarity";

export type KnowledgeBaseEntryRecord = {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
};

// Picked and validated against representative Arabic FAQ-style
// near-wording/unrelated pairs in tests/knowledge-base.test.ts: unrelated
// FAQ pairs topped out around 0.35, near-wording matches of the same
// question scored 0.4 and up - 0.42 sits in that gap with margin on both
// sides. A wrong FAQ answer is worse than a missed quick-reply suggestion,
// so this is deliberately not lower even though it misses some
// differently-worded matches (same local-similarity tradeoff as
// lib/text-similarity.ts's own SIMILARITY_CLUSTER_THRESHOLD).
export const KB_MATCH_THRESHOLD = 0.42;

export async function listKbEntries(tenantId: string): Promise<KnowledgeBaseEntryRecord[]> {
  return prisma.knowledgeBaseEntry.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export async function createKbEntry(tenantId: string, input: { question: string; answer: string }): Promise<KnowledgeBaseEntryRecord> {
  const now = new Date().toISOString();
  return prisma.knowledgeBaseEntry.create({
    data: {
      id: `kb-${randomUUID()}`,
      tenantId,
      question: input.question.trim(),
      answer: input.answer.trim(),
      createdAt: now,
      updatedAt: now
    }
  });
}

export async function updateKbEntry(tenantId: string, id: string, input: { question: string; answer: string }): Promise<KnowledgeBaseEntryRecord | null> {
  const existing = await prisma.knowledgeBaseEntry.findFirst({ where: { id, tenantId } });
  if (!existing) return null;

  return prisma.knowledgeBaseEntry.update({
    where: { id },
    data: { question: input.question.trim(), answer: input.answer.trim(), updatedAt: new Date().toISOString() }
  });
}

export async function deleteKbEntry(tenantId: string, id: string): Promise<boolean> {
  const result = await prisma.knowledgeBaseEntry.deleteMany({ where: { id, tenantId } });
  return result.count > 0;
}

/**
 * Scores the tenant's KB entries against an incoming message using the same
 * local trigram-cosine similarity built for the smart quick-reply feature -
 * a "simple RAG" with no external embeddings API. Capped candidate set
 * (realistic FAQ banks are tens-to-low-hundreds of entries, not the
 * 1000-message scale syncAutomaticQuickReplies handles), and runs
 * synchronously on the inbound-message path since runChannelBot already
 * does per message for every channel.
 */
export async function findBestKbMatch(tenantId: string, incomingText: string): Promise<KnowledgeBaseEntryRecord | null> {
  const text = incomingText.trim();
  if (!text) return null;

  const entries = await prisma.knowledgeBaseEntry.findMany({ where: { tenantId }, take: 500 });
  if (!entries.length) return null;

  let best: KnowledgeBaseEntryRecord | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const score = entry.question
      ? Math.max(textSimilarity(text, entry.question), textSimilarity(text, entry.answer))
      : textSimilarity(text, entry.answer);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore >= KB_MATCH_THRESHOLD ? best : null;
}
