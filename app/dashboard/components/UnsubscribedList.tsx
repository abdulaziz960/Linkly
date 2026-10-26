"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";

type Row = { name: string; phone: string; unsubscribedAt: string; campaignName: string };
type ApiRow = { name: string; phone?: string; email?: string; unsubscribedAt: string; campaignName: string };

function formatDate(iso: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
}

/** Customers who opted out of marketing messages: searchable, filterable by opt-out date, exportable. */
export default function UnsubscribedList({ channel = "whatsapp" }: { channel?: "whatsapp" | "email" }) {
  const isEmail = channel === "email";
  const { t, language } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  async function load(from: string, to: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      if (isEmail) params.set("channel", "email");
      const response = await fetch(`/api/segments/unsubscribed?${params.toString()}`);
      const body = await response.json().catch(() => null);
      setRows(response.ok && body?.ok ? ((body.data ?? []) as ApiRow[]).map((row) => ({ name: row.name, phone: row.phone || row.email || "", unsubscribedAt: row.unsubscribedAt, campaignName: row.campaignName })) : []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { load("", ""); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.phone.includes(query) || row.name.toLowerCase().includes(query) || row.campaignName.toLowerCase().includes(query));
  }, [rows, search]);

  async function exportExcel() {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(t("ألغوا الاشتراك", "Unsubscribed"), { views: [{ rightToLeft: language === "ar" }] });
    sheet.columns = [
      { header: t("الاسم", "Name"), key: "name", width: 28 },
      { header: isEmail ? t("البريد الإلكتروني", "Email") : t("رقم الجوال", "Phone number"), key: "phone", width: 20 },
      { header: t("تاريخ الإلغاء", "Unsubscribed on"), key: "date", width: 24 },
      { header: t("آخر حملة وصلته", "Last campaign received"), key: "campaignName", width: 28 }
    ];
    filtered.forEach((row) => sheet.addRow({ name: row.name, phone: row.phone, date: formatDate(row.unsubscribedAt), campaignName: row.campaignName }));
    sheet.getRow(1).font = { bold: true };
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${t("ألغوا-الاشتراك", "unsubscribed")}${isEmail ? "-email" : ""}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("ألغوا الاشتراك", "Unsubscribed customers")}</h2>
        <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{filtered.length.toLocaleString("en-US")}</b>{filtered.length !== rows.length ? ` / ${rows.length.toLocaleString("en-US")}` : ""}</span>
      </div>
      <div className="panel-body">
        <p className="muted-copy">{isEmail ? t("كل من ضغط رابط إلغاء الاشتراك في النشرات البريدية. لا تصلهم الحملات البريدية بعد الآن.", "Everyone who used the unsubscribe link in your email campaigns. They no longer receive email campaigns.") : t("كل من ضغط زر «إلغاء الاشتراك» في رسالة الحملة أو أرسل كلمة الإلغاء. لا تصلهم الحملات التسويقية بعد الآن، ويمكنهم الاشتراك من جديد بإرسال START.", "Everyone who tapped the unsubscribe button or sent a stop keyword. They no longer receive campaigns and can rejoin by sending START.")}</p>
        <div className="seg-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث بالاسم أو الرقم أو الحملة...", "Search by name, phone or campaign...")} />
          <label className="entries">{t("من", "From")} <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="entries">{t("إلى", "To")} <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button className="btn primary" type="button" onClick={() => load(dateFrom, dateTo)}>{t("تطبيق", "Apply")}</button>
          <button className="btn soft" type="button" onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); load("", ""); }}>{t("مسح", "Clear")}</button>
          <button className="btn soft" type="button" onClick={exportExcel} disabled={!filtered.length}>{t("تصدير Excel", "Export Excel")}</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("الاسم", "Name")}</th><th>{isEmail ? t("البريد الإلكتروني", "Email") : t("رقم الجوال", "Phone number")}</th><th>{t("تاريخ الإلغاء", "Unsubscribed on")}</th><th>{t("آخر حملة وصلته", "Last campaign received")}</th></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.phone}>
                  <td>{row.name || "-"}</td>
                  <td dir="ltr">{row.phone}</td>
                  <td>{formatDate(row.unsubscribedAt)}</td>
                  <td>{row.campaignName || "-"}</td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={4}>{loading ? t("جارٍ التحميل...", "Loading...") : t("لا يوجد عملاء ألغوا الاشتراك.", "No unsubscribed customers.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
