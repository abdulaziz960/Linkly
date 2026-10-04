"use client";
import { useState } from "react";
import { BILLING_CYCLES, isSamePlanRenewalTooEarly, priceForCycle } from "../../lib/billing-pricing";
import { perMonthPrice, cycleBilledNote, cyclePriceSuffix, cycleSaveBadge, cycleTabLabel } from "../../lib/billing-cycle-copy";
import { planFeatures, getPlanDisplayItems } from "../../lib/plan-features";
import { useBillingCycle } from "../useBillingCycle";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number; allowedChannels: string; messageQuota: number };

const copy = {
  ar: {
    recommended: "الأنسب لمعظم الفرق",
    currentPlanBadge: "الباقة الحالية",
    preparingPayment: "جاري تجهيز الدفع...",
    renewPlan: "تجديد هذه الباقة",
    activeUntil: (date: string) => `باقتك سارية حتى ${date}`,
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
    preparingPayment: "Preparing payment...",
    renewPlan: "Renew this plan",
    activeUntil: (date: string) => `Your plan is active until ${date}`,
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

export default function BillingClient({ plans, currentPlan, currentSubscription = null, lang = "ar", isTestMode }: { plans: Plan[]; currentPlan: string; currentSubscription?: { plan?: string; status?: string; renewalAt?: string; billingCycle?: string } | null; lang?: "ar" | "en"; isTestMode: boolean }) {
  const text = copy[lang];
  const [loading, setLoading] = useState(""); const [error, setError] = useState("");
  const { billingCycle, chooseBillingCycle } = useBillingCycle();
  // Discount codes are entered on the payment page itself (app/billing/pay), not here.

  async function checkout(planId: string) {
    setLoading(planId); setError("");
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, billingCycle })
    });
    const payload = await response.json().catch(() => ({})) as { paymentId?: string; paymentUrl?: string; error?: string };
    if (!response.ok || (!payload.paymentId && !payload.paymentUrl)) { setLoading(""); setError(payload.error || text.genericError); return; }
    location.href = payload.paymentId ? `/billing/pay/${payload.paymentId}` : payload.paymentUrl!;
  }

  return <section>
    <div className="billing-cycle-toggle" role="tablist">
      {BILLING_CYCLES.map((cycle) => {
        const badge = cycleSaveBadge(cycle, lang);
        return <button type="button" role="tab" key={cycle} aria-selected={billingCycle === cycle} className={billingCycle === cycle ? "active" : ""} onClick={() => chooseBillingCycle(cycle)}>{cycleTabLabel(cycle, lang)}{badge ? <span className="billing-cycle-badge">{badge}</span> : null}</button>;
      })}
    </div>
    <div className="plan-grid">{plans.map((plan) => {
      const cycleTotal = priceForCycle(plan.monthlyPrice, billingCycle);
      const displayedPrice = perMonthPrice(cycleTotal, billingCycle);
      const items = getPlanDisplayItems(plan, lang);
      const featured = Boolean(planFeatures[plan.name]?.featured);
      const isCurrent = currentPlan === plan.name;
      const renewalTooEarly = isCurrent && isSamePlanRenewalTooEarly(currentSubscription, plan.name, billingCycle);
      return <article className={`plan-card ${featured ? "featured" : ""}`} key={plan.id}>
        {isCurrent ? <span className="current-badge">{text.currentPlanBadge}</span> : featured ? <span className="recommended">{text.recommended}</span> : null}
        <h2>{plan.name}</h2>
        <div className="plan-price"><b>{displayedPrice}</b><span>{lang === "ar" ? "ر.س" : "SAR"} {cyclePriceSuffix(billingCycle, lang)}</span></div>
        {billingCycle !== "شهري" ? <p className="plan-price-note">{cycleBilledNote(billingCycle, cycleTotal, lang)}</p> : null}
        <ul>{items.map((item) => <li key={item}>✓ {item}</li>)}</ul>

        <button disabled={loading !== "" || renewalTooEarly} onClick={() => checkout(plan.id)}>{loading === plan.id ? text.preparingPayment : renewalTooEarly ? text.activeUntil(currentSubscription?.renewalAt || "") : isCurrent ? text.renewPlan : text.upgradePlan}</button>
      </article>;
    })}</div>
    {error ? <p className="billing-error">{error}</p> : null}
    {isTestMode ? <p className="payment-note">{text.paymentNote}</p> : null}
  </section>;
}
