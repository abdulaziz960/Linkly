// Tax invoices apply to customers who joined (made their first payment) on or after this date.
// A customer whose first payment is earlier keeps plain subscription invoices: no VAT lines, no registration numbers, no QR code,
// and Linkly as the seller.
export const TAX_INVOICES_FROM = "2026-10-27";

/** `createdAt` of every invoice of the customer (any status). A customer with no invoices yet is new, so tax applies. */
export function isTaxCustomer(invoiceDates: string[]): boolean {
  const dates = invoiceDates.filter(Boolean).map((value) => value.slice(0, 10)).sort();
  return dates.length === 0 || dates[0] >= TAX_INVOICES_FROM;
}
