import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getActivePlans } from "../../lib/plans";
import { getSubscriptionForTenant } from "../../lib/subscriptions";

export const dynamic = "force-dynamic";
import BillingClient from "./BillingClient";
import "./billing.css";

export const metadata = { title: "الباقات والاشتراك | AudienceW" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login?next=/billing");
  const [plans, subscription, { expired }] = await Promise.all([getActivePlans(), getSubscriptionForTenant(user.tenantId), searchParams]);
  const blockedReason = expired === "1"
    ? subscription?.status === "متوقف"
      ? "تم إيقاف حسابك من فريق AudienceW. اختر باقة وأكمل الدفع لإعادة تفعيله، أو تواصل معنا إذا كان هذا خطأ."
      : "انتهت فترتك التجريبية. اختر باقة وأكمل الدفع لمتابعة استخدام حسابك."
    : "";
  return <main className="billing-page"><header className="billing-header"><Link href="/dashboard">→ العودة للوحة العميل</Link><div><Image src="/assets/audiencew-logo.png" alt="" width={44} height={44} /><b>AudienceW</b></div></header><section className="billing-hero"><span>الخطوة 3 من 3</span><h1>اختر الباقة المناسبة لفريقك</h1><p>اشتراك شهري مرن، ويمكنك تغيير الباقة لاحقًا.</p>{blockedReason ? <div className="current-plan blocked">{blockedReason}</div> : null}{subscription ? <div className="current-plan">اشتراكك الحالي: <b>{subscription.plan}</b><em>{subscription.status}</em></div> : null}</section><BillingClient plans={plans} currentPlan={subscription?.plan || ""} /></main>;
}
