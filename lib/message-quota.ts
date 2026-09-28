// Pure helpers for Plan.messageQuota - no prisma import, safe for client
// components (app/linkly-admin007/plans/PlansView.tsx).

/** Plan.messageQuota sentinel meaning "no cap" (باقة الشركات today). */
export const UNLIMITED_MESSAGE_QUOTA = -1;

/**
 * What actually gets credited to CampaignBalance for an "unlimited" plan -
 * a real, finite number is required because the balance is a hard spend
 * gate (see reserveCampaignCredit in lib/campaign-engine.ts, which blocks a
 * send once balance hits 0). Large enough that no real tenant sending
 * WhatsApp marketing campaigns will ever exhaust it.
 */
export const UNLIMITED_MESSAGE_CREDIT = 1_000_000;

export function isUnlimitedMessageQuota(quota: number): boolean {
  return quota < 0;
}

export function messageQuotaLabel(quota: number, lang: "ar" | "en" = "ar"): string {
  if (isUnlimitedMessageQuota(quota)) return lang === "ar" ? "غير محدود" : "Unlimited";
  return quota.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
}
