"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SubscriptionRow } from "./types";
import { EXTRA_USER_PRICE, formatNumber, getRenewalAlert } from "./utils";
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
  paymentsCount: number;
  plansCount: number;
  teamCount: number;
  logsCount: number;
};

const DONUT_COLORS = ["#171717", "#6b7280", "#a3a3a3", "#d4d4d4", "#e5e5e5"];

export default function OverviewView({ subscriptions, paymentsCount, plansCount, teamCount, logsCount }: OverviewViewProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const activeClients = subscriptions.filter((s) => s.status === "نشط").length;
  const trialClients = subscriptions.filter((s) => s.status === "تجربة").length;
  const monthlyRevenue = subscriptions.reduce((sum, s) => {
    if (s.status !== "نشط") return sum;
    const extra = Math.max(0, s.employeeCount - s.employeeLimit) * EXTRA_USER_PRICE;
    return sum + s.amount + extra;
  }, 0);
  const totalConversations = subscriptions.reduce((sum, s) => sum + s.conversationCount, 0);
  const renewalAlertsCount = subscriptions.filter((s) => getRenewalAlert(s) !== null).length;

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
    { href: "/admin/clients", label: t("العملاء", "Clients"), count: subscriptions.length, hint: t("إدارة كل حسابات العملاء", "Manage all client accounts") },
    { href: "/admin/alerts", label: t("تنبيهات التجديد", "Renewal alerts"), count: renewalAlertsCount, hint: t("اشتراكات تحتاج متابعة", "Subscriptions needing follow-up") },
    { href: "/admin/payments", label: t("المدفوعات", "Payments"), count: paymentsCount, hint: t("سجل مدفوعات Moyasar", "Moyasar payment log") },
    { href: "/admin/plans", label: t("الباقات", "Plans"), count: plansCount, hint: t("أسعار الباقات وحدودها", "Plan pricing and limits") },
    { href: "/admin/team", label: t("الفريق", "Team"), count: teamCount, hint: t("أعضاء فريق المنصة", "Platform team members") },
    { href: "/admin/logs", label: t("السجلات", "Logs"), count: logsCount, hint: t("سجل حركة كل الحسابات", "Activity log for all accounts") }
  ];

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي العملاء", "Total clients")}</span>
            <strong><AnimatedNumber value={subscriptions.length} /></strong>
            <small>{formatNumber(activeClients)} {t("نشط", "active")} · {formatNumber(trialClients)} {t("تجربة", "trial")}</small>
          </article>
          <article>
            <span>{t("اشتراكات نشطة", "Active subscriptions")}</span>
            <strong><AnimatedNumber value={activeClients} /></strong>
            <small>{formatNumber(subscriptions.length - activeClients)} {t("غير نشطة", "inactive")}</small>
          </article>
          <article>
            <span>{t("إيراد شهري متوقع", "Projected monthly revenue")}</span>
            <strong><AnimatedNumber value={monthlyRevenue} /></strong>
            <small>{t("ريال من الاشتراكات النشطة", "SAR from active subscriptions")}</small>
          </article>
          <article>
            <span>{t("محادثات تحت الإدارة", "Conversations under management")}</span>
            <strong><AnimatedNumber value={totalConversations} /></strong>
            <small>{t("مجمعة من كل حسابات العملاء", "Aggregated across all client accounts")}</small>
          </article>
        </div>
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
