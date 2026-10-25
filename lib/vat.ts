// Value-added tax on what Linkly sells (subscriptions, message and email top-ups).
//
// Prices are shown WITHOUT tax; 15% is added when the customer pays. A payment row keeps the price without tax in `amount`
// and the total charged to the card in `amountHalalas`, so:
//   - amountHalalas > amount x 100  ->  tax was added on top of `amount`;
//   - amountHalalas = amount x 100  ->  a payment made before tax was added to the price: what was paid already includes tax,
//     and an invoice shows the tax inside that same total (net = total / 1.15) - the customer is never charged more.

export const VAT_RATE = 0.15;

/** The seller on every invoice (ZATCA VAT registration certificate, effective 2024-01-01). */
export const SELLER = {
  // The registered name and address exactly as the certificate shows them (Arabic only: it has no English form).
  name: "شركة الجمهور المخصص للدعاية والاعلان",
  vatNumber: "311643962400003",
  crNumber: "1010870212",
  address: "الرياض، الرياض، تيماء، 12541"
} as const;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The tax on a price without tax, rounded to the halala. */
export function vatOn(net: number): number {
  return round2(net * VAT_RATE);
}

/** The total to charge, in halalas, for a price without tax in riyals. */
export function grossHalalas(netSar: number): number {
  return Math.round((round2(netSar) + vatOn(netSar)) * 100);
}

/** The total to charge, in halalas, for a price without tax already in halalas (campaign / email pricing). */
export function grossHalalasFromNetHalalas(netHalalas: number): number {
  return grossHalalas(netHalalas / 100);
}

export type TaxBreakdown = {
  /** "added": tax was put on top of the price; "inclusive": tax is inside what was paid; "none": not invoiced by Linkly with tax. */
  mode: "added" | "inclusive" | "none";
  net: number;
  vat: number;
  total: number;
};

/** The tax lines of a payment, from the amounts stored on it. */
export function paymentTaxBreakdown(payment: { amount: number; amountHalalas: number; gateway?: string | null }): TaxBreakdown {
  const gateway = payment.gateway ?? "";
  // Paid through Salla / Shopify (their own invoice and tax) or credited by hand: no tax lines from us.
  if (gateway === "salla" || gateway === "shopify" || gateway === "manual") return { mode: "none", net: round2(payment.amount), vat: 0, total: round2(payment.amount) };
  const charged = payment.amountHalalas > 0 ? payment.amountHalalas : Math.round(payment.amount * 100);
  if (charged > Math.round(payment.amount * 100)) {
    const total = round2(charged / 100);
    return { mode: "added", net: round2(payment.amount), vat: round2(total - payment.amount), total };
  }
  const total = round2(charged / 100);
  const net = round2(total / (1 + VAT_RATE));
  return { mode: "inclusive", net, vat: round2(total - net), total };
}
