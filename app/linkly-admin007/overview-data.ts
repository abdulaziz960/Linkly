import type { PaymentRow, SubscriptionRow } from "./types";
import type { AdminLog } from "../../lib/database";
import { CYCLE_MONTHS, isBillingCycle } from "../../lib/billing-pricing";
import { EXTRA_USER_PRICE, parseTimestamp } from "./utils";
import { describeAction, type ActionLogRow, type ActivityView } from "./activity";

const DAY = 86_400_000;

export type RangeKey = "today" | "7d" | "30d" | "month" | "custom";
export type Range = { key: RangeKey; from: number; to: number; prevFrom: number; prevTo: number; label: string };

export type UrgentTicket = { id: string; ticketNumber: string; subject: string; companyName: string; tenantId: string; createdAt: string; status: string };

export type OverviewInput = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  logs: AdminLog[];
  actions: ActionLogRow[];
  urgentTickets: UrgentTicket[];
  now: number;
};

export type PriorityAction = {
  id: string;
  level: "high" | "medium" | "low";
  icon: "alert" | "calendar" | "card" | "users" | "chart" | "lifebuoy" | "zap";
  title: string;
  description: string;
  clientName: string;
  due: string;
  href: string;
  actionLabel: string;
};

export type Overview = {
  kpis: {
    totalClients: number;
    activeClients: number;
    trialClients: number;
    paidSubscriptions: number;
    mrr: number;
    arr: number;
    collected: number;
    collectedPrev: number;
    outstanding: number;
    outstandingCount: number;
    conversations: number;
    upcomingRenewals: number;
    upcomingRenewalsAmount: number;
    newClients: number;
    newClientsPrev: number;
    overdueRenewals: number;
  };
  growth: { labels: string[]; values: number[] };
  revenue: { labels: string[]; collected: (number | null)[]; expected: (number | null)[] };
  renewalsByMonth: { labels: string[]; values: number[] };
  statusSlices: { label: string; value: number }[];
  planSlices: { label: string; value: number }[];
  usageTop: { label: string; value: number; hint: string; href: string }[];
  priorities: PriorityAction[];
  activity: ActivityView[];
};

export function resolveRange(key: RangeKey, now: number, custom?: { from?: string; to?: string }): Range {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const todayStart = startOfDay.getTime();
  let from: number;
  let to = now;
  let label: string;
  if (key === "today") {
    from = todayStart;
    label = "اليوم";
  } else if (key === "7d") {
    from = now - 7 * DAY;
    label = "آخر 7 أيام";
  } else if (key === "30d") {
    from = now - 30 * DAY;
    label = "آخر 30 يومًا";
  } else if (key === "custom") {
    from = custom?.from ? new Date(`${custom.from}T00:00:00`).getTime() : 0;
    to = custom?.to ? new Date(`${custom.to}T23:59:59`).getTime() : now;
    label = "نطاق مخصص";
  } else {
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    from = monthStart.getTime();
    label = "هذا الشهر";
  }
  const span = Math.max(DAY, to - from);
  return { key, from, to, prevFrom: from - span, prevTo: from - 1, label };
}

const monthKey = (ts: number) => {
  const date = new Date(ts);
  return date.getFullYear() * 12 + date.getMonth();
};
const monthLabel = (key: number) =>
  new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { month: "short" }).format(new Date(Math.floor(key / 12), key % 12, 1));

const renewalTime = (subscription: SubscriptionRow) => {
  if (!subscription.renewalAt) return null;
  const date = new Date(`${subscription.renewalAt}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export const monthlyValue = (subscription: SubscriptionRow) => {
  const extra = Math.max(0, subscription.employeeCount - subscription.employeeLimit) * EXTRA_USER_PRICE;
  return subscription.amount / (isBillingCycle(subscription.billingCycle) ? CYCLE_MONTHS[subscription.billingCycle] : 1) + extra;
};

const paymentTime = (payment: PaymentRow) => parseTimestamp(payment.completedAt || payment.createdAt);
const isCompleted = (payment: PaymentRow) => payment.status === "مكتمل";
const isPending = (payment: PaymentRow) => payment.status === "قيد الانتظار";

const STATUS_LABELS: Record<string, string> = { "نشط": "نشط", "تجربة": "فترة تجريبية", "متوقف": "متوقف" };

export function buildOverview(input: OverviewInput, range: Range): Overview {
  const { subscriptions, payments, logs, actions, urgentTickets, now } = input;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const today = todayStart.getTime();
  const inRange = (ts: number, from: number, to: number) => ts >= from && ts <= to;

  const active = subscriptions.filter((subscription) => subscription.status === "نشط");
  const paying = active.filter((subscription) => subscription.amount > 0);
  const mrr = active.reduce((sum, subscription) => sum + monthlyValue(subscription), 0);

  const collectedIn = (from: number, to: number) => payments.filter((payment) => isCompleted(payment) && inRange(paymentTime(payment), from, to)).reduce((sum, payment) => sum + payment.amount, 0);
  const pending = payments.filter(isPending);

  const renewalDays = (subscription: SubscriptionRow) => {
    const time = renewalTime(subscription);
    return time === null ? null : Math.round((time - today) / DAY);
  };
  const overdue = active.filter((subscription) => (renewalDays(subscription) ?? 1) < 0);
  const upcoming = active.filter((subscription) => {
    const days = renewalDays(subscription);
    return days !== null && days >= 0 && days <= 30;
  });

  const createdTime = (subscription: SubscriptionRow) => parseTimestamp(subscription.createdAt);

  // ----- Charts -----
  const currentMonth = monthKey(now);
  const growthKeys = Array.from({ length: 12 }, (_, index) => currentMonth - 11 + index);
  const growth = {
    labels: growthKeys.map(monthLabel),
    values: growthKeys.map((key) => subscriptions.filter((subscription) => {
      const created = createdTime(subscription);
      return created === 0 ? true : monthKey(created) <= key;
    }).length)
  };

  const revenueKeys = Array.from({ length: 11 }, (_, index) => currentMonth - 5 + index);
  const expectedFor = (key: number) =>
    active.reduce((sum, subscription) => {
      if (isBillingCycle(subscription.billingCycle) && subscription.billingCycle !== "شهري") {
        const time = renewalTime(subscription);
        if (time === null) return sum;
        const renewalMonth = Math.max(monthKey(time), currentMonth);
        return renewalMonth === key ? sum + subscription.amount : sum;
      }
      return sum + monthlyValue(subscription);
    }, 0);
  const revenue = {
    labels: revenueKeys.map(monthLabel),
    collected: revenueKeys.map((key) => (key <= currentMonth ? payments.filter((payment) => isCompleted(payment) && monthKey(paymentTime(payment)) === key && paymentTime(payment) > 0).reduce((sum, payment) => sum + payment.amount, 0) : null)),
    expected: revenueKeys.map((key) => (key >= currentMonth ? Math.round(expectedFor(key)) : null))
  };

  const renewalBuckets = Array.from({ length: 6 }, (_, index) => currentMonth + index);
  const overdueAmount = overdue.reduce((sum, subscription) => sum + subscription.amount, 0);
  const renewalsByMonth = {
    labels: ["متأخر", ...renewalBuckets.map(monthLabel)],
    values: [
      overdueAmount,
      ...renewalBuckets.map((key) => active.filter((subscription) => {
        const time = renewalTime(subscription);
        return time !== null && time >= today && monthKey(time) === key;
      }).reduce((sum, subscription) => sum + subscription.amount, 0))
    ]
  };

  const countBy = (pick: (subscription: SubscriptionRow) => string) => {
    const map = new Map<string, number>();
    for (const subscription of subscriptions) map.set(pick(subscription), (map.get(pick(subscription)) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  };
  const statusSlices = countBy((subscription) => subscription.status).map(([label, value]) => ({ label: STATUS_LABELS[label] ?? label, value }));
  const planEntries = countBy((subscription) => subscription.plan || "بدون باقة");
  const planSlices = planEntries.length > 5
    ? [...planEntries.slice(0, 4).map(([label, value]) => ({ label, value })), { label: "أخرى", value: planEntries.slice(4).reduce((sum, [, value]) => sum + value, 0) }]
    : planEntries.map(([label, value]) => ({ label, value }));

  const usageTop = subscriptions
    .filter((subscription) => subscription.conversationCount > 0)
    .sort((a, b) => b.conversationCount - a.conversationCount)
    .slice(0, 6)
    .map((subscription) => ({
      label: subscription.companyName,
      value: subscription.conversationCount,
      hint: `${subscription.plan} · ${subscription.employeeCount} من ${subscription.employeeLimit} مستخدم`,
      href: `/linkly-admin007/clients/${encodeURIComponent(subscription.tenantId)}`
    }));

  // ----- Priority actions -----
  const priorities: PriorityAction[] = [];
  const clientHref = (tenantId: string) => `/linkly-admin007/clients/${encodeURIComponent(tenantId)}`;

  for (const subscription of overdue) {
    const days = Math.abs(renewalDays(subscription) ?? 0);
    priorities.push({
      id: `overdue-${subscription.tenantId}`,
      level: "high",
      icon: "alert",
      title: "اشتراك متأخر عن التجديد",
      description: `${subscription.plan} · متأخر ${days} ${days === 1 ? "يوم" : "أيام"} · ${subscription.amount} ر.س`,
      clientName: subscription.companyName,
      due: subscription.renewalAt,
      href: clientHref(subscription.tenantId),
      actionLabel: "عرض العميل"
    });
  }
  for (const subscription of active) {
    const days = renewalDays(subscription);
    if (days !== null && days >= 0 && days <= 7) {
      priorities.push({
        id: `renew-${subscription.tenantId}`,
        level: "medium",
        icon: "calendar",
        title: days === 0 ? "اشتراك يتجدد اليوم" : "اشتراك سينتهي قريبًا",
        description: `${subscription.plan} · ${days === 0 ? "اليوم" : `خلال ${days} ${days === 1 ? "يوم" : "أيام"}`} · ${subscription.amount} ر.س`,
        clientName: subscription.companyName,
        due: subscription.renewalAt,
        href: "/linkly-admin007/alerts",
        actionLabel: "متابعة التجديد"
      });
    }
  }
  for (const payment of payments) {
    if (isCompleted(payment) || isPending(payment)) continue;
    const time = parseTimestamp(payment.failedAt || payment.createdAt);
    if (time && now - time <= 7 * DAY) {
      priorities.push({
        id: `failed-${payment.id}`,
        level: "high",
        icon: "card",
        title: "دفعة لم تكتمل",
        description: `${payment.amount} ر.س · ${payment.status}${payment.failureReason ? ` · ${payment.failureReason}` : ""}`,
        clientName: payment.companyName,
        due: payment.createdAt,
        href: `/linkly-admin007/payments?q=${encodeURIComponent(payment.gatewayPaymentId || payment.moyasarId || payment.id)}`,
        actionLabel: "فتح الدفعة"
      });
    }
  }
  for (const payment of pending) {
    const time = parseTimestamp(payment.createdAt);
    if (time && now - time > DAY) {
      priorities.push({
        id: `pending-${payment.id}`,
        level: "medium",
        icon: "card",
        title: "دفعة معلّقة منذ أكثر من يوم",
        description: `${payment.amount} ر.س بانتظار التأكيد`,
        clientName: payment.companyName,
        due: payment.createdAt,
        href: `/linkly-admin007/payments?q=${encodeURIComponent(payment.gatewayPaymentId || payment.moyasarId || payment.id)}`,
        actionLabel: "فتح الدفعة"
      });
    }
  }
  for (const ticket of urgentTickets) {
    priorities.push({
      id: `ticket-${ticket.id}`,
      level: "high",
      icon: "lifebuoy",
      title: "تذكرة دعم عاجلة",
      description: `${ticket.ticketNumber} · ${ticket.subject}`,
      clientName: ticket.companyName,
      due: ticket.createdAt,
      href: "/linkly-admin007/support",
      actionLabel: "فتح التذكرة"
    });
  }
  for (const subscription of active) {
    if (subscription.employeeLimit > 0 && subscription.employeeCount >= subscription.employeeLimit * 0.8) {
      const full = subscription.employeeCount >= subscription.employeeLimit;
      priorities.push({
        id: `limit-${subscription.tenantId}`,
        level: full ? "medium" : "low",
        icon: "chart",
        title: full ? "العميل وصل إلى حد المستخدمين" : "استهلاك قريب من الحد",
        description: `${subscription.employeeCount} من ${subscription.employeeLimit} مستخدم`,
        clientName: subscription.companyName,
        due: "",
        href: clientHref(subscription.tenantId),
        actionLabel: "عرض الاستخدام"
      });
    }
  }
  for (const subscription of subscriptions) {
    const created = createdTime(subscription);
    if (subscription.status !== "متوقف" && subscription.conversationCount === 0 && created && now - created > 3 * DAY) {
      priorities.push({
        id: `idle-${subscription.tenantId}`,
        level: "low",
        icon: "users",
        title: "عميل لم يبدأ استخدام المنصة",
        description: `${subscription.plan} · انضم منذ ${Math.round((now - created) / DAY)} يومًا ولا توجد محادثات`,
        clientName: subscription.companyName,
        due: "",
        href: clientHref(subscription.tenantId),
        actionLabel: "عرض العميل"
      });
    }
  }
  // Operational errors: group the last 24h of error logs per client.
  const errorsByClient = new Map<string, { name: string; count: number }>();
  for (const log of logs) {
    if (log.level !== "خطأ") continue;
    const time = parseTimestamp(log.at);
    if (!time || now - time > DAY || !log.clientId) continue;
    const entry = errorsByClient.get(log.clientId) ?? { name: log.clientName, count: 0 };
    entry.count += 1;
    errorsByClient.set(log.clientId, entry);
  }
  for (const [tenantId, entry] of errorsByClient) {
    priorities.push({
      id: `errors-${tenantId}`,
      level: entry.count >= 5 ? "high" : "medium",
      icon: "zap",
      title: "أخطاء تشغيلية متكررة",
      description: `${entry.count} ${entry.count === 1 ? "خطأ" : "أخطاء"} خلال آخر 24 ساعة (قد يشمل ربط القنوات)`,
      clientName: entry.name,
      due: "",
      href: `/linkly-admin007/logs?client=${encodeURIComponent(tenantId)}`,
      actionLabel: "عرض السجلات"
    });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  priorities.sort((a, b) => order[a.level] - order[b.level]);

  const activity = actions
    .slice()
    .sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt))
    .slice(0, 8)
    .map(describeAction);

  return {
    kpis: {
      totalClients: subscriptions.length,
      activeClients: active.length,
      trialClients: subscriptions.filter((subscription) => subscription.status === "تجربة").length,
      paidSubscriptions: paying.length,
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      collected: collectedIn(range.from, range.to),
      collectedPrev: collectedIn(range.prevFrom, range.prevTo),
      outstanding: pending.reduce((sum, payment) => sum + payment.amount, 0),
      outstandingCount: pending.length,
      conversations: subscriptions.reduce((sum, subscription) => sum + subscription.conversationCount, 0),
      upcomingRenewals: upcoming.length,
      upcomingRenewalsAmount: upcoming.reduce((sum, subscription) => sum + subscription.amount, 0),
      newClients: subscriptions.filter((subscription) => inRange(createdTime(subscription), range.from, range.to)).length,
      newClientsPrev: subscriptions.filter((subscription) => inRange(createdTime(subscription), range.prevFrom, range.prevTo)).length,
      overdueRenewals: overdue.length
    },
    growth,
    revenue,
    renewalsByMonth,
    statusSlices,
    planSlices,
    usageTop,
    priorities,
    activity
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
