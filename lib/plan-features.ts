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

export type PlanFeatures = {
  shortName: { ar: string; en: string };
  audience: { ar: string; en: string };
  items: { ar: string[]; en: string[] };
  featured?: boolean;
};

export const planFeatures: Record<string, PlanFeatures> = {
  "باقة الأفراد": {
    shortName: { ar: "الأفراد", en: "Individuals" },
    audience: { ar: "الأنسب لصاحب عمل يبدأ لحاله ويحتاج يرتب رسائل واتساب.", en: "Best for a solo business owner who needs their WhatsApp messages organized." },
    items: {
      ar: ["رد آلي بسيط جدًا (حتى 6 خطوات)", "وسوم وردود سريعة", "رسالة ترحيب لفتح المحادثة بعد 24 ساعة", "تقرير أساسي"],
      en: ["Very simple auto-reply (up to 6 steps)", "Tags and quick replies", "Welcome message to re-open a chat after 24h", "Basic report"]
    }
  },
  "الباقة العادية": {
    shortName: { ar: "العادية", en: "Regular" },
    audience: { ar: "الأنسب لصاحب عمل بدأ يكبر ويحتاج قناة ثانية وفريق صغير.", en: "Best for a growing business that needs a second channel and a small team." },
    items: {
      ar: ["كل مزايا الأفراد", "رد آلي حتى 15 خطوة وساعات عمل", "فريقان وتوزيع محادثات تلقائي", "قوالب وحملات وتقسيم جمهور بالوسوم", "مساعد AI بربط مفتاحك الخاص", "إرسال أقرب فرع للعميل تلقائيًا (حتى 30 فرعًا)", "كانبان المبيعات وتصعيد المحادثات (30 دقيقة)", "تقارير أساسية"],
      en: ["Everything in Individuals", "Auto-reply up to 15 steps and work hours", "2 teams and automatic routing", "Templates, campaigns and tag-based segments", "AI assistant with your own API key", "Automatically send the customer their nearest branch (up to 30 branches)", "Sales pipeline and escalation (30 min)", "Basic reports"]
    }
  },
  "باقة المؤسسات الصغيرة": {
    shortName: { ar: "المؤسسات الصغيرة", en: "Small Enterprises" },
    audience: { ar: "الأنسب لفريق يحتاج أتمتة وتقسيم جمهور ومساعد AI.", en: "Best for a team that needs automation, audience segments, and an AI Assistant." },
    featured: true,
    items: {
      ar: ["كل مزايا العادية", "فرق متعددة وأتمتة وقواعد تحويل", "مساعد AI (50 طلبًا يوميًا) وقاعدة معرفة (50 مدخلًا)", "حملات متكررة وتقسيم جمهور بتفاعل الحملات", "إرسال أقرب فرع للعميل (حتى 65 فرعًا)", "تصعيد بمدة قابلة للتعديل ومركز عمليات", "تقارير أداء وSLA"],
      en: ["Everything in Regular", "Multiple teams, automation and routing rules", "AI assistant (50 requests/day) and knowledge base (50 entries)", "Recurring campaigns and campaign-engagement segments", "Nearest-branch reply (up to 65 branches)", "Adjustable escalation and operations center", "Performance and SLA reports"]
    }
  },
  "باقة المؤسسات الكبيرة": {
    shortName: { ar: "المؤسسات الكبيرة", en: "Large Enterprises" },
    audience: { ar: "الأنسب لفرق متعددة تحتاج قنوات أكثر وواجهات تكامل.", en: "Best for multiple teams that need more channels and integrations." },
    items: {
      ar: ["كل مزايا المؤسسات الصغيرة", "كتالوج المنتجات والشراء من واتساب (حتى 300 منتج)", "مساعد AI (100 طلب يوميًا) وقاعدة معرفة (200 مدخل)", "إرسال أقرب فرع للعميل (حتى 100 فرع)", "واجهة API وWebhooks وتكاملات", "تصدير Excel ودعم أولوية"],
      en: ["Everything in Small Enterprises", "Product catalog and buying on WhatsApp (up to 300 products)", "AI assistant (100 requests/day) and knowledge base (200 entries)", "Nearest-branch reply (up to 100 branches)", "Developer API, webhooks and integrations", "Excel export and priority support"]
    }
  },
  "باقة الشركات": {
    shortName: { ar: "الشركات", en: "Corporate" },
    audience: { ar: "الأنسب للشركات الكبيرة اللي تحتاج كل القنوات وحساب مخصص.", en: "Best for large companies that need every channel and a dedicated account." },
    items: {
      ar: ["كل مزايا المؤسسات الكبيرة بدون حدود", "كتالوج وفروع وقاعدة معرفة غير محدودة", "مساعد AI (300 طلب يوميًا)", "علامة تجارية مخصّصة (White-label)", "مدير حساب مخصص ودعم VIP فوري"],
      en: ["Everything in Large Enterprises, unlimited", "Unlimited catalog, branches and knowledge base", "AI assistant (300 requests/day)", "Custom white-label branding", "Dedicated account manager and instant VIP support"]
    }
  }
};

export type PlanNumbers = { employeeLimit: number; allowedChannels: string; messageQuota: number };

/** The three numeric bullets (users, channels, message quota), always built fresh from the live Plan row. */
export function buildPlanDynamicItems(plan: PlanNumbers, lang: "ar" | "en", options: { skipQuota?: boolean } = {}): string[] {
  const usersLine = lang === "ar" ? `حتى ${plan.employeeLimit} مستخدم` : `Up to ${plan.employeeLimit} users`;

  const parsedChannels = parseAllowedChannels(plan.allowedChannels);
  const channelsLine = parsedChannels === "*" || parsedChannels.length === 0
    ? (lang === "ar" ? "كل القنوات المتاحة بالمنصة" : "Every channel on the platform")
    : parsedChannels.length > 4
      ? `${parsedChannels.slice(0, 3).map((key) => channelLabel(key, lang)).join(" + ")}${lang === "ar" ? ` + ${parsedChannels.length - 3} قنوات أخرى` : ` + ${parsedChannels.length - 3} more channels`}`
      : parsedChannels.map((key) => channelLabel(key, lang)).join(" + ");

  const messageQuotaLine = isUnlimitedMessageQuota(plan.messageQuota)
    ? (lang === "ar" ? "رسائل تسويقية غير محدودة" : "Unlimited marketing messages")
    : lang === "ar" ? `${messageQuotaLabel(plan.messageQuota, "ar")} رسالة تسويقية شهريًا` : `${messageQuotaLabel(plan.messageQuota, "en")} marketing messages/month`;

  // A plan that has no campaigns section has no marketing messages to promise.
  return options.skipQuota ? [usersLine, channelsLine] : [usersLine, channelsLine, messageQuotaLine];
}

function fallbackTailItems(lang: "ar" | "en"): string[] {
  return lang === "ar" ? ["صندوق وارد موحّد", "أتمتة وتقارير", "دعم فني"] : ["Shared inbox", "Automation and reports", "Technical support"];
}

/** Full bullet list for a plan card: live numbers first, then the static descriptive copy (or a generic fallback for an unrecognized plan name). */
export function getPlanDisplayItems(plan: PlanNumbers & { name: string }, lang: "ar" | "en"): string[] {
  const dynamic = buildPlanDynamicItems(plan, lang, { skipQuota: isViewLockedForPlan(plan.name, "campaigns") });
  const tail = planFeatures[plan.name]?.items[lang] ?? fallbackTailItems(lang);
  return [...dynamic, ...tail];
}
