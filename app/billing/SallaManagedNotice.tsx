"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

/** A workspace subscribed through Salla's app store: plans, payment and cancelling all happen in the Salla dashboard. */
export default function SallaManagedNotice({ branding, plan, renewalAt, active }: { branding: { name: string; logoDataUrl: string }; plan: string; renewalAt: string; active: boolean }) {
  const router = useRouter();
  const until = renewalAt ? new Date(renewalAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Riyadh" }) : "";
  return (
    <main className="billing-page" dir="rtl">
      <header className="billing-header">
        <span />
        <div><Image src={branding.logoDataUrl} alt="" width={64} height={35} unoptimized={branding.logoDataUrl.startsWith("data:")} /><b>{branding.name}</b></div>
      </header>
      <section className="billing-hero">
        <span>الاشتراك عبر سلة</span>
        <h1>{active ? "اشتراكك يُدار ويُدفع من سلة" : "اشتراكك متوقف، جدده من سلة"}</h1>
        <div className={`current-plan${active ? "" : " blocked"}`}>
          {plan ? <p>الباقة الحالية: <b>{plan}</b>{until ? ` · حتى ${until}` : ""}</p> : null}
          <p>لتغيير الباقة أو تجديد الاشتراك أو إلغائه: افتح لوحة تحكم متجرك في سلة ← التطبيقات ← تطبيقاتي ← Linkly ← الاشتراك. يتم الدفع بالكامل عبر سلة، وينعكس التغيير هنا تلقائيًا خلال دقائق.</p>
          <p>الدفع لدينا يقتصر على شحن رصيد الرسائل التسويقية (واتساب والبريد الإلكتروني) من صفحة الحملات.</p>
        </div>
        {active ? <a className="billing-owner-notice-logout" href="/dashboard">العودة إلى لوحة التحكم</a> : (
          <button type="button" className="billing-owner-notice-logout" onClick={() => { fetch("/api/auth/logout", { method: "POST" }).finally(() => router.push("/login")); }}>تسجيل الخروج</button>
        )}
      </section>
    </main>
  );
}
