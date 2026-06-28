import Link from "next/link";
import "./login.css";

export const metadata = {
  title: "تسجيل الدخول | AudienceW"
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-label="تسجيل الدخول إلى AudienceW">
        <div className="login-brand">
          <img src="/assets/audiencew-logo.png" alt="" />
          <div>
            <span>AudienceW</span>
            <b>منصة إدارة محادثات واتساب للأعمال</b>
          </div>
        </div>

        <div className="login-copy">
          <p>مرحباً بعودتك</p>
        </div>

        <form className="login-form">
          <label>
            البريد الإلكتروني
            <input type="email" name="email" placeholder="name@company.com" autoComplete="email" />
          </label>
          <label>
            كلمة المرور
            <input type="password" name="password" placeholder="••••••••" autoComplete="current-password" />
          </label>

          <div className="login-options">
            <label className="remember-option">
              <input type="checkbox" name="remember" />
              <span>تذكرني</span>
            </label>
            <a href="#">نسيت كلمة المرور؟</a>
          </div>

          <Link className="login-submit" href="/dashboard">
            تسجيل الدخول
          </Link>
        </form>
      </section>
    </main>
  );
}
