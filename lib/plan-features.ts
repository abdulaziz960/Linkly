// Single source of truth for each pricing tier's marketing content - shared
// between the public pricing page (app/page.tsx, app/en/page.tsx) and the
// self-serve checkout page (app/billing/BillingClient.tsx), so a customer
// sees the exact same thing before and after signing up.
//
// Only the qualitative, non-numeric copy lives here (audience blurb,
// descriptive feature bullets, which tier is "featured"). The numeric bullets
// (user count, channels, message quota) are built fresh from the live Plan
// row by buildPlanDynamicItems below, so an admin editing a plan's price,
// employee limit, channels or message quota is reflected on both pages
// immediately with no code change - see getPlanDisplayItems.
//
// A plan name with no entry here (a custom plan an admin created, or one
// they renamed) falls back to the plan's own name and a short generic list
// built entirely from its live numbers, instead of showing nothing.

import { parseAllowedChannels, channelLabel } from "./channel-catalog";
import { isUnlimitedMessageQuota, messageQuotaLabel } from "./message-quota";
import { isViewLockedForPlan } from "./plan-access";
import { emailPromotionCreditsForPlan, emailPromotionCreditLabel } from "./plan-email-promotions";

/** How a quote-based plan's limits read everywhere (plan card and comparison table alike). */
export const BY_AGREEMENT = { ar: "حسب الاتفاق", en: "By agreement" } as const;

/**
 * "3 users" with the right plural in both languages. Arabic: 1 مستخدم واحد,
 * 2 مستخدمان, 3-10 مستخدمين, 11+ مستخدم. `upTo` prefixes حتى / Up to.
 */
export function usersLabel(count: number, lang: "ar" | "en", upTo = false): string {
  if (lang === "en") return `${upTo ? "Up to " : ""}${count} ${count === 1 ? "user" : "users"}`;
  const noun = count === 1 ? "مستخدم واحد" : count === 2 ? "مستخدمان" : count >= 3 && count <= 10 ? `${count} مستخدمين` : `${count} مستخدم`;
  return upTo ? `حتى ${noun}` : noun;
}

export type PlanFeatures = {
  shortName: { ar: string; en: string };
  audience: { ar: string; en: string };
  items: { ar: string[]; en: string[] };
  featured?: boolean;
  /** Quote-based plan: no price, every feature selectable; the CTA goes to the contact page. */
  custom?: boolean;
};

export const planFeatures: Record<string, PlanFeatures> = {
  "باقة الأفراد": {
    shortName: { ar: "الأفراد", en: "Individuals" },
    audience: { ar: "الأنسب لصاحب عمل يبدأ لحاله ويحتاج يرتب رسائل واتساب.", en: "Best for a solo business owner who needs their WhatsApp messages organized." },
    items: {
      ar: ["رد آلي بسيط جدًا (حتى 6 خطوات)", "وسوم وردود سريعة", "قالب واتساب معتمد لمتابعة العميل بعد نافذة الـ24 ساعة", "ربط متجر سلة: الطلبات والسلات المتروكة وإشعارات واتساب", "إشعارات واتساب لكل حالة طلب وشحنة", "استرجاع السلات المتروكة برسالة واتساب", "متابعة الطلبات والشحن من داخل المحادثة", "تقرير أساسي"],
      en: ["Very simple auto-reply (up to 6 steps)", "Tags and quick replies", "Approved WhatsApp template to follow up after the 24-hour window", "Salla store link: orders, abandoned carts and WhatsApp updates", "WhatsApp notifications for every order and shipment status", "Abandoned-cart recovery by WhatsApp message", "Track orders and shipping from inside the chat", "Basic report"]
    }
  },
  "الباقة العادية": {
    shortName: { ar: "العادية", en: "Regular" },
    audience: { ar: "الأنسب لصاحب عمل بدأ يكبر ويحتاج قناة ثانية وفريق صغير.", en: "Best for a growing business that needs a second channel and a small team." },
    items: {
      ar: ["كل مزايا الأفراد", "رد آلي حتى 15 خطوة وساعات عمل", "فريقان وتوزيع محادثات تلقائي", "قوالب وحملات وتقسيم جمهور بالوسوم", "مساعد AI بربط مفتاحك الخاص", "إرسال أقرب فرع للعميل تلقائيًا (حتى 30 فرعًا)", "تصعيد المحادثات (30 دقيقة)", "تقارير أساسية"],
      en: ["Everything in Individuals", "Auto-reply up to 15 steps and work hours", "2 teams and automatic routing", "Templates, campaigns and tag-based segments", "AI assistant with your own API key", "Automatically send the customer their nearest branch (up to 30 branches)", "Conversation escalation (30 min)", "Basic reports"]
    }
  },
  "باقة المؤسسات الصغيرة": {
    shortName: { ar: "المؤسسات الصغيرة", en: "Small Enterprises" },
    audience: { ar: "الأنسب لفريق يحتاج أتمتة وتقسيم جمهور ومساعد AI.", en: "Best for a team that needs automation, audience segments, and an AI Assistant." },
    featured: true,
    items: {
      ar: ["كل مزايا العادية", "فرق متعددة وأتمتة وقواعد تحويل", "مساعد AI (50 طلبًا يوميًا) وقاعدة معرفة (50 مدخلًا)", "حملات متكررة وتقسيم جمهور بتفاعل الحملات", "إرسال أقرب فرع للعميل (حتى 65 فرعًا)", "تصعيد بمدة قابلة للتعديل ومركز عمليات", "تحسين الحملات الإعلانية بإرسال أحداث التحويل إلى ميتا", "تقارير أداء وSLA"],
      en: ["Everything in Regular", "Multiple teams, automation and routing rules", "AI assistant (50 requests/day) and knowledge base (50 entries)", "Recurring campaigns and campaign-engagement segments", "Nearest-branch reply (up to 65 branches)", "Adjustable escalation and operations center", "Better ad campaigns by sending conversion events to Meta", "Performance and SLA reports"]
    }
  },
  "باقة المؤسسات الكبيرة": {
    shortName: { ar: "المؤسسات الكبيرة", en: "Large Enterprises" },
    audience: { ar: "الأنسب لفرق متعددة تحتاج قنوات أكثر وواجهات تكامل.", en: "Best for multiple teams that need more channels and integrations." },
    items: {
      ar: ["كل مزايا المؤسسات الصغيرة", "كتالوج المنتجات والشراء من واتساب (حتى 300 منتج)", "مساعد AI (100 طلب يوميًا) وقاعدة معرفة (200 مدخل)", "إرسال أقرب فرع للعميل (حتى 100 فرع)", "ربط متجر سلة: مزامنة المنتجات والطلبات والكوبونات (زد وشوبيفاي قريبًا)", "إرسال أحداث التحويل إلى ميتا وسناب شات وتيك توك لتحسين الحملات", "واجهة API وWebhooks وتكاملات", "تصدير Excel ودعم أولوية"],
      en: ["Everything in Small Enterprises", "Product catalog and buying on WhatsApp (up to 300 products)", "AI assistant (100 requests/day) and knowledge base (200 entries)", "Nearest-branch reply (up to 100 branches)", "Salla store integration: products, orders and coupons (Zid and Shopify coming soon)", "Conversion events to Meta, Snapchat and TikTok to optimise campaigns", "Developer API, webhooks and integrations", "Excel export and priority support"]
    }
  },
  "باقة الشركات": {
    shortName: { ar: "صمم باقتك", en: "Build your plan" },
    custom: true,
    audience: { ar: "تواصل معنا واختر المزايا والقنوات والحدود التي تحتاجها، ونصدر لك عرض سعر خاص بما طلبته.", en: "Contact us, pick the features, channels and limits you need, and we'll send you a quote for exactly that." },
    items: {
      ar: ["عدد المستخدمين حسب الاتفاق", "كل القنوات المتاحة: واتساب وإنستقرام وتيليجرام وفيسبوك وجيميل ويوتيوب ولينكدإن وسناب وSMS وغيرها", "رسائل تسويقية وحملات متكررة بلا حدود", "1,000 بريد تسويقي شهريًا أو حسب الاتفاق", "شرائح عملاء متقدمة وتقارير وتصدير Excel", "أتمتة وبوت بخطوات وعقد بلا حدود", "كتالوج المنتجات والشراء من واتساب بعدد تحدده", "الفروع وإرسال أقرب فرع بعدد تحدده", "قاعدة المعرفة ومساعد AI بحدود تناسبك", "التصعيد التلقائي للمحادثات", "ربط متجر سلة (زد وشوبيفاي قريبًا)", "إرسال أحداث التحويل إلى ميتا وسناب شات وتيك توك", "واجهة API وWebhooks وتكاملات", "علامة تجارية مخصّصة (White-label)", "مدير حساب مخصص ودعم VIP فوري"],
      en: ["Number of users by agreement", "Every available channel: WhatsApp, Instagram, Telegram, Facebook, Gmail, YouTube, LinkedIn, Snapchat, SMS and more", "Unlimited marketing messages and recurring campaigns", "1,000 promotional emails/month or by agreement", "Advanced customer segments, reports and Excel export", "Automation and bots with unlimited steps and nodes", "Product catalog and buying on WhatsApp, sized to you", "Branches and nearest-branch replies, sized to you", "Knowledge base and AI assistant with limits that fit you", "Automatic conversation escalation", "Salla store integration (Zid and Shopify coming soon)", "Conversion events to Meta, Snapchat and TikTok", "Developer API, webhooks and integrations", "Custom white-label branding", "Dedicated account manager and instant VIP support"]
    }
  }
};

export type PlanNumbers = {
  employeeLimit: number;
  allowedChannels: string;
  messageQuota: number;
  name?: string;
  featureItemsAr?: string | null;
  featureItemsEn?: string | null;
  emailQuota?: number | null;
};

/** The three numeric bullets (users, channels, message quota), always built fresh from the live Plan row. */
export function buildPlanDynamicItems(plan: PlanNumbers, lang: "ar" | "en", options: { skipQuota?: boolean } = {}): string[] {
  const usersLine = usersLabel(plan.employeeLimit, lang, true);

  const parsedChannels = parseAllowedChannels(plan.allowedChannels);
  const channelsLine = parsedChannels === "*" || parsedChannels.length === 0
    ? (lang === "ar" ? "كل القنوات المتاحة بالمنصة" : "Every channel on the platform")
    : parsedChannels.length > 4
      ? `${parsedChannels.slice(0, 3).map((key) => channelLabel(key, lang)).join(" + ")}${lang === "ar" ? ` + ${parsedChannels.length - 3} قنوات أخرى` : ` + ${parsedChannels.length - 3} more channels`}`
      : parsedChannels.map((key) => channelLabel(key, lang)).join(" + ");

  const messageQuotaLine = isUnlimitedMessageQuota(plan.messageQuota)
    ? (lang === "ar" ? "رسائل تسويقية غير محدودة" : "Unlimited marketing messages")
    // Western digits in both languages, like every other number on the pricing cards.
    : lang === "ar" ? `${messageQuotaLabel(plan.messageQuota, "en")} رسالة تسويقية شهريًا` : `${messageQuotaLabel(plan.messageQuota, "en")} marketing messages/month`;
  const emailCredits = emailPromotionCreditsForPlan(plan.name || "", plan.emailQuota);
  const emailCreditsLine = emailCredits
    ? (lang === "ar" ? `${messageQuotaLabel(emailCredits, "en")} بريد تسويقي شهريًا` : emailPromotionCreditLabel(plan.name || "", lang, plan.emailQuota))
    : "";

  // A plan that has no campaigns section has no marketing messages to promise.
  return options.skipQuota ? [usersLine, channelsLine] : [usersLine, channelsLine, messageQuotaLine, emailCreditsLine].filter(Boolean);
}

function fallbackTailItems(lang: "ar" | "en"): string[] {
  return lang === "ar" ? ["صندوق وارد موحّد", "أتمتة وتقارير", "دعم فني"] : ["Shared inbox", "Automation and reports", "Technical support"];
}

/** Full bullet list for a plan card: live numbers first, then the static descriptive copy (or a generic fallback for an unrecognized plan name). */
function parseCustomFeatureItems(value?: string | null): string[] {
  return (value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function getPlanDisplayItems(plan: PlanNumbers & { name: string }, lang: "ar" | "en"): string[] {
  const own = planFeatures[plan.name];
  const customItems = parseCustomFeatureItems(lang === "ar" ? plan.featureItemsAr : plan.featureItemsEn);
  if (own?.custom) return customItems.length ? customItems : own.items[lang];
  const dynamic = buildPlanDynamicItems(plan, lang, { skipQuota: isViewLockedForPlan(plan.name, "campaigns") });
  const tail = customItems.length ? customItems : (planFeatures[plan.name]?.items[lang] ?? fallbackTailItems(lang));
  return [...dynamic, ...tail];
}

/** A plan's name for the UI language: the stored plan rows carry Arabic names, so English shows the English short name. */
export function planDisplayName(name: string, lang: "ar" | "en"): string {
  if (lang === "ar") return name;
  const entry = planFeatures[name];
  if (!entry) return name;
  return entry.custom ? entry.shortName.en : `${entry.shortName.en} plan`;
}
