"use client";
import { useState } from "react";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number };

const copy = {
  ar: {
    recommended: "الأكثر اختيارًا",
    perMonth: "ر.س / شهريًا",
    upToUsers: (limit: number) => `✓ حتى ${limit} مستخدم`,
    sharedInbox: "✓ صندوق وارد موحّد",
    automation: "✓ أتمتة وتقارير",
    support: "✓ دعم فني",
    preparingPayment: "جاري تجهيز الدفع...",
    renewPlan: "تجديد هذه الباقة",
    choosePlan: "اختيار الباقة",
    genericError: "تعذر بدء الدفع",
    paymentNote: "🔒 الدفع الحقيقي يتم على صفحة Moyasar الآمنة. في وضع الاختبار تظهر محاكاة دفع ولن يُخصم أي مبلغ.",
    promoLabel: "كود الخصم",
    promoPlaceholder: "أدخل كود الخصم",
    promoApply: "تطبيق",
    promoApplying: "جاري التحقق...",
    promoRemove: "إزالة الكود",
    promoAppliedPrefix: "كود الخصم",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    total: "الإجمالي",
    sar: "ر.س",
    choosePlanFirst: "اختر باقة أولاً"
  },
  en: {
    recommended: "Most popular",
    perMonth: "SAR / month",
    upToUsers: (limit: number) => `✓ Up to ${limit} users`,
    sharedInbox: "✓ Shared inbox",
    automation: "✓ Automation and reports",
    support: "✓ Technical support",
    preparingPayment: "Preparing payment...",
    renewPlan: "Renew this plan",
    choosePlan: "Choose plan",
    genericError: "Could not start the payment",
    paymentNote: "🔒 Real payments happen on Moyasar's secure page. In test mode a simulated payment is shown and nothing is charged.",
    promoLabel: "Promo code",
    promoPlaceholder: "Enter discount code",
    promoApply: "Apply",
    promoApplying: "Checking...",
    promoRemove: "Remove code",
    promoAppliedPrefix: "Promo code",
    subtotal: "Subtotal",
    discount: "Discount",
    total: "Total",
    sar: "SAR",
    choosePlanFirst: "Choose a plan first"
  }
} as const;

export default function BillingClient({ plans, currentPlan, lang = "ar", isTestMode }: { plans: Plan[]; currentPlan: string; lang?: "ar" | "en"; isTestMode: boolean }) {
  const text = copy[lang];
  const [loading, setLoading] = useState(""); const [error, setError] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoTargetPlanId, setPromoTargetPlanId] = useState("");
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; planId: string; subtotal: number; discountAmount: number; finalAmount: number } | null>(null);

  async function applyPromoCode(planId: string) {
    if (!promoInput.trim()) return;
    setPromoApplying(true);
    setPromoError("");
    const response = await fetch("/api/billing/promo-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, code: promoInput })
    });
    const payload = await response.json().catch(() => ({})) as { code?: string; subtotal?: number; discountAmount?: number; finalAmount?: number; error?: string };
    setPromoApplying(false);
    if (!response.ok || payload.discountAmount === undefined) {
      setPromoError(payload.error || text.genericError);
      setAppliedPromo(null);
      return;
    }
    setAppliedPromo({ code: payload.code || promoInput.toUpperCase(), planId, subtotal: payload.subtotal || 0, discountAmount: payload.discountAmount, finalAmount: payload.finalAmount || 0 });
  }

  function removePromoCode() {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError("");
  }

  async function checkout(planId: string) {
    setLoading(planId); setError("");
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, promoCode: appliedPromo && appliedPromo.planId === planId ? appliedPromo.code : undefined })
    });
    const payload = await response.json().catch(() => ({})) as { paymentId?: string; paymentUrl?: string; error?: string };
    if (!response.ok || (!payload.paymentId && !payload.paymentUrl)) { setLoading(""); setError(payload.error || text.genericError); return; }
    location.href = payload.paymentId ? `/billing/pay/${payload.paymentId}` : payload.paymentUrl!;
  }

  return <section>
    <div className="plan-grid">
      {plans.map((plan, index) => <article className={`plan-card ${index === 1 ? "featured" : ""}`} key={plan.id}>
        {index === 1 ? <span className="recommended">{text.recommended}</span> : null}
        <h2>{plan.name}</h2>
        <div className="plan-price"><b>{plan.monthlyPrice}</b><span>{text.perMonth}</span></div>
        <ul>
          <li>{text.upToUsers(plan.employeeLimit)}</li>
          <li>{text.sharedInbox}</li>
          <li>{text.automation}</li>
          <li>{text.support}</li>
        </ul>

        {promoTargetPlanId === plan.id ? (
          <div className="promo-code-box">
            {appliedPromo && appliedPromo.planId === plan.id ? (
              <>
                <p className="promo-code-applied">{text.promoAppliedPrefix}: {appliedPromo.code} ✓</p>
                <p>{text.subtotal}: {appliedPromo.subtotal} {text.sar}</p>
                <p>{text.discount}: -{appliedPromo.discountAmount} {text.sar}</p>
                <p><b>{text.total}: {appliedPromo.finalAmount} {text.sar}</b></p>
                <button type="button" onClick={removePromoCode}>{text.promoRemove}</button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value)}
                  placeholder={text.promoPlaceholder}
                  dir="ltr"
                />
                <button type="button" disabled={promoApplying} onClick={() => applyPromoCode(plan.id)}>
                  {promoApplying ? text.promoApplying : text.promoApply}
                </button>
                {promoError ? <p className="billing-error">{promoError}</p> : null}
              </>
            )}
          </div>
        ) : (
          <button type="button" className="promo-code-toggle" onClick={() => setPromoTargetPlanId(plan.id)}>
            {text.promoLabel}
          </button>
        )}

        <button disabled={loading !== ""} onClick={() => checkout(plan.id)}>
          {loading === plan.id ? text.preparingPayment : currentPlan === plan.name ? text.renewPlan : text.choosePlan}
        </button>
      </article>)}
    </div>
    {error ? <p className="billing-error">{error}</p> : null}
    {isTestMode ? <p className="payment-note">{text.paymentNote}</p> : null}
  </section>;
}
