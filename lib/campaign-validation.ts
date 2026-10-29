/** Requirements for a template whose URL button uses a per-recipient suffix. Shared by the form and send routes. */
export function requiresCampaignLinkTracking(template: { buttonType?: string; buttonUrl?: string } | null | undefined): boolean {
  return template?.buttonType === "URL" && /\{\{\s*1\s*\}\}\s*$/.test(template.buttonUrl ?? "");
}

export function campaignLinkTrackingIssue(
  template: { buttonType?: string; buttonUrl?: string } | null | undefined,
  campaign: { enabled: boolean; destinationUrl: string; recurring?: boolean }
): { ar: string; en: string } | null {
  if (!requiresCampaignLinkTracking(template)) return null;
  if (campaign.recurring) return { ar: "هذا القالب يحتاج تتبع الروابط، وهو غير مدعوم للحملات المتكررة حاليًا. اختر قالبًا برابط ثابت أو حملة غير متكررة.", en: "This template requires link tracking, which recurring campaigns do not support yet. Choose a static-link template or a one-off campaign." };
  if (!campaign.enabled) return { ar: "هذا القالب يحتاج تفعيل تتبع الروابط لهذه الحملة - الزر يعتمد على رابط تتبع لكل عميل", en: "Enable link tracking for this campaign: the template button requires a tracking link for each customer." };
  try {
    const url = new URL(campaign.destinationUrl);
    if (url.protocol === "https:" || url.protocol === "http:") return null;
  } catch { /* Return the same actionable validation error for missing or malformed URLs. */ }
  return { ar: "أدخل رابط وجهة صحيحًا يبدأ بـ https:// أو http:// قبل بدء الحملة.", en: "Enter a valid destination URL starting with https:// or http:// before starting the campaign." };
}
