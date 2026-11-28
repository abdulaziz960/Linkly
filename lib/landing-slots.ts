// The editable texts of the home pages (from app/page.tsx and app/en/page.tsx), in page order.
// Each default must appear in its page file (a test keeps them in sync); admin overrides are
// stored by the default text's id (see lib/landing-content.ts).
export type LandingSlot = { label: string; text: string; multiline: boolean };

export const LANDING_SLOTS: Record<"ar" | "en", LandingSlot[]> = {
  ar: [
    { label: "الواجهة العلوية: العنوان الرئيسي (H1) - الجزء الأول", text: "رد أسرع على عملائك ", multiline: false },
    { label: "الواجهة العلوية: العنوان الرئيسي (H1) - الجزء الثاني", text: "ولا تضيع ولا محادثة", multiline: false },
    { label: "الواجهة العلوية: الوصف", text: "لنكلي يجمع محادثات واتساب وإنستغرام وفيسبوك وتيليجرام والبريد في مكان واحد؛ فريقك يرد ويوزّع المحادثات ويتابعها دون أن يضيع عميل.", multiline: true },
    { label: "الواجهة العلوية: زر البدء", text: "ابدأ تجربتك مجانًا", multiline: false },
    { label: "قسم المنتج - العنوان (H2)", text: "واجهة واحدة ترى فيها ما يحتاجه الفريق الآن", multiline: true },
    { label: "قسم المنتج - الوصف", text: "من أول رسالة إلى الإغلاق، تبقى المحادثة والعميل والمسؤول والخطوة التالية في نفس السياق.", multiline: true },
    { label: "قسم القنوات - العنوان (H2)", text: "كل قناة بطبيعتها. إدارة واحدة لفريقك.", multiline: true },
    { label: "قسم القنوات - الوصف", text: "فعّل القنوات التي يحتاجها نشاطك، واجعل الفريق يعمل من صندوق وارد واحد.", multiline: true },
    { label: "قسم المزايا - العنوان (H2)", text: "كل ما يحتاجه فريقك لإدارة المحادثة بوضوح", multiline: true },
    { label: "قسم المزايا - الوصف", text: "أدوات عملية مبنية حول سير العمل اليومي، لا قائمة طويلة من المزايا النظرية.", multiline: true },
    { label: "قسم طريقة العمل - العنوان (H2)", text: "ابدأ خلال أربع خطوات", multiline: true },
    { label: "قسم طريقة العمل - الوصف", text: "مسار واضح من إنشاء الحساب إلى أول محادثة يديرها فريقك.", multiline: true },
    { label: "قسم حالات الاستخدام - العنوان (H2)", text: "من أول استفسار إلى عميل تمت خدمته", multiline: true },
    { label: "قسم الأمان - العنوان (H2)", text: "بيانات عملائك تستحق حماية على مستوى أعمالك", multiline: true },
    { label: "قسم الأمان - الوصف", text: "الحماية جزء أساسي من المنتج، من تسجيل الدخول إلى ربط قنواتك.", multiline: true },
    { label: "قسم الأسعار - العنوان (H2)", text: "باقة واضحة لكل مرحلة من نمو فريقك", multiline: true },
    { label: "قسم الأسعار - الوصف", text: "ابدأ بالتجربة أولًا، ثم اختر السعة والأدوات المناسبة لطريقة عملك.", multiline: true },
    { label: "قسم الأسئلة الشائعة - العنوان (H2)", text: "إجابات واضحة قبل أن تبدأ", multiline: true },
    { label: "الدعوة الختامية: العنوان", text: "خل فريقك يركز على العميل، مو على التنقل بين التطبيقات.", multiline: true },
    { label: "الدعوة الختامية: الوصف", text: "ابدأ تجربة Linkly مجانًا لمدة 3 أيام.", multiline: true },
    { label: "الدعوة الختامية: ملاحظة تحت الزر", text: "بدون بطاقة دفع", multiline: false },
  ],
  en: [
    { label: "Hero: headline (H1) - first part", text: "Reply faster to customers ", multiline: false },
    { label: "Hero: headline (H1) - second part", text: "and never lose a conversation", multiline: false },
    { label: "Hero: description", text: "Linkly brings your WhatsApp, Instagram, Facebook, Telegram and email conversations into one place, so your team replies, routes and follows up without losing a customer.", multiline: true },
    { label: "Hero: start button", text: "Start your free trial", multiline: false },
    { label: "Section: Product - heading (H2)", text: "One interface showing exactly what your team needs right now", multiline: true },
    { label: "Section: Product - description", text: "From the first message to close, the conversation, customer, owner and next step all stay in the same context.", multiline: true },
    { label: "Section: Channels - heading (H2)", text: "Every channel on its own terms. One place to manage them.", multiline: true },
    { label: "Section: Channels - description", text: "Turn on the channels your business needs, and let the team work from a single inbox.", multiline: true },
    { label: "Section: Features - heading (H2)", text: "Everything your team needs to manage conversations clearly", multiline: true },
    { label: "Section: Features - description", text: "Practical tools built around the daily workflow, not a long list of theoretical features.", multiline: true },
    { label: "Section: How it works - heading (H2)", text: "Get started in four steps", multiline: true },
    { label: "Section: How it works - description", text: "A clear path from creating your account to your team's first managed conversation.", multiline: true },
    { label: "Section: Use cases - heading (H2)", text: "From the first inquiry to a served customer", multiline: true },
    { label: "Section: Security - heading (H2)", text: "Your customers' data deserves business-grade protection", multiline: true },
    { label: "Section: Security - description", text: "Protection is a core part of the product, from signing in to connecting your channels.", multiline: true },
    { label: "Section: Pricing - heading (H2)", text: "A clear plan for every stage of your team's growth", multiline: true },
    { label: "Section: Pricing - description", text: "Start with the free trial first, then choose the capacity and tools that fit how you work.", multiline: true },
    { label: "Section: FAQ - heading (H2)", text: "Clear answers before you start", multiline: true },
    { label: "Final call to action: headline", text: "Let your team focus on the customer, not on switching between apps.", multiline: true },
    { label: "Final call to action: description", text: "Try Linkly free for 3 days.", multiline: true },
    { label: "Final call to action: note under button", text: "No card required", multiline: false },
  ]
};

// The editable texts of the pricing pages (from app/PricingPage.tsx). They are saved the same way as the home page texts; the short labels the
// pricing page shares with the home page ("الأسعار", "الأسئلة الشائعة", the trial button) are left out so one edit cannot change both pages.
export const PRICING_SLOTS: Record<"ar" | "en", LandingSlot[]> = {
  ar: [
    { label: "الأسعار: العنوان الرئيسي (H1)", text: "أسعار Linkly: باقة واضحة لكل مرحلة من نمو فريقك", multiline: true },
    { label: "الأسعار: الوصف تحت العنوان", text: "ابدأ بتجربة مجانية لمدة 3 أيام بدون بطاقة دفع، ثم اختر السعة والأدوات المناسبة لفريقك. الأسعار شهرية وسنوية وبدون ضريبة القيمة المضافة.", multiline: true },
    { label: "الأسعار: عنوان قسم الأسئلة", text: "أسئلة عن الأسعار والباقات", multiline: false },
    { label: "الأسعار: الشارة فوق عنوان الأدلة", text: "أدلة عملية", multiline: false },
    { label: "الأسعار: عنوان قسم الأدلة", text: "قبل أن تختار، اقرأ كيف يُستخدم Linkly", multiline: true },
    { label: "الأسعار: عنوان الدعوة الختامية", text: "جرّب الباقة المناسبة مجانًا لمدة 3 أيام", multiline: true }
  ],
  en: [
    { label: "Pricing page: headline (H1)", text: "Linkly pricing: a clear plan for every stage of your team's growth", multiline: true },
    { label: "Pricing page: intro under the headline", text: "Start with a free 3-day trial with no card, then choose the capacity and tools your team needs. Prices are monthly or yearly and exclude VAT.", multiline: true },
    { label: "Pricing page: FAQ section heading", text: "Questions about pricing and plans", multiline: false },
    { label: "Pricing page: guides badge", text: "PRACTICAL GUIDES", multiline: false },
    { label: "Pricing page: guides section heading", text: "Before you choose, read how Linkly is used", multiline: true },
    { label: "Pricing page: final call to action heading", text: "Try the right plan free for 3 days", multiline: true }
  ]
};
