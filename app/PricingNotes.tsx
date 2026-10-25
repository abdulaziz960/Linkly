import s from "./page.module.css";

/**
 * What the prices cover, stated as the product actually behaves:
 * - trial: app/api/trial/route.ts (3 days from signup, no card, on the chosen plan;
 *   the enterprise plan is quote-only, lib/trial-plan.ts); when it ends the workspace
 *   is locked to /billing (lib/auth.ts).
 * - marketing messages: credited to the campaign balance on each confirmed
 *   subscription payment (x12 for yearly), spent only by campaign sends; an empty
 *   balance stops the rest of a campaign (lib/campaign-engine.ts), and the balance can
 *   be topped up (app/api/campaigns/balance).
 * - Meta fees: billed by Meta to the payment method on the business's own WhatsApp
 *   Business Account, never through Linkly (lib/whatsapp-billing.ts).
 * Prices are without VAT (VatNote under the price lists); 15% is added at the payment page.
 */
const notes = {
  ar: {
    title: "ماذا تشمل الأسعار؟",
    items: [
      ["التجربة المجانية", "3 أيام تبدأ عند إنشاء الحساب، على الباقة التي تختارها (عدا «صمم باقتك»)، بدون بطاقة دفع. عند انتهائها تختار باقة وتدفع الاشتراك لمواصلة استخدام لوحة التحكم."],
      ["الرسائل التسويقية", "رصيد لرسائل الحملات التي ترسلها من لنكلي، ولا يُخصم منه الرد على محادثات العملاء. يُضاف مع كل دفعة اشتراك (رصيد 12 شهرًا مع الدفع السنوي). إذا نفد الرصيد يتوقف إرسال بقية الحملة حتى تشحن رصيدًا إضافيًا أو يتجدد اشتراكك."],
      ["ضريبة القيمة المضافة", "الأسعار المعروضة غير شاملة ضريبة القيمة المضافة (15%)، وتُضاف عند صفحة الدفع على كل اشتراك وشحن رصيد، وتظهر في الفاتورة الضريبية برقمنا الضريبي."],
      ["رسوم Meta لواتساب", "رسوم رسائل القوالب التي تفرضها Meta، إن وجدت، غير مشمولة في الباقة، وتدفعها لـ Meta مباشرة عبر وسيلة الدفع في حساب واتساب للأعمال الخاص بك."],
      ["ربط القنوات وخدمة التجهيز", "نساعدك في ربط قنواتك بحساباتك الحالية ضمن اشتراكك. أما خدمة التجهيز الاختيارية (500 ريال مرة واحدة) فهي لمن ليس لديه حساب فيسبوك أو Meta للأعمال: ننشئ الحساب ونربط واتساب للأعمال بالكامل."]
    ]
  },
  en: {
    title: "What do the prices cover?",
    items: [
      ["Free trial", "3 days starting when you create your account, on the plan you pick (except “Build your plan”), with no card. When it ends, you choose a plan and pay to keep using the dashboard."],
      ["Marketing messages", "An allowance for the campaign messages you send from Linkly; replying to customer conversations never uses it. It is added with each subscription payment (12 months’ worth with yearly billing). If it runs out, the rest of a campaign stops sending until you top up or your subscription renews."],
      ["VAT", "Displayed prices exclude VAT (15%). It is added on the payment page for every subscription and top-up, and shown on the tax invoice with our VAT number."],
      ["Meta fees for WhatsApp", "Template message fees charged by Meta, if any, are not included in the plan; you pay them to Meta directly through the payment method on your own WhatsApp Business Account."],
      ["Channel connection and setup service", "We help you connect your channels to your existing accounts as part of your subscription. The optional setup service (500 SAR one time) is for businesses without a Facebook or Meta Business account: we create the account and connect WhatsApp Business end to end."]
    ]
  }
} as const;

export default function PricingNotes({ lang }: { lang: "ar" | "en" }) {
  const text = notes[lang];
  return (
    <section className={s.pricingNotes} aria-labelledby={`pricing-notes-${lang}`}>
      <h3 id={`pricing-notes-${lang}`}>{text.title}</h3>
      <dl>
        {text.items.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}
      </dl>
    </section>
  );
}
