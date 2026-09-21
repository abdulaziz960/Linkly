"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";
import { formatDateTime } from "../../../lib/time";
import { engagementBucketFor, type EngagementBucket } from "../../../lib/campaign-engagement";
import { sanitizeCsvCell } from "../../../lib/csv-export";
import CustomSelect from "../../components/CustomSelect";

const pageSizeOptions = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" }
];

type ReportRow = {
  phone: string;
  name: string;
  status: string;
  error: string;
  date: string;
  readAt: string;
  clickedAt: string;
  clickCount: number;
  clicks: string[];
  deliveryFailed: number;
};

function engagementLabel(bucket: EngagementBucket | null, t: (ar: string, en: string) => string) {
  if (bucket === "clicked") return t("تفاعل", "Clicked");
  if (bucket === "opened") return t("فتحها بدون ضغط", "Opened, no click");
  if (bucket === "notOpened") return t("ما فتحها", "Not opened");
  if (bucket === "notReceived") return t("لم يستلم الرسالة", "Didn't receive the message");
  return "-";
}

// clickCount is 0 for a recipient who clicked before this counter existed
// (the column defaults to 0 and old clicks are never backfilled) - "-" is
// clearer there than a misleading "0" next to a "Clicked" row.
function clickCountLabel(bucket: EngagementBucket | null, clickCount: number) {
  if (bucket !== "clicked" || clickCount <= 0) return "-";
  return clickCount.toLocaleString("en-US");
}

function reportRowStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "تم الإرسال") return t("تم الإرسال", "Sent");
  if (status === "قيد الإرسال") return t("قيد الإرسال", "Sending");
  if (status === "فشل") return t("فشل", "Failed");
  return status;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    totalPages
  };
}

function Pagination({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (page: number) => void }) {
  return (
    <div className="campaign-pages">
      <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>‹</button>
      <button className="active" type="button">{currentPage}</button>
      <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>›</button>
    </div>
  );
}

/**
 * Per-campaign recipient engagement breakdown (tiles + searchable/paginated
 * table with a send-message action) - shared between the campaign report
 * modal (CampaignsView.tsx) and the automatic per-campaign classification on
 * the Segments page (SegmentsView.tsx), so the two never drift apart.
 */
export default function CampaignEngagementReport({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [engagementFilter, setEngagementFilter] = useState<EngagementBucket | null>(null);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [page, setPage] = useState(1);
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setEngagementFilter(null);
    setSearch("");
    setPage(1);
    setExpandedPhone(null);
    fetch(`/api/campaigns/${campaignId}/report`)
      .then((response) => response.json().catch(() => null))
      .then((body) => {
        if (cancelled) return;
        setRows(body?.ok ? body.data?.recipients ?? [] : []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId]);

  const engagementCounts = useMemo(() => {
    const counts: Record<EngagementBucket, number> = { notReceived: 0, notOpened: 0, opened: 0, clicked: 0 };
    for (const row of rows) {
      const bucket = engagementBucketFor(row);
      if (bucket) counts[bucket] += 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (engagementFilter && engagementBucketFor(row) !== engagementFilter) return false;
      if (!query) return true;
      return row.phone.includes(query) || row.status.toLowerCase().includes(query) || row.date.toLowerCase().includes(query);
    });
  }, [rows, search, engagementFilter]);

  const pagination = paginate(filteredRows, page, Number(pageSize));

  function downloadReport() {
    const header = [t("الاسم", "Name"), t("رقم الهاتف", "Phone number"), t("الحالة", "Status"), t("التفاعل", "Engagement"), t("مرات النقر", "Clicks"), t("التاريخ", "Date")];
    const csvRows = filteredRows.map((row) => {
      const bucket = engagementBucketFor(row);
      return [row.name, row.phone, row.status, engagementLabel(bucket, t), clickCountLabel(bucket, row.clickCount), formatDateTime(row.date)];
    });
    const csv = [header, ...csvRows].map((row) => row.map(sanitizeCsvCell).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaignName}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campaign-report-body">
      <div className="campaign-engagement-tiles campaign-engagement-tiles-4">
        <button type="button" className={engagementFilter === "notReceived" ? "engagement-tile active" : "engagement-tile"} onClick={() => { setEngagementFilter((current) => current === "notReceived" ? null : "notReceived"); setPage(1); }}>
          <b>{engagementCounts.notReceived.toLocaleString("en-US")}</b>
          <span>{t("لم يستلم الرسالة", "Didn't receive")}</span>
        </button>
        <button type="button" className={engagementFilter === "notOpened" ? "engagement-tile active" : "engagement-tile"} onClick={() => { setEngagementFilter((current) => current === "notOpened" ? null : "notOpened"); setPage(1); }}>
          <b>{engagementCounts.notOpened.toLocaleString("en-US")}</b>
          <span>{t("ما فتحها", "Not opened")}</span>
        </button>
        <button type="button" className={engagementFilter === "opened" ? "engagement-tile active" : "engagement-tile"} onClick={() => { setEngagementFilter((current) => current === "opened" ? null : "opened"); setPage(1); }}>
          <b>{engagementCounts.opened.toLocaleString("en-US")}</b>
          <span>{t("فتحها بدون ضغط", "Opened, no click")}</span>
        </button>
        <button type="button" className={engagementFilter === "clicked" ? "engagement-tile active" : "engagement-tile"} onClick={() => { setEngagementFilter((current) => current === "clicked" ? null : "clicked"); setPage(1); }}>
          <b>{engagementCounts.clicked.toLocaleString("en-US")}</b>
          <span>{t("تفاعل", "Clicked")}</span>
        </button>
      </div>
      <div className="campaign-toolbar report-toolbar">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("بحث...", "Search...")} />
        <button className="btn primary" type="button" onClick={downloadReport}>{t("تنزيل", "Download")}</button>
        <label className="entries">{t("عرض", "Show")} <CustomSelect className="page-size" value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} options={pageSizeOptions} /> {t("إدخالات", "entries")}</label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("الاسم", "Name")}</th>
              <th>{t("رقم الهاتف", "Phone number")}</th>
              <th>{t("الحالة", "Status")}</th>
              <th>{t("التفاعل", "Engagement")}</th>
              <th>{t("مرات النقر", "Clicks")}</th>
              <th>{t("التاريخ", "Date")}</th>
              <th>{t("إجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7}>{t("جارٍ التحميل...", "Loading...")}</td></tr> : null}
            {!loading ? pagination.items.map((row) => {
              const bucket = engagementBucketFor(row);
              // >= 1, not > 1: clicks that happened before this log existed
              // are never backfilled, so a recipient's total clickCount can
              // be higher than clicks.length even right after they click
              // again - showing the toggle as soon as there's ANY logged
              // click (rather than waiting for a second one post-rollout)
              // means the feature is visibly working on the very first
              // click, not just the second.
              const hasClickHistory = bucket === "clicked" && row.clicks.length >= 1;
              const isExpanded = hasClickHistory && expandedPhone === row.phone;
              return (
                <Fragment key={row.phone}>
                  <tr>
                    <td>{row.name || "-"}</td>
                    <td dir="ltr">{row.phone}</td>
                    <td>
                      <span className={row.status === "تم الإرسال" ? "state ok" : row.status === "قيد الإرسال" ? "state warn" : "state off"} title={row.error || undefined}>{reportRowStatusLabel(row.status, t)}</span>
                      {row.error ? <small className="campaign-report-error">{row.error}</small> : null}
                    </td>
                    <td>{engagementLabel(bucket, t)}</td>
                    <td>
                      {clickCountLabel(bucket, row.clickCount)}
                      {hasClickHistory ? (
                        <button
                          type="button"
                          className="campaign-click-history-toggle"
                          aria-expanded={isExpanded}
                          aria-label={t("عرض أوقات كل نقرة", "Show every click's time")}
                          onClick={() => setExpandedPhone((current) => (current === row.phone ? null : row.phone))}
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      ) : null}
                    </td>
                    <td><span className="campaign-date">◴ {formatDateTime(row.date)}</span></td>
                    <td>
                      <a className="btn soft" href={`/dashboard?view=inbox&phone=${encodeURIComponent(row.phone)}&name=${encodeURIComponent(row.name)}`} target="_blank" rel="noopener noreferrer">{t("إرسال رسالة", "Send message")}</a>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="campaign-click-history-row">
                      <td colSpan={7}>
                        <div className="campaign-click-history">
                          <b>{t(`كل النقرات (${row.clicks.length})`, `Every click (${row.clicks.length})`)}</b>
                          <ul>
                            {row.clicks.map((clickedAt, index) => (
                              <li key={`${clickedAt}-${index}`}>
                                <span className="campaign-click-history-index">#{index + 1}</span>
                                <span>◴ {formatDateTime(clickedAt)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            }) : null}
            {!loading && !pagination.items.length ? (
              <tr><td colSpan={7}>{t("لا توجد أرقام مطابقة للبحث.", "No numbers match your search.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
    </div>
  );
}
