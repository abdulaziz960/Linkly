import LoginForm from "./LoginForm";
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

        <LoginForm />
      </section>
    </main>
  );
}
