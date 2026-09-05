"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PaymentRow, SubscriptionRow } from "./types";
import type { AdminLog } from "../../lib/database";
import { EXTRA_USER_PRICE, formatNumber, getRenewalAlert, parseTimestamp } from "./utils";
import AnimatedNumber from "./AnimatedNumber";
import { useLanguage } from "./i18n";

function statusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "نشط") return t("نشط", "Active");
  if (status === "تجربة") return t("تجربة", "Trial");
  if (status === "متوقف") return t("متوقف", "Stopped");
  return status;
}

type OverviewViewProps = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  plansCount: number;
  teamCount: number;
  logs: AdminLog[];
};

const DONUT_COLORS = ["#171717", "#6b7280", "#a3a3a3", "#d4d4d4", "#e5e5e5"];

export default function OverviewView({ subscriptions, payments, plansCount, teamCount, logs }: OverviewViewProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  useEffect(() => setMounted(true), []);

  // Only metrics that represent something that *happened at a point in
  // time* (a payment was collected) can meaningfully respect a date range.
  // Status snapshots - active/trial clients, overdue
  // renewals, MRR/ARR, outstanding payments still awaiting completion -
  // describe the account's state right now, not an event within a window,
  // so they stay unfiltered on purpose (filtering "outstanding payments" by
  // "today" would hide a payment stuck since last week - exactly the thing
  // that still needs attention).
  const periodRange = (() => {
    const now = new Date().getTime();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    if (period === "today") return { from: dayStart.getTime(), to: Infinity };
    if (period === "7d") return { from: now - 7 * 86400000, to: Infinity };
    if (period === "custom") {
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : 0,
        to: customTo ? new Date(`${customTo}T23:59:59`).getTime() : Infinity
      };
    }
    return { from: monthStart.getTime(), to: Infinity };
  })();
  const inPeriod = (value: string) => {
    const ts = parseTimestamp(value);
    return ts >= periodRange.from && ts <= periodRange.to;
  };

  const activeClients = subscriptions.filter((s) => s.status === "نشط").length;
  const trialClients = subscriptions.filter((s) => s.status === "تجربة").length;
  const monthlyRevenue = subscriptions.reduce((sum, s) => {
    if (s.status !== "نشط") return sum;
    const extra = Math.max(0, s.employeeCount - s.employeeLimit) * EXTRA_USER_PRICE;
    return sum + s.amount + extra;
  }, 0);
  const totalConversations = subscriptions.reduce((sum, s) => sum + s.conversationCount, 0);
  const renewalAlertsCount = subscriptions.filter((s) => getRenewalAlert(s) !== null).length;
  const overdueRenewals = subscriptions.filter((s) => getRenewalAlert(s)?.tier === "overdue").length;
  const pendingPayments = payments.filter((payment) => payment.status === "قيد الانتظار");
  const collectedRevenue = payments.filter((payment) => payment.status === "مكتمل" && inPeriod(payment.completedAt || payment.createdAt)).reduce((sum, payment) => sum + payment.amount, 0);
  const outstandingRevenue = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const annualRecurringRevenue = monthlyRevenue * 12;
  const averageConversations = subscriptions.length ? Math.round(totalConversations / subscriptions.length) : 0;
  const inactiveUsage = subscriptions.filter((subscription) => subscription.conversationCount === 0).length;

  const statusCounts = new Map<string, number>();
  for (const s of subscriptions) {
    statusCounts.set(s.status, (statusCounts.get(s.status) || 0) + 1);
  }
  const statusEntries = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]);

  let cursor = 0;
  const donutStops = statusEntries.map(([status, count], index) => {
    const color = DONUT_COLORS[index % DONUT_COLORS.length];
    const from = subscriptions.length ? (cursor / subscriptions.length) * 100 : 0;
    cursor += count;
    const to = subscriptions.length ? (cursor / subscriptions.length) * 100 : 0;
    return { status, count, color, from, to };
  });
  const donutBackground = subscriptions.length
    ? `conic-gradient(${donutStops.map((stop) => `${stop.color} ${stop.from}% ${stop.to}%`).join(", ")})`
    : "var(--admin-surface-soft)";

  const planCounts = new Map<string, number>();
  for (const s of subscriptions) {
    planCounts.set(s.plan, (planCounts.get(s.plan) || 0) + 1);
  }
  const planEntries = Array.from(planCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxPlanCount = Math.max(1, ...planEntries.map(([, count]) => count));

  const quickLinks = [
    { href: "/linkly-admin007/clients", label: t("العملاء", "Clients"), count: subscriptions.length, hint: t("إدارة كل حسابات العملاء", "Manage all client accounts") },
    { href: "/linkly-admin007/alerts", label: t("تنبيهات التجديد", "Renewal alerts"), count: renewalAlertsCount, hint: t("اشتراكات تحتاج متابعة", "Subscriptions needing follow-up") },
    { href: "/linkly-admin007/payments", label: t("المدفوعات", "Payments"), count: payments.length, hint: t("سجل مدفوعات Moyasar", "Moyasar payment log") },
    { href: "/linkly-admin007/plans", label: t("الباقات", "Plans"), count: plansCount, hint: t("أسعار الباقات وحدودها", "Plan pricing and limits") },
    { href: "/linkly-admin007/team", label: t("الفريق", "Team"), count: teamCount, hint: t("أعضاء فريق المنصة", "Platform team members") },
    { href: "/linkly-admin007/logs", label: t("السجلات", "Logs"), count: logs.length, hint: t("سجل حركة كل الحسابات", "Activity log for all accounts") }
  ];

  return (
    <>
      <section className="admin-action-center">
        <div className="admin-action-title"><div><span>{t("الأولوية الآن", "Priority now")}</span><h2>{t("يتطلب إجراء الآن", "Needs action now")}</h2></div><strong>{formatNumber(overdueRenewals + pendingPayments.length)}</strong></div>
        <div className="admin-action-grid">
          <Link href="/linkly-admin007/alerts?status=overdue" className="admin-action-item is-danger"><span>!</span><div><strong>{formatNumber(overdueRenewals)} {t("تجديدات متأخرة", "overdue renewals")}</strong><small>{t("تحتاج تواصلاً أو تعليقاً مدروساً", "Need outreach or considered suspension")}</small></div><b>←</b></Link>
          <Link href="/linkly-admin007/payments?status=pending" className="admin-action-item is-warn"><span>◷</span><div><strong>{formatNumber(pendingPayments.length)} {t("دفعات بانتظار الإكمال", "pending payments")}</strong><small>{formatNumber(outstandingRevenue)} {t("ر.س مستحقة", "SAR outstanding")}</small></div><b>←</b></Link>
          <Link href="/linkly-admin007/clients?usage=inactive" className="admin-action-item"><span>○</span><div><strong>{formatNumber(inactiveUsage)} {t("عملاء دون استخدام", "clients without usage")}</strong><small>{t("لم تسجل لهم محادثات", "No conversations recorded")}</small></div><b>←</b></Link>
        </div>
      </section>

      <section className="admin-dashboard-period" aria-label={t("النطاق الزمني للوحة", "Dashboard date range")}>
        <div><strong>{t("نطاق العرض", "View range")}</strong><small>{t("ينطبق على الإيراد المحصّل — حالات العملاء والاشتراكات مؤشرات آنية دائماً", "Applies to collected revenue — client/subscription status is always shown live")}</small></div>
        <div>
          <div>{[["today", t("اليوم", "Today")], ["7d", t("آخر 7 أيام", "Last 7 days")], ["month", t("هذا الشهر", "This month")], ["custom", t("نطاق مخصص", "Custom range")]].map(([value, label]) => <button key={value} type="button" className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{label}</button>)}</div>
          {period === "custom" ? (
            <div className="admin-dashboard-period-custom">
              <label><span>{t("من تاريخ", "From")}</span><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label><span>{t("إلى تاريخ", "To")}</span><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
            </div>
          ) : null}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-metrics">
          <Link href="/linkly-admin007/clients" className="admin-metric-link">
            <span>{t("إجمالي العملاء", "Total clients")}</span>
            <strong><AnimatedNumber value={subscriptions.length} /></strong>
            <small>{formatNumber(activeClients)} {t("نشط", "active")} · {formatNumber(trialClients)} {t("تجربة", "trial")} <em>{t("عرض التفاصيل ←", "View details →")}</em></small>
          </Link>
          <Link href="/linkly-admin007/clients?status=نشط" className="admin-metric-link">
            <span>{t("اشتراكات نشطة", "Active subscriptions")}</span>
            <strong><AnimatedNumber value={activeClients} /></strong>
            <small>{formatNumber(subscriptions.length - activeClients)} {t("غير نشطة — حالة مختلفة عن انتظار الدفع", "inactive — separate from pending payments")}</small>
          </Link>
          <Link href="/linkly-admin007/payments?status=completed" className="admin-metric-link">
            <span>{t("MRR المتوقع", "Projected MRR")}</span>
            <strong><AnimatedNumber value={monthlyRevenue} /></strong>
            <small>{t("ر.س شهرياً", "SAR monthly")} · ARR {formatNumber(annualRecurringRevenue)}</small>
          </Link>
          <Link href="/linkly-admin007/clients?sort=usage" className="admin-metric-link">
            <span>{t("محادثات تحت الإدارة", "Conversations under management")}</span>
            <strong><AnimatedNumber value={totalConversations} /></strong>
            <small>{t("متوسط", "Average")} {formatNumber(averageConversations)} {t("لكل عميل", "per client")}</small>
          </Link>
        </div>
      </section>

      <section className="admin-revenue-strip">
        <div className="is-confirmed"><span>{t("المحصل", "Collected")}<em>{t("إيراد مؤكد", "Confirmed")}</em></span><strong>{formatNumber(collectedRevenue)} <small>{t("ر.س", "SAR")}</small></strong></div>
        <div className="is-pending"><span>{t("المستحق", "Outstanding")}<em>{t("معلّق تحت التحصيل", "Pending collection")}</em></span><strong>{formatNumber(outstandingRevenue)} <small>{t("ر.س", "SAR")}</small></strong>{pendingPayments.length ? <small className="admin-revenue-note">{t(`${formatNumber(pendingPayments.length)} دفعة لم تُؤكَّد بعد — غير محتسبة ضمن MRR/ARR`, `${formatNumber(pendingPayments.length)} payment(s) not yet confirmed — excluded from MRR/ARR`)}</small> : null}</div>
        <div className="is-confirmed"><span>MRR<em>{t("إيراد مؤكد", "Confirmed")}</em></span><strong>{formatNumber(monthlyRevenue)} <small>{t("ر.س", "SAR")}</small></strong></div>
        <div className="is-confirmed"><span>ARR<em>{t("إيراد مؤكد", "Confirmed")}</em></span><strong>{formatNumber(annualRecurringRevenue)} <small>{t("ر.س", "SAR")}</small></strong></div>
      </section>

      <section className="admin-overview-grid">
        <article className="admin-card admin-donut-card">
          <div className="admin-donut" style={{ background: donutBackground }}>
            <div className="admin-donut-hole">
              <strong><AnimatedNumber value={subscriptions.length} /></strong>
              <span>{t("إجمالي", "Total")}</span>
            </div>
          </div>
          <div className="admin-donut-legend">
            {donutStops.map((stop) => (
              <div className="admin-donut-legend-row" key={stop.status}>
                <span className="admin-donut-dot" style={{ background: stop.color }} />
                <span>{statusLabel(stop.status, t)}</span>
                <strong>{formatNumber(stop.count)}</strong>
              </div>
            ))}
            {!donutStops.length ? <p className="admin-empty-state">{t("لا يوجد عملاء بعد لعرض توزيع الحالات.", "No clients yet to show a status breakdown.")}</p> : null}
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-plan-card-head">
            <h2>{t("توزيع الباقات", "Plan distribution")}</h2>
            <p>{t("عدد العملاء على كل باقة.", "Number of clients on each plan.")}</p>
          </div>
          <div className="admin-bars">
            {planEntries.map(([plan, count]) => (
              <div className="admin-bar-row" key={plan}>
                <div className="admin-bar-label">
                  <span>{plan}</span>
                  <strong>{formatNumber(count)}</strong>
                </div>
                <div className="admin-bar-track">
                  <div
                    className="admin-bar-fill"
                    style={{ width: mounted ? `${(count / maxPlanCount) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
            {!planEntries.length ? <p className="admin-empty-state">{t("لا يوجد عملاء بعد لعرض توزيع الباقات.", "No clients yet to show a plan breakdown.")}</p> : null}
          </div>
        </article>
      </section>

      <div className="admin-quick-links">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href} className="admin-quick-link-card">
            <div className="admin-quick-link-head">
              <span>{link.label}</span>
            </div>
            <strong><AnimatedNumber value={link.count} /></strong>
            <small>{link.hint}</small>
          </Link>
        ))}
      </div>
    </>
  );
}
