import { prisma } from "./prisma";
import { formatMessageTime } from "./time";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { sendTelegramTextMessage } from "./telegram-send";
import { sendInstagramTextMessage } from "./instagram-send";
import { sendFacebookTextMessage } from "./facebook-send";
import { sendXTextMessage } from "./x-send";
import { sendWebsiteTextMessage } from "./website-send";
import { sendEmailMessage } from "./email-channel";
import { sendUnifonicSms } from "./sms-send";
import { getIntegrationSettings } from "./database";

const OFF_HOURS_AUTHOR = "رد آلي - خارج أوقات الدوام";
const DEFAULT_OFF_HOURS_MESSAGE =
  "شكرًا لتواصلك معنا. فريقنا غير متوفر حاليًا خارج أوقات الدوام الرسمية، وسنرد على رسالتك في أقرب وقت ضمن ساعات العمل.";

const businessDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const weekdayMap: Record<string, string> = {
  Sunday: "الأحد",
  Monday: "الإثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
  Saturday: "السبت"
};

function parseScheduleDays(days: string): string[] {
  const trimmed = days.trim();
  if (!trimmed) return [];
  if (trimmed === "الأحد - الخميس") return businessDays;

  return trimmed
    .split(/[،,]/)
    .map((day) => day.trim())
    .filter(Boolean);
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function nowInRiyadh() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const weekdayEn = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");

  return { weekday: weekdayMap[weekdayEn] || "", minutes: hour * 60 + minute };
}

function todayKeyInRiyadh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

/**
 * A tenant with zero active schedules has no configured hours, so we treat
 * it as always open rather than silently blocking every conversation.
 */
export async function isWithinWorkHours(tenantId: string): Promise<boolean> {
  const schedules = await prisma.workSchedule.findMany({ where: { tenantId, status: "نشط" } });
  if (!schedules.length) return true;

  const { weekday, minutes } = nowInRiyadh();

  return schedules.some((schedule) => {
    const days = parseScheduleDays(schedule.days);
    if (!days.includes(weekday)) return false;

    const start = minutesFromTime(schedule.start);
    const end = minutesFromTime(schedule.end);
    if (start === null || end === null || end <= start) return false;

    return minutes >= start && minutes < end;
  });
}

async function sendOffHoursText(channel: string, tenantId: string, conversationId: string, recipientId: string, text: string) {
  const base = { tenantId, conversationId, text, author: OFF_HOURS_AUTHOR };

  if (channel === "whatsapp") return sendWhatsAppTextMessage({ ...base, to: recipientId });
  if (channel === "telegram") return sendTelegramTextMessage({ ...base, chatId: recipientId });
  if (channel === "instagram") return sendInstagramTextMessage({ ...base, recipientId });
  if (channel === "facebook") return sendFacebookTextMessage({ ...base, recipientId });
  if (channel === "x") return sendXTextMessage({ ...base, recipientId });
  if (channel === "website") return sendWebsiteTextMessage({ conversationId, text, author: OFF_HOURS_AUTHOR });

  if (channel === "email") {
    await sendEmailMessage(recipientId, text, "رد تلقائي - خارج أوقات الدوام", tenantId);
    await prisma.message.create({
      data: { id: `off-hours-${Date.now()}`, conversationId, direction: "out", text, time: formatMessageTime(), createdAt: new Date().toISOString(), author: OFF_HOURS_AUTHOR }
    });
    return { ok: true };
  }

  if (channel === "sms") {
    const settings = await getIntegrationSettings("sms", tenantId);
    const appSid = settings.appId?.trim();
    const senderId = settings.phoneNumber?.trim();
    if (!appSid || !senderId || !recipientId) return { ok: false, skipped: true };
    await sendUnifonicSms({ appSid, senderId, to: recipientId, text });
    await prisma.message.create({
      data: { id: `off-hours-${Date.now()}`, conversationId, direction: "out", text, time: formatMessageTime(), createdAt: new Date().toISOString(), author: OFF_HOURS_AUTHOR }
    });
    return { ok: true };
  }

  return { ok: false, skipped: true };
}

/**
 * Sends at most one automatic "we're closed" reply per conversation per day
 * when a customer message arrives outside every active work schedule for
 * the tenant. No-ops silently for channels we can't reply on (Google Maps,
 * TikTok) or tenants that haven't configured any schedule.
 */
export async function checkOffHoursAutoReply(conversationId: string, tenantId: string) {
  try {
    const configuredRule = await prisma.automationRule.findFirst({
      where: { tenantId, id: "auto-business-hours" },
      select: { enabled: true }
    });
    if (configuredRule?.enabled === 0) return;

    const hasActiveSchedule = await prisma.workSchedule.count({ where: { tenantId, status: "نشط" } });
    if (!hasActiveSchedule) return;

    if (await isWithinWorkHours(tenantId)) return;

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { customer: true } });
    if (!conversation) return;
    const todayKey = todayKeyInRiyadh();
    if (conversation.offHoursNotifiedAt === todayKey) return;

    const result = await sendOffHoursText(conversation.channel, tenantId, conversationId, conversation.customer.phone, DEFAULT_OFF_HOURS_MESSAGE);
    if (!result || result.ok === false) return;

    await prisma.conversation.update({ where: { id: conversationId }, data: { offHoursNotifiedAt: todayKey } });
  } catch (error) {
    console.error(`Off-hours auto-reply failed for conversation ${conversationId}`, error);
  }
}
