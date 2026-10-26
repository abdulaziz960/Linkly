"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { DonutChart } from "./MiniCharts";
import type { EngagementBucket } from "../../../lib/campaign-engagement";

type Row = { name: string; email: string; campaignName: string; clickCount: number };
type Overview = { counts: Record<EngagementBucket, number>; rows: Record<EngagementBucket, Row[]> };
type CampaignOption = { id: string; name: string };
const buckets: EngagementBucket[] = ["notReceived", "notOpened", "opened", "clicked", "unsubscribed"];

/** Email audience classification: everyone sent an email, grouped by what they did, filterable by campaign and date, exportable. */
export default function EmailAudienceOverview() {
  const { t, language } = useLanguage();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<EngagementBucket | null>(null);
  const [search, setSearch] = useState("");

  const label = (bucket: EngagementBucket) => ({
    notReceived: t("لم يستلم الرسالة", "Didn't receive"), notOpened: t("لم يفتح الرسالة", "Didn't open"),
    opened: t("فتحها بدون تفاعل", "Opened, no interaction"), clicked: t("تفاعل", "Interacted"), unsubscribed: t("ألغى الاشتراك", "Unsubscribed")
  })[bucket];

  async function load(from: string, to: string, campaign: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      if (campaign) params.set("campaignId", campaign);
      const response = await fetch(`/api/segments/email-engagement?${params.toString()}`);
      const body = await response.json().catch(() => null);
      setOverview(response.ok && body?.ok ? body.data : null);
    } catch { setOverview(null); }
    setLoading(false);
  }

  useEffect(() => {
    load("", "", "");
    fetch("/api/segments/email-campaigns").then((response) => response.json().catch(() => null)).then((body) => setCampaigns(body?.ok ? (body.data ?? []).map((campaign: CampaignOption) => ({ id: campaign.id, name: campaign.name })) : [])).catch(() => setCampaigns([]));
  }, []);

  const rows = active && overview ? overview.rows[active].filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || row.email.includes(query) || row.name.toLowerCase().includes(query) || row.campaignName.toLowerCase().includes(query);
  }) : [];

  async function exportExcel() {
    if (!active) return;
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(label(active), { views: [{ rightToLeft: language === "ar" }] });
    sheet.columns = [{ header: t("الاسم", "Name"), key: "name", width: 28 }, { header: t("البريد الإلكتروني", "Email"), key: "email", width: 32 }, { header: t("من أي حملة", "From which campaign"), key: "campaignName", width: 28 }];
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${label(active)}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="seg-tab-stack">
      <div className="panel seg-filters">
        <label>{t("الحملة", "Campaign")}<CustomSelect value={campaignId} onChange={setCampaignId} options={[{ value: "", label: t("كل الحملات", "All campaigns") }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]} /></label>
        <label>{t("من", "From")} <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>{t("إلى", "To")} <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <button className="btn primary" type="button" onClick={() => { setActive(null); load(dateFrom, dateTo, campaignId); }}>{t("تطبيق", "Apply")}</button>
        <button className="btn soft" type="button" onClick={() => { setDateFrom(""); setDateTo(""); setCampaignId(""); setActive(null); load("", "", ""); }}>{t("مسح", "Clear")}</button>
      </div>
      {loading ? <p className="muted-copy">{t("جارٍ التحميل...", "Loading...")}</p> : null}
      {!loading && overview ? (
        <div className="seg-overview-grid">
          <div className="panel"><div className="panel-body"><DonutChart centerLabel={t("عميل", "contacts")} slices={[
            { label: label("clicked"), value: overview.counts.clicked, color: "#2e9e6b" }, { label: label("opened"), value: overview.counts.opened, color: "#4a90d9" },
            { label: label("notOpened"), value: overview.counts.notOpened, color: "#f0ad4e" }, { label: label("notReceived"), value: overview.counts.notReceived, color: "#d9534f" },
            { label: label("unsubscribed"), value: overview.counts.unsubscribed, color: "#8e6bbf" }]} /></div></div>
          <div className="panel">
            <div className="campaign-engagement-tiles campaign-engagement-tiles-5">
              {buckets.map((bucket) => (
                <button key={bucket} type="button" className={active === bucket ? "engagement-tile active" : "engagement-tile"} onClick={() => setActive((current) => current === bucket ? null : bucket)}>
                  <b>{overview.counts[bucket].toLocaleString("en-US")}</b><span>{label(bucket)}</span>
                </button>
              ))}
            </div>
            {active ? (
              <div className="panel-body">
                <div className="seg-toolbar">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث بالاسم أو البريد...", "Search name or email...")} />
                  <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{rows.length.toLocaleString("en-US")}</b></span>
                  <button className="btn soft" type="button" onClick={exportExcel} disabled={!rows.length}>{t("تصدير Excel", "Export Excel")}</button>
                </div>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t("الاسم", "Name")}</th><th>{t("البريد الإلكتروني", "Email")}</th><th>{t("من أي حملة", "From which campaign")}</th></tr></thead>
                  <tbody>
                    {rows.map((row) => <tr key={row.email}><td>{row.name || "-"}</td><td dir="ltr">{row.email}</td><td>{row.campaignName || "-"}</td></tr>)}
                    {!rows.length ? <tr><td colSpan={3}>{t("لا يوجد عملاء بهذه الحالة.", "No contacts in this state.")}</td></tr> : null}
                  </tbody>
                </table></div>
              </div>
            ) : <div className="panel-body"><p className="muted-copy">{t("اضغط على أي حالة لعرض القائمة وتصديرها.", "Select a state to see and export the list.")}</p></div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
