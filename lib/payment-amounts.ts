import { VAT_RATE, paymentTaxBreakdown } from "./vat";

/**
 * What the admin payments screen shows for one payment: the total the client actually paid (tax included), the tax inside it,
 * and the net (revenue without tax). Invoices use paymentTaxBreakdown directly; this only adds the manual/quote cases.
 */
export type PaymentAmounts = { total: number; vat: number; net: number };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function paymentAmounts(payment: { amount: number; amountHalalas?: number | null; gateway?: string | null; metadataJson?: string | null }): PaymentAmounts {
  const gateway = payment.gateway ?? "";
  if (gateway === "manual") {
    let meta: { kind?: string; netSar?: number } = {};
    try { meta = JSON.parse(payment.metadataJson || "{}") ?? {}; } catch { meta = {}; }
    const total = round2(payment.amount);
    // A quote or a confirmed bank transfer is recorded with the total in `amount`; tax is inside it. Credited by hand (no kind): no tax.
    if (meta.kind === "quote" || meta.kind === "manual") {
      const net = typeof meta.netSar === "number" && meta.netSar > 0 && meta.netSar <= total ? round2(meta.netSar) : round2(total / (1 + VAT_RATE));
      return { total, vat: round2(total - net), net };
    }
    return { total, vat: 0, net: total };
  }
  const tax = paymentTaxBreakdown({ amount: payment.amount, amountHalalas: payment.amountHalalas ?? 0, gateway });
  return { total: tax.total, vat: tax.vat, net: tax.net };
}
