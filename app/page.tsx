const features = [
  {
    title: "صندوق محادثات موحد",
    text: "تابع رسائل واتساب، الإسناد، الوسوم، والملاحظات الخاصة من شاشة واحدة."
  },
  {
    title: "قوالب وحملات",
    text: "زامن قوالب Meta، أرسل حملات، وتابع حالة الرسائل من داخل المنصة."
  },
  {
    title: "أتمتة قابلة للتخصيص",
    text: "أنشئ شروط وإجراءات تلقائية لتوزيع المحادثات وإضافة الوسوم والردود."
  }
];

const metrics = [
  ["24/7", "استقبال محادثات"],
  ["CRM", "عميل وسجل كامل"],
  ["Meta", "WhatsApp Cloud API"]
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/">
          <span>
            <img src="/assets/audiencew-logo.png" alt="" />
          </span>
          AudienceW
        </a>
        <nav>
          <a href="#features">المزايا</a>
          <a href="#pricing">الباقات</a>
          <a href="/login">تسجيل الدخول</a>
        </nav>
      </header>

      <section className="landing-hero">
        <div>
          <span className="landing-eyebrow">منصة واتساب للأعمال</span>
          <h1>إدارة محادثات العملاء والفرق من مكان واحد</h1>
          <p>
            AudienceW تجمع المحادثات، العملاء، الوسوم، القوالب، الأتمتة، وساعات العمل في تجربة واحدة واضحة لفريقك.
          </p>
          <div className="landing-actions">
            <a className="landing-button primary" href="/dashboard">دخول المنصة</a>
            <a className="landing-button" href="/login">تسجيل الدخول</a>
          </div>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="preview-head">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-row">
            <b>Abdulaziz</b>
            <small>صورة واردة</small>
            <em>غير مسندة</em>
          </div>
          <div className="preview-row">
            <b>Omar</b>
            <small>السلام عليكم</small>
            <em>مسندة</em>
          </div>
          <div className="preview-card">
            <strong>حالة الربط</strong>
            <span>WhatsApp Cloud API متصل</span>
          </div>
        </div>
      </section>

      <section className="landing-metrics">
        {metrics.map(([value, label]) => (
          <div key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="landing-section" id="features">
        <h2>كل أدوات التشغيل اليومية</h2>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-pricing" id="pricing">
        <div>
          <h2>جاهزة للتجربة</h2>
          <p>ابدأ بالربط التجريبي، ثم أضف الموظفين، القوالب، وساعات العمل حسب احتياجك.</p>
        </div>
        <a className="landing-button primary" href="/dashboard">فتح لوحة التحكم</a>
      </section>
    </main>
  );
}
