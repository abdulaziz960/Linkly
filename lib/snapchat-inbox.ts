import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { triggerWebhookEvent } from "./webhooks";
import type { SnapchatLeadAnswer } from "./snapchat";
import { firstChar } from "./first-char";
import { questionLabel, summarizeFormAnswers } from "./lead-form";
import { getIntegrationSettings } from "./database";
import { recordFormAdSource } from "./ad-source";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { normalizeWhatsAppPhone, storeWhatsAppMessage, whatsappThreadIds } from "./whatsapp-inbox";
import { leadWhatsappNumber } from "./phone-format";

type StoreSnapchatLeadInput = {
  tenantId: string;
  adAccountId: string;
  formId: string;
  formName: string;
  leadId: string;
  answers: SnapchatLeadAnswer[];
  submittedAt?: string;
};

const NAME_KEYS = ["FULL_NAME", "FIRST_NAME", "NAME"];
const PHONE_KEYS = ["PHONE_NUMBER", "PHONE"];
const EMAIL_KEYS = ["EMAIL"];

function findAnswer(answers: SnapchatLeadAnswer[], keys: string[]) {
  const match = answers.find((answer) => keys.includes(answer.question.toUpperCase()));
  return match?.answer?.trim() || "";
}

export { questionLabel };

/** Digits with the country code: a Saudi local number (05xxxxxxxx / 5xxxxxxxx) gets 966, 00-prefixed numbers lose the 00. */
export function whatsappNumberFromForm(raw: string): string {
  let digits = normalizeWhatsAppPhone(raw);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

/** The form as readable lines (see lib/lead-form.ts). */
export function summarizeAnswers(formName: string, answers: SnapchatLeadAnswer[]) {
  return summarizeFormAnswers(`نموذج: ${formName || "بدون اسم"}`, answers.map((answer) => ({ question: answer.question || "", answer: answer.answer || "" })));
}

/**
 * The welcome template a workspace may send on WhatsApp the moment a Snapchat lead is added.
 * Never throws; the lead is already stored. Records what happened as a system note in the lead's
 * conversation, so the team can see whether the welcome went out.
 */
async function sendSnapchatWelcome(input: { tenantId: string; conversationId: string; phone: string; name: string; leadId: string; summary: string }) {
  try {
    const settings = await getIntegrationSettings("snapchat", input.tenantId);
    const template = settings.leadWelcomeTemplateName?.trim();
    if (settings.leadAdsEnabled !== 1 || !template) return;
    const phone = whatsappNumberFromForm(input.phone);
    let note: string;
    if (!phone) note = "لم تُرسل رسالة الترحيب: رقم الجوال في النموذج غير صالح لواتساب";
    else {
      const result = await sendWhatsAppTemplate(input.tenantId, phone, template, "ar", input.name);
      note = result.ok ? `أُرسلت رسالة ترحيب عبر واتساب (القالب: ${template})` : `تعذر إرسال رسالة الترحيب عبر واتساب: ${result.error}`;
      if (result.ok) {
        // Open the WhatsApp conversation with what we know, so when the customer replies the thread (and
        // the assistant, if the bot answers with AI) starts from the form answers instead of from nothing.
        await storeWhatsAppMessage({
          phone,
          name: input.name,
          text: `أُرسلت رسالة ترحيب (القالب: ${template}) بعد تعبئة العميل نموذج سناب شات.\n${input.summary}`,
          direction: "out",
          tenantId: input.tenantId,
          author: "نظام"
        }).catch((error) => console.error("Snapchat welcome conversation failed", error));
      }
    }
    const now = new Date();
    await prisma.message.create({
      data: { id: `sc-welcome-${input.leadId}`, conversationId: input.conversationId, direction: "out", text: note, time: formatMessageTime(now), createdAt: now.toISOString(), author: "نظام" }
    });
  } catch (error) {
    console.error("Snapchat lead welcome failed", error);
  }
}

export async function storeSnapchatLead(input: StoreSnapchatLeadInput) {
  await ensureSchema();
  const alreadyStored = Boolean(await prisma.lead.findUnique({ where: { id: `lead-${input.leadId}` }, select: { id: true } }));

  const activityAt = input.submittedAt ? new Date(input.submittedAt).toISOString() : new Date().toISOString();
  const tenantId = input.tenantId;
  // The name the customer typed; empty when the form has none (the welcome then says "عميلنا" instead of a placeholder).
  const formName = findAnswer(input.answers, NAME_KEYS);
  const name = formName || `عميل سناب شات ${input.leadId.slice(-4)}`;
  const phone = findAnswer(input.answers, PHONE_KEYS);
  const email = findAnswer(input.answers, EMAIL_KEYS);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  // With a usable phone the lead joins that phone's WhatsApp thread (one person, one conversation: the welcome and
  // any reply land there too). Without one it stays a conversation of its own on the Snapchat channel.
  const threadPhone = leadWhatsappNumber(phone);
  const thread = threadPhone ? whatsappThreadIds(tenantId, threadPhone) : null;
  const customerId = thread?.customerId ?? `${scopedPrefix}sc-lead-${input.leadId}`;
  const conversationId = thread?.conversationId ?? `${scopedPrefix}sc-lead-${input.leadId}`;
  const conversationChannel = thread ? "whatsapp" : "snapchat";
  const messageId = `sc-${input.leadId}`;
  const summary = summarizeAnswers(input.formName, input.answers);

  const result = await prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name, phone: threadPhone || phone, initial: firstChar(name.trim()) || "S" },
      create: { id: customerId, name, phone: threadPhone || phone, initial: firstChar(name.trim()) || "S", tenantId }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: conversationChannel,
        lastMessage: summary,
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 1,
        windowExpired: 0,
        lastActivityAt: activityAt,
        tenantId
      }
    });

    const message = await tx.message.upsert({
      where: { id: messageId },
      update: {},
      create: {
        id: messageId,
        conversationId,
        direction: "in",
        text: summary,
        time: formatMessageTime(new Date(activityAt)),
        createdAt: activityAt,
        author: "",
        sourceType: "snapchat_lead_form",
        sourceId: input.formId,
        sourceLabel: input.formName
      }
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessage: summary, unread: { increment: 1 }, windowExpired: 0, lastActivityAt: activityAt }
    });

    const lead = await tx.lead.upsert({
      where: { id: `lead-${input.leadId}` },
      update: {},
      create: {
        id: `lead-${input.leadId}`,
        tenantId,
        customerId,
        conversationId,
        source: "snapchat",
        sourceId: input.leadId,
        formId: input.formId,
        formName: input.formName,
        adAccountId: input.adAccountId,
        name,
        phone,
        email,
        answersJson: JSON.stringify(input.answers),
        createdAt: activityAt
      }
    });

    return { conversationId, message, lead };
  });

  await recordFormAdSource({ tenantId, conversationId: result.conversationId, platform: "snapchat", adId: input.formId, headline: input.formName });
  await runInboundMessageAutomations(result.conversationId, tenantId, summary);
  if (!alreadyStored) await sendSnapchatWelcome({ tenantId, conversationId: result.conversationId, phone, name: formName, leadId: input.leadId, summary });
  await triggerWebhookEvent(tenantId, "lead.created", {
    id: result.lead.id,
    source: "snapchat",
    customerId,
    conversationId: result.conversationId,
    formId: input.formId,
    formName: input.formName,
    name,
    phone,
    email,
    answers: input.answers,
    createdAt: activityAt
  });

  return result;
}
