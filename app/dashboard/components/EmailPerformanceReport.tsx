"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";
import ReportFilters, { downloadReportExcel } from "./ReportFilters";
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

  async function load() {
    try {
      const response = await fetch("/api/segments/email-campaigns");
      const body = await response.json().catch(() => null);
      setCampaigns(response.ok && body?.ok ? body.data ?? [] : []);
    } catch {
      setCampaigns([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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
  const best = rows.length ? ranked[0] : null;
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
      <ReportFilters
        campaigns={all.map((row) => ({ id: row.campaign.id, name: row.campaign.name }))}
        campaignId={campaignId}
        onCampaign={setCampaignId}
        onRange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        onRefresh={load}
        exportDisabled={!rows.length}
        onExport={() => downloadReportExcel("email-campaign-report.xlsx", t("مقارنة الحملات", "Campaign comparison"), [
          { header: t("الحملة", "Campaign"), key: "name", width: 28 }, { header: t("التاريخ", "Date"), key: "day" }, { header: t("مرسلة", "Sent"), key: "sent" },
          { header: t("لم يستلم", "Not received"), key: "notReceived" }, { header: t("لم يفتح", "Not opened"), key: "notOpened" }, { header: t("فتحها بدون تفاعل", "Opened only"), key: "openedNoAction" },
          { header: t("تفاعل", "Interacted"), key: "interacted" }, { header: t("ألغى الاشتراك", "Unsubscribed"), key: "unsubscribed" }, { header: t("نسبة الفتح %", "Open rate %"), key: "openRate" }, { header: t("نسبة التفاعل %", "Interaction rate %"), key: "interactRate" }
        ], rows.map((row) => ({ name: row.campaign.name, day: row.day, sent: row.a.sentCount, notReceived: row.notReceived, notOpened: row.notOpened, openedNoAction: row.openedNoAction, interacted: row.interacted, unsubscribed: row.a.unsubscribeCount, openRate: row.openRate, interactRate: row.interactRate })))}
      />
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
          <div className="seg-banners">
            <div className="seg-banner seg-banner-good">
              <span>🏆 {t("أفضل أداء", "Best performance")}</span>
              {best ? (
                <>
                  <b>{best.campaign.name}</b>
                  <small>{t(`تفاعل ${best.interactRate}% · فتح ${best.openRate}%`, `Interaction ${best.interactRate}% · open ${best.openRate}%`)}</small>
                </>
              ) : (
                <>
                  <b>{t("لا توجد حملات مرسلة بعد", "No campaigns sent yet")}</b>
                  <small>{t("يظهر هنا أفضل حملة بعد أول إرسال.", "Your best campaign shows here after the first send.")}</small>
                </>
              )}
            </div>
            <div className="seg-banner seg-banner-warn">
              <span>⚠ {t("أضعف أداء", "Weakest performance")}</span>
              {best && worst && worst.campaign.id !== best.campaign.id ? (
                <>
                  <b>{worst.campaign.name}</b>
                  <small>{t(`تفاعل ${worst.interactRate}% · فتح ${worst.openRate}%`, `Interaction ${worst.interactRate}% · open ${worst.openRate}%`)}</small>
                </>
              ) : (
                <>
                  <b>{t("لا توجد حملة للمقارنة بعد", "No campaign to compare yet")}</b>
                  <small>{t("يظهر هنا أضعف أداء عند وجود حملتين مرسلتين على الأقل.", "The weakest performer shows here once two campaigns have been sent.")}</small>
                </>
              )}
            </div>
          </div>
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
                  {!rows.length ? <tr><td colSpan={10}>{loading ? t("جارٍ التحميل...", "Loading...") : t("سيظهر هنا أداء حملاتك بعد أول إرسال.", "Your campaigns' performance will show here after the first send.")}</td></tr> : null}
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
    </div>
  );
}
