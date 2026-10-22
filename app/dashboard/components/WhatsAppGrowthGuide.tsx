"use client";

import { useLanguage } from "../i18n";

type Props = { onClose: () => void; businessId?: string; wabaId?: string };

/** Short checklist: raise the WhatsApp sending limit, verify the business and get the display name approved. */
export default function WhatsAppGrowthGuide({ onClose, businessId = "", wabaId = "" }: Props) {
  const { t } = useLanguage();
  const business = /^\d+$/.test(businessId.trim()) ? `?business_id=${businessId.trim()}` : "";
  const waba = /^\d+$/.test(wabaId.trim()) ? `?waba_id=${wabaId.trim()}` : "";
  const settings = (page: string) => `https://business.facebook.com/latest/settings/${page}${business}`;
  const links: Record<string, Array<{ label: string; href: string }>> = {
    limit: [{ label: t("مدير واتساب: الأرقام والحد الحالي", "WhatsApp Manager: phone numbers and current limit"), href: `https://business.facebook.com/wa/manage/phone-numbers/${waba}` }],
    verify: [
      { label: t("مركز الأمان: التوثيق التجاري", "Security Center: business verification"), href: settings("security") },
      { label: t("معلومات حافظة الأعمال", "Business portfolio info"), href: settings("info") },
      { label: t("النطاقات (Domains)", "Domains"), href: settings("domains") }
    ],
    name: [{ label: t("مدير واتساب: اسم العرض", "WhatsApp Manager: display name"), href: `https://business.facebook.com/wa/manage/phone-numbers/${waba}` }]
  };
  const sections: Array<{ key: string; title: string; items: string[] }> = [
    {
      key: "limit",
      title: t("1) رفع حد الإرسال", "1) Raise your sending limit"),
      items: [
        t("الحساب الجديد يبدأ عادةً بحد صغير (حوالي 250 عميلًا مختلفًا كل 24 ساعة) ويرتفع تدريجيًا.", "A new account usually starts with a small limit (around 250 different customers per 24 hours) that rises step by step."),
        t("وثّق نشاطك التجاري واعتمد اسم العرض، فهما شرطان للانتقال لحدود أعلى.", "Verify your business and get the display name approved; both are needed to move to higher limits."),
        t("حافظ على جودة الرقم «عالية»: أرسل لمن وافق على استقبال رسائلك، وتجنّب الإزعاج حتى لا يحظرك العملاء أو يبلّغوا عنك.", "Keep the number's quality rating high: message only people who opted in and avoid spam so customers don't block or report you."),
        t("استخدم نصف الحد تقريبًا خلال 7 أيام بجودة جيدة، وغالبًا ترفعه Meta للمستوى التالي تلقائيًا.", "Use about half of your limit within 7 days with good quality, and Meta will usually raise it to the next tier automatically."),
        t("المستويات الشائعة: 250 ثم 1,000 ثم 10,000 ثم 100,000 ثم بلا حد. تتغير سياسات Meta أحيانًا فراجع حسابك في Meta.", "Common tiers: 250, then 1,000, 10,000, 100,000, then unlimited. Meta's policies change, so check your Meta account.")
      ]
    },
    {
      key: "verify",
      title: t("2) توثيق النشاط التجاري", "2) Verify your business"),
      items: [
        t("افتح «التوثيق التجاري» في هذه الصفحة واضغط «فتح صفحة التوثيق في Meta».", "Open “Business Verification” on this page and press “Open verification in Meta”."),
        t("جهّز السجل التجاري أو الترخيص، وإثبات عنوان أو هاتف الشركة (فاتورة أو كشف)، ورقم الضريبة.", "Prepare your commercial registration or licence, proof of the company address or phone (a bill or statement), and your tax ID."),
        t("اجعل الاسم القانوني والعنوان والهاتف في Meta مطابقة تمامًا للمستندات.", "Make the legal name, address and phone in Meta match your documents exactly."),
        t("ضع موقعًا إلكترونيًا للشركة يحمل الاسم نفسه، ويفضَّل أن تتحقق من ملكية نطاقه في Meta.", "Use a company website with the same name, and ideally verify its domain in Meta."),
        t("المراجعة تأخذ من يوم إلى عدة أيام عمل. إن رُفض الطلب فصحّح سبب الرفض وأعد المحاولة.", "Review takes one to several business days. If it is rejected, fix the stated reason and try again.")
      ]
    },
    {
      key: "name",
      title: t("3) اعتماد اسم العرض", "3) Get the display name approved"),
      items: [
        t("استخدم اسم نشاطك كما هو في موقعك أو سجلك التجاري.", "Use your business name exactly as on your website or registration."),
        t("بدون روابط أو إيموجي أو أرقام هواتف أو رموز، ولا اسمًا عامًا مثل «متجر» أو «شركة».", "No links, emoji, phone numbers or symbols, and no generic names such as “Store” or “Company”."),
        t("لا تضمّن كلمتي Meta أو WhatsApp في الاسم.", "Do not include Meta or WhatsApp in the name."),
        t("يمكن تقديم طلب واحد فقط في الوقت نفسه، انتظر نتيجة الطلب الحالي قبل آخر جديد.", "Only one request can be pending at a time; wait for the current result before a new one."),
        t("قرار القبول لـ Meta ويستغرق حتى يومين عمل، ويظهر حالته في بطاقة «اسم العرض».", "Meta makes the decision, which takes up to two business days; the status shows in the “Display name” card.")
      ]
    }
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="account-modal form-modal diagnose-modal" role="dialog" aria-modal="true" aria-label={t("دليل رفع الحد والتوثيق", "Limits and verification guide")} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={onClose}>×</button>
          <h2>{t("دليل رفع الحد والتوثيق", "Limits and verification guide")}</h2>
        </header>
        <div className="account-modal-body wa-guide">
          <p className="wa-guide-note">{t("الروابط تفتح صفحات Meta الخاصة بحسابك. سجّل الدخول إلى Meta بنفس الحساب الذي يدير حافظة الأعمال المرتبطة بلنكلي، وإلا لن تظهر لك الصفحة أو ستعرض حسابًا آخر.", "The links open the Meta pages for your account. Sign in to Meta with the same account that manages the business portfolio linked to Linkly, otherwise the page will not load or will show another account.")}</p>
          {sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="wa-guide-links">
                {links[section.key].map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="modal-foot">
          <button className="btn soft" type="button" onClick={onClose}>{t("إغلاق", "Close")}</button>
        </footer>
      </div>
    </div>
  );
}
