"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { AdminLog } from "../../../lib/database";
import type { SubscriptionRow } from "../types";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section, Segmented, StatCard, type Tone } from "../ds/primitives";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";
import { sanitizeCsvCell } from "../../../lib/csv-export";
import {
  DATE_RANGES,
  EMPTY_LOG_FILTERS,
  LEVELS,
  PAGE_SIZE,
  buildFilterQuery,
  duplicateCompanyNames,
  filterLogs,
  fullDate,
  groupLogs,
  levelCounts,
  parseInitialFilters,
  prepareLogs,
  relativeTime,
  type DateRange,
  type LevelFilter,
  type LogFilters
} from "./logs-data";

type Props = { subscriptions: SubscriptionRow[]; logs: AdminLog[]; initialFilters: Record<string, string | undefined> };

const LEVEL_TONE: Record<string, Tone> = { معلومة: "info", تنبيه: "warning", خطأ: "danger" };
const EXPORT_HEADERS = ["الوقت", "العميل", "نوع الحدث", "المصدر", "المنفذ", "المستوى", "التفاصيل", "قبل", "بعد", "IP", "الجهاز"];

function downloadBlob(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function LogsView({ subscriptions, logs, initialFilters }: Props) {
  const toast = useToast();
  const [now] = useState(() => Date.now());
  const [filters, setFilters] = useState<LogFilters>(() => parseInitialFilters(initialFilters));
  const deferredQuery = useDeferredValue(filters.query);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const enriched = useMemo(() => prepareLogs(logs), [logs]);
  const counts = useMemo(() => levelCounts(enriched), [enriched]);
  const sources = useMemo(() => Array.from(new Set(enriched.map((log) => log.source))).sort(), [enriched]);
  const actors = useMemo(() => Array.from(new Set(enriched.map((log) => log.actor))).sort(), [enriched]);
  const eventTypes = useMemo(() => Array.from(new Set(enriched.map((log) => log.eventType))).sort(), [enriched]);
  const duplicates = useMemo(() => duplicateCompanyNames(subscriptions), [subscriptions]);
  const selectedClient = subscriptions.find((item) => item.tenantId === filters.client);

  const effective = useMemo(() => ({ ...filters, query: deferredQuery }), [filters, deferredQuery]);
  const visible = useMemo(() => filterLogs(enriched, effective, now), [enriched, effective, now]);
  const groups = useMemo(() => groupLogs(visible), [visible]);
  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageGroups = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const activeFilters = [filters.client !== "all", filters.level !== "الكل", filters.dateRange !== "all", filters.eventType !== "all", filters.source !== "all", filters.actor !== "all", Boolean(filters.query.trim())].filter(Boolean).length;
  const isFiltering = filters.query !== deferredQuery;

  function patch(next: Partial<LogFilters>) {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }

  function toggleGroup(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const exportRows = () => visible.map((log) => [fullDate(log.timestamp, log.at), log.clientName, log.eventType, log.source, log.actor, log.level, log.message, log.before, log.after, log.ip, log.device]);
  const stamp = new Date().toISOString().slice(0, 10);

  function exportCsv() {
    const rows = [EXPORT_HEADERS, ...exportRows()];
    downloadBlob(`﻿${rows.map((row) => row.map((cell) => sanitizeCsvCell(String(cell ?? ""))).join(",")).join("\r\n")}`, "text/csv;charset=utf-8", `audiencew-logs-${stamp}.csv`);
    toast("success", "تم تصدير ملف CSV", `${formatNumber(visible.length)} سجل.`);
  }

  async function exportExcel() {
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("السجلات", { views: [{ rightToLeft: true }] });
      const widths = [23, 24, 16, 18, 20, 13, 55, 20, 20, 18, 20];
      sheet.columns = EXPORT_HEADERS.map((header, index) => ({ header, key: `c${index}`, width: widths[index] }));
      exportRows().forEach((row) => sheet.addRow(Object.fromEntries(row.map((cell, index) => [`c${index}`, cell]))));
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: "A1", to: "K1" };
      downloadBlob(await workbook.xlsx.writeBuffer(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `audiencew-logs-${stamp}.xlsx`);
      toast("success", "تم تصدير ملف Excel", `${formatNumber(visible.length)} سجل.`);
    } catch {
      toast("error", "تعذر تصدير ملف Excel", "حاول مرة أخرى أو استخدم CSV.");
    }
  }

  async function copyLink() {
    const query = buildFilterQuery(filters);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`);
      toast("success", "تم نسخ رابط التصفية");
    } catch {
      toast("error", "تعذر نسخ الرابط");
    }
  }

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي السجلات" value={formatNumber(counts["الكل"])} hint="كل الأحداث المسجّلة" icon="scroll" />
        <StatCard label="معلومة" value={formatNumber(counts["معلومة"])} hint="أحداث تشغيلية عادية" icon="info" tone="info" />
        <StatCard label="تنبيه" value={formatNumber(counts["تنبيه"])} hint="تحتاج إلى الانتباه" icon="alert" tone={counts["تنبيه"] ? "warning" : "neutral"} />
      </div>

      <Section
        title="السجلات التشغيلية"
        description={`${formatNumber(visible.length)} نتيجة مرتبة من الأحدث إلى الأقدم`}
        actions={
          <>
            <Button variant="outline" icon="external" onClick={() => void copyLink()} disabled={visible.length === 0}>نسخ رابط التصفية</Button>
            <ActionMenu
              label="تصدير السجلات"
              items={[
                { key: "csv", label: "تصدير CSV", icon: "download", onSelect: exportCsv, disabled: visible.length === 0 },
                { key: "xlsx", label: "تصدير Excel (.xlsx)", icon: "download", onSelect: () => void exportExcel(), disabled: visible.length === 0 }
              ]}
            />
          </>
        }
      >
        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث في التفاصيل أو العميل أو المنفّذ أو المصدر…" aria-label="بحث في السجلات" value={filters.query} onChange={(event) => patch({ query: event.target.value })} />
          </div>
          <Segmented label="تصفية حسب المستوى" value={filters.level} onChange={(level: LevelFilter) => patch({ level })} options={LEVELS.map((level) => ({ value: level, label: `${level} (${formatNumber(counts[level as "الكل" | "معلومة" | "تنبيه"])})` }))} />
        </div>

        <div className="ds-toolbar ds-toolbar-advanced">
          <label className="ds-field">النطاق الزمني
            <select className="ds-select" value={filters.dateRange} onChange={(event) => patch({ dateRange: event.target.value as DateRange })}>
              {DATE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
            </select>
          </label>
          {filters.dateRange === "custom" ? (
            <>
              <label className="ds-field">من تاريخ<input className="ds-input" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => patch({ from: event.target.value })} /></label>
              <label className="ds-field">إلى تاريخ<input className="ds-input" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => patch({ to: event.target.value })} /></label>
            </>
          ) : null}
          <label className="ds-field">العميل
            <select className="ds-select" value={filters.client} onChange={(event) => patch({ client: event.target.value })}>
              <option value="all">كل العملاء</option>
              {subscriptions.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.companyName}</option>)}
            </select>
            {selectedClient && duplicates.has(selectedClient.companyName) ? <small style={{ color: "var(--ds-warning)" }}>يوجد أكثر من حساب بنفس اسم الشركة، تأكد من اختيار الحساب الصحيح.</small> : null}
          </label>
          <label className="ds-field">نوع الحدث
            <select className="ds-select" value={filters.eventType} onChange={(event) => patch({ eventType: event.target.value })}>
              <option value="all">كل الأنواع</option>
              {eventTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="ds-field">المصدر
            <select className="ds-select" value={filters.source} onChange={(event) => patch({ source: event.target.value })}>
              <option value="all">كل المصادر</option>
              {sources.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="ds-field">المنفّذ
            <select className="ds-select" value={filters.actor} onChange={(event) => patch({ actor: event.target.value })}>
              <option value="all">كل المنفّذين</option>
              {actors.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {activeFilters ? <Button variant="ghost" onClick={() => { setFilters(EMPTY_LOG_FILTERS); setPage(1); }}>إعادة تعيين ({formatNumber(activeFilters)})</Button> : null}
        </div>

        {logs.length === 0 ? (
          <EmptyState icon="scroll" title="لا توجد سجلات حتى الآن" description="ستظهر الأحداث التشغيلية هنا بمجرد تسجيلها." />
        ) : isFiltering ? (
          <p className="ds-log-status" role="status">جارٍ تطبيق التصفية…</p>
        ) : pageGroups.length === 0 ? (
          <EmptyState icon="search" title="لا توجد سجلات مطابقة" description="جرّب تعديل البحث أو إعادة تعيين التصفية." action={<Button variant="outline" onClick={() => { setFilters(EMPTY_LOG_FILTERS); setPage(1); }}>إعادة تعيين التصفية</Button>} />
        ) : (
          <div className="ds-card ds-card-pad">
            <ul className="ds-feed ds-log-feed">
              {pageGroups.map((group) => {
                const log = group.primary;
                const open = expanded.has(group.id);
                const hasDetails = Boolean(log.before || log.after || log.ip || log.device);
                return (
                  <li key={group.id}>
                    <Badge tone={LEVEL_TONE[log.level] ?? "neutral"}>{log.level}</Badge>
                    <div className="ds-feed-body">
                      <strong>{log.message}</strong>
                      <span>
                        {log.clientName} · {log.eventType} · {log.actor} · {log.source}
                        {group.isGrouped ? ` · ${formatNumber(group.items.length)} تغييرات متتابعة` : ""}
                      </span>
                      {hasDetails ? (
                        <dl className="ds-log-details">
                          {log.before ? <div><dt>قبل</dt><dd>{log.before}</dd></div> : null}
                          {log.after ? <div><dt>بعد</dt><dd>{log.after}</dd></div> : null}
                          {log.ip ? <div><dt>IP</dt><dd dir="ltr">{log.ip}</dd></div> : null}
                          {log.device ? <div><dt>الجهاز</dt><dd>{log.device}</dd></div> : null}
                        </dl>
                      ) : null}
                      {group.isGrouped ? (
                        <>
                          <button type="button" className="ds-link-btn" aria-expanded={open} onClick={() => toggleGroup(group.id)}>{open ? "إخفاء التغييرات" : "عرض كل التغييرات"}</button>
                          {open ? (
                            <ol className="ds-log-sequence">
                              {group.items.slice(1).map((item, index) => (
                                <li key={item.id}>
                                  <span>{formatNumber(index + 2)}</span>
                                  <div>
                                    <p>{item.message}</p>
                                    <small>{relativeTime(item.timestamp, now, formatNumber)} · {item.actor}</small>
                                    {item.before || item.after ? <small>{item.before ? `قبل: ${item.before}` : ""} {item.after ? `← بعد: ${item.after}` : ""}</small> : null}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <time suppressHydrationWarning dateTime={log.timestamp ? new Date(log.timestamp).toISOString() : undefined} title={fullDate(log.timestamp, log.at)} className="ds-log-time">
                      {relativeTime(log.timestamp, now, formatNumber)}
                      <small>{fullDate(log.timestamp, log.at)}</small>
                    </time>
                  </li>
                );
              })}
            </ul>
            {groups.length > PAGE_SIZE ? (
              <nav className="ds-pager" aria-label="ترقيم صفحات السجلات" style={{ marginTop: 14, justifyContent: "center" }}>
                <Button variant="outline" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>السابق</Button>
                <span>صفحة {formatNumber(safePage)} من {formatNumber(pageCount)}</span>
                <Button variant="outline" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>التالي</Button>
              </nav>
            ) : null}
          </div>
        )}
      </Section>
    </>
  );
}
