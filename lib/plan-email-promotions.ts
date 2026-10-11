import { messageQuotaLabel } from "./message-quota";

const EMAIL_PROMOTION_MONTHLY_CREDITS: Record<string, number> = {
  "الباقة العادية": 100,
  "باقة المؤسسات الصغيرة": 250,
  "باقة المؤسسات الكبيرة": 500,
  "باقة الشركات": 1000
};

/** `emailQuota` is the plan row's own value (admin-edited); -1 or missing falls back to the built-in default for the name. */
export function emailPromotionCreditsForPlan(planName: string, emailQuota?: number | null) {
  if (typeof emailQuota === "number" && emailQuota >= 0) return emailQuota;
  return EMAIL_PROMOTION_MONTHLY_CREDITS[planName] ?? 0;
}

export function emailPromotionCreditLabel(planName: string, lang: "ar" | "en" = "ar", emailQuota?: number | null) {
  const credits = emailPromotionCreditsForPlan(planName, emailQuota);
  if (!credits) return lang === "ar" ? "لا يشمل رصيد بريد تسويقي" : "No promotional email credits included";
  const formatted = messageQuotaLabel(credits, lang);
  return lang === "ar" ? `${formatted} بريد تسويقي شهريًا` : `${formatted} promotional emails/month`;
}
