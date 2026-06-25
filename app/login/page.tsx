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
          <h1>سجّل دخولك لإدارة المحادثات، الفرق، الحملات، والربط من مكان واحد.</h1>
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

      <aside className="login-preview" aria-label="ملخص المنصة">
        <div className="preview-card primary">
          <span>محادثات اليوم</span>
          <b>128</b>
          <small>42 محادثة مسندة للفريق</small>
        </div>
        <div className="preview-grid">
          <div>
            <span>متوسط الرد</span>
            <b>4 د</b>
          </div>
          <div>
            <span>حالة الربط</span>
            <b>متصل</b>
          </div>
        </div>
        <div className="preview-inbox">
          <div>
            <span>ن</span>
            <p>نورة القحطاني</p>
            <b>تم تحويل الطلب لقسم الشحن</b>
          </div>
          <div>
            <span>س</span>
            <p>سارة العتيبي</p>
            <b>هل يقدر يوصل اليوم؟</b>
          </div>
          <div>
            <span>ع</span>
            <p>عبدالله الحربي</p>
            <b>العرض ما زال متاح؟</b>
          </div>
        </div>
      </aside>
    </main>
  );
}
