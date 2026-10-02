"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** API route that applies/removes the code for this kind of payment. */
  endpoint: string;
  paymentId: string;
  appliedCode: string;
  subtotal: number;
  discountAmount: number;
  total: number;
};

/**
 * "Have a discount code?" box on the payment page itself (not on the plan
 * picker). Applying re-prices this payment on the server and refreshes the
 * page so the card form below charges the discounted amount.
 */
export default function PayPromoBox({ endpoint, paymentId, appliedCode, subtotal, discountAmount, total }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(nextCode: string) {
    setBusy(true);
    setError("");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId, code: nextCode }) }).catch(() => null);
    const payload = await response?.json().catch(() => null) as { error?: string; ok?: boolean } | null;
    setBusy(false);
    if (!response || !response.ok) {
      setError(payload?.error || "تعذر تطبيق الكود، حاول مرة أخرى");
      return;
    }
    setCode("");
    router.refresh();
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) void send(code.trim());
  }

  return (
    <div className="pay-promo">
      {appliedCode ? (
        <div className="pay-promo-applied">
          <p><b>كود الخصم: {appliedCode} ✓</b></p>
          <dl>
            <div><dt>السعر قبل الخصم</dt><dd>{subtotal.toLocaleString("en-US")} ر.س</dd></div>
            <div><dt>الخصم</dt><dd>-{discountAmount.toLocaleString("en-US")} ر.س</dd></div>
            <div className="proration-final"><dt>المبلغ المطلوب</dt><dd>{total.toLocaleString("en-US")} ر.س</dd></div>
          </dl>
          <button type="button" disabled={busy} onClick={() => void send("")}>إزالة الكود</button>
        </div>
      ) : (
        <form onSubmit={apply}>
          <label htmlFor="pay-promo-input">كود الخصم</label>
          <div>
            <input id="pay-promo-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="أدخل كود الخصم" autoComplete="off" dir="ltr" maxLength={40} />
            <button type="submit" disabled={busy || !code.trim()}>{busy ? "جاري التحقق..." : "تطبيق"}</button>
          </div>
        </form>
      )}
      {error ? <p className="billing-error" role="alert">{error}</p> : null}
    </div>
  );
}
