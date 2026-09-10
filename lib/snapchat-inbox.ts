import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { triggerWebhookEvent } from "./webhooks";
import type { SnapchatLeadAnswer } from "./snapchat";

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

function summarizeAnswers(formName: string, answers: SnapchatLeadAnswer[]) {
  const lines = [`نموذج: ${formName || "بدون اسم"}`];
  for (const answer of answers) {
    if (!answer.question && !answer.answer) continue;
    lines.push(`${answer.question}: ${answer.answer}`);
  }
  return lines.join("\n");
}

/**
 * A Snapchat Lead Generation Ads submission isn't a chat message, so unlike
 * every other channel's storeXMessage() it doesn't create a back-and-forth
 * thread - it creates one synthetic inbound message rendering the form's
 * Q&A, plus a Lead row carrying the raw attribution (form/campaign/ad
 * account) that the Leads API and the "lead.created" webhook read from.
 * The Customer/Conversation are still created so the submission shows up
 * in the same unified inbox as every other channel.
 */
export async function storeSnapchatLead(input: StoreSnapchatLeadInput) {
  await ensureSchema();

  const activityAt = input.submittedAt ? new Date(input.submittedAt).toISOString() : new Date().toISOString();
  const tenantId = input.tenantId;
  const name = findAnswer(input.answers, NAME_KEYS) || `عميل سناب شات ${input.leadId.slice(-4)}`;
  const phone = findAnswer(input.answers, PHONE_KEYS);
  const email = findAnswer(input.answers, EMAIL_KEYS);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = `${scopedPrefix}sc-lead-${input.leadId}`;
  const conversationId = `${scopedPrefix}sc-lead-${input.leadId}`;
  const messageId = `sc-${input.leadId}`;
  const summary = summarizeAnswers(input.formName, input.answers);

  const result = await prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name, phone, initial: name.trim().charAt(0) || "S" },
      create: { id: customerId, name, phone, initial: name.trim().charAt(0) || "S", tenantId }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: "snapchat",
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

  await runInboundMessageAutomations(result.conversationId, tenantId, summary);
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
