import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import "../../login/login.css";

export const metadata = {
  title: { absolute: "أهلًا بك في Linkly" },
  robots: { index: false, follow: false }
};

/** Where Salla sends a merchant who opens Linkly from their store: signed in goes straight to the dashboard, otherwise the next step is spelled out. */
export default async function SallaWelcomePage() {
  const user = await getCurrentUser({ allowExpired: true });
  if (user) redirect("/dashboard?view=inbox");
  return (
    <main className="login-page" dir="rtl" style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <h1>أهلًا بك في Linkly</h1>
      <p>تم تثبيت التطبيق على متجرك في سلة، وأُنشئت مساحتك تلقائيًا. اشتراكك ودفعه يتمان عبر سلة.</p>
      <ol>
        <li>افتح بريدك الإلكتروني المسجل في سلة وابحث عن رسالة تفعيل Linkly.</li>
        <li>اضغط رابط التفعيل واختر كلمة سر لحسابك.</li>
        <li>سجّل الدخول وابدأ ربط واتساب.</li>
      </ol>
      <p>لديك حساب مفعّل؟ <Link href="/login">سجّل الدخول</Link>. لم تصلك الرسالة؟ جرّب <Link href="/forgot-password">نسيت كلمة السر</Link> بنفس البريد.</p>
    </main>
  );
}
