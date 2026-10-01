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
      ar: ["رد آلي بسيط وردود سريعة", "حملات تسويقية أساسية", "تقارير أساسية"],
      en: ["Simple auto-reply and quick replies", "Basic marketing campaigns", "Basic reports"]
    }
  },
  "الباقة العادية": {
    shortName: { ar: "العادية", en: "Regular" },
    audience: { ar: "الأنسب لصاحب عمل بدأ يكبر ويحتاج قناة ثانية وفريق صغير.", en: "Best for a growing business that needs a second channel and a small team." },
    items: {
      ar: ["توزيع محادثات تلقائي", "وسوم وتقسيم جمهور بسيط", "تقارير أساسية"],
      en: ["Automatic conversation routing", "Tags and basic audience segments", "Basic reports"]
    }
  },
  "باقة المؤسسات الصغيرة": {
    shortName: { ar: "المؤسسات الصغيرة", en: "Small Enterprises" },
    audience: { ar: "الأنسب لفريق يحتاج أتمتة وتقسيم جمهور ومساعد AI.", en: "Best for a team that needs automation, audience segments, and an AI Assistant." },
    featured: true,
    items: {
      ar: ["فرق عمل متعددة", "أتمتة وقواعد تحويل متقدمة", "تقسيم جمهور واستهداف بالحملات", "مساعد AI", "تقارير أداء وSLA"],
      en: ["Multiple teams", "Advanced automation and routing rules", "Audience segments and campaign targeting", "AI Assistant", "Performance and SLA reports"]
    }
  },
  "باقة المؤسسات الكبيرة": {
    shortName: { ar: "المؤسسات الكبيرة", en: "Large Enterprises" },
    audience: { ar: "الأنسب لفرق متعددة تحتاج قنوات أكثر وواجهات تكامل.", en: "Best for multiple teams that need more channels and integrations." },
    items: {
      ar: ["كل مزايا المؤسسات الصغيرة", "واجهة برمجة API وWebhooks للمطورين", "مساعد AI", "دعم أولوية"],
      en: ["Everything in Small Enterprises", "Developer API and webhooks", "AI Assistant", "Priority support"]
    }
  },
  "باقة الشركات": {
    shortName: { ar: "الشركات", en: "Corporate" },
    audience: { ar: "الأنسب للشركات الكبيرة اللي تحتاج كل القنوات وحساب مخصص.", en: "Best for large companies that need every channel and a dedicated account." },
    items: {
      ar: ["علامة تجارية مخصّصة (White-label)", "مساعد AI", "مدير حساب مخصص ودعم VIP فوري"],
      en: ["Custom white-label branding", "AI Assistant", "Dedicated account manager and instant VIP support"]
    }
  }
};

export type PlanNumbers = { employeeLimit: number; allowedChannels: string; messageQuota: number };

/** The three numeric bullets (users, channels, message quota), always built fresh from the live Plan row. */
export function buildPlanDynamicItems(plan: PlanNumbers, lang: "ar" | "en"): string[] {
  const usersLine = lang === "ar" ? `حتى ${plan.employeeLimit} مستخدم` : `Up to ${plan.employeeLimit} users`;

  const parsedChannels = parseAllowedChannels(plan.allowedChannels);
  const channelsLine = parsedChannels === "*" || parsedChannels.length === 0
    ? (lang === "ar" ? "كل القنوات المتاحة بالمنصة" : "Every channel on the platform")
    : parsedChannels.map((key) => channelLabel(key, lang)).join(" + ");

  const messageQuotaLine = isUnlimitedMessageQuota(plan.messageQuota)
    ? (lang === "ar" ? "رسائل تسويقية غير محدودة" : "Unlimited marketing messages")
    : lang === "ar" ? `${messageQuotaLabel(plan.messageQuota, "ar")} رسالة تسويقية شهريًا` : `${messageQuotaLabel(plan.messageQuota, "en")} marketing messages/month`;

  return [usersLine, channelsLine, messageQuotaLine];
}

function fallbackTailItems(lang: "ar" | "en"): string[] {
  return lang === "ar" ? ["صندوق وارد موحّد", "أتمتة وتقارير", "دعم فني"] : ["Shared inbox", "Automation and reports", "Technical support"];
}

/** Full bullet list for a plan card: live numbers first, then the static descriptive copy (or a generic fallback for an unrecognized plan name). */
export function getPlanDisplayItems(plan: PlanNumbers & { name: string }, lang: "ar" | "en"): string[] {
  const dynamic = buildPlanDynamicItems(plan, lang);
  const tail = planFeatures[plan.name]?.items[lang] ?? fallbackTailItems(lang);
  return [...dynamic, ...tail];
}
