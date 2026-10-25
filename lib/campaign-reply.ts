import { prisma } from "./prisma";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";

const REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Stamps the "replied" step of the campaign funnel on this customer's recent, not yet replied recipient rows. */
export async function markCampaignReply(tenantId: string, fromPhone: string) {
  const since = new Date(Date.now() - REPLY_WINDOW_MS).toISOString();
  const phones = [...new Set([fromPhone, normalizeWhatsAppPhone(fromPhone)].filter(Boolean))];
  await prisma.campaignRecipient.updateMany({
    where: { tenantId, phone: { in: phones }, status: "تم الإرسال", repliedAt: "", sentAt: { gte: since } },
    data: { repliedAt: new Date().toISOString() }
  });
}
