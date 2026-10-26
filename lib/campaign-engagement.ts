// Shared between the campaign report UI (app/dashboard/views/CampaignsView.tsx)
// and segment resolution (lib/segments.ts) so "notReceived"/"notOpened"/
// "opened"/"clicked" mean exactly the same thing everywhere. Pure and
// I/O-free so it can be imported from a client component as well as
// server-only code.
export type EngagementBucket = "notReceived" | "notOpened" | "opened" | "clicked" | "unsubscribed";

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
export function engagementBucketFor(recipient: { status: string; readAt: string; clickedAt: string; repliedAt?: string; deliveryFailed?: number | boolean; unsubscribed?: boolean }): EngagementBucket | null {
  // "clicked" is the "تفاعل" bucket: a link/button click OR a written reply. Opting out wins over everything
  // (set by the caller only when the customer unsubscribed after this send).
  if (recipient.unsubscribed) return "unsubscribed";
  // A read receipt or a tracked click proves the customer got the message, whatever a failure flag says
  // (a late/contradictory "failed" status, or a send our side recorded as failed after Meta had accepted it).
  if (recipient.clickedAt || recipient.repliedAt) return "clicked";
  if (recipient.readAt) return "opened";
  if (recipient.status === "فشل الإرسال") return "notReceived";
  if (recipient.status !== "تم الإرسال") return null;
  if (recipient.deliveryFailed) return "notReceived";
  return "notOpened";
}
