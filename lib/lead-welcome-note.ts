import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { formatMessageTime } from "./time";
import type { WelcomeReport } from "./lead-welcome";

/**
 * The internal note left in a lead's chat when its WhatsApp welcome did not go out, so the employee knows why
 * the customer got nothing (and can message them) instead of the failure being silent. "sent" and "off" (the
 * owner never turned the welcome on) leave no note.
 */
export function welcomeNote(report: WelcomeReport): string {
  switch (report.outcome) {
    case "failed":
      return `لم تُرسل رسالة الترحيب للعميل: ${report.error || "تعذر الإرسال عبر واتساب"}. تأكد من ربط واتساب ومن أن القالب معتمد من ميتا، أو راسل العميل مباشرة.`;
    case "already-welcomed":
      return "لم تُرسل رسالة ترحيب جديدة لأن هذا الرقم استلم ترحيبًا من قبل (يُرسل الترحيب مرة واحدة لكل رقم).";
    case "bad-phone":
      return "لم تُرسل رسالة الترحيب لأن رقم العميل غير صالح لواتساب.";
    case "no-template":
      return "لم تُرسل رسالة الترحيب لأنه لم يُحدد لها قالب في الإعدادات.";
    default:
      return "";
  }
}

export async function addConversationNote(conversationId: string, text: string) {
  const now = new Date();
  await prisma.message.create({
    data: {
      id: `lead-welcome-note-${randomUUID()}`,
      conversationId,
      direction: "note",
      text,
      time: formatMessageTime(now),
      createdAt: now.toISOString(),
      author: "",
      sourceType: "lead_welcome_note"
    }
  }).catch((error) => console.error("Lead welcome note failed", error));
}
