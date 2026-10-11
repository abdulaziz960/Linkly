import { messageQuotaLabel } from "./message-quota";

const EMAIL_PROMOTION_MONTHLY_CREDITS: Record<string, number> = {
  "الباقة العادية": 100,
  "باقة المؤسسات الصغيرة": 250,
  "باقة المؤسسات الكبيرة": 500,
  "باقة الشركات": 1000
};

export function emailPromotionCreditsForPlan(planName: string) {
  return EMAIL_PROMOTION_MONTHLY_CREDITS[planName] ?? 0;
}

export function emailPromotionCreditLabel(planName: string, lang: "ar" | "en" = "ar") {
  const credits = emailPromotionCreditsForPlan(planName);
  if (!credits) return lang === "ar" ? "لا يشمل رصيد بريد تسويقي" : "No promotional email credits included";
  const formatted = messageQuotaLabel(credits, lang);
  return lang === "ar" ? `${formatted} بريد تسويقي شهريًا` : `${formatted} promotional emails/month`;
}
