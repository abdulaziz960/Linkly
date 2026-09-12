// Shared between the campaign report UI (app/dashboard/views/CampaignsView.tsx)
// and segment resolution (lib/segments.ts) so "opened"/"clicked"/"notOpened"
// mean exactly the same thing in both places. Pure and I/O-free so it can be
// imported from a client component as well as server-only code.
export type EngagementBucket = "notOpened" | "opened" | "clicked";

export function engagementBucketFor(recipient: { status: string; readAt: string; clickedAt: string }): EngagementBucket | null {
  if (recipient.status !== "تم الإرسال") return null;
  if (recipient.clickedAt) return "clicked";
  if (recipient.readAt) return "opened";
  return "notOpened";
}
