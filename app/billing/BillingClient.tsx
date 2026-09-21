"use client";
import { useState } from "react";
import { ANNUAL_DISCOUNT_PERCENT, computeYearlyPrice, type BillingCycle } from "../../lib/billing-pricing";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number };

const copy = {
  ar: {
    recommended: "الأكثر اختيارًا",
    monthlyTab: "شهري",
    yearlyTab: "سنوي",
    yearlySave: `وفر ${ANNUAL_DISCOUNT_PERCENT}٪`,
    perMonth: "ر.س / شهريًا",
    perYear: "ر.س / سنويًا",
    billedYearly: (total: number) => `تُدفع دفعة واحدة بقيمة ${total} ر.س سنويًا`,
    upToUsers: (limit: number) => `✓ حتى ${limit} مستخدم`,
    sharedInbox: "✓ صندوق وارد موحّد",
    automation: "✓ أتمتة وتقارير",
    support: "✓ دعم فني",
    preparingPayment: "جاري تجهيز الدفع...",
    renewPlan: "تجديد هذه الباقة",
    choosePlan: "اختيار الباقة",
    genericError: "تعذر بدء الدفع",
    paymentNote: "🔒 الدفع الحقيقي يتم على صفحة Moyasar الآمنة. في وضع الاختبار تظهر محاكاة دفع ولن يُخصم أي مبلغ."
  },
  en: {
    recommended: "Most popular",
    monthlyTab: "Monthly",
    yearlyTab: "Yearly",
    yearlySave: `Save ${ANNUAL_DISCOUNT_PERCENT}%`,
    perMonth: "SAR / month",
    perYear: "SAR / year",
    billedYearly: (total: number) => `Billed once as ${total} SAR / year`,
    upToUsers: (limit: number) => `✓ Up to ${limit} users`,
    sharedInbox: "✓ Shared inbox",
    automation: "✓ Automation and reports",
    support: "✓ Technical support",
    preparingPayment: "Preparing payment...",
    renewPlan: "Renew this plan",
    choosePlan: "Choose plan",
    genericError: "Couldn't start the payment",
    paymentNote: "🔒 Real payments happen on Moyasar's secure page. In test mode a simulated payment is shown and nothing is charged."
  }
} as const;

export default function BillingClient({ plans, currentPlan, lang = "ar", isTestMode }: { plans: Plan[]; currentPlan: string; lang?: "ar" | "en"; isTestMode: boolean }) {
  const text = copy[lang];
  const [loading, setLoading] = useState(""); const [error, setError] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("شهري");
  async function checkout(planId: string) {
    setLoading(planId); setError("");
    const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, billingCycle }) });
    // paymentId -> our own embedded checkout (Moyasar configured); paymentUrl
    // -> the local dev-only simulated page (no Moyasar key configured yet).
    const payload = await response.json().catch(() => ({})) as { paymentId?: string; paymentUrl?: string; error?: string };
    // The backend only returns Arabic error messages today, so an
    // English-language checkout still shows an Arabic error string here.
    if (!response.ok || (!payload.paymentId && !payload.paymentUrl)) { setLoading(""); setError(payload.error || text.genericError); return; }
    location.href = payload.paymentId ? `/billing/pay/${payload.paymentId}` : payload.paymentUrl!;
  }
  return <section>
    <div className="billing-cycle-toggle" role="tablist">
      <button type="button" role="tab" aria-selected={billingCycle === "شهري"} className={billingCycle === "شهري" ? "active" : ""} onClick={() => setBillingCycle("شهري")}>{text.monthlyTab}</button>
      <button type="button" role="tab" aria-selected={billingCycle === "سنوي"} className={billingCycle === "سنوي" ? "active" : ""} onClick={() => setBillingCycle("سنوي")}>{text.yearlyTab}<span className="billing-cycle-badge">{text.yearlySave}</span></button>
    </div>
    <div className="plan-grid">{plans.map((plan, index) => {
      const yearly = computeYearlyPrice(plan.monthlyPrice);
      const displayedPrice = billingCycle === "سنوي" ? Math.round(yearly / 12) : plan.monthlyPrice;
      return <article className={`plan-card ${index === 1 ? "featured" : ""}`} key={plan.id}>
        {index === 1 ? <span className="recommended">{text.recommended}</span> : null}
        <h2>{plan.name}</h2>
        <div className="plan-price"><b>{displayedPrice}</b><span>{text.perMonth}</span></div>
        {billingCycle === "سنوي" ? <p className="plan-price-note">{text.billedYearly(yearly)}</p> : null}
        <ul><li>{text.upToUsers(plan.employeeLimit)}</li><li>{text.sharedInbox}</li><li>{text.automation}</li><li>{text.support}</li></ul>
        <button disabled={loading !== ""} onClick={() => checkout(plan.id)}>{loading === plan.id ? text.preparingPayment : currentPlan === plan.name ? text.renewPlan : text.choosePlan}</button>
      </article>;
    })}</div>
    {error ? <p className="billing-error">{error}</p> : null}
    {isTestMode ? <p className="payment-note">{text.paymentNote}</p> : null}
  </section>;
}
