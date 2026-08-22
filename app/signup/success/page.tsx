import Link from "next/link";
import "../signup.css";
export default async function TrialSuccess({ searchParams }: { searchParams: Promise<{ email?: string; delivery?: string }> }) {
  const { email, delivery } = await searchParams;
  const deliveryFailed = delivery === "failed";
  return <main className="journey-page journey-centered"><section className="journey-card success-card"><b className="success-mark">✓</b><span className="journey-kicker">تم إنشاء التجربة</span><h1>{deliveryFailed ? "مساحتك جاهزة، لكن تعذر إرسال البريد" : "راجع بريدك لتفعيل الحساب"}</h1><p>{deliveryFailed ? <>لم نتمكن من إرسال رابط التفعيل إلى <strong>{email || "بريدك الإلكتروني"}</strong> الآن. تواصل معنا من صفحة الدعم ليُعاد الإرسال بأمان.</> : <>أرسلنا رابط التفعيل إلى <strong>{email || "بريدك الإلكتروني"}</strong>. بعد اختيار كلمة السر ستدخل مباشرة إلى إعداد مساحة العمل.</>}</p><Link className="journey-submit" href={deliveryFailed ? "/contact" : "/login"}>{deliveryFailed ? "التواصل مع الدعم" : "الانتقال لتسجيل الدخول"}</Link></section></main>;
}
