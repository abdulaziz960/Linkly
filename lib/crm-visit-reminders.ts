import { prisma } from "./prisma";
import { sendBotText } from "./bot-engine";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { notifyUsers } from "./push-notifications";
import { recordLeadEvent } from "./lead-timeline";
import { getTenantCompanyName } from "./subscriptions";
import { todayInRiyadh } from "./crm-visits";

/**
 * A WhatsApp reminder to the customer (and a push to the assigned employee) shortly before a booked visit.
 *
 * Per workspace: on/off, how many hours before, an optional approved template (for a customer whose 24-hour chat
 * window is closed), and an optional wording. Runs on the existing every-minute cron. Each visit is reminded once:
 * the reminder is claimed atomically before sending, and given back (up to 3 tries) if the send fails.
 */

export const REMINDER_HOURS = [1, 2, 3, 6, 12, 24, 48] as const;
const MAX_TRIES = 3;
const MAX_PER_TICK = 100;
const DEFAULT_MESSAGE = "هلا {name} 🌷 تذكير بموعد زيارتك {project}{day} الساعة {time}. بانتظارك بإذن الله، وإذا تحتاج تغيّر الموعد قل لنا.";
const SYSTEM_AUTHOR = "نظام";

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_visit_reminder_settings (
      tenant_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      hours_before INTEGER NOT NULL DEFAULT 24,
      template_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      notify_employee INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )`);
    // The visits table is owned by lib/crm-visits.ts; the reminder state rides on it.
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_visits (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '', project_name TEXT NOT NULL DEFAULT '',
      conversation_id TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL DEFAULT '', customer_phone TEXT NOT NULL DEFAULT '',
      visit_date TEXT NOT NULL, visit_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'محجوز', booked_by TEXT NOT NULL DEFAULT '',
      employee TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    // A second run finds the columns and the error is ignored.
    await prisma.$executeRawUnsafe(`ALTER TABLE crm_visits ADD COLUMN reminded_at TEXT NOT NULL DEFAULT ''`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE crm_visits ADD COLUMN reminder_tries INTEGER NOT NULL DEFAULT 0`).catch(() => undefined);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type ReminderSettings = { enabled: boolean; hoursBefore: number; templateName: string; message: string; notifyEmployee: boolean };

export async function getReminderSettings(tenantId: string): Promise<ReminderSettings> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ enabled: number; hours_before: number; template_name: string; message: string; notify_employee: number }>>`SELECT enabled, hours_before, template_name, message, notify_employee FROM crm_visit_reminder_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  return { enabled: row?.enabled === 1, hoursBefore: row?.hours_before ?? 24, templateName: row?.template_name ?? "", message: row?.message ?? "", notifyEmployee: row ? row.notify_employee === 1 : true };
}

export async function saveReminderSettings(tenantId: string, input: { enabled?: unknown; hoursBefore?: unknown; templateName?: unknown; message?: unknown; notifyEmployee?: unknown }): Promise<{ ok: true; settings: ReminderSettings } | { ok: false; error: string }> {
  const current = await getReminderSettings(tenantId);
  const hoursBefore = input.hoursBefore === undefined ? current.hoursBefore : Number(input.hoursBefore);
  if (!(REMINDER_HOURS as readonly number[]).includes(hoursBefore)) return { ok: false, error: "وقت التذكير غير صالح" };
  const templateName = input.templateName === undefined ? current.templateName : typeof input.templateName === "string" ? input.templateName.trim().slice(0, 120) : "";
  if (templateName && !(await prisma.template.findFirst({ where: { tenantId, name: templateName, status: "معتمد" }, select: { id: true } }))) return { ok: false, error: "القالب غير موجود أو غير معتمد" };
  const message = input.message === undefined ? current.message : typeof input.message === "string" ? input.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 600) : "";
  const next: ReminderSettings = {
    enabled: input.enabled === undefined ? current.enabled : input.enabled === true,
    hoursBefore, templateName, message,
    notifyEmployee: input.notifyEmployee === undefined ? current.notifyEmployee : input.notifyEmployee === true
  };
  await prisma.$executeRaw`DELETE FROM crm_visit_reminder_settings WHERE tenant_id = ${tenantId}`;
  await prisma.$executeRaw`INSERT INTO crm_visit_reminder_settings (tenant_id, enabled, hours_before, template_name, message, notify_employee, updated_at) VALUES (${tenantId}, ${next.enabled ? 1 : 0}, ${next.hoursBefore}, ${next.templateName}, ${next.message}, ${next.notifyEmployee ? 1 : 0}, ${new Date().toISOString()})`;
  return { ok: true, settings: next };
}

/** The visit's start as a real instant (visits are kept in Riyadh time, UTC+3, no daylight saving). */
export function visitInstant(date: string, time: string): number {
  return new Date(`${date}T${time}:00+03:00`).getTime();
}

const weekday = (date: string) => new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** "اليوم" / "غدًا" / the weekday, relative to Riyadh today. */
export function dayWord(date: string, now: Date): string {
  const today = todayInRiyadh(now);
  const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  return date === today ? "اليوم" : date === tomorrow ? "غدًا" : `${weekday(date)} ${date}`;
}

export function renderReminder(template: string, values: { name: string; project: string; day: string; time: string }): string {
  return (template || DEFAULT_MESSAGE)
    .replaceAll("{name}", values.name || "عميلنا")
    .replaceAll("{project}", values.project ? `لمشروع ${values.project} ` : "")
    .replaceAll("{day}", values.day)
    .replaceAll("{time}", values.time)
    .replace(/\s+/g, " ")
    .replace(/\s+([.،!])/g, "$1")
    .trim();
}

type VisitRow = { id: string; project_name: string; conversation_id: string; customer_name: string; customer_phone: string; visit_date: string; visit_time: string; employee: string; reminder_tries: number };

/** Sends the reminders that are due. Never throws for one tenant's failure; returns how many went out. */
export async function sendVisitReminders(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  await ensureTables();
  const tenants = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM crm_visit_reminder_settings WHERE enabled = 1`;
  let sent = 0;
  let failed = 0;
  const today = todayInRiyadh(now);

  for (const { tenant_id: tenantId } of tenants) {
    try {
      const settings = await getReminderSettings(tenantId);
      const horizon = now.getTime() + settings.hoursBefore * 3_600_000;
      const lastDate = new Date(horizon + 3 * 3_600_000).toISOString().slice(0, 10);
      const candidates = await prisma.$queryRaw<VisitRow[]>`SELECT id, project_name, conversation_id, customer_name, customer_phone, visit_date, visit_time, employee, reminder_tries FROM crm_visits WHERE tenant_id = ${tenantId} AND status = 'محجوز' AND reminded_at = '' AND reminder_tries < ${MAX_TRIES} AND visit_date >= ${today} AND visit_date <= ${lastDate} ORDER BY visit_date ASC, visit_time ASC LIMIT ${MAX_PER_TICK}`;
      const due = candidates.filter((visit) => {
        const at = visitInstant(visit.visit_date, visit.visit_time);
        return at > now.getTime() && at <= horizon;
      });
      if (!due.length) continue;
      const company = await getTenantCompanyName(tenantId).catch(() => "");

      for (const visit of due) {
        // Claim it first: two overlapping ticks must not both remind the same customer.
        const claimed = await prisma.$executeRaw`UPDATE crm_visits SET reminded_at = ${now.toISOString()} WHERE id = ${visit.id} AND tenant_id = ${tenantId} AND reminded_at = ''`;
        if (Number(claimed) !== 1) continue;
        const text = renderReminder(settings.message, { name: visit.customer_name, project: visit.project_name, day: dayWord(visit.visit_date, now), time: visit.visit_time });
        let delivered = false;
        try {
          // Inside the customer's 24-hour window a plain message works; outside it only an approved template can.
          if (visit.conversation_id && visit.customer_phone) {
            const result = await sendBotText("whatsapp", { tenantId, conversationId: visit.conversation_id, recipientId: visit.customer_phone, text, author: SYSTEM_AUTHOR });
            delivered = !("ok" in result) || result.ok !== false;
          }
          if (!delivered && settings.templateName && visit.customer_phone) {
            const result = await sendWhatsAppTemplate(tenantId, visit.customer_phone, settings.templateName, "ar", visit.customer_name, "", false, "", [visit.customer_name || "عميلنا", dayWord(visit.visit_date, now), visit.visit_time, visit.project_name || company || "الزيارة"]);
            delivered = result.ok;
          }
        } catch (error) {
          console.error("Visit reminder failed", error);
        }
        if (delivered) {
          sent += 1;
          if (visit.conversation_id) await recordLeadEvent({ tenantId, conversationId: visit.conversation_id, kind: "visit", text: `أُرسل تذكير الزيارة للعميل (${visit.visit_date} ${visit.visit_time})`, actor: "نظام" });
        } else {
          failed += 1;
          // Give the claim back for another try on the next tick (it stops after MAX_TRIES).
          await prisma.$executeRaw`UPDATE crm_visits SET reminded_at = '', reminder_tries = reminder_tries + 1 WHERE id = ${visit.id} AND tenant_id = ${tenantId}`;
        }

        if (settings.notifyEmployee && visit.employee) {
          const employee = await prisma.employee.findFirst({ where: { tenantId, name: visit.employee }, select: { userId: true } });
          if (employee?.userId && (delivered || visit.reminder_tries + 1 >= MAX_TRIES)) {
            await notifyUsers([employee.userId], { title: "زيارة قريبة", body: `${visit.customer_name || visit.customer_phone} · ${dayWord(visit.visit_date, now)} ${visit.visit_time}${visit.project_name ? ` · ${visit.project_name}` : ""}${delivered ? "" : " (تعذر إرسال التذكير للعميل)"}`, url: "/dashboard?view=pipeline" }).catch(() => undefined);
          }
        }
      }
    } catch (error) {
      console.error("Visit reminders failed for a tenant", error);
    }
  }
  return { sent, failed };
}
