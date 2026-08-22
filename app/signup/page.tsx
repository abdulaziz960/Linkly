import Link from "next/link";
import Image from "next/image";
import SignupForm from "./SignupForm";
import "./signup.css";

export const metadata = { title: "ابدأ تجربتك | AudienceW" };

export default function SignupPage() {
  return (
    <main className="journey-page">
      <section className="journey-copy">
        <Link className="journey-brand" href="/"><Image src="/assets/audiencew-logo.png" alt="" width={44} height={44} />AudienceW</Link>
        <span className="journey-kicker">تجربة مجانية لمدة 14 يومًا</span>
        <h1>ابدأ من أول محادثة، وشاهد فريقك يعمل من مكان واحد.</h1>
        <p>أنشئ مساحة عملك، اربط قنواتك، وجرّب الصندوق الموحد قبل اختيار الباقة المناسبة.</p>
        <ol className="journey-steps">
          <li><b>1</b><span><strong>أنشئ حسابك</strong>بيانات بسيطة بدون بطاقة بنكية</span></li>
          <li><b>2</b><span><strong>فعّل مساحة العمل</strong>اختر كلمة السر واربط قنواتك</span></li>
          <li><b>3</b><span><strong>جرّب ثم اشترك</strong>اختر الباقة من داخل لوحة العميل</span></li>
        </ol>
      </section>
      <section className="journey-card">
        <div><span>الخطوة 1 من 3</span><h2>أنشئ مساحة العمل</h2><p>لن يتم خصم أي مبلغ أثناء التجربة.</p></div>
        <SignupForm />
        <small>لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></small>
      </section>
    </main>
  );
}
