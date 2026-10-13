import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { ensureEmailPromotionsSchema } from "./email-promotions-schema";
import { emailHtmlToText, sanitizeEmailHtml } from "./email-html";

export const EMAIL_CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "failed", "cancelled"] as const;
export type EmailCampaignStatus = (typeof EMAIL_CAMPAIGN_STATUSES)[number];
export type EmailAudienceMode = "all" | "tag" | "status" | "channel" | "custom" | "file";

export type EmailAudienceInput = {
  mode: EmailAudienceMode;
  tagNames?: string[];
  conversationStatus?: string;
  channel?: string;
  customerIds?: string[];
  fileName?: string;
};

export type EmailRecipientTarget = {
  customerId: string;
  name: string;
  email: string;
};

type EmailCampaignCreateInput = {
  name: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  audience: EmailAudienceInput;
  scheduledAt?: string;
  sendNow?: boolean;
  saveDraft?: boolean;
  fileRecipients?: EmailRecipientTarget[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_CAMPAIGN_RECIPIENTS = 50_000;
export const MAX_EMAIL_CAMPAIGN_FILE_BYTES = 5 * 1024 * 1024;
export const EMAIL_PROMOTION_PRICE_TIERS = [
  { min: 1000, max: 1000, credits: 1000, price: 25 },
  { min: 5000, max: 5000, credits: 5000, price: 99 },
  { min: 10000, max: 10000, credits: 10000, price: 179 },
  { min: 25000, max: 25000, credits: 25000, price: 399 },
  { min: 50000, max: 50000, credits: 50000, price: 699 }
];

function nowIso() {
  return new Date().toISOString();
}

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

export function normalizeMarketingEmail(value: string) {
  const match = value.trim().match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

function parseEmailCsv(text: string): EmailRecipientTarget[] {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed: EmailRecipientTarget[] = [];
  for (const line of rows) {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const emailIndex = cells.findIndex((cell) => isValidEmail(normalizeMarketingEmail(cell)));
    if (emailIndex === -1) continue;
    const email = normalizeMarketingEmail(cells[emailIndex]);
    if (email === "email") continue;
    parsed.push({ customerId: "", email, name: cells[emailIndex === 0 ? 1 : 0] || "" });
  }
  return parsed;
}

async function parseEmailSpreadsheet(buffer: Buffer): Promise<EmailRecipientTarget[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: EmailRecipientTarget[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= MAX_EMAIL_CAMPAIGN_RECIPIENTS) return;
    const cells = [1, 2, 3, 4, 5].map((index) => cellText(row.getCell(index).value));
    const emailIndex = cells.findIndex((cell) => isValidEmail(normalizeMarketingEmail(cell)));
    if (emailIndex === -1) return;
    const email = normalizeMarketingEmail(cells[emailIndex]);
    if (email === "email") return;
    rows.push({ customerId: "", email, name: cells[emailIndex === 0 ? 1 : 0] || "" });
  });
  return rows;
}

export async function parseEmailRecipientFile(buffer: Buffer, filename: string): Promise<EmailRecipientTarget[]> {
  const lower = filename.toLowerCase();
  const parsed = lower.endsWith(".csv") ? parseEmailCsv(buffer.toString("utf-8")) : await parseEmailSpreadsheet(buffer);
  const seen = new Set<string>();
  const deduped: EmailRecipientTarget[] = [];
  for (const recipient of parsed) {
    const email = normalizeMarketingEmail(recipient.email);
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    deduped.push({ ...recipient, email });
    if (deduped.length >= MAX_EMAIL_CAMPAIGN_RECIPIENTS) break;
  }
  return deduped;
}

function stripHtml(value: string) {
  return emailHtmlToText(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function validateEmailCampaignInput(input: EmailCampaignCreateInput): string | null {
  if (!input.name.trim()) return "اسم الحملة مطلوب";
  if (input.name.trim().length > 120) return "اسم الحملة طويل جداً";
  if (!input.subject.trim()) return "عنوان البريد مطلوب";
  if (input.subject.trim().length > 160) return "عنوان البريد طويل جداً";
  if (!input.senderName.trim()) return "اسم المرسل مطلوب";
  if (!isValidEmail(input.senderEmail)) return "بريد المرسل غير صحيح";
  if (!stripHtml(input.bodyHtml).trim()) return "محتوى البريد مطلوب";
  if (input.ctaText && !input.ctaUrl) return "أدخل رابط زر الدعوة لاتخاذ إجراء";
  if (input.ctaUrl) {
    try {
      const url = new URL(input.ctaUrl);
      if (!["http:", "https:"].includes(url.protocol)) return "رابط الزر يجب أن يبدأ بـ http أو https";
    } catch {
      return "رابط الزر غير صحيح";
    }
  }
  if (!["all", "tag", "status", "channel", "custom", "file"].includes(input.audience.mode)) return "اختيار الجمهور غير صحيح";
  if (input.audience.mode === "tag" && !input.audience.tagNames?.length) return "اختر وسم واحد على الأقل";
  if (input.audience.mode === "status" && !input.audience.conversationStatus) return "اختر حالة المحادثة";
  if (input.audience.mode === "channel" && !input.audience.channel) return "اختر مصدر العميل";
  if (input.audience.mode === "custom" && !input.audience.customerIds?.length) return "اختر عملاء للحملة";
  if (input.audience.mode === "file" && !input.fileRecipients?.length) return "ارفع ملف يحتوي على إيميلات صالحة";
  if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) return "وقت الجدولة غير صحيح";
  return null;
}

export async function resolveEmailRecipients(tenantId: string, audience: EmailAudienceInput): Promise<EmailRecipientTarget[]> {
  await ensureEmailPromotionsSchema();
  const customers = await prisma.customer.findMany({
    where: { tenantId, marketingOptOut: 0 },
    include: { conversations: { include: { tags: true } } }
  });
  const optedOut = await prisma.emailMarketingOptOut.findMany({ where: { tenantId }, select: { email: true } });
  const optedOutEmails = new Set(optedOut.map((row) => row.email.toLowerCase()));
  const selectedIds = new Set(audience.customerIds || []);
  const tagNames = new Set((audience.tagNames || []).map((tag) => tag.trim()).filter(Boolean));

  const rows = customers.filter((customer) => {
    if (audience.mode === "custom") return selectedIds.has(customer.id);
    if (audience.mode === "tag") return customer.conversations.some((conversation) => conversation.tags.some((tag) => tagNames.has(tag.tagName)));
    if (audience.mode === "status") return customer.conversations.some((conversation) => conversation.status === audience.conversationStatus);
    if (audience.mode === "channel") return customer.conversations.some((conversation) => conversation.channel === audience.channel);
    return true;
  });

  const deduped = new Map<string, EmailRecipientTarget>();
  for (const customer of rows) {
    const email = normalizeMarketingEmail(customer.phone);
    if (!isValidEmail(email) || optedOutEmails.has(email)) continue;
    if (!deduped.has(email)) deduped.set(email, { customerId: customer.id, name: customer.name, email });
  }
  return Array.from(deduped.values()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function getEmailCampaignBalance(tenantId: string): Promise<number> {
  await ensureEmailPromotionsSchema();
  const row = await prisma.emailCampaignBalance.findUnique({ where: { tenantId } });
  return row?.balance ?? 0;
}

export async function creditEmailCampaignBalance(tenantId: string, credits: number) {
  await ensureEmailPromotionsSchema();
  if (!Number.isInteger(credits) || credits <= 0) throw new Error("اكتب عدد رصيد صحيح");
  const updatedAt = nowIso();
  await prisma.emailCampaignBalance.upsert({
    where: { tenantId },
    update: { balance: { increment: credits }, updatedAt },
    create: { tenantId, balance: credits, updatedAt }
  });
  return getEmailCampaignBalance(tenantId);
}

export function findEmailPromotionPriceTier(credits: number) {
  return [...EMAIL_PROMOTION_PRICE_TIERS].reverse().find((tier) => credits >= tier.credits) ?? null;
}

export function calculateEmailPromotionChargeAmount(credits: number) {
  const tier = findEmailPromotionPriceTier(credits);
  if (!tier) return 0;
  return Math.round(credits * (tier.price / tier.credits) * 100) / 100;
}

export function calculateEmailPromotionChargeAmountHalalas(credits: number) {
  return Math.round(calculateEmailPromotionChargeAmount(credits) * 100);
}

async function reserveEmailCampaignCredit(tenantId: string) {
  await ensureEmailPromotionsSchema();
  const row = await prisma.emailCampaignBalance.findUnique({ where: { tenantId } });
  if (!row || row.balance <= 0) return false;
  await prisma.emailCampaignBalance.update({ where: { tenantId }, data: { balance: { decrement: 1 }, updatedAt: nowIso() } });
  return true;
}

function recipientCounts(rows: Array<{ status: string; openCount: number; clickCount: number; unsubscribedAt: string }>) {
  return {
    sentCount: rows.filter((row) => ["sent", "delivered", "opened", "clicked", "unsubscribed"].includes(row.status)).length,
    deliveredCount: rows.filter((row) => ["delivered", "opened", "clicked", "unsubscribed"].includes(row.status)).length,
    openCount: rows.filter((row) => row.openCount > 0).length,
    clickCount: rows.filter((row) => row.clickCount > 0).length,
    bounceCount: rows.filter((row) => row.status === "bounced" || row.status === "failed").length,
    unsubscribeCount: rows.filter((row) => row.unsubscribedAt).length
  };
}

export async function syncEmailCampaignAnalytics(campaignId: string) {
  await ensureEmailPromotionsSchema();
  const rows = await prisma.emailCampaignRecipient.findMany({ where: { campaignId }, select: { status: true, openCount: true, clickCount: true, unsubscribedAt: true } });
  const counts = recipientCounts(rows);
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: counts });
  return counts;
}

export async function listEmailCampaigns(tenantId: string) {
  await ensureEmailPromotionsSchema();
  const campaigns = await prisma.emailCampaign.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    senderName: campaign.senderName,
    senderEmail: campaign.senderEmail,
    // Rows saved before sanitising existed are cleaned on the way out as well.
    bodyHtml: sanitizeEmailHtml(campaign.bodyHtml),
    ctaText: campaign.ctaText,
    ctaUrl: campaign.ctaUrl,
    audienceMode: campaign.audienceMode,
    audience: JSON.parse(campaign.audienceJson || "{}"),
    scheduledAt: campaign.scheduledAt,
    status: campaign.status,
    analytics: {
      totalRecipients: campaign.totalRecipients,
      sentCount: campaign.sentCount,
      deliveredCount: campaign.deliveredCount,
      openCount: campaign.openCount,
      clickCount: campaign.clickCount,
      bounceCount: campaign.bounceCount,
      unsubscribeCount: campaign.unsubscribeCount
    },
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt
  }));
}

export async function listEmailCampaignTransactions(tenantId: string) {
  await ensureEmailPromotionsSchema();
  const payments = await prisma.campaignPayment.findMany({
    where: { tenantId, id: { startsWith: "pay-email-" } },
    orderBy: { createdAt: "desc" },
    take: 30
  });
  return payments.map((payment) => ({
    id: payment.id,
    credits: payment.messages,
    amount: payment.amount,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    gatewayStatus: payment.gatewayStatus,
    createdAt: payment.createdAt,
    completedAt: payment.completedAt
  }));
}

export async function createEmailCampaign(tenantId: string, input: EmailCampaignCreateInput) {
  await ensureEmailPromotionsSchema();
  const error = validateEmailCampaignInput(input);
  if (error) throw new Error(error);

  const recipients = input.audience.mode === "file" ? (input.fileRecipients || []) : await resolveEmailRecipients(tenantId, input.audience);
  if (!input.saveDraft && recipients.length === 0) throw new Error("لا يوجد عملاء لديهم بريد صالح ضمن الجمهور المختار");
  const balance = await getEmailCampaignBalance(tenantId);
  if (!input.saveDraft && balance < recipients.length) throw new Error(`رصيد البريد غير كافٍ. المتاح ${balance.toLocaleString("en-US")} والمطلوب ${recipients.length.toLocaleString("en-US")}.`);

  const at = nowIso();
  const scheduledFuture = input.scheduledAt && Date.parse(input.scheduledAt) > Date.now();
  const status: EmailCampaignStatus = input.saveDraft ? "draft" : scheduledFuture && !input.sendNow ? "scheduled" : "sending";
  const id = `email-campaign-${randomUUID()}`;
  await prisma.$transaction(async (tx) => {
    await tx.emailCampaign.create({
      data: {
        id,
        tenantId,
        name: input.name.trim(),
        subject: input.subject.trim(),
        senderName: input.senderName.trim(),
        senderEmail: normalizeMarketingEmail(input.senderEmail),
        bodyHtml: sanitizeEmailHtml(input.bodyHtml).trim(),
        bodyText: stripHtml(input.bodyHtml),
        ctaText: input.ctaText?.trim() || "",
        ctaUrl: input.ctaUrl?.trim() || "",
        audienceMode: input.audience.mode,
        audienceJson: JSON.stringify(input.audience.mode === "file" ? { mode: "file", fileName: input.audience.fileName || "" } : input.audience),
        scheduledAt: status === "scheduled" ? new Date(input.scheduledAt || "").toISOString() : "",
        status,
        totalRecipients: recipients.length,
        createdAt: at,
        updatedAt: at
      }
    });
    if (recipients.length) {
      await tx.emailCampaignRecipient.createMany({
        data: recipients.map((recipient) => ({
          id: `email-recipient-${randomUUID()}`,
          campaignId: id,
          tenantId,
          customerId: recipient.customerId,
          email: recipient.email,
          name: recipient.name,
          status: "pending",
          createdAt: at
        }))
      });
    }
  });
  if (status === "sending") await processEmailCampaignBatch(tenantId, 20);
  return id;
}

export function decorateEmailHtml(campaign: { id: string; name: string; bodyHtml: string; ctaText: string; ctaUrl: string }, recipientId: string) {
  const root = baseUrl();
  const unsubscribeUrl = `${root}/api/email-promotions/unsubscribe/${encodeURIComponent(recipientId)}`;
  const openPixel = `${root}/api/email-promotions/open/${encodeURIComponent(recipientId)}`;
  const ctaHref = campaign.ctaUrl ? `${root}/api/email-promotions/click/${encodeURIComponent(recipientId)}?u=${encodeURIComponent(campaign.ctaUrl)}` : "";
  const button = campaign.ctaText && ctaHref
    ? `<p style="margin:24px 0"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#178a82;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(campaign.ctaText)}</a></p>`
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f8fafc;font-family:Arial,Tahoma,sans-serif;line-height:1.8;color:#1f2937;direction:rtl;text-align:right"><main style="max-width:680px;margin:0 auto;padding:28px 18px"><section style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 8px 24px rgba(15,23,42,.05)"><div style="direction:rtl;text-align:right">${sanitizeEmailHtml(campaign.bodyHtml)}</div>${button}<hr style="border:0;border-top:1px solid #e5e7eb;margin:26px 0"><p style="margin:0;font-size:12px;color:#64748b">تستلم هذه الرسالة لأن بريدك مسجل ضمن قائمة التواصل التسويقي لدينا. إذا لم تعد ترغب باستلام الرسائل التسويقية يمكنك <a href="${escapeHtml(unsubscribeUrl)}" style="color:#0f766e;font-weight:700">إلغاء الاشتراك</a>.</p></section></main><img src="${escapeHtml(openPixel)}" width="1" height="1" alt="" style="display:none"></body></html>`;
}

async function sendProviderEmail(input: { from: string; to: string; subject: string; html: string; text: string; idempotencyKey: string }) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}`, "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from: input.from, to: input.to, subject: input.subject, html: input.html, text: input.text })
    });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (response.ok) return payload?.id || "";
    throw new Error(payload?.message || `Resend failed (${response.status})`);
  }

  const googleScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  const googleScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim();
  if (googleScriptUrl && googleScriptSecret) {
    const response = await fetch(googleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: googleScriptSecret, to: input.to, subject: input.subject, text: input.text, html: input.html, htmlBody: input.html })
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; id?: string; error?: string } | null;
    if (response.ok && payload?.ok) return payload.id || "";
    throw new Error(payload?.error || `Google Script failed (${response.status})`);
  }

  throw new Error("لم يتم ضبط مزود بريد. أضف RESEND_API_KEY و RESEND_FROM_EMAIL أو GOOGLE_APPS_SCRIPT_URL و GOOGLE_APPS_SCRIPT_SECRET.");
}

export async function activateDueEmailCampaigns(tenantId: string) {
  await ensureEmailPromotionsSchema();
  const now = nowIso();
  await prisma.emailCampaign.updateMany({ where: { tenantId, status: "scheduled", scheduledAt: { lte: now } }, data: { status: "sending", updatedAt: now } });
}

export async function processEmailCampaignBatch(tenantId: string, batchSize = 20) {
  await ensureEmailPromotionsSchema();
  await activateDueEmailCampaigns(tenantId);
  const campaigns = await prisma.emailCampaign.findMany({ where: { tenantId, status: "sending" }, take: 3 });
  for (const campaign of campaigns) {
    const recipients = await prisma.emailCampaignRecipient.findMany({ where: { tenantId, campaignId: campaign.id, status: "pending" }, take: batchSize });
    if (!recipients.length) {
      const failed = await prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ["failed", "bounced"] } } });
      await syncEmailCampaignAnalytics(campaign.id);
      await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: failed && failed === campaign.totalRecipients ? "failed" : "sent", updatedAt: nowIso() } });
      continue;
    }
    for (const recipient of recipients) {
      const html = decorateEmailHtml(campaign, recipient.id);
      const unsubscribeUrl = `${baseUrl()}/api/email-promotions/unsubscribe/${encodeURIComponent(recipient.id)}`;
      const text = `${campaign.bodyText}\n\n${campaign.ctaText && campaign.ctaUrl ? `${campaign.ctaText}: ${campaign.ctaUrl}\n\n` : ""}إلغاء الاشتراك: ${unsubscribeUrl}`;
      const from = `${campaign.senderName} <${campaign.senderEmail}>`;
      try {
        const hasCredit = await reserveEmailCampaignCredit(tenantId);
        if (!hasCredit) {
          await prisma.emailCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "failed", error: "رصيد البريد غير كافٍ" } });
          continue;
        }
        const providerId = await sendProviderEmail({ from, to: recipient.email, subject: campaign.subject, html, text, idempotencyKey: recipient.id });
        const sentAt = nowIso();
        await prisma.emailCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "sent", providerId, sentAt, deliveredAt: sentAt } });
      } catch (error) {
        await creditEmailCampaignBalance(tenantId, 1).catch(() => undefined);
        await prisma.emailCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "send failed" } });
      }
    }
    await syncEmailCampaignAnalytics(campaign.id);
  }
}

export async function markEmailOpened(recipientId: string) {
  await ensureEmailPromotionsSchema();
  const recipient = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipientId } });
  if (!recipient) return;
  await prisma.emailCampaignRecipient.update({ where: { id: recipientId }, data: { status: recipient.status === "sent" ? "opened" : recipient.status, openedAt: recipient.openedAt || nowIso(), openCount: { increment: 1 } } });
  await syncEmailCampaignAnalytics(recipient.campaignId);
}

export async function markEmailClicked(recipientId: string) {
  await ensureEmailPromotionsSchema();
  const recipient = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipientId } });
  if (!recipient) return;
  await prisma.emailCampaignRecipient.update({ where: { id: recipientId }, data: { status: "clicked", clickedAt: recipient.clickedAt || nowIso(), clickCount: { increment: 1 } } });
  await syncEmailCampaignAnalytics(recipient.campaignId);
}

export async function unsubscribeEmailRecipient(recipientId: string) {
  await ensureEmailPromotionsSchema();
  const recipient = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipientId } });
  if (!recipient) return null;
  const createdAt = nowIso();
  await prisma.$transaction(async (tx) => {
    await tx.emailMarketingOptOut.upsert({
      where: { tenantId_email: { tenantId: recipient.tenantId, email: recipient.email } },
      update: { source: "unsubscribe" },
      create: { id: `email-optout-${randomUUID()}`, tenantId: recipient.tenantId, email: recipient.email, source: "unsubscribe", createdAt }
    });
    await tx.emailCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "unsubscribed", unsubscribedAt: recipient.unsubscribedAt || createdAt } });
  });
  await syncEmailCampaignAnalytics(recipient.campaignId);
  return recipient.email;
}
