/**
 * Complete SEO content for the fixed public pages. It fills every field the admin
 * panel shows (title, description, share title/description, canonical, share image)
 * until an admin saves something different for that field - a value saved from the
 * admin panel always wins (see lib/page-seo.ts).
 *
 * Rules the copy follows (checked by tests/page-seo-defaults.test.ts): titles stay
 * under ~60 characters and descriptions between 70 and 160 so search results do not
 * truncate them; no prices (they change from the admin panel); no promises the
 * product does not keep.
 */

const ORIGIN = "https://linklysa.io";
const SHARE_IMAGE = `${ORIGIN}/opengraph-image`;

export type PageSeoDefault = {
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  canonicalUrl: string;
  ogImage: string;
};

function page(path: string, fields: Omit<PageSeoDefault, "canonicalUrl" | "ogImage">): PageSeoDefault {
  return { ...fields, canonicalUrl: path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`, ogImage: SHARE_IMAGE };
}

export const DEFAULT_PAGE_SEO: Record<string, PageSeoDefault> = {
  "/": page("/", {
    metaTitle: "Linkly | صندوق موحّد لواتساب وإنستقرام وكل قنوات عملائك",
    metaDescription: "منصة سعودية تجمع محادثات واتساب وإنستقرام وتيليجرام والبريد وتيك توك في صندوق واحد، مع توزيع المحادثات والأتمتة والتقارير. جرّب مجانًا 3 أيام.",
    ogTitle: "Linkly | كل محادثات عملائك في مكان واحد",
    ogDescription: "صندوق وارد موحّد لفريقك: توزيع للمحادثات، ردود آلية، حملات وتقارير. ابدأ تجربتك المجانية الآن."
  }),
  "/en": page("/en", {
    metaTitle: "Linkly | One inbox for WhatsApp, Instagram and every channel",
    metaDescription: "A Saudi platform that brings WhatsApp, Instagram, Telegram, email and TikTok chats into one shared inbox, with routing, automation and reports. Free 3-day trial.",
    ogTitle: "Linkly | Every customer conversation in one place",
    ogDescription: "One shared inbox for your team: conversation routing, auto-replies, campaigns and reports. Start your free trial today."
  }),
  "/faq": page("/faq", {
    metaTitle: "الأسئلة الشائعة | Linkly",
    metaDescription: "إجابات عن أكثر الأسئلة شيوعًا حول Linkly: ربط واتساب وإنستقرام، الباقات والاشتراك، الأمان وحماية البيانات، وواجهة البرمجة للمطورين.",
    ogTitle: "الأسئلة الشائعة عن Linkly",
    ogDescription: "كل ما تحتاج معرفته عن ربط القنوات والباقات والأمان قبل أن تبدأ."
  }),
  "/en/faq": page("/en/faq", {
    metaTitle: "FAQ | Linkly",
    metaDescription: "Answers to the most common questions about Linkly: connecting WhatsApp and Instagram, plans and billing, security and data protection, and the developer API.",
    ogTitle: "Linkly frequently asked questions",
    ogDescription: "Everything you need to know about connecting channels, plans and security before you start."
  }),
  "/blog": page("/blog", {
    metaTitle: "مدونة Linkly | أدلة لفرق خدمة العملاء والمبيعات",
    metaDescription: "أدلة عملية ونصائح لفرق خدمة العملاء والمبيعات: تنظيم محادثات واتساب، تسريع الرد، وتحسين تجربة العميل من فريق Linkly.",
    ogTitle: "مدونة Linkly",
    ogDescription: "أدلة عملية لفرق خدمة العملاء والمبيعات: من تنظيم المحادثات إلى تحسين سرعة الرد."
  }),
  "/en/blog": page("/en/blog", {
    metaTitle: "Linkly Blog | Guides for customer service and sales teams",
    metaDescription: "Practical guides for customer service and sales teams: organizing WhatsApp conversations, replying faster and improving the customer experience.",
    ogTitle: "The Linkly blog",
    ogDescription: "Practical guides for customer service and sales teams, from organizing conversations to replying faster."
  }),
  "/contact": page("/contact", {
    metaTitle: "تواصل معنا | Linkly",
    metaDescription: "تواصل مع فريق Linkly للمبيعات والدعم الفني، وللمساعدة في تجهيز قنوات خدمة عملائك وربط واتساب وإنستقرام.",
    ogTitle: "تواصل مع فريق Linkly",
    ogDescription: "فريق المبيعات والدعم جاهز لمساعدتك في تجهيز قنوات خدمة عملائك."
  }),
  "/en/contact": page("/en/contact", {
    metaTitle: "Contact us | Linkly",
    metaDescription: "Contact the Linkly team for sales and technical support, and for help setting up your customer service channels, including WhatsApp and Instagram.",
    ogTitle: "Contact the Linkly team",
    ogDescription: "Our sales and support team is ready to help you set up your customer service channels."
  }),
  "/terms": page("/terms", {
    metaTitle: "شروط الاستخدام | Linkly",
    metaDescription: "شروط استخدام منصة Linkly لإدارة محادثات العملاء: الاستخدام المقبول، ربط القنوات، الحسابات والاشتراكات، والتعامل مع البيانات.",
    ogTitle: "شروط استخدام Linkly",
    ogDescription: "الشروط التي تحكم استخدام منصة Linkly: الحسابات، القنوات، والبيانات."
  }),
  "/en/terms": page("/en/terms", {
    metaTitle: "Terms of Service | Linkly",
    metaDescription: "The terms governing use of the Linkly customer communication platform: acceptable use, channel connections, accounts and subscriptions, and data handling.",
    ogTitle: "Linkly terms of service",
    ogDescription: "The terms that govern use of the Linkly platform: accounts, channels and data."
  }),
  "/privacy": page("/privacy", {
    metaTitle: "سياسة الخصوصية | Linkly",
    metaDescription: "كيف تجمع Linkly بياناتك وتستخدمها وتحميها: البيانات التي نعالجها، ملفات تعريف الارتباط، ومدة الاحتفاظ بها وحقوقك في التحكم بها.",
    ogTitle: "سياسة الخصوصية في Linkly",
    ogDescription: "كيف نجمع بياناتك ونستخدمها ونحميها، وما هي حقوقك."
  }),
  "/en/privacy": page("/en/privacy", {
    metaTitle: "Privacy Policy | Linkly",
    metaDescription: "How Linkly collects, uses and protects your data: what we process, cookies, how long we keep it, and your rights to control it.",
    ogTitle: "Linkly privacy policy",
    ogDescription: "How we collect, use and protect your data, and what rights you have."
  }),
  "/data-deletion": page("/data-deletion", {
    metaTitle: "حذف البيانات | Linkly",
    metaDescription: "كيف تطلب حذف بياناتك من Linkly، بما فيها البيانات المرتبطة بحسابات واتساب وفيسبوك وإنستقرام، وماذا يحدث بعد تقديم الطلب.",
    ogTitle: "طلب حذف البيانات من Linkly",
    ogDescription: "خطوات طلب حذف بياناتك وما يحدث بعد تقديم الطلب."
  }),
  "/en/data-deletion": page("/en/data-deletion", {
    metaTitle: "Data deletion | Linkly",
    metaDescription: "How to request deletion of your data from Linkly, including data tied to WhatsApp, Facebook and Instagram accounts, and what happens after you submit a request.",
    ogTitle: "Request data deletion from Linkly",
    ogDescription: "The steps to request deletion of your data and what happens afterwards."
  })
};
