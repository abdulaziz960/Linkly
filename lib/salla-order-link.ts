import { sendBotText } from "./bot-engine";
import { prisma } from "./prisma";

export type OrderLinkResult = { sent: boolean; reason: "" | "no-conversation" | "window-expired" | "failed" };

/** The text sent with a new order's payment link. */
export function orderLinkText(input: { name: string; reference: string; url: string }): string {
  const name = input.name.trim() || "عميلنا";
  return `أهلًا ${name}، تم إنشاء طلبك رقم ${input.reference}. أكمل الدفع من الرابط التالي: ${input.url}`;
}

/**
 * Sends the order's payment link on WhatsApp to the customer's existing conversation. A free-text message
 * only reaches the customer inside WhatsApp's 24h window, so without a recent conversation the caller falls back to copying the link.
 */
export async function sendOrderLinkOnWhatsApp(input: { tenantId: string; phone: string; text: string; author: string }): Promise<OrderLinkResult> {
  const last9 = input.phone.replace(/\D/g, "").slice(-9);
  if (last9.length < 9) return { sent: false, reason: "no-conversation" };
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId: input.tenantId, channel: "whatsapp", customer: { phone: { endsWith: last9 } } },
    orderBy: { lastActivityAt: "desc" },
    include: { customer: { select: { phone: true } } }
  });
  if (!conversation) return { sent: false, reason: "no-conversation" };
  try {
    const result = await sendBotText("whatsapp", { tenantId: input.tenantId, conversationId: conversation.id, recipientId: conversation.customer.phone, text: input.text, author: input.author });
    const outcome = result as { ok?: boolean; skipped?: boolean; error?: string } | undefined;
    if (outcome?.skipped || outcome?.error === "WHATSAPP_WINDOW_EXPIRED") return { sent: false, reason: "window-expired" };
    return outcome && outcome.ok === false ? { sent: false, reason: "failed" } : { sent: true, reason: "" };
  } catch (error) {
    console.error("Order link WhatsApp send failed", error);
    return { sent: false, reason: "failed" };
  }
}
