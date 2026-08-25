import Link from "next/link";
import "../signup.css";

const copy = {
  ar: {
    kicker: "تم إنشاء التجربة",
    titleFailed: "مساحتك جاهزة، لكن تعذر إرسال البريد",
    titleSent: "راجع بريدك لتفعيل الحساب",
    fallbackEmail: "بريدك الإلكتروني",
    failedIntro: "لم نتمكن من إرسال رابط التفعيل إلى",
    failedOutro: "الآن. تواصل معنا من صفحة الدعم ليُعاد الإرسال بأمان.",
    sentIntro: "أرسلنا رابط التفعيل إلى",
    sentOutro: "بعد اختيار كلمة السر ستدخل مباشرة إلى إعداد مساحة العمل.",
    contactSupport: "التواصل مع الدعم",
    goToLogin: "الانتقال لتسجيل الدخول"
  },
  en: {
    kicker: "Trial created",
    titleFailed: "Your workspace is ready, but we couldn't send the email",
    titleSent: "Check your email to activate your account",
    fallbackEmail: "your email",
    failedIntro: "We couldn't send the activation link to",
    failedOutro: "right now. Contact us from the support page to have it resent safely.",
    sentIntro: "We sent the activation link to",
    sentOutro: "After choosing a password you'll go straight into setting up your workspace.",
    contactSupport: "Contact support",
    goToLogin: "Go to sign in"
  }
} as const;

export default async function TrialSuccess({ searchParams }: { searchParams: Promise<{ email?: string; delivery?: string; lang?: string }> }) {
  const { email, delivery, lang: langParam } = await searchParams;
  const deliveryFailed = delivery === "failed";
  const lang = langParam === "en" ? "en" : "ar";
  const text = copy[lang];

  return (
    <main className="journey-page journey-centered" dir={lang === "en" ? "ltr" : "rtl"}>
      <section className="journey-card success-card">
        <b className="success-mark">✓</b>
        <span className="journey-kicker">{text.kicker}</span>
        <h1>{deliveryFailed ? text.titleFailed : text.titleSent}</h1>
        <p>
          {deliveryFailed
            ? <>{text.failedIntro} <strong>{email || text.fallbackEmail}</strong> {text.failedOutro}</>
            : <>{text.sentIntro} <strong>{email || text.fallbackEmail}</strong>. {text.sentOutro}</>}
        </p>
        <Link className="journey-submit" href={deliveryFailed ? "/contact" : "/login"}>{deliveryFailed ? text.contactSupport : text.goToLogin}</Link>
      </section>
    </main>
  );
}
