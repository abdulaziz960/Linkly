"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { DonutChart, LineChart } from "./MiniCharts";
import { formatRate } from "../../../lib/campaign-metrics";

type EmailCampaign = {
  id: string; name: string; status: string; scheduledAt: string; createdAt: string; updatedAt: string;
  analytics: { totalRecipients: number; sentCount: number; deliveredCount: number; openCount: number; clickCount: number; bounceCount: number; unsubscribeCount: number };
};

const sentStatuses = new Set(["sending", "sent"]);

/** Email counterpart of CampaignPerformanceReport: filters, KPIs, best/weakest, daily trend, outcome donut, comparison table. */
export default function EmailPerformanceReport() {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [campaignId, setCampaignId] = useState("");

  useEffect(() => {
    fetch("/api/segments/email-campaigns").then((response) => response.json().catch(() => null)).then((body) => setCampaigns(body?.ok ? body.data ?? [] : [])).catch(() => setCampaigns([])).finally(() => setLoading(false));
  }, []);

  const all = useMemo(() => campaigns.filter((campaign) => sentStatuses.has(campaign.status) && campaign.analytics.sentCount > 0).map((campaign) => {
    const a = campaign.analytics;
    const day = (campaign.scheduledAt || campaign.updatedAt || campaign.createdAt).slice(0, 10);
    const notReceived = a.bounceCount;
    const interacted = a.clickCount;
    const openedNoAction = Math.max(0, a.openCount - a.clickCount);
    const notOpened = Math.max(0, a.sentCount - a.openCount - a.unsubscribeCount);
    return { campaign, a, day, notReceived, notOpened, openedNoAction, interacted, openRate: formatRate(a.openCount, a.sentCount), interactRate: formatRate(a.clickCount, a.sentCount) };
  }), [campaigns]);

  const rows = useMemo(() => all.filter((row) => (!campaignId || row.campaign.id === campaignId) && (!dateFrom || row.day >= dateFrom) && (!dateTo || row.day <= dateTo)), [all, campaignId, dateFrom, dateTo]);
  const totals = rows.reduce((acc, row) => ({ sent: acc.sent + row.a.sentCount, notReceived: acc.notReceived + row.notReceived, notOpened: acc.notOpened + row.notOpened, openedNoAction: acc.openedNoAction + row.openedNoAction, interacted: acc.interacted + row.interacted, unsubscribed: acc.unsubscribed + row.a.unsubscribeCount }), { sent: 0, notReceived: 0, notOpened: 0, openedNoAction: 0, interacted: 0, unsubscribed: 0 });
  const ranked = [...rows].sort((a, b) => b.interactRate - a.interactRate || b.openRate - a.openRate);
  const best = rows.length > 1 ? ranked[0] : null;
  const worst = rows.length > 1 ? ranked[ranked.length - 1] : null;
  const trend = useMemo(() => {
    const byDay = new Map<string, { sent: number; opened: number; clicked: number }>();
    for (const row of rows) {
      const entry = byDay.get(row.day) ?? { sent: 0, opened: 0, clicked: 0 };
      entry.sent += row.a.sentCount; entry.opened += row.a.openCount; entry.clicked += row.a.clickCount;
      byDay.set(row.day, entry);
    }
    const days = [...byDay.keys()].sort();
    return { days, entries: days.map((day) => byDay.get(day)!) };
  }, [rows]);
  const num = (value: number) => value.toLocaleString("en-US");
  const pct = (part: number) => `${formatRate(part, totals.sent)}%`;

  return (
    <div className="seg-tab-stack">
      <div className="panel seg-filters">
        <label>{t("الحملة", "Campaign")}<CustomSelect value={campaignId} onChange={setCampaignId} options={[{ value: "", label: t("كل الحملات", "All campaigns") }, ...all.map((row) => ({ value: row.campaign.id, label: row.campaign.name }))]} /></label>
        <label>{t("من", "From")} <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>{t("إلى", "To")} <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <button className="btn soft" type="button" onClick={() => { setDateFrom(""); setDateTo(""); setCampaignId(""); }}>{t("مسح الفلاتر", "Clear filters")}</button>
      </div>
      {!rows.length ? <div className="panel"><div className="panel-body"><p className="muted-copy">{loading ? t("جارٍ التحميل...", "Loading...") : t("لا توجد حملات بريدية مرسلة ضمن هذه الفلاتر.", "No sent email campaigns match these filters.")}</p></div></div> : (
        <>
          <div className="seg-kpis">
            <div className="seg-kpi"><span>{t("الحملات", "Campaigns")}</span><b>{num(rows.length)}</b></div>
            <div className="seg-kpi"><span>{t("الرسائل المرسلة", "Emails sent")}</span><b>{num(totals.sent)}</b></div>
            <div className="seg-kpi seg-kpi-bad"><span>{t("لم يستلم الرسالة", "Didn't receive")}</span><b>{num(totals.notReceived)}</b><small>{pct(totals.notReceived)}</small></div>
            <div className="seg-kpi seg-kpi-warn"><span>{t("لم يفتح الرسالة", "Didn't open")}</span><b>{num(totals.notOpened)}</b><small>{pct(totals.notOpened)}</small></div>
            <div className="seg-kpi"><span>{t("فتحها بدون تفاعل", "Opened, no interaction")}</span><b>{num(totals.openedNoAction)}</b><small>{pct(totals.openedNoAction)}</small></div>
            <div className="seg-kpi seg-kpi-good"><span>{t("تفاعل (ضغط رابط)", "Interacted (click)")}</span><b>{num(totals.interacted)}</b><small>{pct(totals.interacted)}</small></div>
            <div className="seg-kpi seg-kpi-unsub"><span>{t("ألغى الاشتراك", "Unsubscribed")}</span><b>{num(totals.unsubscribed)}</b><small>{pct(totals.unsubscribed)}</small></div>
          </div>
          {best && worst && best.campaign.id !== worst.campaign.id ? (
            <div className="seg-banners">
              <div className="seg-banner seg-banner-good"><span>{t("أفضل حملة", "Best campaign")}</span><b>{best.campaign.name}</b><small>{t(`تفاعل ${best.interactRate}% · فتح ${best.openRate}%`, `Interaction ${best.interactRate}% · open ${best.openRate}%`)}</small></div>
              <div className="seg-banner seg-banner-warn"><span>{t("أضعف حملة", "Weakest campaign")}</span><b>{worst.campaign.name}</b><small>{t(`تفاعل ${worst.interactRate}% · فتح ${worst.openRate}%`, `Interaction ${worst.interactRate}% · open ${worst.openRate}%`)}</small></div>
            </div>
          ) : null}
          <div className="seg-charts">
            <div className="panel">
              <div className="panel-head"><h2>{t("الاتجاه اليومي", "Daily trend")}</h2></div>
              <div className="panel-body">
                <LineChart labels={trend.days.map((day) => day.slice(5))} series={[
                  { label: t("مرسلة", "Sent"), color: "#4a90d9", values: trend.entries.map((entry) => entry.sent) },
                  { label: t("فُتحت", "Opened"), color: "#f0ad4e", values: trend.entries.map((entry) => entry.opened) },
                  { label: t("ضغط", "Clicked"), color: "#2e9e6b", values: trend.entries.map((entry) => entry.clicked) }
                ]} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h2>{t("نتيجة الرسائل", "Outcome")}</h2></div>
              <div className="panel-body">
                <DonutChart centerLabel={t("رسالة", "emails")} slices={[
                  { label: t("تفاعل", "Interacted"), value: totals.interacted, color: "#2e9e6b" },
                  { label: t("فتحها بدون تفاعل", "Opened, no interaction"), value: totals.openedNoAction, color: "#4a90d9" },
                  { label: t("لم يفتح الرسالة", "Didn't open"), value: totals.notOpened, color: "#f0ad4e" },
                  { label: t("لم يستلم الرسالة", "Didn't receive"), value: totals.notReceived, color: "#d9534f" },
                  { label: t("ألغى الاشتراك", "Unsubscribed"), value: totals.unsubscribed, color: "#8e6bbf" }
                ]} />
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>{t("مقارنة الحملات", "Campaign comparison")}</h2></div>
            <div className="panel-body table-wrap">
              <table>
                <thead><tr><th>{t("الحملة", "Campaign")}</th><th>{t("التاريخ", "Date")}</th><th>{t("مرسلة", "Sent")}</th><th>{t("لم يستلم", "Not received")}</th><th>{t("لم يفتح", "Not opened")}</th><th>{t("فتحها بدون تفاعل", "Opened only")}</th><th>{t("تفاعل", "Interacted")}</th><th>{t("ألغى الاشتراك", "Unsub.")}</th><th>{t("نسبة الفتح", "Open rate")}</th><th>{t("نسبة التفاعل", "Interaction rate")}</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.campaign.id}>
                      <td><b>{row.campaign.name}</b></td><td>{row.day}</td><td>{num(row.a.sentCount)}</td><td>{num(row.notReceived)}</td><td>{num(row.notOpened)}</td><td>{num(row.openedNoAction)}</td><td>{num(row.interacted)}</td><td>{num(row.a.unsubscribeCount)}</td>
                      <td><span className="seg-rate">{row.openRate}%</span></td><td><span className="seg-rate seg-rate-good">{row.interactRate}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
