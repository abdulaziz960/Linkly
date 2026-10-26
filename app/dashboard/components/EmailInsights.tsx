"use client";

import { useMemo } from "react";
import type { EmailCampaignSummary } from "../types";
import { useLanguage } from "../i18n";
import { BarList, DonutChart, LineChart } from "./MiniCharts";
import { formatRate } from "../../../lib/campaign-metrics";

/** KPI cards and charts at the top of the email campaigns overview. */
export default function EmailInsights({ campaigns, balance, customersWithEmail }: { campaigns: EmailCampaignSummary[]; balance: number; customersWithEmail: number }) {
  const { t } = useLanguage();
  const totals = useMemo(() => campaigns.reduce((sum, campaign) => ({
    recipients: sum.recipients + campaign.analytics.totalRecipients,
    sent: sum.sent + campaign.analytics.sentCount,
    delivered: sum.delivered + campaign.analytics.deliveredCount,
    opens: sum.opens + campaign.analytics.openCount,
    clicks: sum.clicks + campaign.analytics.clickCount,
    bounces: sum.bounces + campaign.analytics.bounceCount,
    unsubs: sum.unsubs + campaign.analytics.unsubscribeCount
  }), { recipients: 0, sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0 }), [campaigns]);

  const trend = useMemo(() => {
    const byDay = new Map<string, { sent: number; opens: number; clicks: number }>();
    for (const campaign of campaigns) {
      if (!campaign.analytics.sentCount) continue;
      const day = (campaign.scheduledAt || campaign.updatedAt || campaign.createdAt).slice(0, 10);
      const entry = byDay.get(day) ?? { sent: 0, opens: 0, clicks: 0 };
      entry.sent += campaign.analytics.sentCount; entry.opens += campaign.analytics.openCount; entry.clicks += campaign.analytics.clickCount;
      byDay.set(day, entry);
    }
    const days = [...byDay.keys()].sort();
    return { days, entries: days.map((day) => byDay.get(day)!) };
  }, [campaigns]);

  const top = useMemo(() => campaigns.filter((campaign) => campaign.analytics.sentCount > 0)
    .map((campaign) => ({ label: campaign.name, value: formatRate(campaign.analytics.openCount, campaign.analytics.sentCount) }))
    .sort((a, b) => b.value - a.value).slice(0, 5), [campaigns]);

  const num = (value: number) => value.toLocaleString("en-US");
  const rate = (part: number, whole: number) => `${formatRate(part, whole)}%`;
  const openedOnly = Math.max(0, totals.opens - totals.clicks);
  const notOpened = Math.max(0, totals.sent - totals.opens - totals.unsubs);

  return (
    <div className="seg-tab-stack email-insights">
      <div className="seg-kpis">
        <div className={balance > 0 ? "seg-kpi seg-kpi-good" : "seg-kpi seg-kpi-bad"}><span>{t("رصيد البريد", "Email balance")}</span><b>{num(balance)}</b><small>{t("رسالة متاحة", "emails available")}</small></div>
        <div className="seg-kpi"><span>{t("عملاء ببريد", "Customers with email")}</span><b>{num(customersWithEmail)}</b></div>
        <div className="seg-kpi"><span>{t("الحملات", "Campaigns")}</span><b>{num(campaigns.length)}</b><small>{t(`${num(totals.recipients)} مستلم`, `${num(totals.recipients)} recipients`)}</small></div>
        <div className="seg-kpi"><span>{t("المرسلة", "Sent")}</span><b>{num(totals.sent)}</b><small>{t(`وصلت ${rate(totals.delivered, totals.sent)}`, `delivered ${rate(totals.delivered, totals.sent)}`)}</small></div>
        <div className="seg-kpi seg-kpi-good"><span>{t("معدل الفتح", "Open rate")}</span><b>{rate(totals.opens, totals.sent)}</b><small>{num(totals.opens)} / {num(totals.sent)}</small></div>
        <div className="seg-kpi seg-kpi-good"><span>{t("معدل الضغط", "Click rate")}</span><b>{rate(totals.clicks, totals.sent)}</b><small>{num(totals.clicks)} {t("ضغطة", "clicks")}</small></div>
        <div className="seg-kpi seg-kpi-bad"><span>{t("ارتداد", "Bounced")}</span><b>{num(totals.bounces)}</b><small>{rate(totals.bounces, totals.sent)}</small></div>
        <div className="seg-kpi seg-kpi-unsub"><span>{t("ألغى الاشتراك", "Unsubscribed")}</span><b>{num(totals.unsubs)}</b><small>{rate(totals.unsubs, totals.sent)}</small></div>
      </div>
      {totals.sent > 0 ? (
        <div className="seg-charts">
          <div className="panel">
            <div className="panel-head"><h2>{t("الأداء اليومي", "Daily performance")}</h2></div>
            <div className="panel-body">
              <LineChart labels={trend.days.map((day) => day.slice(5))} series={[
                { label: t("مرسلة", "Sent"), color: "#4a90d9", values: trend.entries.map((entry) => entry.sent) },
                { label: t("فتح", "Opened"), color: "#f0ad4e", values: trend.entries.map((entry) => entry.opens) },
                { label: t("ضغط", "Clicked"), color: "#2e9e6b", values: trend.entries.map((entry) => entry.clicks) }
              ]} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>{t("نتيجة الرسائل", "Outcome")}</h2></div>
            <div className="panel-body">
              <DonutChart centerLabel={t("رسالة", "emails")} slices={[
                { label: t("ضغط", "Clicked"), value: totals.clicks, color: "#2e9e6b" },
                { label: t("فتح بدون ضغط", "Opened only"), value: openedOnly, color: "#4a90d9" },
                { label: t("لم يفتح", "Not opened"), value: notOpened, color: "#f0ad4e" },
                { label: t("ارتداد", "Bounced"), value: totals.bounces, color: "#d9534f" },
                { label: t("ألغى الاشتراك", "Unsubscribed"), value: totals.unsubs, color: "#8e6bbf" }
              ]} />
            </div>
          </div>
        </div>
      ) : null}
      {top.length > 1 ? (
        <div className="panel">
          <div className="panel-head"><h2>{t("أفضل الحملات (نسبة الفتح %)", "Top campaigns (open rate %)")}</h2></div>
          <div className="panel-body"><BarList items={top} color="#2e9e6b" /></div>
        </div>
      ) : null}
    </div>
  );
}
