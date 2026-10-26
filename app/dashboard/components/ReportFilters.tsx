"use client";

import { useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

/** The report filter bar from the approved preview: period, campaign, refresh and Excel export (custom dates when "custom" is picked). */
export default function ReportFilters({ campaigns, campaignId, onCampaign, onRange, onRefresh, onExport, exportDisabled }: {
  campaigns: Array<{ id: string; name: string }>;
  campaignId: string;
  onCampaign: (id: string) => void;
  onRange: (from: string, to: string) => void;
  onRefresh: () => void | Promise<void>;
  onExport: () => void | Promise<void>;
  exportDisabled?: boolean;
}) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  function choosePeriod(value: string) {
    setPeriod(value);
    if (value === "custom") return;
    const iso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const now = new Date();
    if (value === "all") { setFrom(""); setTo(""); onRange("", ""); return; }
    const start = new Date(now);
    if (value === "week") start.setDate(start.getDate() - 6);
    if (value === "month") start.setDate(1);
    if (value === "year") { start.setMonth(0); start.setDate(1); }
    setFrom(iso(start)); setTo(iso(now));
    onRange(iso(start), iso(now));
  }

  return (
    <div className="seg-toolbar report-filters">
      <label className="rf-field"><span>{t("الفترة", "Period")}</span>
        <CustomSelect value={period} onChange={choosePeriod} options={[{ value: "all", label: t("كل الفترات", "All time") }, { value: "today", label: t("اليوم", "Today") }, { value: "week", label: t("آخر 7 أيام", "Last 7 days") }, { value: "month", label: t("هذا الشهر", "This month") }, { value: "year", label: t("هذه السنة", "This year") }, { value: "custom", label: t("فترة مخصصة", "Custom range") }]} />
      </label>
      {period === "custom" ? (
        <>
          <label className="rf-field"><span>{t("من", "From")}</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); onRange(event.target.value, to); }} /></label>
          <label className="rf-field"><span>{t("إلى", "To")}</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); onRange(from, event.target.value); }} /></label>
        </>
      ) : null}
      <label className="rf-field"><span>{t("الحملة", "Campaign")}</span>
        <CustomSelect value={campaignId} onChange={onCampaign} options={[{ value: "", label: t("كل الحملات", "All campaigns") }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]} />
      </label>
      <button className="btn primary" type="button" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }}>{refreshing ? t("جارٍ التحديث...", "Refreshing...") : t("تحديث التقرير", "Refresh report")}</button>
      <button className="btn soft" type="button" disabled={exportDisabled} onClick={() => void onExport()}>{t("تصدير Excel", "Export Excel")}</button>
    </div>
  );
}

export async function downloadReportExcel(fileName: string, sheetName: string, columns: Array<{ header: string; key: string; width?: number }>, rows: Array<Record<string, string | number>>) {
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  sheet.columns = columns.map((column) => ({ ...column, width: column.width ?? 16 }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}
