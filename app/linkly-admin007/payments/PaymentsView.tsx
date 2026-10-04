"use client";

import { useMemo, useState } from "react";
import type { PaymentRow, SubscriptionRow } from "../types";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section, Segmented, StatCard } from "../ds/primitives";
import { Drawer } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import { sanitizeCsvCell } from "../../../lib/csv-export";
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  SOURCE_FILTERS,
  STATUS_FILTERS,
  STATUS_TONE,
  filterPayments,
  formatPaymentDate,
  gatewayLabel,
  initiatedByLabel,
  normalizeStatusParam,
  paymentStats,
  sortPayments,
  statusCounts,
  visibleTotals,
  type PaymentFilters,
  type PaymentSort
} from "./payments-data";

type Props = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  initialStatus?: string;
  initialClient?: string;
};

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

const EXPORT_HEADERS = ["التاريخ", "العميل", "النوع", "المبلغ", "الحالة", "مرجع Moyasar"];
const exportRow = (payment: PaymentRow) => [payment.completedAt || payment.createdAt, payment.companyName, payment.source, payment.amount, payment.status, payment.moyasarId];

export default function PaymentsView({ subscriptions, payments, initialStatus, initialClient }: Props) {
  const toast = useToast();
  const [filters, setFilters] = useState<PaymentFilters>(() => ({
    ...EMPTY_FILTERS,
    status: normalizeStatusParam(initialStatus),
    client: initialClient && subscriptions.some((client) => client.tenantId === initialClient) ? initialClient : "all"
  }));
  const [sort, setSort] = useState<PaymentSort>("recent");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [now] = useState(() => Date.now());

  function patch(next: Partial<PaymentFilters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  const stats = useMemo(() => paymentStats(payments, now), [payments, now]);
  const counts = useMemo(() => statusCounts(payments), [payments]);
  const visible = useMemo(() => sortPayments(filterPayments(payments, filters), sort), [payments, filters, sort]);
  const totals = useMemo(() => visibleTotals(visible), [visible]);
  const activeFilterCount = [filters.client !== "all", filters.status !== "الكل", filters.source !== "الكل", Boolean(filters.query.trim()), Boolean(filters.from), Boolean(filters.to), Boolean(filters.min), Boolean(filters.max)].filter(Boolean).length;
  const dateStamp = new Date().toISOString().slice(0, 10);

  function exportCsv() {
    const rows = [EXPORT_HEADERS, ...visible.map(exportRow)];
    download(`﻿${rows.map((row) => row.map(sanitizeCsvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8", `audiencew-payments-${dateStamp}.csv`);
    toast("success", "تم تصدير ملف CSV", `${formatNumber(visible.length)} دفعة.`);
  }

  async function exportExcel() {
    try {
      const ExcelJS = await import("exceljs");
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("المدفوعات", { views: [{ rightToLeft: true }] });
      sheet.columns = [
        { header: EXPORT_HEADERS[0], key: "date", width: 22 },
        { header: EXPORT_HEADERS[1], key: "client", width: 24 },
        { header: EXPORT_HEADERS[2], key: "source", width: 22 },
        { header: EXPORT_HEADERS[3], key: "amount", width: 14 },
        { header: EXPORT_HEADERS[4], key: "status", width: 16 },
        { header: EXPORT_HEADERS[5], key: "reference", width: 28 }
      ];
      visible.forEach((payment) => {
        const [date, client, source, amount, status, reference] = exportRow(payment);
        sheet.addRow({ date, client, source, amount, status, reference });
      });
      sheet.getRow(1).font = { bold: true };
      const buffer = await book.xlsx.writeBuffer();
      download(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `audiencew-payments-${dateStamp}.xlsx`);
      toast("success", "تم تصدير ملف Excel", `${formatNumber(visible.length)} دفعة.`);
    } catch {
      toast("error", "تعذر تصدير ملف Excel", "حاول مرة أخرى أو استخدم CSV.");
    }
  }

  const detailRows = selected
    ? ([
        ["العميل", selected.companyName],
        ["المبلغ", `${formatNumber(selected.amount)} ر.س`],
        ["النوع", selected.source],
        selected.planName ? ["الباقة", selected.planName] : null,
        selected.messages ? ["الرسائل", formatNumber(selected.messages)] : null,
        ["أُنشئت", formatPaymentDate(selected.createdAt)],
        selected.completedAt ? ["اكتملت", formatPaymentDate(selected.completedAt)] : null,
        selected.periodStart && selected.periodEnd ? ["الفترة", `${selected.periodStart} → ${selected.periodEnd}`] : null,
        ["البوابة", gatewayLabel(selected.gateway)],
        selected.paymentMethod ? ["طريقة الدفع", selected.paymentMethod] : null,
        selected.initiatedBy ? ["أُنشئت بواسطة", initiatedByLabel(selected.initiatedBy)] : null,
        ["معرّف الفاتورة", selected.moyasarId || "—", true],
        selected.gatewayPaymentId ? ["معرّف عملية الدفع", selected.gatewayPaymentId, true] : null,
        selected.failureReason ? ["سبب الفشل", selected.failureReason, true] : null
      ].filter(Boolean) as Array<[string, string, boolean?]>)
    : [];

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي المحصَّل" value={`${formatNumber(stats.collected)} ر.س`} hint={`${formatNumber(stats.completedCount)} دفعة مكتملة ومؤكدة`} icon="wallet" tone="success" />
        <StatCard label="المستحق" value={`${formatNumber(stats.outstanding)} ر.س`} hint={`${formatNumber(stats.pendingCount)} طلب بانتظار الدفع`} icon="clock" tone={stats.pendingCount ? "warning" : "neutral"} />
        <StatCard label="المتأخر" value={formatNumber(stats.overdueCount)} hint="معلّقة لأكثر من 7 أيام" icon="alert" tone={stats.overdueCount ? "danger" : "neutral"} />
        <StatCard label="فشل الدفع" value={formatNumber(stats.failedCount)} hint="تحتاج إعادة محاولة" icon="alert" tone={stats.failedCount ? "warning" : "neutral"} />
        <StatCard label="المسترد" value={`${formatNumber(stats.refundedTotal)} ر.س`} hint={`${formatNumber(stats.refundedCount)} عملية استرداد`} icon="refresh" tone="info" />
      </div>

      <Section
        title={`المدفوعات (${formatNumber(visible.length)} من ${formatNumber(payments.length)})`}
        description="كل طلبات الدفع عبر Moyasar، اشتراكات وشحن رصيد رسائل الحملات معًا، بحالتها الفعلية."
        actions={
          <>
            <Button variant="outline" icon="download" onClick={exportCsv} disabled={visible.length === 0}>CSV</Button>
            <Button variant="outline" icon="download" onClick={() => void exportExcel()} disabled={visible.length === 0}>Excel</Button>
          </>
        }
      >
        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث بالعميل أو معرّف Moyasar…" aria-label="بحث في المدفوعات" value={filters.query} onChange={(event) => patch({ query: event.target.value })} />
          </div>
          <select className="ds-select" aria-label="العميل" value={filters.client} onChange={(event) => patch({ client: event.target.value })}>
            <option value="all">كل العملاء</option>
            {subscriptions.map((client) => <option key={client.tenantId} value={client.tenantId}>{client.companyName}</option>)}
          </select>
          <select className="ds-select" aria-label="ترتيب المدفوعات" value={sort} onChange={(event) => setSort(event.target.value as PaymentSort)}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>ترتيب: {option.label}</option>)}
          </select>
          <div className="ds-toolbar-end">
            <Button variant={showAdvanced ? "secondary" : "outline"} icon="filter" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
              تصفية متقدمة
            </Button>
            {activeFilterCount ? <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>مسح التصفية ({formatNumber(activeFilterCount)})</Button> : null}
          </div>
        </div>

        <div className="ds-toolbar">
          <Segmented
            label="تصفية حسب الحالة"
            value={filters.status}
            onChange={(status) => patch({ status })}
            options={STATUS_FILTERS.map((status) => ({ value: status, label: `${status} (${formatNumber(counts[status] ?? 0)})` }))}
          />
          <Segmented label="تصفية حسب النوع" value={filters.source} onChange={(source) => patch({ source })} options={SOURCE_FILTERS.map((source) => ({ value: source, label: source }))} />
        </div>

        {showAdvanced ? (
          <div className="ds-toolbar ds-toolbar-advanced">
            <label className="ds-field">من تاريخ<input className="ds-input" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => patch({ from: event.target.value })} /></label>
            <label className="ds-field">إلى تاريخ<input className="ds-input" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => patch({ to: event.target.value })} /></label>
            <label className="ds-field">أقل مبلغ (ر.س)<input className="ds-input" type="number" min="0" inputMode="decimal" value={filters.min} onChange={(event) => patch({ min: event.target.value })} /></label>
            <label className="ds-field">أعلى مبلغ (ر.س)<input className="ds-input" type="number" min="0" inputMode="decimal" value={filters.max} onChange={(event) => patch({ max: event.target.value })} /></label>
          </div>
        ) : null}

        {payments.length === 0 ? (
          <EmptyState icon="card" title="لا توجد مدفوعات مسجّلة حتى الآن" description="ستظهر هنا كل عمليات الدفع عند تنفيذها." />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="لا توجد نتائج مطابقة" description="جرّب تغيير البحث أو مسح التصفية." action={<Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>مسح التصفية</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">العميل</th>
                  <th scope="col">المبلغ</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">التاريخ</th>
                  <th scope="col">النوع</th>
                  <th scope="col"><span className="ds-sr-only">التفاصيل</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((payment) => (
                  <tr key={payment.id}>
                    <td data-cell="main">
                      <div className="ds-cell-stack">
                        <strong>{payment.companyName}</strong>
                        {payment.planName ? <small>{payment.planName}</small> : null}
                      </div>
                    </td>
                    <td data-label="المبلغ"><strong>{formatNumber(payment.amount)} ر.س</strong></td>
                    <td data-label="الحالة"><Badge tone={STATUS_TONE[payment.status] ?? "neutral"}>{payment.status}</Badge></td>
                    <td data-label="التاريخ">{formatPaymentDate(payment.completedAt || payment.createdAt)}</td>
                    <td data-label="النوع">{payment.source}</td>
                    <td>
                      <div className="ds-cell-actions">
                        <Button variant="ghost" icon="info" onClick={() => setSelected(payment)} aria-label={`تفاصيل دفعة ${payment.companyName}`}>التفاصيل</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ds-table-foot ds-table-foot-split">
              <span>إجمالي المدفوع: <strong>{formatNumber(totals.collected)} ر.س</strong></span>
              <span>{formatNumber(totals.completedCount)} ناجحة من {formatNumber(totals.count)} عملية</span>
            </div>
          </div>
        )}
      </Section>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${formatNumber(selected.amount)} ر.س · ${selected.companyName}` : ""}
        description={selected ? selected.source : undefined}
        footer={
          selected?.status === "قيد الانتظار" && selected.paymentUrl ? (
            <Button variant="primary" icon="external" onClick={() => window.open(selected.paymentUrl, "_blank", "noreferrer")}>فتح رابط الدفع</Button>
          ) : (
            <Button variant="outline" onClick={() => setSelected(null)}>إغلاق</Button>
          )
        }
      >
        {selected ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div><Badge tone={STATUS_TONE[selected.status] ?? "neutral"}>{selected.status}</Badge></div>
            <dl className="ds-detail-list">
              {detailRows.map(([label, value, ltr]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd dir={ltr ? "ltr" : undefined}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
