import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";

export const CLIENT_NOTE_MAX_LENGTH = 2000;

export type ClientNoteRow = { id: string; tenantId: string; authorId: string; authorName: string; body: string; createdAt: string };

export function validateNoteBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "نص الملاحظة مطلوب" };
  const body = raw.trim();
  if (!body) return { ok: false, error: "اكتب نص الملاحظة" };
  if (body.length > CLIENT_NOTE_MAX_LENGTH) return { ok: false, error: `الحد الأقصى للملاحظة ${CLIENT_NOTE_MAX_LENGTH} حرف` };
  return { ok: true, body };
}

export async function listClientNotes(tenantId: string): Promise<ClientNoteRow[]> {
  await ensureSchema();
  return prisma.clientNote.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function addClientNote(tenantId: string, author: { id: string; name: string }, body: string): Promise<ClientNoteRow> {
  await ensureSchema();
  return prisma.clientNote.create({
    data: { id: `note-${randomUUID()}`, tenantId, authorId: author.id, authorName: author.name, body, createdAt: new Date().toISOString() }
  });
}

export async function deleteClientNote(tenantId: string, noteId: string): Promise<boolean> {
  await ensureSchema();
  // Scoped by tenant so a note id from another client can never be removed here.
  const result = await prisma.clientNote.deleteMany({ where: { id: noteId, tenantId } });
  return result.count > 0;
}
