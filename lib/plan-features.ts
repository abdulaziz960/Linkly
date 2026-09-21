// Single source of truth for each pricing tier's marketing feature list -
// shared between the public pricing page (app/page.tsx, app/en/page.tsx)
// and the self-serve checkout page (app/billing/BillingClient.tsx), so a
// customer sees the exact same promised feature list before and after
// signing up. Keyed by the plan's real name in the database (Plan.name) -
// price/employeeLimit/messageQuota themselves are NOT duplicated here and
// always come live from the database, so an admin's price edit is reflected
// everywhere immediately without touching this file.
//
// A plan name with no entry here (a custom plan an admin created, or an old
// deactivated one) falls back to a short generic list built from its live
// numbers - see fallbackFeatureItems below - instead of showing nothing.

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
      ar: ["مستخدم واحد", "قناة واتساب", "1000 رسالة تسويقية شهريًا", "رد آلي بسيط وردود سريعة", "حملات تسويقية أساسية", "تقارير أساسية"],
      en: ["1 user", "WhatsApp channel", "1,000 marketing messages/month", "Simple auto-reply and quick replies", "Basic marketing campaigns", "Basic reports"]
    }
  },
  "الباقة العادية": {
    shortName: { ar: "العادية", en: "Regular" },
    audience: { ar: "الأنسب لصاحب عمل بدأ يكبر ويحتاج قناة ثانية وفريق صغير.", en: "Best for a growing business that needs a second channel and a small team." },
    items: {
      ar: ["حتى 3 مستخدمين", "واتساب + انستقرام", "3000 رسالة تسويقية شهريًا", "توزيع محادثات تلقائي", "وسوم وتقسيم جمهور بسيط", "تقارير أساسية"],
      en: ["Up to 3 users", "WhatsApp + Instagram", "3,000 marketing messages/month", "Automatic conversation routing", "Tags and basic audience segments", "Basic reports"]
    }
  },
  "باقة المؤسسات الصغيرة": {
    shortName: { ar: "المؤسسات الصغيرة", en: "Small Enterprises" },
    audience: { ar: "الأنسب لفريق يحتاج أتمتة وتقسيم جمهور ومساعد ذكاء اصطناعي.", en: "Best for a team that needs automation, audience segments, and an AI copilot." },
    featured: true,
    items: {
      ar: ["حتى 6 مستخدمين", "واتساب + انستقرام", "5000 رسالة تسويقية شهريًا", "فرق عمل متعددة", "أتمتة وقواعد تحويل متقدمة", "تقسيم جمهور واستهداف بالحملات", "مساعد ذكاء اصطناعي (AI Copilot)", "تقارير أداء وSLA"],
      en: ["Up to 6 users", "WhatsApp + Instagram", "5,000 marketing messages/month", "Multiple teams", "Advanced automation and routing rules", "Audience segments and campaign targeting", "AI Copilot", "Performance and SLA reports"]
    }
  },
  "باقة المؤسسات الكبيرة": {
    shortName: { ar: "المؤسسات الكبيرة", en: "Large Enterprises" },
    audience: { ar: "الأنسب لفرق متعددة تحتاج قنوات أكثر وواجهات تكامل.", en: "Best for multiple teams that need more channels and integrations." },
    items: {
      ar: ["حتى 8 مستخدمين", "واتساب + انستقرام + تيك توك", "7000 رسالة تسويقية شهريًا", "كل مزايا المؤسسات الصغيرة", "واجهة برمجة API وWebhooks للمطورين", "مساعد ذكاء اصطناعي بحد أعلى", "دعم أولوية"],
      en: ["Up to 8 users", "WhatsApp + Instagram + TikTok", "7,000 marketing messages/month", "Everything in Small Enterprises", "Developer API and webhooks", "AI Copilot with a higher limit", "Priority support"]
    }
  },
  "باقة الشركات": {
    shortName: { ar: "الشركات", en: "Corporate" },
    audience: { ar: "الأنسب للشركات الكبيرة اللي تحتاج كل القنوات وحساب مخصص.", en: "Best for large companies that need every channel and a dedicated account." },
    items: {
      ar: ["مستخدمين غير محدودين", "كل القنوات المتاحة بالمنصة", "رسائل تسويقية غير محدودة", "علامة تجارية مخصّصة (White-label)", "مساعد ذكاء اصطناعي بأعلى حد", "مدير حساب مخصص ودعم VIP فوري"],
      en: ["Unlimited users", "Every channel on the platform", "Unlimited marketing messages", "Custom white-label branding", "AI Copilot with the highest limit", "Dedicated account manager and instant VIP support"]
    }
  }
};

export function fallbackFeatureItems(employeeLimit: number, lang: "ar" | "en"): string[] {
  return lang === "ar"
    ? [`حتى ${employeeLimit} مستخدم`, "صندوق وارد موحّد", "أتمتة وتقارير", "دعم فني"]
    : [`Up to ${employeeLimit} users`, "Shared inbox", "Automation and reports", "Technical support"];
}
