import { createHash } from "crypto";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { prisma } from "./prisma";
import { leadWhatsappNumber } from "./phone-format";
import { storeWhatsAppMessage } from "./whatsapp-inbox";

export { leadWhatsappNumber };

/**
 * The WhatsApp welcome for leads that arrive through the public leads API (Zapier / Make: TikTok forms, Google
 * forms, Typeform...). One template per workspace, sent once per phone: the first message to an unknown lead has
 * to be an approved template. Same idea as the Meta and Snapchat lead welcomes, which have their own switches.
 */

export type LeadWelcomeSettings = { enabled: boolean; template: string };

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS lead_welcome_settings (
      tenant_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      template TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS lead_welcome_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function getLeadWelcomeSettings(tenantId: string): Promise<LeadWelcomeSettings> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ enabled: number; template: string }>>`SELECT enabled, template FROM lead_welcome_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  return { enabled: rows[0]?.enabled === 1, template: rows[0]?.template ?? "" };
}

export async function saveLeadWelcomeSettings(tenantId: string, input: { enabled?: unknown; template?: unknown }): Promise<LeadWelcomeSettings> {
  await ensureTables();
  const current = await getLeadWelcomeSettings(tenantId);
  const template = typeof input.template === "string" ? input.template.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) : current.template;
  // Switching it on without a template would only produce silent failures.
  const enabled = (typeof input.enabled === "boolean" ? input.enabled : current.enabled) && Boolean(template);
  const now = new Date().toISOString();
  const existing = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM lead_welcome_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  if (existing.length) {
    await prisma.$executeRaw`UPDATE lead_welcome_settings SET enabled = ${enabled ? 1 : 0}, template = ${template}, updated_at = ${now} WHERE tenant_id = ${tenantId}`;
  } else {
    await prisma.$executeRaw`INSERT INTO lead_welcome_settings (tenant_id, enabled, template, updated_at) VALUES (${tenantId}, ${enabled ? 1 : 0}, ${template}, ${now})`;
  }
  return { enabled, template };
}

export type WelcomeOutcome = "sent" | "off" | "no-template" | "bad-phone" | "already-welcomed" | "failed";

/**
 * Sends the welcome to a lead that just arrived (once per phone), and opens the WhatsApp thread with what we
 * know so the reply continues from it. Never throws; the lead is already saved.
 */
export async function sendExternalLeadWelcome(input: { tenantId: string; phone: string; name: string; summary: string }): Promise<WelcomeOutcome> {
  try {
    const settings = await getLeadWelcomeSettings(input.tenantId);
    if (!settings.enabled) return "off";
    if (!settings.template) return "no-template";
    const phone = leadWhatsappNumber(input.phone);
    if (!phone) return "bad-phone";

    await ensureTables();
    const id = `lw-${createHash("sha1").update(`${input.tenantId}:${phone}`).digest("hex").slice(0, 24)}`;
    // The phone's slot is claimed first: two requests for the same lead cannot both send.
    const claimed = await prisma.$executeRaw`INSERT INTO lead_welcome_log (id, tenant_id, phone, ok, detail, created_at) VALUES (${id}, ${input.tenantId}, ${phone}, 0, 'claimed', ${new Date().toISOString()}) ON CONFLICT (id) DO NOTHING`;
    if (!claimed) return "already-welcomed";

    const result = await sendWhatsAppTemplate(input.tenantId, phone, settings.template, "ar", input.name);
    await prisma.$executeRaw`UPDATE lead_welcome_log SET ok = ${result.ok ? 1 : 0}, detail = ${result.ok ? "" : result.error.slice(0, 300)} WHERE id = ${id}`;
    if (!result.ok) {
      // A failed send frees the slot so a later delivery of the same lead can try again.
      await prisma.$executeRaw`DELETE FROM lead_welcome_log WHERE id = ${id}`;
      return "failed";
    }
    await storeWhatsAppMessage({
      phone,
      name: input.name,
      text: `أُرسلت رسالة ترحيب (القالب: ${settings.template}) بعد وصول العميل من نموذج خارجي.\n${input.summary}`,
      direction: "out",
      tenantId: input.tenantId,
      author: "نظام"
    }).catch((error) => console.error("External lead welcome thread failed", error));
    return "sent";
  } catch (error) {
    console.error("External lead welcome failed", error);
    return "failed";
  }
}
