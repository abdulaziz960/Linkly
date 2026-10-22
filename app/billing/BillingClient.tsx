"use client";
import { useState } from "react";
import { planDisplayName } from "../../lib/plan-features";
import { SELLABLE_BILLING_CYCLES, isSamePlanRenewalTooEarly, priceForCycle } from "../../lib/billing-pricing";
import { cycleSavings, cycleSavingsLabel, formatPrice, perMonthPrice, cycleBilledNote, cyclePriceSuffix, cycleSaveBadge, cycleTabLabel } from "../../lib/billing-cycle-copy";
import { planFeatures, getPlanDisplayItems } from "../../lib/plan-features";
import { useBillingCycle } from "../useBillingCycle";
import { formatUsd, shopifyPriceForCycle } from "../../lib/shopify-pricing";
import { CYCLE_MONTHS } from "../../lib/billing-pricing";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number; allowedChannels: string; messageQuota: number };

const copy = {
  ar: {
    recommended: "الأنسب لمعظم الفرق",
    currentPlanBadge: "الباقة الحالية",
    preparingPayment: "جاري تجهيز الدفع...",
    renewPlan: "تجديد هذه الباقة",
    activeUntil: (date: string) => `باقتك سارية حتى ${date}`,
    upgradePlan: "ترقية الباقة",
    subscribePlan: "اشترك",
    genericError: "تعذر بدء الدفع",
    paymentNote: "🔒 الدفع الحقيقي يتم على صفحة Moyasar الآمنة. في وضع الاختبار تظهر محاكاة دفع ولن يُخصم أي مبلغ.",
    shopifyNote: "يُضاف الاشتراك إلى فاتورة متجرك في شوبيفاي، وتوافق عليه من صفحة شوبيفاي. يتجدد تلقائيًا ويمكنك إلغاؤه في أي وقت.",
    shopifyUnavailable: "غير متاحة عبر شوبيفاي بعد",
    shopifyYearly: (total: string) => `الإجمالي ${total} · يُدفع سنويًا عبر شوبيفاي`,
    save: (amount: string) => `وفر ${amount}`,
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
    subscribePlan: "Subscribe",
    genericError: "Could not start the payment",
    paymentNote: "🔒 Real payments happen on Moyasar's secure page. In test mode a simulated payment is shown and nothing is charged.",
    shopifyNote: "The subscription is added to your Shopify bill and you approve it on Shopify's page. It renews automatically and you can cancel any time.",
    shopifyUnavailable: "Not available through Shopify yet",
    shopifyYearly: (total: string) => `${total} total · billed yearly through Shopify`,
    save: (amount: string) => `Save ${amount}`,
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

export default function BillingClient({ plans, currentPlan, currentSubscription = null, lang = "ar", isTestMode, shopifyPrices = null }: { plans: Plan[]; currentPlan: string; currentSubscription?: { plan?: string; status?: string; renewalAt?: string; billingCycle?: string } | null; lang?: "ar" | "en"; isTestMode: boolean; shopifyPrices?: Record<string, number> | null }) {
  const text = copy[lang];
  // A trial has nothing to upgrade or renew: every plan is a first subscription.
  const onTrial = currentSubscription?.status === "تجربة";
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
      {SELLABLE_BILLING_CYCLES.map((cycle) => {
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
      // Shopify-billed workspaces see and pay the plan's US-dollar price (set per plan in the admin).
      const monthlyUsd = shopifyPrices ? shopifyPrices[plan.id] || 0 : 0;
      const usdTotal = shopifyPrices ? shopifyPriceForCycle(monthlyUsd, billingCycle) : 0;
      const usdSavings = shopifyPrices ? Math.round((monthlyUsd * CYCLE_MONTHS[billingCycle] - usdTotal) * 100) / 100 : 0;
      const unavailable = Boolean(shopifyPrices) && monthlyUsd <= 0;
      return <article className={`plan-card ${featured ? "featured" : ""}`} key={plan.id}>
        {shopifyPrices
          ? (billingCycle !== "شهري" && usdSavings > 0 ? <span className="plan-ribbon">{text.save(formatUsd(usdSavings))}</span> : null)
          : (billingCycle !== "شهري" && cycleSavings(plan.monthlyPrice, cycleTotal, billingCycle) > 0 ? <span className="plan-ribbon">{cycleSavingsLabel(cycleSavings(plan.monthlyPrice, cycleTotal, billingCycle), lang)}</span> : null)}
        {isCurrent ? <span className="current-badge">{text.currentPlanBadge}</span> : featured ? <span className="recommended">{text.recommended}</span> : null}
        <h2>{planDisplayName(plan.name, lang)}</h2>
        {shopifyPrices ? <>
          <div className="plan-price"><b>{unavailable ? "—" : formatUsd(Math.round((usdTotal / CYCLE_MONTHS[billingCycle]) * 100) / 100)}</b><span>{cyclePriceSuffix(billingCycle, lang)}</span></div>
          {billingCycle !== "شهري" && !unavailable ? <p className="plan-price-note">{text.shopifyYearly(formatUsd(usdTotal))}</p> : null}
        </> : <>
          <div className="plan-price"><b>{formatPrice(displayedPrice)}</b><span>{lang === "ar" ? "ر.س" : "SAR"} {cyclePriceSuffix(billingCycle, lang)}</span></div>
          {billingCycle !== "شهري" ? <p className="plan-price-note">{cycleBilledNote(billingCycle, cycleTotal, lang)}</p> : null}
        </>}
        <ul>{items.map((item) => <li key={item}>✓ {item}</li>)}</ul>

        <button disabled={loading !== "" || renewalTooEarly || unavailable} onClick={() => checkout(plan.id)}>{unavailable ? text.shopifyUnavailable : loading === plan.id ? text.preparingPayment : renewalTooEarly ? text.activeUntil(currentSubscription?.renewalAt || "") : isCurrent && !onTrial ? text.renewPlan : onTrial ? text.subscribePlan : text.upgradePlan}</button>
      </article>;
    })}</div>
    {error ? <p className="billing-error">{error}</p> : null}
    {shopifyPrices ? <p className="payment-note">{text.shopifyNote}</p> : isTestMode ? <p className="payment-note">{text.paymentNote}</p> : null}
  </section>;
}
