import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { ensureSchema, getIntegrationSettings } from "./database";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";

export type ParsedRecipient = { phone: string; name: string };

export const MAX_CAMPAIGN_RECIPIENTS = 10_000;
export const MAX_CAMPAIGN_FILE_BYTES = 5 * 1024 * 1024;

const marketingMessagePrices = [
  { min: 1000, max: 5000, rate: 0.03 },
  { min: 5001, max: 10000, rate: 0.028 },
  { min: 10001, max: 25000, rate: 0.026 },
  { min: 25001, max: 50000, rate: 0.023 },
  { min: 50001, max: 100000, rate: 0.02 },
  { min: 100001, max: 150000, rate: 0.018 },
  { min: 150001, max: 250000, rate: 0.016 },
  { min: 250001, max: 500000, rate: 0.014 },
  { min: 500001, max: 1000000, rate: 0.012 }
];

/** Source of truth for pricing - never trust a client-supplied amount. */
export function calculateChargeAmount(messages: number): number | null {
  const tier = marketingMessagePrices.find((t) => messages >= t.min && messages <= t.max);
  if (!tier) return null;
  return Math.round(messages * tier.rate * 100) / 100;
}

function looksLikePhone(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 8;
}

function parseCsv(text: string): ParsedRecipient[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")))
    .filter((cells) => looksLikePhone(cells[0] || ""))
    .map((cells) => ({ phone: normalizeWhatsAppPhone(cells[0] || ""), name: cells[1] || "" }));
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

async function parseSpreadsheet(buffer: Buffer): Promise<ParsedRecipient[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: ParsedRecipient[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= MAX_CAMPAIGN_RECIPIENTS) return;
    const phone = cellText(row.getCell(1).value);
    const name = cellText(row.getCell(2).value);
    if (looksLikePhone(phone)) rows.push({ phone: normalizeWhatsAppPhone(phone), name });
  });
  return rows;
}

export async function parseRecipientFile(buffer: Buffer, filename: string): Promise<ParsedRecipient[]> {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const parsed = isCsv ? parseCsv(buffer.toString("utf-8")) : await parseSpreadsheet(buffer);

  const seen = new Set<string>();
  const deduped: ParsedRecipient[] = [];
  for (const recipient of parsed) {
    if (!recipient.phone || seen.has(recipient.phone)) continue;
    seen.add(recipient.phone);
    deduped.push(recipient);
    if (deduped.length >= MAX_CAMPAIGN_RECIPIENTS) break;
  }
  return deduped;
}

export async function getCampaignBalance(tenantId: string): Promise<number> {
  await ensureSchema();
  const row = await prisma.campaignBalance.findUnique({ where: { tenantId } });
  return row?.balance ?? 0;
}

async function adjustCampaignBalance(tenantId: string, delta: number) {
  await prisma.campaignBalance.upsert({
    where: { tenantId },
    update: { balance: { increment: delta }, updatedAt: new Date().toISOString() },
    create: { tenantId, balance: Math.max(0, delta), updatedAt: new Date().toISOString() }
  });
}

async function reserveCampaignCredit(tenantId: string) {
  const result = await prisma.campaignBalance.updateMany({
    where: { tenantId, balance: { gte: 1 } },
    data: { balance: { decrement: 1 }, updatedAt: new Date().toISOString() }
  });
  return result.count === 1;
}

/** Credits confirmed, paid balance - called from the Moyasar webhook once a payment succeeds. */
export async function creditCampaignBalance(tenantId: string, messages: number) {
  await ensureSchema();
  await adjustCampaignBalance(tenantId, messages);
}

/** Manual balance top-up from the admin panel - recorded as a completed payment so it shows in the client's own transaction history. */
export async function addManualCampaignBalance(tenantId: string, messages: number, amount: number) {
  await ensureSchema();
  const now = new Date().toISOString();
  const payment = await prisma.campaignPayment.create({
    data: {
      id: `pay-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      messages,
      amount,
      status: "مكتمل",
      moyasarId: "",
      paymentUrl: "",
      createdAt: now,
      completedAt: now
    }
  });
  await adjustCampaignBalance(tenantId, messages);
  return payment;
}

async function sendWhatsAppTemplate(tenantId: string, to: string, templateName: string, language: string, recipientName = "") {
  const settings = await getIntegrationSettings("whatsapp", tenantId);
  const phoneNumberId = settings.phoneNumberId?.trim();
  const accessToken = settings.accessToken?.trim();
  if (!phoneNumberId || !accessToken) return { ok: false as const, error: "واتساب غير مربوط لهذا الحساب" };

  const languageCode = language === "Arabic" || language === "العربية" || !language ? "ar" : language === "English" || language === "الإنجليزية" ? "en_US" : language;
  const templateRecord = await prisma.template.findFirst({ where: { tenantId, name: templateName, status: "معتمد" } });
  if (!templateRecord) return { ok: false as const, error: "قالب واتساب غير موجود أو غير معتمد" };
  const indexes = [...templateRecord.message.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const parameterCount = indexes.length ? Math.max(...indexes) : 0;
  const components = parameterCount
    ? [{
        type: "body",
        parameters: Array.from({ length: parameterCount }, () => ({ type: "text", text: recipientName.trim() || "عميلنا" }))
      }]
    : undefined;

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {})
      }
    })
  });
  const payload = await response.json().catch(() => null) as { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;

  if (!response.ok) return { ok: false as const, error: payload?.error?.message || "تعذر الإرسال عبر واتساب" };
  return { ok: true as const, messageId: payload?.messages?.[0]?.id || "" };
}

function recalcProgress(sent: number, total: number) {
  return total > 0 ? `${Math.round((sent / total) * 100)}%` : "0%";
}

/** Flips scheduled campaigns whose time has come to "قيد الإرسال" so the batch processor picks them up. */
export async function activateDueScheduledCampaigns(tenantId: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.campaign.updateMany({
    where: { tenantId, status: "مجدولة", scheduledAt: { not: "", lte: now } },
    data: { status: "قيد الإرسال" }
  });
}

/**
 * Sends a small batch of still-pending recipients across this tenant's
 * active campaigns. It is called by the protected cron endpoint and the
 * dashboard polling fallback.
 */
export async function processCampaignBatch(tenantId: string, batchSize = 5) {
  await ensureSchema();

  const activeCampaigns = await prisma.campaign.findMany({ where: { tenantId, status: "قيد الإرسال" } });
  if (!activeCampaigns.length) return;

  let remainingBudget = batchSize;

  for (const campaign of activeCampaigns) {
    if (remainingBudget <= 0) break;

    const pending = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: "قيد الإرسال" },
      take: remainingBudget
    });

    if (!pending.length) {
      const remainingCount = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "قيد الإرسال" } });
      if (remainingCount === 0) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "الحملة أنجزت", progress: recalcProgress(campaign.sent, campaign.total), updatedAt: new Date().toLocaleString("en-US") }
        });
      }
      continue;
    }

    for (const recipient of pending) {
      remainingBudget -= 1;
      const claimed = await prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, tenantId, campaignId: campaign.id, status: "قيد الإرسال" },
        data: { status: "جارٍ الإرسال" }
      });
      if (claimed.count !== 1) continue;
      const hasCredit = await reserveCampaignCredit(tenantId);
      if (!hasCredit) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "فشل الإرسال", error: "الرصيد غير كافٍ" }
        });
        continue;
      }

      let result: Awaited<ReturnType<typeof sendWhatsAppTemplate>>;
      try {
        result = await sendWhatsAppTemplate(tenantId, recipient.phone, campaign.templateName, campaign.language || "ar", recipient.name);
      } catch {
        await adjustCampaignBalance(tenantId, 1);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "فشل الإرسال", error: "تعذر الاتصال بمزود واتساب" }
        });
        continue;
      }

      if (result.ok) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "تم الإرسال", messageId: result.messageId, sentAt: new Date().toISOString(), error: "" }
        });
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { sent: { increment: 1 } }
        });
      } else {
        await adjustCampaignBalance(tenantId, 1);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "فشل الإرسال", error: result.error }
        });
      }
    }

    const updatedCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    if (updatedCampaign) {
      const stillPending = await prisma.campaignRecipient.count({
        where: { campaignId: campaign.id, status: { in: ["قيد الإرسال", "جارٍ الإرسال"] } }
      });
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          progress: recalcProgress(updatedCampaign.sent, updatedCampaign.total),
          status: stillPending === 0 ? "الحملة أنجزت" : "قيد الإرسال",
          updatedAt: new Date().toLocaleString("en-US")
        }
      });
    }
  }
}
