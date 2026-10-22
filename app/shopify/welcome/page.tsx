import Link from "next/link";
import s from "./welcome.module.css";

export const metadata = { title: { absolute: "Linkly × Shopify" }, robots: { index: false } };

type Status = "created" | "reinstalled" | "existing_account" | "error";

const messages: Record<Status, { ar: { title: string; body: string; cta?: [string, string] }; en: { title: string; body: string; cta?: [string, string] } }> = {
  created: {
    ar: { title: "تم إنشاء حسابك في لنكلي", body: "ربطنا متجرك وبدأت تجربتك المجانية لمدة 3 أيام. أرسلنا رابط التفعيل إلى بريد المتجر المسجّل في شوبيفاي؛ افتحه لتعيين كلمة المرور والدخول إلى لوحة التحكم." },
    en: { title: "Your Linkly account is ready", body: "Your store is connected and your 3-day free trial has started. We emailed an activation link to the store's email in Shopify; open it to set your password and sign in." }
  },
  reinstalled: {
    ar: { title: "أُعيد ربط متجرك", body: "متجرك مربوط بحسابك في لنكلي من جديد. سجّل الدخول للمتابعة.", cta: ["/login", "تسجيل الدخول"] },
    en: { title: "Your store is reconnected", body: "Your store is linked to your Linkly account again. Sign in to continue.", cta: ["/login", "Sign in"] }
  },
  existing_account: {
    ar: { title: "لديك حساب في لنكلي بهذا البريد", body: "سجّل الدخول ثم اربط المتجر من: التكاملات ← شوبيفاي ← ربط المتجر.", cta: ["/login?next=/dashboard?view=integrations", "تسجيل الدخول"] },
    en: { title: "This email already has a Linkly account", body: "Sign in, then connect the store from Integrations → Shopify → Connect store.", cta: ["/login?next=/dashboard?view=integrations", "Sign in"] }
  },
  error: {
    ar: { title: "تعذّر إكمال التثبيت", body: "حاول تثبيت التطبيق مرة أخرى من متجرك. إن تكرر ذلك فتواصل معنا.", cta: ["/contact", "تواصل معنا"] },
    en: { title: "We couldn't finish the install", body: "Try installing the app again from your store. If it keeps happening, contact us.", cta: ["/en/contact", "Contact us"] }
  }
};

export default async function ShopifyWelcomePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const key: Status = status && status in messages ? (status as Status) : "error";
  const { ar, en } = messages[key];
  return (
    <main className={s.page}>
      <section className={s.card} dir="rtl" lang="ar">
        <h1>{ar.title}</h1>
        <p>{ar.body}</p>
        {ar.cta ? <Link className={s.cta} href={ar.cta[0]}>{ar.cta[1]}</Link> : null}
      </section>
      <section className={s.card} dir="ltr" lang="en">
        <h2>{en.title}</h2>
        <p>{en.body}</p>
        {en.cta ? <Link className={s.cta} href={en.cta[0]}>{en.cta[1]}</Link> : null}
      </section>
    </main>
  );
}
