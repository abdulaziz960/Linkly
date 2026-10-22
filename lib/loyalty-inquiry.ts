import { sendBotText } from "./bot-engine";
import { getLoyaltySettings, loyaltyStatusText, looksLikeLoyaltyQuestion } from "./loyalty";
import { prisma } from "./prisma";

/**
 * A customer asking about their loyalty ("كم بقي لي؟") gets their progress and any reward code from the bot, when the
 * workspace's loyalty program is on. Returns true when it answered (so the bot flow does not also reply).
 */
export async function handleLoyaltyInquiry(input: { tenantId: string; conversationId: string; phone: string; text: string }): Promise<boolean> {
  try {
    if (!looksLikeLoyaltyQuestion(input.text)) return false;
    const settings = await getLoyaltySettings(input.tenantId);
    if (!settings.enabled) return false;
    const customer = await prisma.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId }, select: { customer: { select: { name: true } } } });
    const text = await loyaltyStatusText(input.tenantId, input.phone, customer?.customer.name ?? "");
    await sendBotText("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, text, author: "الرد الآلي" });
    return true;
  } catch (error) {
    console.error("Loyalty inquiry failed", error);
    return false;
  }
}
