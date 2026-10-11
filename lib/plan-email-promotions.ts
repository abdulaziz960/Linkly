import { messageQuotaLabel } from "./message-quota";

const EMAIL_PROMOTION_MONTHLY_CREDITS: Record<string, number> = {
  "الباقة العادية": 500,
  "باقة المؤسسات الصغيرة": 1000,
  "باقة المؤسسات الكبيرة": 3000,
  "باقة الشركات": 5000
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
