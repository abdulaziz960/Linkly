import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { parseDataUrl } from "./message-attachments";

/**
 * Pictures and videos an automation rule sends. Kept apart from the rule's
 * actions JSON so listing rules stays light - an action only carries the id.
 */
export type AutomationMediaKind = "image" | "video";

export const AUTOMATION_MEDIA_ACTIONS: Record<string, AutomationMediaKind> = {
  "إرسال صورة": "image",
  "إرسال فيديو": "video"
};

const LIMITS: Record<AutomationMediaKind, { mimes: string[]; bytes: number; label: string }> = {
  image: { mimes: ["image/jpeg", "image/png"], bytes: 5 * 1024 * 1024, label: "الصورة يجب أن تكون JPG أو PNG وبحجم أقل من 5 ميجا" },
  video: { mimes: ["video/mp4", "video/3gpp"], bytes: 12 * 1024 * 1024, label: "الفيديو يجب أن يكون MP4 وبحجم أقل من 12 ميجا" }
};

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS automation_media (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export type StoredAutomationMedia = { id: string; kind: AutomationMediaKind; name: string; mimeType: string; dataUrl: string };

export async function saveAutomationMedia(
  tenantId: string,
  input: { name?: unknown; dataUrl?: unknown }
): Promise<{ ok: true; id: string; kind: AutomationMediaKind; name: string } | { ok: false; error: string }> {
  const dataUrl = typeof input.dataUrl === "string" ? input.dataUrl : "";
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, error: "الملف غير صالح" };

  const kind = (Object.keys(LIMITS) as AutomationMediaKind[]).find((key) => LIMITS[key].mimes.includes(parsed.mimeType));
  if (!kind) return { ok: false, error: "الصيغة غير مدعومة. المسموح: صورة JPG/PNG أو فيديو MP4" };
  if (parsed.bytes.length > LIMITS[kind].bytes) return { ok: false, error: LIMITS[kind].label };

  const name = (typeof input.name === "string" ? input.name : "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || (kind === "image" ? "صورة" : "فيديو");
  const id = `amedia-${randomUUID()}`;
  await ensureTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO automation_media (id, tenant_id, kind, name, mime_type, size, data_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, tenantId, kind, name, parsed.mimeType, parsed.bytes.length, dataUrl, new Date().toISOString()
  );
  return { ok: true, id, kind, name };
}

export async function loadAutomationMedia(tenantId: string, id: string): Promise<StoredAutomationMedia | null> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; kind: string; name: string; mime_type: string; data_url: string }>>(
    `SELECT id, kind, name, mime_type, data_url FROM automation_media WHERE id = ? AND tenant_id = ?`,
    id, tenantId
  );
  const row = rows[0];
  if (!row || (row.kind !== "image" && row.kind !== "video")) return null;
  return { id: row.id, kind: row.kind, name: row.name, mimeType: row.mime_type, dataUrl: row.data_url };
}
