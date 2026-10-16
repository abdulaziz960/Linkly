// What a paying workspace's owner should be told inside the dashboard about the subscription (isomorphic: no Prisma).
// The emails already go out (lib/subscriptions.ts); this is the notice that is seen without opening the mailbox.

export type RenewalNoticeInput = {
  status: string;
  renewalAt: string;
  cancelledAt?: string;
  autoRenewEnabled?: number;
  autoRenewFailCount?: number;
};

export type RenewalNotice =
  | { kind: "overdue"; daysOverdue: number }
  | { kind: "charge-failed" }
  | { kind: "ending-soon"; daysLeft: number };

/** Days before the paid-through date at which a workspace that is not on auto-renew is warned. */
export const RENEWAL_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

export function getRenewalNotice(subscription: RenewalNoticeInput | null | undefined, now = Date.now()): RenewalNotice | null {
  if (!subscription || subscription.status !== "نشط" || subscription.cancelledAt) return null;
  const renewal = new Date(subscription.renewalAt).getTime();
  if (!Number.isFinite(renewal)) return null;
  const msLeft = renewal - now;
  if (msLeft <= 0) return { kind: "overdue", daysOverdue: Math.floor(-msLeft / DAY_MS) };
  // The saved card was declined (or the plan could not be charged): said before the date, not only after it.
  if ((subscription.autoRenewFailCount ?? 0) > 0) return { kind: "charge-failed" };
  // On auto-renew the card is charged by itself, so a "renew now" nudge would only confuse.
  if (subscription.autoRenewEnabled) return null;
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  return daysLeft <= RENEWAL_WARNING_DAYS ? { kind: "ending-soon", daysLeft } : null;
}
