import { randomInt } from "crypto";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-storage";

/**
 * Registers a freshly connected WhatsApp number with Meta (the Cloud API
 * "/register" call that moves it from Pending to Connected), so the customer
 * never has to do it by hand. Each number gets its own random two-step PIN,
 * stored encrypted. The outcome is saved so the settings page can say plainly
 * what is wrong instead of leaving the number silently Pending.
 */

const GRAPH = "https://graph.facebook.com/v22.0";
/** The PIN earlier versions of Linkly registered every number with; tried only when a number rejects ours. */
const LEGACY_PIN = "000000";

export type RegistrationStatus = "registered" | "needs_pin" | "failed" | "unknown";
export type RegistrationState = { status: RegistrationStatus; code: number; message: string; updatedAt: string };

let tableReady: Promise<void> | null = null;
function ensureTable() {
  tableReady ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS whatsapp_number_registrations (
      phone_number_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error_code INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      pin_encrypted TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`)
    .then(() => undefined)
    .catch((error) => {
      tableReady = null;
      throw error;
    });
  return tableReady;
}

type Row = { phone_number_id: string; tenant_id: string; status: string; error_code: number; message: string; pin_encrypted: string; updated_at: string };

async function readRow(phoneNumberId: string): Promise<Row | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT phone_number_id, tenant_id, status, error_code, message, pin_encrypted, updated_at FROM whatsapp_number_registrations WHERE phone_number_id = ${phoneNumberId}`;
  return rows[0] ?? null;
}

async function writeRow(input: { phoneNumberId: string; tenantId: string; status: RegistrationStatus; code: number; message: string; pin?: string }) {
  await ensureTable();
  const existing = await readRow(input.phoneNumberId);
  const pinEncrypted = input.pin ? encryptSecret(input.pin) : existing?.pin_encrypted ?? "";
  const now = new Date().toISOString();
  if (existing) {
    await prisma.$executeRaw`UPDATE whatsapp_number_registrations SET tenant_id = ${input.tenantId}, status = ${input.status}, error_code = ${input.code}, message = ${input.message}, pin_encrypted = ${pinEncrypted}, updated_at = ${now} WHERE phone_number_id = ${input.phoneNumberId}`;
  } else {
    await prisma.$executeRaw`INSERT INTO whatsapp_number_registrations (phone_number_id, tenant_id, status, error_code, message, pin_encrypted, updated_at) VALUES (${input.phoneNumberId}, ${input.tenantId}, ${input.status}, ${input.code}, ${input.message}, ${pinEncrypted}, ${now})`;
  }
}

export function explainRegistrationError(code: number, message: string): { status: RegistrationStatus; text: string } {
  switch (code) {
    case 133005:
      return { status: "needs_pin", text: "الرقم عليه رمز تحقق بخطوتين سابق. أدخل الرمز نفسه في «تسجيل الرقم لدى Meta»، أو عطّل التحقق بخطوتين من WhatsApp Manager ثم أعد المحاولة." };
    case 133015:
      return { status: "failed", text: "Meta طلبت الانتظار بضع دقائق قبل إعادة محاولة تسجيل الرقم. لا تكرر المحاولة الآن." };
    case 100:
    case 190:
    case 200:
      return { status: "failed", text: "صلاحية ربط واتساب ناقصة (Meta رفضت تسجيل الرقم). أعد ربط القناة بحساب مسؤول مباشر عن المحفظة التجارية ووافق على كل الصلاحيات." };
    default:
      return { status: "failed", text: `تعذر تسجيل الرقم لدى Meta${code ? ` (رمز ${code})` : ""}: ${message || "لم تؤكد Meta نجاح التسجيل"}.` };
  }
}

async function graphJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const payload = await response.json().catch(() => null) as { success?: boolean; status?: string; error?: { code?: number; message?: string } } | null;
  return { ok: response.ok, payload };
}

/** Meta's own view of the number: CONNECTED once it is registered and usable. */
export async function fetchPhoneStatus(phoneNumberId: string, accessToken: string): Promise<string> {
  try {
    const { ok, payload } = await graphJson(`${GRAPH}/${phoneNumberId}?fields=status`, { headers: { Authorization: `Bearer ${accessToken}` } });
    return ok && typeof payload?.status === "string" ? payload.status.toUpperCase() : "";
  } catch {
    return "";
  }
}

async function callRegister(phoneNumberId: string, accessToken: string, pin: string) {
  try {
    const { ok, payload } = await graphJson(`${GRAPH}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin })
    });
    if (ok && payload?.success === true) return { ok: true as const };
    return { ok: false as const, code: payload?.error?.code ?? 0, message: payload?.error?.message ?? "" };
  } catch (error) {
    return { ok: false as const, code: 0, message: error instanceof Error ? error.message : "network error" };
  }
}

function randomPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Makes sure the number is registered; safe to call again (it first asks Meta
 * whether the number is already Connected, and reuses the PIN it stored).
 * Never throws - the connect flow must finish even if this does not.
 */
export async function ensureWhatsAppNumberRegistered(input: { tenantId: string; phoneNumberId: string; accessToken: string }): Promise<RegistrationState> {
  const { tenantId, phoneNumberId, accessToken } = input;
  const done = (status: RegistrationStatus, code: number, message: string): RegistrationState => ({ status, code, message, updatedAt: new Date().toISOString() });
  if (!phoneNumberId || !accessToken) return done("unknown", 0, "لم يكتمل ربط الرقم بعد.");

  try {
    if ((await fetchPhoneStatus(phoneNumberId, accessToken)) === "CONNECTED") {
      await writeRow({ phoneNumberId, tenantId, status: "registered", code: 0, message: "الرقم مسجل ومتصل لدى Meta." });
      return done("registered", 0, "الرقم مسجل ومتصل لدى Meta.");
    }

    const existing = await readRow(phoneNumberId);
    let storedPin = "";
    try {
      storedPin = existing?.pin_encrypted ? decryptSecret(existing.pin_encrypted) : "";
    } catch {
      storedPin = "";
    }
    const candidates = [storedPin || randomPin()];
    if (!candidates.includes(LEGACY_PIN)) candidates.push(LEGACY_PIN);

    let last = { code: 0, message: "" };
    for (const pin of candidates) {
      const result = await callRegister(phoneNumberId, accessToken, pin);
      if (result.ok) {
        await writeRow({ phoneNumberId, tenantId, status: "registered", code: 0, message: "تم تسجيل الرقم لدى Meta.", pin });
        return done("registered", 0, "تم تسجيل الرقم لدى Meta.");
      }
      last = result;
      // Only a PIN mismatch is worth another candidate; anything else would fail the same way.
      if (result.code !== 133005) break;
    }

    const explained = explainRegistrationError(last.code, last.message);
    await writeRow({ phoneNumberId, tenantId, status: explained.status, code: last.code, message: explained.text });
    console.error("WhatsApp phone number registration failed", { tenantId, phoneNumberId, code: last.code, message: last.message });
    return done(explained.status, last.code, explained.text);
  } catch (error) {
    console.error("WhatsApp phone number registration errored", error);
    return done("failed", 0, "تعذر الاتصال بـ Meta لتسجيل الرقم. حاول بعد قليل.");
  }
}

/**
 * Registers the number AGAIN even though it is already Connected. Meta applies an approved new display name only when the
 * number is registered after the approval ("Register your number to start using it"), so ensureWhatsAppNumberRegistered -
 * which stops as soon as the number is Connected - never applies it. `pin` is the two-step PIN the owner typed, when Meta
 * asks for one; otherwise the PIN stored for the number (or the legacy one) is used.
 */
export async function reRegisterWhatsAppNumber(input: { tenantId: string; phoneNumberId: string; accessToken: string; pin?: string }): Promise<RegistrationState> {
  const { tenantId, phoneNumberId, accessToken } = input;
  const done = (status: RegistrationStatus, code: number, message: string): RegistrationState => ({ status, code, message, updatedAt: new Date().toISOString() });
  if (!phoneNumberId || !accessToken) return done("unknown", 0, "لم يكتمل ربط الرقم بعد.");
  try {
    const existing = await readRow(phoneNumberId);
    let storedPin = "";
    try {
      storedPin = existing?.pin_encrypted ? decryptSecret(existing.pin_encrypted) : "";
    } catch {
      storedPin = "";
    }
    const candidates = [...new Set([input.pin ?? "", storedPin, LEGACY_PIN].filter((pin) => /^\d{6}$/.test(pin)))];
    let last = { code: 0, message: "" };
    for (const pin of candidates) {
      const result = await callRegister(phoneNumberId, accessToken, pin);
      if (result.ok) {
        await writeRow({ phoneNumberId, tenantId, status: "registered", code: 0, message: "تم تسجيل الرقم لدى Meta.", pin });
        return done("registered", 0, "تم تسجيل الرقم لدى Meta.");
      }
      last = result;
      if (result.code !== 133005) break;
    }
    const explained = explainRegistrationError(last.code, last.message);
    await writeRow({ phoneNumberId, tenantId, status: explained.status, code: last.code, message: explained.text });
    return done(explained.status, last.code, explained.text);
  } catch (error) {
    console.error("WhatsApp phone number re-registration errored", error);
    return done("failed", 0, "تعذر الاتصال بـ Meta لتسجيل الرقم. حاول بعد قليل.");
  }
}

/** Remembers a registration the customer completed by hand (with the PIN they chose). */
export async function recordManualRegistration(input: { tenantId: string; phoneNumberId: string; pin: string }) {
  await writeRow({ phoneNumberId: input.phoneNumberId, tenantId: input.tenantId, status: "registered", code: 0, message: "تم تسجيل الرقم لدى Meta.", pin: input.pin });
}

export async function getRegistrationState(phoneNumberId: string): Promise<RegistrationState | null> {
  const row = await readRow(phoneNumberId);
  return row ? { status: row.status as RegistrationStatus, code: row.error_code, message: row.message, updatedAt: row.updated_at } : null;
}
