import { paymentTaxBreakdown } from "../../../lib/vat";

/** The tax lines on the payment page: price without tax, the 15% tax, and the total that goes on the card. */
export default function PayTaxSummary({ payment }: { payment: { amount: number; amountHalalas: number; gateway?: string | null } }) {
  const tax = paymentTaxBreakdown(payment);
  const money = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
  return (
    <div className="proration-breakdown pay-tax-summary">
      <dl>
        {tax.mode === "inclusive" ? (
          <>
            <div><dt>ضريبة القيمة المضافة (15%) المشمولة</dt><dd>{money(tax.vat)}</dd></div>
            <div className="proration-final"><dt>الإجمالي المطلوب (شامل الضريبة)</dt><dd>{money(tax.total)}</dd></div>
          </>
        ) : (
          <>
            <div><dt>المبلغ قبل الضريبة</dt><dd>{money(tax.net)}</dd></div>
            <div><dt>ضريبة القيمة المضافة (15%)</dt><dd>{money(tax.vat)}</dd></div>
            <div className="proration-final"><dt>الإجمالي المطلوب</dt><dd>{money(tax.total)}</dd></div>
          </>
        )}
      </dl>
    </div>
  );
}
