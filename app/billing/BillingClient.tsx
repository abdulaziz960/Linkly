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
    paymentNote: "🔒 الدفع الحقيقي يتم على صفحة Moyasar الآمنة. في وضع الاختبار تظهر محاكاة دفع ولن يُخصم أي مبلغ."
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
    genericError: "Couldn't start the payment",
    paymentNote: "🔒 Real payments happen on Moyasar's secure page. In test mode a simulated payment is shown and nothing is charged."
  }
} as const;

export default function BillingClient({ plans, currentPlan, lang = "ar" }: { plans: Plan[]; currentPlan: string; lang?: "ar" | "en" }) {
  const text = copy[lang];
  const [loading, setLoading] = useState(""); const [error, setError] = useState("");
  async function checkout(planId: string) {
    setLoading(planId); setError("");
    const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
    const payload = await response.json().catch(() => ({})) as { paymentUrl?: string; error?: string };
    // The backend only returns Arabic error messages today, so an
    // English-language checkout still shows an Arabic error string here.
    if (!response.ok || !payload.paymentUrl) { setLoading(""); setError(payload.error || text.genericError); return; }
    location.href = payload.paymentUrl;
  }
  return <section><div className="plan-grid">{plans.map((plan, index) => <article className={`plan-card ${index === 1 ? "featured" : ""}`} key={plan.id}>{index === 1 ? <span className="recommended">{text.recommended}</span> : null}<h2>{plan.name}</h2><div className="plan-price"><b>{plan.monthlyPrice}</b><span>{text.perMonth}</span></div><ul><li>{text.upToUsers(plan.employeeLimit)}</li><li>{text.sharedInbox}</li><li>{text.automation}</li><li>{text.support}</li></ul><button disabled={loading !== ""} onClick={() => checkout(plan.id)}>{loading === plan.id ? text.preparingPayment : currentPlan === plan.name ? text.renewPlan : text.choosePlan}</button></article>)}</div>{error ? <p className="billing-error">{error}</p> : null}<p className="payment-note">{text.paymentNote}</p></section>;
}
