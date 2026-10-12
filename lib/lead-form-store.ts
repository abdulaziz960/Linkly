import { prisma } from "./prisma";
import { formatMessageTime } from "./time";
import { pickAnswer, summarizeFormAnswers, type FormAnswer } from "./lead-form";

/**
 * Saves what a customer typed in a lead form: one inbound message in the conversation (the answers as readable
 * lines) and a Lead row carrying the raw answers (email, budget...). Idempotent per `key`: the same submission
 * delivered twice is stored once. Never throws - the lead itself is already saved by the caller.
 */
export async function saveFormSubmission(input: {
  tenantId: string;
  conversationId: string;
  /** Unique per submission (e.g. the platform's lead id). */
  key: string;
  source: string;
  title: string;
  answers: FormAnswer[];
  name: string;
  phone: string;
  formId?: string;
  formName?: string;
  adAccountId?: string;
  campaignId?: string;
}): Promise<{ isNew: boolean; summary: string }> {
  const summary = summarizeFormAnswers(input.title, input.answers);
  try {
    const messageId = `form-${input.key}`;
    const existing = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true } });
    if (existing) return { isNew: false, summary };

    const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId }, select: { id: true, customerId: true } });
    if (!conversation) return { isNew: false, summary };

    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id: messageId,
          conversationId: conversation.id,
          direction: "in",
          text: summary,
          time: formatMessageTime(now),
          createdAt: now.toISOString(),
          author: input.name || "",
          sourceType: "lead_form",
          sourceId: input.formId || "",
          sourceLabel: input.formName || ""
        }
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage: summary, unread: { increment: 1 }, lastActivityAt: now.toISOString() }
      }),
      prisma.lead.upsert({
        where: { id: `lead-${input.key}` },
        update: {},
        create: {
          id: `lead-${input.key}`,
          tenantId: input.tenantId,
          customerId: conversation.customerId,
          conversationId: conversation.id,
          source: input.source,
          sourceId: input.key,
          formId: input.formId || "",
          formName: input.formName || "",
          campaignId: input.campaignId || "",
          adAccountId: input.adAccountId || "",
          name: input.name,
          phone: input.phone,
          email: pickAnswer(input.answers, ["EMAIL"]),
          answersJson: JSON.stringify(input.answers),
          createdAt: now.toISOString()
        }
      })
    ]);
    return { isNew: true, summary };
  } catch (error) {
    console.error("Saving the form submission failed", error);
    return { isNew: false, summary };
  }
}
