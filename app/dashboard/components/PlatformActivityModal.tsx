"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";

type Kind = "leads" | "events";
type Platform = "meta" | "snapchat" | "tiktok";
type EventRange = "24h" | "7d" | "30d" | "all";
type LeadRange = "all" | "today" | "yesterday" | "7d";
type Lead = { conversationId: string; name: string; phone: string; stage: string; source: string; campaign: string; createdAt: string };
type EventRow = { conversationId: string; name: string; phone: string; stage: string; eventName: string; ok: boolean; message: string; createdAt: string };

const ACCENT: Record<Platform, string> = { meta: "linear-gradient(135deg,#1877f2,#4f9bff)", snapchat: "linear-gradient(135deg,#fffc00,#ffc400)", tiktok: "linear-gradient(135deg,#25f4ee,#4fd8d0)" };
const INK: Record<Platform, string> = { meta: "#fff", snapchat: "#111", tiktok: "#111" };
const PAGE_SIZE = 20;

/** The pipeline stage «فاز» is a purchase for the ad platform, so the log says «شراء». */
function eventStageLabel(stage: string) {
  return stage.trim() === "فاز" ? "شراء" : stage;
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function startOfDay(offsetDays: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.getTime();
}

const ghostButton = { minHeight: 44, padding: "0 22px", borderRadius: 14, border: "1.5px solid #d6dedc", background: "#fff", color: "#1d2b28", fontWeight: 700, fontSize: 15, cursor: "pointer" } as const;

/** Pop-up with the platform's customers, or the log of conversions Linkly sent back to it. */
export default function PlatformActivityModal({ platform, kind, title, onClose }: { platform: Platform; kind: Kind; title: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [eventRange, setEventRange] = useState<EventRange>("7d");
  const [leadRange, setLeadRange] = useState<LeadRange>("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    // Customers are fetched whole and filtered here, so the day buttons never wait on the server.
    fetch(`/api/ad-platforms?platform=${platform}&kind=${kind}&range=${kind === "leads" ? "all" : eventRange}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; error?: string; data?: { leads?: Lead[]; events?: EventRow[] } }) => {
        if (cancelled) return;
        if (!result?.ok) throw new Error(result?.error || t("تعذر التحميل.", "Could not load."));
        setLeads(result.data?.leads ?? []);
        setEvents(result.data?.events ?? []);
      })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : t("تعذر التحميل.", "Could not load.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, kind, eventRange, reload]);

  const visibleLeads = useMemo(() => {
    const time = (lead: Lead) => new Date(lead.createdAt).getTime();
    if (leadRange === "today") return leads.filter((lead) => time(lead) >= startOfDay(0));
    if (leadRange === "yesterday") return leads.filter((lead) => time(lead) >= startOfDay(-1) && time(lead) < startOfDay(0));
    if (leadRange === "7d") return leads.filter((lead) => time(lead) >= startOfDay(-6));
    return leads;
  }, [leads, leadRange]);

  const pageCount = Math.max(1, Math.ceil(visibleLeads.length / PAGE_SIZE));
  const pageLeads = visibleLeads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sent = events.filter((event) => event.ok).length;
  const sourceLabel = (source: string) => source === "lead_form" ? t("نموذج إعلان", "Lead form") : source === "tracking_link" ? t("رابط تتبع", "Tracking link") : t("إعلان واتساب", "Click-to-WhatsApp");

  function exportCsv() {
    const rows = [[t("العميل", "Customer"), t("الرقم", "Phone"), t("الحملة", "Campaign"), t("المصدر", "Source"), t("المرحلة", "Stage"), t("التاريخ", "Date")], ...visibleLeads.map((lead) => [lead.name, lead.phone, lead.campaign, sourceLabel(lead.source), lead.stage, when(lead.createdAt)])];
    // A leading apostrophe stops spreadsheets from running a cell that starts like a formula.
    const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const blob = new Blob(["﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${platform}-customers.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const pills: Array<[string, string]> = kind === "events"
    ? [["24h", t("24 ساعة", "24 hours")], ["7d", t("7 أيام", "7 days")], ["30d", t("30 يوم", "30 days")], ["all", t("الكل", "All")]]
    : [["all", t("الكل", "All")], ["today", t("اليوم", "Today")], ["yesterday", t("أمس", "Yesterday")], ["7d", t("آخر 7 أيام", "Last 7 days")]];
  const activePill = kind === "events" ? eventRange : leadRange;

  const th = { padding: "14px 16px", textAlign: "start", fontWeight: 800, background: "#f3f6f8", color: "#1d2b28", whiteSpace: "nowrap", position: "sticky", top: 0 } as const;
  const td = { padding: "14px 16px", borderTop: "1px solid #e8eeec", verticalAlign: "middle" } as const;
  const sentPill = (ok: boolean, message: string) => (
    <span title={ok ? "" : message} style={{ display: "inline-block", padding: "4px 14px", borderRadius: 999, fontWeight: 800, fontSize: 14, background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#15803d" : "#b91c1c" }}>{ok ? t("تم الإرسال", "Sent") : t("فشل", "Failed")}</span>
  );

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: "min(980px, 96vw)", padding: 0, overflow: "hidden" }} onClick={(event) => event.stopPropagation()}>
        <header style={{ background: ACCENT[platform], color: INK[platform], display: "flex", alignItems: "center", gap: 14, padding: "22px 26px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ color: "inherit", margin: 0, fontSize: 26 }}>{title}</h2>
            <small style={{ opacity: 0.8, fontSize: 15 }}>{kind === "leads" ? t(`عدد العملاء: ${visibleLeads.length}`, `Customers: ${visibleLeads.length}`) : t(`${events.length} حدث`, `${events.length} events`)}</small>
          </div>
          {kind === "leads" ? (
            <button type="button" onClick={exportCsv} disabled={!visibleLeads.length} style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#0b3a6f", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{t("تصدير Excel", "Export Excel")}</button>
          ) : null}
          <button type="button" aria-label={t("تحديث", "Refresh")} title={t("تحديث", "Refresh")} onClick={() => setReload((value) => value + 1)} disabled={loading} style={{ minHeight: 44, minWidth: 44, padding: kind === "leads" ? "0 20px" : 0, borderRadius: 12, border: 0, background: "rgba(0,0,0,0.1)", color: "inherit", fontWeight: 800, fontSize: kind === "leads" ? 15 : 24, cursor: "pointer" }}>{kind === "leads" ? t("تحديث", "Refresh") : "↻"}</button>
        </header>

        <div style={{ padding: "22px 26px", display: "grid", gap: 18, maxHeight: "70vh", overflow: "auto", alignContent: "start" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {pills.map(([value, label]) => {
              const active = activePill === value;
              return (
                <button key={value} type="button" onClick={() => { setPage(0); if (kind === "events") setEventRange(value as EventRange); else setLeadRange(value as LeadRange); }} style={{ ...ghostButton, minHeight: kind === "events" ? 54 : 40, borderRadius: kind === "events" ? 16 : 999, background: active ? "#111" : "#fff", color: active ? "#fffc00" : "#1d2b28", borderColor: active ? "#111" : "#d6dedc" }}>{label}</button>
              );
            })}
          </div>

          {kind === "events" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
              {([[t("الإجمالي", "Total"), events.length, "linear-gradient(135deg,#1e40af,#3b6cf0)"], [t("تم الإرسال", "Sent"), sent, "linear-gradient(135deg,#0f766e,#16b27a)"], [t("فشل", "Failed"), events.length - sent, "linear-gradient(135deg,#9d1c52,#e0407f)"]] as Array<[string, number, string]>).map(([label, value, background]) => (
                <div key={label} style={{ background, color: "#fff", borderRadius: 20, padding: "22px 26px", display: "grid", gap: 6 }}>
                  <small style={{ fontWeight: 700, fontSize: 15 }}>{label}</small>
                  <b style={{ fontSize: 44, lineHeight: 1.1 }}>{value}</b>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="automation-feedback error" role="status">{error}</div> : null}
          {loading ? <p>{t("جارٍ التحميل...", "Loading...")}</p> : null}
          {!loading && !error && (kind === "leads" ? visibleLeads.length === 0 : events.length === 0) ? (
            <p style={{ opacity: 0.7 }}>{kind === "leads" ? t("لا يوجد عملاء من هذه المنصة في هذه الفترة.", "No customers from this platform in this period.") : t("لم تُرسل أي أحداث لهذه المنصة في هذه الفترة.", "No events were sent to this platform in this period.")}</p>
          ) : null}

          {!loading && kind === "events" && events.length ? (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
                <thead><tr><th style={th}>{t("العميل", "Customer")}</th><th style={th}>{t("الحدث", "Event")}</th><th style={th}>{t("الحالة", "Status")}</th><th style={th}>{t("التاريخ", "Date")}</th></tr></thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={`${event.conversationId}-${event.createdAt}-${index}`}>
                      <td style={td}><b style={{ fontSize: 18 }}>{event.name || "—"}</b><br /><small dir="ltr" style={{ opacity: 0.65, display: "inline-block" }}>{event.phone}</small></td>
                      <td style={td}><b style={{ fontSize: 18, fontWeight: 600 }}>{eventStageLabel(event.stage)}</b><br /><small style={{ opacity: 0.65 }}>{event.eventName} · {t("تلقائي", "automatic")}</small></td>
                      <td style={td}>{sentPill(event.ok, event.message)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }} dir="ltr"><span style={{ display: "block", textAlign: "right" }}>{when(event.createdAt)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && kind === "leads" && visibleLeads.length ? (
            <div style={{ overflow: "auto", border: "1px solid #e1e8e6", borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
                <thead><tr><th style={th}>#</th><th style={th}>{t("العميل", "Customer")}</th><th style={th}>{t("الرقم", "Phone")}</th><th style={th}>{t("التفاصيل / الحملة", "Details / campaign")}</th><th style={th}>{t("المصدر", "Source")}</th><th style={th}>{t("المرحلة", "Stage")}</th><th style={th}>{t("التاريخ", "Date")}</th><th style={th}>{t("المحادثة", "Chat")}</th></tr></thead>
                <tbody>
                  {pageLeads.map((lead, index) => (
                    <tr key={lead.conversationId}>
                      <td style={td}>{page * PAGE_SIZE + index + 1}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{lead.name || "—"}</td>
                      <td style={{ ...td, fontWeight: 800 }} dir="ltr"><span style={{ display: "block", textAlign: "right" }}>{lead.phone}</span></td>
                      <td style={{ ...td, color: "#0b4f8a", fontWeight: 700 }}>{lead.campaign || "—"}</td>
                      <td style={{ ...td, opacity: 0.75 }}>{sourceLabel(lead.source)}</td>
                      <td style={td}><span className="status-pill assigned">{lead.stage}</span></td>
                      <td style={{ ...td, whiteSpace: "nowrap" }} dir="ltr"><span style={{ display: "block", textAlign: "right" }}>{when(lead.createdAt)}</span></td>
                      <td style={td}>
                        <a href={`/dashboard?view=conversations&conversation=${encodeURIComponent(lead.conversationId)}`} aria-label={t("فتح المحادثة", "Open the chat")} title={t("فتح المحادثة", "Open the chat")} style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 999, background: "#25d366", color: "#fff", fontSize: 18 }}>💬</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <footer style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 26px", borderTop: "1px solid #e1e8e6" }}>
          <button type="button" onClick={onClose} style={{ border: 0, background: "none", color: "#be123c", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>{t("إغلاق", "Close")}</button>
          {kind === "leads" && pageCount > 1 ? (
            <>
              <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)} style={{ ...ghostButton, minHeight: 40 }}>{t("التالي ›", "Next ›")}</button>
              <b>{t(`صفحة ${page + 1} / ${pageCount}`, `Page ${page + 1} / ${pageCount}`)}</b>
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} style={{ ...ghostButton, minHeight: 40 }}>{t("‹ السابق", "‹ Previous")}</button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
