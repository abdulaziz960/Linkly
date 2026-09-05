import { getAdminLogs } from "./database";
import { getSubscriptions } from "./subscriptions";

const RENEWAL_SOON_DAYS = 7;

export type AdminNotification = {
  id: string;
  type: "renewal" | "log";
  level: "معلومة" | "تنبيه" | "خطأ";
  title: string;
  message: string;
  at: string;
  clientName: string;
  tenantId: string;
};

function parseRenewalDate(renewalAt: string) {
  if (!renewalAt) return null;
  const date = new Date(`${renewalAt}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getAdminNotifications(): Promise<AdminNotification[]> {
  const [subscriptions, logs] = await Promise.all([getSubscriptions(), getAdminLogs()]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const renewalNotifications: AdminNotification[] = [];
  for (const subscription of subscriptions) {
    if (subscription.status !== "نشط") continue;
    const renewalDate = parseRenewalDate(subscription.renewalAt);
    if (!renewalDate) continue;

    const diffDays = Math.round((renewalDate.getTime() - today.getTime()) / 86400000);
    if (diffDays > RENEWAL_SOON_DAYS) continue;

    const overdue = diffDays < 0;
    const label = overdue
      ? `متأخر عن التجديد ${Math.abs(diffDays)} يوم`
      : diffDays === 0
        ? "يتجدد اليوم"
        : `يتجدد خلال ${diffDays} يوم`;

    renewalNotifications.push({
      id: `renewal-${subscription.tenantId}`,
      type: "renewal",
      level: overdue ? "خطأ" : "تنبيه",
      title: overdue ? `اشتراك متأخر: ${subscription.companyName}` : `تجديد قريب: ${subscription.companyName}`,
      message: `${subscription.plan} · ${label}`,
      at: subscription.renewalAt,
      clientName: subscription.companyName,
      tenantId: subscription.tenantId
    });
  }
  renewalNotifications.sort((a, b) => (a.level === "خطأ" ? 0 : 1) - (b.level === "خطأ" ? 0 : 1));

  // Log rows are raw and technical (source is a route path, message is a
  // full "GET /x فشل: ..." string) - unusable as a notification title
  // as-is. They also repeat verbatim once per affected channel/request, so
  // the same underlying incident (e.g. one bad credential breaking five
  // integrations at once) used to show up as five near-identical rows.
  // Collapse by a signature that strips the query string (the only thing
  // that varies between them) and keep just the newest per signature, with
  // a count for the rest.
  const recentLogs = logs.slice().reverse().slice(0, 80);
  const bySignature = new Map<string, { log: (typeof recentLogs)[number]; count: number }>();
  for (const log of recentLogs) {
    const signature = `${log.level}::${log.source}::${log.message.replace(/\?\S*/g, "")}`;
    const existing = bySignature.get(signature);
    if (existing) {
      existing.count += 1;
    } else {
      bySignature.set(signature, { log, count: 1 });
    }
  }

  const logNotifications: AdminNotification[] = Array.from(bySignature.values())
    .slice(0, 40)
    .map(({ log, count }) => {
      const summary = log.message.length > 70 ? `${log.message.slice(0, 70)}…` : log.message;
      return {
        id: log.id,
        type: "log",
        level: log.level,
        title: count > 1 ? `${summary} (×${count})` : summary,
        message: log.source,
        at: log.at,
        clientName: log.clientName,
        tenantId: log.clientId
      };
    });

  return [...renewalNotifications, ...logNotifications];
}
