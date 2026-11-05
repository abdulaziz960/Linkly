import { randomUUID } from "crypto";
import { prisma } from "./prisma";

/**
 * The history of one lead (customer): what happened to it and when - stage changes, visits booked / changed,
 * notes, assignment. Stage and visit changes are recorded here as they happen; notes and assignment lines are
 * read from the conversation's own messages (they already live there), so older leads show them too.
 */

export type TimelineKind = "stage" | "assign" | "visit" | "note" | "ai";
export type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  at: string;
  /** Text shown for the entry (visit / note / assignment lines). */
  text: string;
  /** For a stage change. */
  from?: string;
  to?: string;
  actor: string;
};

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS lead_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      from_value TEXT NOT NULL DEFAULT '',
      to_value TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS lead_events_conversation ON lead_events (tenant_id, conversation_id, created_at)`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Records one event on a lead. Never throws: a failed history line must not break the action itself. */
export async function recordLeadEvent(input: { tenantId: string; conversationId: string; kind: "stage" | "visit"; from?: string; to?: string; text?: string; actor?: string; at?: string }) {
  if (!input.conversationId) return;
  try {
    await ensureTable();
    await prisma.$executeRaw`INSERT INTO lead_events (id, tenant_id, conversation_id, kind, from_value, to_value, text, actor, created_at)
      VALUES (${`le-${randomUUID()}`}, ${input.tenantId}, ${input.conversationId}, ${input.kind}, ${input.from ?? ""}, ${input.to ?? ""}, ${(input.text ?? "").slice(0, 500)}, ${(input.actor ?? "").slice(0, 100)}, ${input.at ?? new Date().toISOString()})`;
  } catch (error) {
    console.error("Lead event failed", error);
  }
}

/** Newest first. Merges the recorded events with the notes / assignment lines of the conversation. */
export async function getLeadTimeline(tenantId: string, conversationId: string): Promise<TimelineEntry[]> {
  await ensureTable();
  const [events, messages] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; kind: string; from_value: string; to_value: string; text: string; actor: string; created_at: string }>>`SELECT id, kind, from_value, to_value, text, actor, created_at FROM lead_events WHERE tenant_id = ${tenantId} AND conversation_id = ${conversationId} ORDER BY created_at DESC LIMIT 300`,
    prisma.message.findMany({ where: { conversationId, direction: "note", conversation: { tenantId } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, text: true, createdAt: true, author: true, sourceType: true } })
  ]);
  const entries: TimelineEntry[] = [
    ...events.map((event): TimelineEntry => ({ id: event.id, kind: event.kind as TimelineKind, at: event.created_at, text: event.text, from: event.from_value || undefined, to: event.to_value || undefined, actor: event.actor })),
    ...messages.map((message): TimelineEntry => ({
      id: message.id,
      kind: message.sourceType === "system_assignment" ? "assign" : message.sourceType === "crm_ai_note" ? "ai" : "note",
      at: message.createdAt,
      text: message.text,
      actor: message.author
    }))
  ];
  return entries.filter((entry) => entry.at).sort((a, b) => b.at.localeCompare(a.at));
}
