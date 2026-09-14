// Shared between the campaign report UI (app/dashboard/views/CampaignsView.tsx)
// and segment resolution (lib/segments.ts) so "notReceived"/"notOpened"/
// "opened"/"clicked" mean exactly the same thing everywhere. Pure and
// I/O-free so it can be imported from a client component as well as
// server-only code.
export type EngagementBucket = "notReceived" | "notOpened" | "opened" | "clicked";

/**
 * "notReceived" covers two distinct failure points that both mean the
 * customer never actually got the message: our own send attempt failing
 * outright (status "فشل الإرسال" - insufficient balance, invalid number,
 * API error), and WhatsApp accepting the send but later reporting async
 * delivery failure (deliveryFailed, stamped from the webhook's "failed"
 * status event - e.g. the recipient has marketing/template messages turned
 * off, or blocked the business). A still-in-progress send ("قيد الإرسال" /
 * "جارٍ الإرسال") has no outcome yet, so it returns null rather than being
 * counted anywhere.
 */
export function engagementBucketFor(recipient: { status: string; readAt: string; clickedAt: string; deliveryFailed?: number | boolean }): EngagementBucket | null {
  if (recipient.status === "فشل الإرسال") return "notReceived";
  if (recipient.status !== "تم الإرسال") return null;
  if (recipient.deliveryFailed) return "notReceived";
  if (recipient.clickedAt) return "clicked";
  if (recipient.readAt) return "opened";
  return "notOpened";
}
