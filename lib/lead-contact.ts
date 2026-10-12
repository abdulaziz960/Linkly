import { prisma } from "./prisma";
import { splitName } from "./identity-hash";

export type LeadContact = { email: string; firstName: string; lastName: string };

/**
 * What we know about the person behind a conversation, for matching their events on the ad platforms:
 * the email they typed in a lead form (kept on the lead record) and their name. A name that is only the
 * phone number (no name was given) is ignored. Never throws.
 */
export async function getLeadContact(tenantId: string, conversationId: string): Promise<LeadContact> {
  const empty: LeadContact = { email: "", firstName: "", lastName: "" };
  try {
    const [lead, conversation] = await Promise.all([
      prisma.lead.findFirst({ where: { tenantId, conversationId, email: { not: "" } }, orderBy: { createdAt: "desc" }, select: { email: true, name: true } }),
      prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { customer: { select: { name: true, phone: true } } } })
    ]);
    const rawName = (lead?.name || conversation?.customer.name || "").trim();
    const isPhoneAsName = /^[\d\s+()-]+$/.test(rawName);
    const { first, last } = isPhoneAsName ? { first: "", last: "" } : splitName(rawName);
    return { email: (lead?.email || "").trim(), firstName: first, lastName: last };
  } catch {
    return empty;
  }
}
