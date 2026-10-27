import { prisma } from "./prisma";
import { isTaxCustomer } from "./tax-customer";
import { grossHalalas, grossHalalasFromNetHalalas } from "./vat";

/**
 * Customers who already paid before VAT was added (their first completed payment is earlier than TAX_INVOICES_FROM) keep paying the
 * price as shown. Every other customer - including anyone who has not paid yet - pays the price plus 15% VAT.
 */
export async function isTaxCustomerTenant(tenantId: string): Promise<boolean> {
  const [subscription, campaign] = await Promise.all([
    prisma.subscriptionPayment.findFirst({ where: { tenantId, status: "مكتمل" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.campaignPayment.findFirst({ where: { tenantId, status: "مكتمل" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })
  ]);
  return isTaxCustomer([subscription?.createdAt ?? "", campaign?.createdAt ?? ""]);
}

/** What the card is charged, in halalas, for a price in riyals without tax. */
export async function chargeHalalas(tenantId: string, netSar: number): Promise<number> {
  return (await isTaxCustomerTenant(tenantId)) ? grossHalalas(netSar) : Math.round(netSar * 100);
}

/** The same for a price already in halalas (campaign and email top-ups). */
export async function chargeHalalasFromNetHalalas(tenantId: string, netHalalas: number): Promise<number> {
  return (await isTaxCustomerTenant(tenantId)) ? grossHalalasFromNetHalalas(netHalalas) : Math.round(netHalalas);
}
