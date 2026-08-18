import ForgotPasswordForm from "./ForgotPasswordForm";
import "../login/login.css";

export const metadata = {
  title: "استعادة كلمة المرور | AudienceW"
};

export default function ForgotPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-label="استعادة كلمة المرور">
        <div className="login-brand">
          <img src="/assets/audiencew-logo.png" alt="" />
          <div>
            <span>AudienceW</span>
            <b>منصة إدارة محادثات واتساب للأعمال</b>
          </div>
        </div>

        <div className="login-copy">
          <p>استعادة كلمة المرور</p>
        </div>

        <ForgotPasswordForm />
      </section>
    </main>
  );
}
