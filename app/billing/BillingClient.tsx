"use client";
import { useState } from "react";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number };
export default function BillingClient({ plans, currentPlan }: { plans: Plan[]; currentPlan: string }) {
  const [loading, setLoading] = useState(""); const [error, setError] = useState("");
  async function checkout(planId: string) {
    setLoading(planId); setError("");
    const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
    const payload = await response.json().catch(() => ({})) as { paymentUrl?: string; error?: string };
    if (!response.ok || !payload.paymentUrl) { setLoading(""); setError(payload.error || "تعذر بدء الدفع"); return; }
    location.href = payload.paymentUrl;
  }
  return <section><div className="plan-grid">{plans.map((plan, index) => <article className={`plan-card ${index === 1 ? "featured" : ""}`} key={plan.id}>{index === 1 ? <span className="recommended">الأكثر اختيارًا</span> : null}<h2>{plan.name}</h2><div className="plan-price"><b>{plan.monthlyPrice}</b><span>ر.س / شهريًا</span></div><ul><li>✓ حتى {plan.employeeLimit} مستخدم</li><li>✓ صندوق وارد موحّد</li><li>✓ أتمتة وتقارير</li><li>✓ دعم فني</li></ul><button disabled={loading !== ""} onClick={() => checkout(plan.id)}>{loading === plan.id ? "جاري تجهيز الدفع..." : currentPlan === plan.name ? "تجديد هذه الباقة" : "اختيار الباقة"}</button></article>)}</div>{error ? <p className="billing-error">{error}</p> : null}<p className="payment-note">🔒 الدفع الحقيقي يتم على صفحة Moyasar الآمنة. في وضع الاختبار تظهر محاكاة دفع ولن يُخصم أي مبلغ.</p></section>;
}
