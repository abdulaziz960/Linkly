import { prisma } from "./prisma";
import { logAdminAction } from "./subscriptions";

const THRESHOLDS = [50, 20, 5] as const;

/** Which alert thresholds (ascending severity) a given percent-remaining has crossed. */
export function thresholdsToAlert(percent: number): number[] {
  return THRESHOLDS.filter((threshold) => percent <= threshold);
}

/**
 * Warns tenants as their WhatsApp campaign-messaging balance drains, at 50%,
 * 20%, and 5% of their last top-up. Runs off the existing cron trigger rather
 * than a new schedule; dedup uses admin_logs markers (see
 * sendTrialEndingReminders in lib/subscriptions.ts for the same pattern) so a
 * tenant only gets each threshold's alert once per top-up cycle - the top-up
 * amount is baked into the marker, so a fresh top-up naturally re-arms every
 * threshold for the next drain.
 */
export async function sendLowBalanceAlerts(baseUrl: string) {
  const balances = await prisma.campaignBalance.findMany({ where: { lastTopUpAmount: { gt: 0 } } });
  let sent = 0;

  for (const row of balances) {
    const percent = (row.balance / row.lastTopUpAmount) * 100;
    for (const threshold of thresholdsToAlert(percent)) {
      const marker = `[balance-alert-${threshold}:${row.tenantId}:${row.lastTopUpAmount}]`;
      const alreadySent = await prisma.adminLog.findFirst({ where: { message: { contains: marker } } });
      if (alreadySent) continue;

      const owner = await prisma.userAccount.findFirst({
        where: { tenantId: row.tenantId, role: "مالك الحساب" },
        orderBy: { createdAt: "asc" }
      });

      let delivered = false;
      if (owner?.email) {
        const { sendLowBalanceEmail } = await import("./email");
        delivered = await sendLowBalanceEmail({
          to: owner.email,
          name: owner.name,
          remaining: row.balance,
          percent: Math.round(percent),
          topUpUrl: `${baseUrl}/dashboard?view=campaigns&tab=balance`
        });
      }

      await logAdminAction(
        row.tenantId,
        owner?.name || row.tenantId,
        `${marker} ${delivered ? "تم إرسال" : "تعذر إرسال"} تنبيه انخفاض رصيد الحملات (${Math.round(percent)}% متبقٍ، ${row.balance} رسالة) ${owner?.email ? `إلى ${owner.email}` : "- لا يوجد بريد مالك حساب"}`
      );
      if (delivered) sent += 1;
    }
  }

  return { sent };
}
