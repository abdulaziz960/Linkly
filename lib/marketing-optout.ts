import { prisma } from "./prisma";
import { sendWhatsAppTextMessage } from "./whatsapp-send";

// Matches only an EXACT, whole-message keyword (never a substring) - an
// ordinary customer message that happens to contain "stop" must never be
// misread as an unsubscribe request. Arabic variants cover the common
// spellings customers actually type, not just a literal transliteration.
const optOutKeywords = new Set(["stop", "unsubscribe", "الغاء", "إلغاء", "ايقاف", "إيقاف", "توقف"]);
const optInKeywords = new Set(["start", "subscribe", "اشتراك", "ابدأ", "ابدا"]);

function normalize(text: string) {
  return text.trim().toLowerCase();
}

/**
 * WhatsApp marketing-message opt-out/in via the customer's own reply.
 * lib/campaign-engine.ts skips any customer with marketingOptOut set before
 * sending a campaign template - this never affects one-to-one replies from
 * the inbox, only campaign sends. Called from the Meta webhook right after
 * an inbound WhatsApp message is stored, same as runWhatsAppBot.
 */
export async function handleMarketingOptOutKeyword(input: { tenantId: string; conversationId: string; phone: string; text: string }) {
  const normalized = normalize(input.text);
  const isOptOut = optOutKeywords.has(normalized);
  const isOptIn = !isOptOut && optInKeywords.has(normalized);
  if (!isOptOut && !isOptIn) return;

  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, select: { customerId: true } });
  if (!conversation) return;

  await prisma.customer.update({
    where: { id: conversation.customerId },
    data: isOptOut
      ? { marketingOptOut: 1, marketingOptOutAt: new Date().toISOString() }
      : { marketingOptOut: 0, marketingOptOutAt: "" }
  });

  await sendWhatsAppTextMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.phone,
    text: isOptOut
      ? "تم إلغاء اشتراكك من رسائل الحملات التسويقية. أرسل START في أي وقت للاشتراك من جديد."
      : "تم تفعيل اشتراكك في رسائل الحملات التسويقية من جديد.",
    author: "Linkly"
  });
}
