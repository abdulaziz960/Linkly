import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { decryptSecret } from "./secret-storage";
import type { UnitStatus } from "./crm-units";

/**
 * Reads a developer's price sheet (a PDF) into units. The PDF goes to the workspace's own AI provider as it is:
 * the text inside such files is often garbled (Arabic letters swapped by the font), so the model reads the pages
 * the way a person does. Nothing is saved here: the caller shows the result for review first.
 */

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type ReadUnit = { name: string; kind: string; model: string; area: string; priceText: string; status: UnitStatus };

const PROMPT = [
  "This PDF is a real-estate price sheet. Extract EVERY unit listed in its tables, in order, from all pages.",
  'Return ONLY a JSON object: {"units":[{"code":"A1","model":"A","type":"دور أرضي","area":"270","price":"950000","status":"available"}]}.',
  "Rules:",
  '- code: the unit code or number exactly as written (A1, B10, 12...).',
  '- model: the group/model heading the unit sits under ("نموذج A" -> "A"); "" if none.',
  '- type: what the unit is, as written in Arabic in parentheses or a column ("دور أرضي", "بنت هاوس", "فيلا"); "" if none.',
  "- area: the number only (keep decimals), no unit; Arabic-Indic digits converted to 0-9; \"\" if none.",
  '- price: digits only when it is a number (no separators, no currency); when the cell holds a word instead of a number (for example an offer label) copy that word; "" when the cell is empty or a dash.',
  '- status: "available" for متاح, "reserved" for محجوز, "sold" for مباع/مباعة. If the sheet has no status column use "available".',
  "- Do not invent, merge or skip units. Skip pages with no unit rows (covers, maps, descriptions).",
  "Output the JSON object and nothing else."
].join("\n");

const STATUS_WORDS: Array<[RegExp, UnitStatus]> = [[/sold|مباع|مباعة|مباعه|تم البيع/i, "sold"], [/reserv|محجوز|محجوزة|حجز/i, "reserved"], [/avail|متاح|متاحة|متوفر/i, "available"]];

function digits(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function statusOf(value: unknown): UnitStatus {
  const text = String(value ?? "");
  return STATUS_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "available";
}

function formatPrice(raw: unknown): string {
  const text = digits(String(raw ?? "")).trim();
  if (!text || /^[-–—_.]+$/.test(text)) return "";
  const compact = text.replace(/[,\s٬.](?=\d{3}(\D|$))/g, "").replace(/[^\d.]/g, "");
  if (/^\d+(\.\d+)?$/.test(compact) && Number(compact) > 0) return `${Math.round(Number(compact)).toLocaleString("en-US")} ر.س`;
  return text.slice(0, 80);
}

function formatArea(raw: unknown): string {
  const text = digits(String(raw ?? "")).replace(/م\s*[²2]?|m2|m²/gi, "").trim();
  return /^\d+([.,]\d+)?$/.test(text) ? `${text.replace(",", ".")} م²` : text.slice(0, 60);
}

/** Pure: the model's answer (possibly fenced, or with text around the JSON) as clean units; an unreadable answer gives an empty list. */
export function parseUnitsJson(answer: string): ReadUnit[] {
  const text = answer.replace(/```(?:json)?/gi, "").trim();
  const tryParse = (from: string, to: string): unknown => {
    const start = text.indexOf(from);
    const end = text.lastIndexOf(to);
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  };
  const object = tryParse("{", "}") as { units?: unknown } | null;
  const array = tryParse("[", "]");
  const list = Array.isArray(object?.units) ? object.units : Array.isArray(array) ? array : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const units: ReadUnit[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = digits(String(row.code ?? row.name ?? "")).replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    units.push({
      name,
      kind: String(row.type ?? row.kind ?? "").replace(/[()（）]/g, "").replace(/\s+/g, " ").trim().slice(0, 60),
      model: String(row.model ?? "").replace(/^(نموذج|model)\s*/i, "").trim().slice(0, 40),
      area: formatArea(row.area),
      priceText: formatPrice(row.price),
      status: statusOf(row.status)
    });
  }
  return units;
}

type Connection = { provider: string; model: string; apiKey: string };
const VISION_PROVIDERS = ["anthropic", "openai", "gemini"];

async function workspaceConnection(tenantId: string): Promise<{ ok: true; connection: Connection } | { ok: false; error: string }> {
  await ensureSchema();
  const setting = await prisma.aiWorkspaceSetting.findUnique({ where: { tenantId } });
  if (!setting?.apiKey) return { ok: false, error: "أضف مفتاح الذكاء الاصطناعي الخاص بمساحة عملك أولًا (الإعدادات ← الذكاء الاصطناعي)." };
  if (!VISION_PROVIDERS.includes(setting.provider)) return { ok: false, error: "مزوّد الذكاء الاصطناعي الحالي لا يقرأ ملفات PDF. استخدم Claude أو GPT أو Gemini." };
  try {
    return { ok: true, connection: { provider: setting.provider, model: setting.model, apiKey: decryptSecret(setting.apiKey) } };
  } catch {
    return { ok: false, error: "تعذر قراءة مفتاح الذكاء الاصطناعي. أعد حفظه." };
  }
}

async function ask(connection: Connection, pdfBase64: string): Promise<string | null> {
  const signal = AbortSignal.timeout(150_000);
  if (connection.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json", "x-api-key": connection.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: connection.model, max_tokens: 16000, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: PROMPT }] }] })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return Array.isArray(payload?.content) ? payload.content.filter((part: { type?: string }) => part.type === "text").map((part: { text?: string }) => part.text || "").join("") : null;
  }
  if (connection.provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(connection.model)}:generateContent`, {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": connection.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "application/pdf", data: pdfBase64 } }, { text: PROMPT }] }], generationConfig: { maxOutputTokens: 16000, responseMimeType: "application/json" } })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.candidates?.[0]?.content?.parts?.filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text || "").join("") ?? null;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", redirect: "error", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.apiKey}` },
    body: JSON.stringify({ model: connection.model, max_completion_tokens: 16000, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "file", file: { filename: "units.pdf", file_data: `data:application/pdf;base64,${pdfBase64}` } }, { type: "text", text: PROMPT }] }] })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content ?? null;
}

/** Reads the units out of a PDF with the workspace's own AI key. Never throws; says why when it cannot. */
export async function readUnitsFromPdf(tenantId: string, pdf: Buffer): Promise<{ ok: true; units: ReadUnit[] } | { ok: false; error: string }> {
  if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) return { ok: false, error: "حجم الملف يجب أن يكون أقل من 10 ميجا." };
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, error: "الملف ليس PDF صالحًا." };
  const resolved = await workspaceConnection(tenantId);
  if (!resolved.ok) return resolved;
  try {
    const answer = await ask(resolved.connection, pdf.toString("base64"));
    if (answer === null) return { ok: false, error: "تعذر على مزوّد الذكاء الاصطناعي قراءة الملف. تأكد من المفتاح والنموذج وأعد المحاولة." };
    const units = parseUnitsJson(answer);
    if (!units.length) return { ok: false, error: "لم أجد وحدات في الملف. تأكد أنه جدول أسعار ووحدات." };
    return { ok: true, units };
  } catch (error) {
    console.error("Units PDF read failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "تعذر قراءة الملف. أعد المحاولة." };
  }
}
