"use client";

import { useMemo, useState } from "react";
import type { Campaign } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { DonutChart, LineChart } from "./MiniCharts";
import { FAILURE_DETAIL, formatRate, type CampaignStats, type FailureReasonKey } from "../../../lib/campaign-metrics";

const failureLabels = FAILURE_DETAIL;
const failureColors = ["#d9534f", "#f0ad4e", "#8e6bbf", "#4a90d9", "#e87ca0", "#5bb5a2", "#91a29e"];

const launched = new Set(["قيد الإرسال", "الحملة أنجزت"]);

type Row = {
  campaign: Campaign;
  stats: CampaignStats;
  day: string;
  notReceived: number;
  notOpened: number;
  openedNoAction: number;
  interacted: number;
  unsubscribed: number;
  openRate: number;
  interactRate: number;
};

function dayOf(campaign: Campaign) {
  return (campaign.sentAt || campaign.updatedAt || "").slice(0, 10);
}

function buildRow(campaign: Campaign): Row | null {
  const stats = campaign.stats;
  if (!stats || stats.sent <= 0) return null;
  const read = stats.read;
  const interacted = stats.interacted;
  const delivered = Math.max(stats.delivered, read);
  return {
    campaign,
    stats,
    day: dayOf(campaign),
    notReceived: stats.failed + Math.max(0, stats.sent - delivered),
    notOpened: Math.max(0, delivered - read),
    openedNoAction: Math.max(0, read - interacted),
    interacted,
    unsubscribed: stats.unsubscribed,
    openRate: formatRate(read, stats.sent),
    interactRate: formatRate(interacted, stats.sent)
  };
}

/** Tab 1: the comprehensive campaign report - filters, KPIs, best/worst campaign, daily trend, error analysis, comparison table. */
export default function CampaignPerformanceReport({ campaigns }: { campaigns: Campaign[] }) {
  const { t } = useLanguage();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [campaignId, setCampaignId] = useState("");

  const allRows = useMemo(() => campaigns.filter((campaign) => launched.has(campaign.status)).map(buildRow).filter((row): row is Row => Boolean(row)), [campaigns]);
  const rows = useMemo(() => allRows.filter((row) => {
    if (campaignId && row.campaign.id !== campaignId) return false;
    if (dateFrom && row.day < dateFrom) return false;
    if (dateTo && row.day > dateTo) return false;
    return true;
  }), [allRows, campaignId, dateFrom, dateTo]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    sent: acc.sent + row.stats.sent,
    notReceived: acc.notReceived + row.notReceived,
    notOpened: acc.notOpened + row.notOpened,
    openedNoAction: acc.openedNoAction + row.openedNoAction,
    interacted: acc.interacted + row.interacted,
    unsubscribed: acc.unsubscribed + row.unsubscribed,
    read: acc.read + row.stats.read,
    cost: acc.cost + (row.campaign.cost ?? 0)
  }), { sent: 0, notReceived: 0, notOpened: 0, openedNoAction: 0, interacted: 0, unsubscribed: 0, read: 0, cost: 0 }), [rows]);

  const ranked = [...rows].sort((a, b) => b.interactRate - a.interactRate || b.openRate - a.openRate);
  const best = rows.length > 1 ? ranked[0] : null;
  const worst = rows.length > 1 ? ranked[ranked.length - 1] : null;

  const trend = useMemo(() => {
    const byDay = new Map<string, { sent: number; read: number; interacted: number }>();
    for (const row of rows) {
      if (!row.day) continue;
      const entry = byDay.get(row.day) ?? { sent: 0, read: 0, interacted: 0 };
      entry.sent += row.stats.sent; entry.read += row.stats.read; entry.interacted += row.interacted;
      byDay.set(row.day, entry);
    }
    const days = [...byDay.keys()].sort();
    return { days, entries: days.map((day) => byDay.get(day)!) };
  }, [rows]);

  const reasons = useMemo(() => {
    const map = new Map<FailureReasonKey, number>();
    for (const row of rows) for (const reason of row.stats.failureReasons) map.set(reason.key, (map.get(reason.key) ?? 0) + reason.count);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const pct = (part: number) => `${formatRate(part, totals.sent).toLocaleString("en-US")}%`;
  const num = (value: number) => value.toLocaleString("en-US");

  return (
    <div className="seg-tab-stack">
      <div className="panel seg-filters">
        <label>{t("الحملة", "Campaign")}
          <CustomSelect value={campaignId} onChange={setCampaignId} options={[{ value: "", label: t("كل الحملات", "All campaigns") }, ...allRows.map((row) => ({ value: row.campaign.id, label: row.campaign.name }))]} />
        </label>
        <label>{t("من", "From")} <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>{t("إلى", "To")} <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <button className="btn soft" type="button" onClick={() => { setDateFrom(""); setDateTo(""); setCampaignId(""); }}>{t("مسح الفلاتر", "Clear filters")}</button>
      </div>

      {!rows.length ? <div className="panel"><div className="panel-body"><p className="muted-copy">{t("لا توجد حملات مرسلة ضمن هذه الفلاتر.", "No sent campaigns match these filters.")}</p></div></div> : (
        <>
          <div className="seg-kpis">
            <div className="seg-kpi"><span>{t("الحملات", "Campaigns")}</span><b>{num(rows.length)}</b></div>
            <div className="seg-kpi"><span>{t("الرسائل المرسلة", "Messages sent")}</span><b>{num(totals.sent)}</b></div>
            <div className="seg-kpi seg-kpi-bad"><span>{t("لم يستلم الرسالة", "Didn't receive")}</span><b>{num(totals.notReceived)}</b><small>{pct(totals.notReceived)}</small></div>
            <div className="seg-kpi seg-kpi-warn"><span>{t("لم يفتح الرسالة", "Didn't open")}</span><b>{num(totals.notOpened)}</b><small>{pct(totals.notOpened)}</small></div>
            <div className="seg-kpi"><span>{t("فتحها بدون تفاعل", "Opened, no interaction")}</span><b>{num(totals.openedNoAction)}</b><small>{pct(totals.openedNoAction)}</small></div>
            <div className="seg-kpi seg-kpi-good"><span>{t("تفاعل", "Interacted")}</span><b>{num(totals.interacted)}</b><small>{pct(totals.interacted)}</small></div>
            <div className="seg-kpi seg-kpi-unsub"><span>{t("ألغى الاشتراك", "Unsubscribed")}</span><b>{num(totals.unsubscribed)}</b><small>{pct(totals.unsubscribed)}</small></div>
            <div className="seg-kpi"><span>{t("التكلفة (ر.س)", "Cost (SAR)")}</span><b>{totals.cost.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
          </div>

          {best && worst && best.campaign.id !== worst.campaign.id ? (
            <div className="seg-banners">
              <div className="seg-banner seg-banner-good">
                <span>{t("أفضل حملة", "Best campaign")}</span>
                <b>{best.campaign.name}</b>
                <small>{t(`تفاعل ${best.interactRate}% · فتح ${best.openRate}%`, `Interaction ${best.interactRate}% · open ${best.openRate}%`)}</small>
              </div>
              <div className="seg-banner seg-banner-warn">
                <span>{t("أضعف حملة", "Weakest campaign")}</span>
                <b>{worst.campaign.name}</b>
                <small>{t(`تفاعل ${worst.interactRate}% · فتح ${worst.openRate}%`, `Interaction ${worst.interactRate}% · open ${worst.openRate}%`)}</small>
              </div>
            </div>
          ) : null}

          <div className="seg-charts">
            <div className="panel">
              <div className="panel-head"><h2>{t("الاتجاه اليومي", "Daily trend")}</h2></div>
              <div className="panel-body">
                <p className="muted-copy">{t("حسب تاريخ إرسال كل حملة.", "By each campaign's send date.")}</p>
                <LineChart
                  labels={trend.days.map((day) => day.slice(5))}
                  series={[
                    { label: t("مرسلة", "Sent"), color: "#4a90d9", values: trend.entries.map((entry) => entry.sent) },
                    { label: t("فُتحت", "Opened"), color: "#f0ad4e", values: trend.entries.map((entry) => entry.read) },
                    { label: t("تفاعل", "Interacted"), color: "#2e9e6b", values: trend.entries.map((entry) => entry.interacted) }
                  ]}
                />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h2>{t("تحليل الأخطاء", "Error analysis")}</h2></div>
              <div className="panel-body">
                {reasons.length ? (
                  <DonutChart centerLabel={t("فشل", "Failed")} slices={reasons.map(([key, value], index) => ({ label: t(failureLabels[key][0], failureLabels[key][1]), value, color: failureColors[index % failureColors.length] }))} />
                ) : <p className="muted-copy">{t("لا توجد أخطاء إرسال 🎉", "No delivery errors 🎉")}</p>}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>{t("مقارنة الحملات", "Campaign comparison")}</h2></div>
            <div className="panel-body table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("الحملة", "Campaign")}</th><th>{t("التاريخ", "Date")}</th><th>{t("مرسلة", "Sent")}</th>
                    <th>{t("لم يستلم", "Not received")}</th><th>{t("لم يفتح", "Not opened")}</th><th>{t("فتحها بدون تفاعل", "Opened only")}</th>
                    <th>{t("تفاعل", "Interacted")}</th><th>{t("ألغى الاشتراك", "Unsub.")}</th><th>{t("نسبة الفتح", "Open rate")}</th><th>{t("نسبة التفاعل", "Interaction rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.campaign.id}>
                      <td><b>{row.campaign.name}</b></td>
                      <td>{row.day || "-"}</td>
                      <td>{num(row.stats.sent)}</td>
                      <td>{num(row.notReceived)}</td>
                      <td>{num(row.notOpened)}</td>
                      <td>{num(row.openedNoAction)}</td>
                      <td>{num(row.interacted)}</td>
                      <td>{num(row.unsubscribed)}</td>
                      <td><span className="seg-rate">{row.openRate}%</span></td>
                      <td><span className="seg-rate seg-rate-good">{row.interactRate}%</span></td>
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
