"use client";
import { useState } from "react";
import { ANNUAL_DISCOUNT_PERCENT, computeYearlyPrice } from "../../lib/billing-pricing";
import { planFeatures, getPlanDisplayItems } from "../../lib/plan-features";
import { useBillingCycle } from "../useBillingCycle";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number; allowedChannels: string; messageQuota: number };

const copy = {
  ar: {
    recommended: "الأنسب لمعظم الفرق",
    currentPlanBadge: "الباقة الحالية",
    monthlyTab: "شهري",
    yearlyTab: "سنوي",
    yearlySave: `وفر ${ANNUAL_DISCOUNT_PERCENT}٪`,
    perMonth: "ر.س / شهريًا",
    perYear: "ر.س / سنويًا",
    billedYearly: (total: number) => `تُدفع دفعة واحدة بقيمة ${total} ر.س سنويًا`,
    preparingPayment: "جاري تجهيز الدفع...",
    renewPlan: "تجديد هذه الباقة",
    upgradePlan: "ترقية الباقة",
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
    sar: "ر.س"
  },
  en: {
    recommended: "Best for most teams",
    currentPlanBadge: "Current plan",
    monthlyTab: "Monthly",
    yearlyTab: "Yearly",
    yearlySave: `Save ${ANNUAL_DISCOUNT_PERCENT}%`,
    perMonth: "SAR / month",
    perYear: "SAR / year",
    billedYearly: (total: number) => `Billed once as ${total} SAR / year`,
    preparingPayment: "Preparing payment...",
    renewPlan: "Renew this plan",
    upgradePlan: "Upgrade plan",
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
    sar: "SAR"
  }
} as const;

export default function BillingClient({ plans, currentPlan, lang = "ar", isTestMode }: { plans: Plan[]; currentPlan: string; lang?: "ar" | "en"; isTestMode: boolean }) {
  const text = copy[lang];
  const [loading, setLoading] = useState(""); const [error, setError] = useState("");
  const { billingCycle, chooseBillingCycle } = useBillingCycle();
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
      body: JSON.stringify({ planId, billingCycle, promoCode: appliedPromo && appliedPromo.planId === planId ? appliedPromo.code : undefined })
    });
    const payload = await response.json().catch(() => ({})) as { paymentId?: string; paymentUrl?: string; error?: string };
    if (!response.ok || (!payload.paymentId && !payload.paymentUrl)) { setLoading(""); setError(payload.error || text.genericError); return; }
    location.href = payload.paymentId ? `/billing/pay/${payload.paymentId}` : payload.paymentUrl!;
  }

  return <section>
    <div className="billing-cycle-toggle" role="tablist">
      <button type="button" role="tab" aria-selected={billingCycle === "شهري"} className={billingCycle === "شهري" ? "active" : ""} onClick={() => chooseBillingCycle("شهري")}>{text.monthlyTab}</button>
      <button type="button" role="tab" aria-selected={billingCycle === "سنوي"} className={billingCycle === "سنوي" ? "active" : ""} onClick={() => chooseBillingCycle("سنوي")}>{text.yearlyTab}<span className="billing-cycle-badge">{text.yearlySave}</span></button>
    </div>
    <div className="plan-grid">{plans.map((plan) => {
      const yearly = computeYearlyPrice(plan.monthlyPrice);
      const displayedPrice = billingCycle === "سنوي" ? yearly : plan.monthlyPrice;
      const items = getPlanDisplayItems(plan, lang);
      const featured = Boolean(planFeatures[plan.name]?.featured);
      const isCurrent = currentPlan === plan.name;
      return <article className={`plan-card ${featured ? "featured" : ""}`} key={plan.id}>
        {isCurrent ? <span className="current-badge">{text.currentPlanBadge}</span> : featured ? <span className="recommended">{text.recommended}</span> : null}
        <h2>{plan.name}</h2>
        <div className="plan-price"><b>{displayedPrice}</b><span>{billingCycle === "سنوي" ? text.perYear : text.perMonth}</span></div>
        {billingCycle === "سنوي" ? <p className="plan-price-note">{text.billedYearly(yearly)}</p> : null}
        <ul>{items.map((item) => <li key={item}>✓ {item}</li>)}</ul>

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

        <button disabled={loading !== ""} onClick={() => checkout(plan.id)}>{loading === plan.id ? text.preparingPayment : isCurrent ? text.renewPlan : text.upgradePlan}</button>
      </article>;
    })}</div>
    {error ? <p className="billing-error">{error}</p> : null}
    {isTestMode ? <p className="payment-note">{text.paymentNote}</p> : null}
  </section>;
}
