"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SubscriptionRow } from "./types";
import { EXTRA_USER_PRICE, formatNumber, getRenewalAlert } from "./utils";
import AnimatedNumber from "./AnimatedNumber";

type OverviewViewProps = {
  subscriptions: SubscriptionRow[];
  paymentsCount: number;
  plansCount: number;
  teamCount: number;
  logsCount: number;
};

const DONUT_COLORS = ["#171717", "#6b7280", "#a3a3a3", "#d4d4d4", "#e5e5e5"];

export default function OverviewView({ subscriptions, paymentsCount, plansCount, teamCount, logsCount }: OverviewViewProps) {
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
    { href: "/admin/clients", label: "العملاء", count: subscriptions.length, hint: "إدارة كل حسابات العملاء" },
    { href: "/admin/alerts", label: "تنبيهات التجديد", count: renewalAlertsCount, hint: "اشتراكات تحتاج متابعة" },
    { href: "/admin/payments", label: "المدفوعات", count: paymentsCount, hint: "سجل مدفوعات Moyasar" },
    { href: "/admin/plans", label: "الباقات", count: plansCount, hint: "أسعار الباقات وحدودها" },
    { href: "/admin/team", label: "الفريق", count: teamCount, hint: "أعضاء فريق المنصة" },
    { href: "/admin/logs", label: "السجلات", count: logsCount, hint: "سجل حركة كل الحسابات" }
  ];

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>إجمالي العملاء</span>
            <strong><AnimatedNumber value={subscriptions.length} /></strong>
            <small>{formatNumber(activeClients)} نشط · {formatNumber(trialClients)} تجربة</small>
          </article>
          <article>
            <span>اشتراكات نشطة</span>
            <strong><AnimatedNumber value={activeClients} /></strong>
            <small>{formatNumber(subscriptions.length - activeClients)} غير نشطة</small>
          </article>
          <article>
            <span>إيراد شهري متوقع</span>
            <strong><AnimatedNumber value={monthlyRevenue} /></strong>
            <small>ريال من الاشتراكات النشطة</small>
          </article>
          <article>
            <span>محادثات تحت الإدارة</span>
            <strong><AnimatedNumber value={totalConversations} /></strong>
            <small>مجمعة من كل حسابات العملاء</small>
          </article>
        </div>
      </section>

      <section className="admin-overview-grid">
        <article className="admin-card admin-donut-card">
          <div className="admin-donut" style={{ background: donutBackground }}>
            <div className="admin-donut-hole">
              <strong><AnimatedNumber value={subscriptions.length} /></strong>
              <span>إجمالي</span>
            </div>
          </div>
          <div className="admin-donut-legend">
            {donutStops.map((stop) => (
              <div className="admin-donut-legend-row" key={stop.status}>
                <span className="admin-donut-dot" style={{ background: stop.color }} />
                <span>{stop.status}</span>
                <strong>{formatNumber(stop.count)}</strong>
              </div>
            ))}
            {!donutStops.length ? <p className="admin-empty-state">لا يوجد عملاء بعد لعرض توزيع الحالات.</p> : null}
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-plan-card-head">
            <h2>توزيع الباقات</h2>
            <p>عدد العملاء على كل باقة.</p>
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
            {!planEntries.length ? <p className="admin-empty-state">لا يوجد عملاء بعد لعرض توزيع الباقات.</p> : null}
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
