"use client";

import { Fragment, useMemo, useState } from "react";
import type { PaymentRow, SubscriptionRow } from "../types";
import { formatNumber, statusClass } from "../utils";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

type PaymentsViewProps = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  initialStatus?: string;
};

const STATUS_FILTERS = ["الكل", "مكتمل", "قيد الانتظار", "منتهي الصلاحية"];
const SOURCE_FILTERS = ["الكل", "اشتراك", "شحن رسائل حملات"];
const PAYMENT_REFERENCE_TIME = Date.now();
type SortKey = "recent" | "oldest" | "amount_desc" | "amount_asc";
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "الأحدث" },
  { value: "oldest", label: "الأقدم" },
  { value: "amount_desc", label: "أعلى مبلغ" },
  { value: "amount_asc", label: "أقل مبلغ" }
];

function statusLabel(status: string, t: (ar: string, en: string) => string) {
  switch (status) {
    case "الكل":
      return t("الكل", "All");
    case "مكتمل":
      return t("مكتمل", "Completed");
    case "قيد الانتظار":
      return t("قيد الانتظار", "Pending");
    case "منتهي الصلاحية":
      return t("منتهي الصلاحية", "Expired");
    default:
      return status;
  }
}

function sourceLabel(source: string, t: (ar: string, en: string) => string) {
  switch (source) {
    case "الكل":
      return t("الكل", "All");
    case "اشتراك":
      return t("اشتراك", "Subscription");
    case "شحن رسائل حملات":
      return t("شحن رسائل حملات", "Campaign Message Top-up");
    default:
      return source;
  }
}

function sortLabel(option: SortKey, t: (ar: string, en: string) => string) {
  switch (option) {
    case "recent":
      return t("الأحدث", "Most Recent");
    case "oldest":
      return t("الأقدم", "Oldest");
    case "amount_desc":
      return t("أعلى مبلغ", "Highest Amount");
    case "amount_asc":
      return t("أقل مبلغ", "Lowest Amount");
    default:
      return option;
  }
}

function downloadPaymentFile(content: BlobPart, type: string, name: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }

export default function PaymentsView({ subscriptions, payments, initialStatus = "الكل" }: PaymentsViewProps) {
  const { t } = useLanguage();
  const [selectedPaymentClient, setSelectedPaymentClient] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus === "pending" ? "قيد الانتظار" : initialStatus === "completed" ? "مكتمل" : initialStatus);
  const [sourceFilter, setSourceFilter] = useState("الكل");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completedPayments = payments.filter((p) => p.status === "مكتمل");
  const pendingPayments = payments.filter((p) => p.status === "قيد الانتظار");
  const completedTotal = completedPayments.reduce((sum, p) => sum + p.amount, 0);
  const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const failedPayments = payments.filter((p) => /فشل|failed/i.test(p.status));
  const refundedPayments = payments.filter((p) => /مسترد|refund/i.test(p.status));

  const visiblePayments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = payments.filter((payment) => {
      if (selectedPaymentClient !== "all" && payment.tenantId !== selectedPaymentClient) return false;
      if (statusFilter !== "الكل" && payment.status !== statusFilter) return false;
      if (sourceFilter !== "الكل" && payment.source !== sourceFilter) return false;
      const createdAt = Date.parse(payment.createdAt || payment.completedAt || "");
      if (fromDate && (!createdAt || createdAt < new Date(`${fromDate}T00:00:00`).getTime())) return false;
      if (toDate && createdAt > new Date(`${toDate}T23:59:59`).getTime()) return false;
      if (minAmount && payment.amount < Number(minAmount)) return false;
      if (maxAmount && payment.amount > Number(maxAmount)) return false;
      if (!query) return true;
      return payment.companyName.toLowerCase().includes(query) || payment.moyasarId.toLowerCase().includes(query);
    });

    const sorted = [...filtered];
    if (sortBy === "oldest") {
      sorted.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    } else if (sortBy === "amount_desc") {
      sorted.sort((a, b) => b.amount - a.amount);
    } else if (sortBy === "amount_asc") {
      sorted.sort((a, b) => a.amount - b.amount);
    } else {
      sorted.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }
    return sorted;
  }, [payments, selectedPaymentClient, statusFilter, sourceFilter, searchQuery, sortBy, fromDate, toDate, minAmount, maxAmount]);

  function exportCsv() { const rows = [["التاريخ", "العميل", "النوع", "المبلغ", "الحالة", "مرجع Moyasar"], ...visiblePayments.map((p) => [p.completedAt || p.createdAt, p.companyName, p.source, p.amount, p.status, p.moyasarId])]; const content = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n")}`; downloadPaymentFile(content, "text/csv;charset=utf-8", `audiencew-payments-${new Date().toISOString().slice(0, 10)}.csv`); }
  async function exportExcel() { const ExcelJS = await import("exceljs"); const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("المدفوعات", { views: [{ rightToLeft: true }] }); sheet.columns = [{ header: "التاريخ", key: "date", width: 22 }, { header: "العميل", key: "client", width: 24 }, { header: "النوع", key: "source", width: 22 }, { header: "المبلغ", key: "amount", width: 14 }, { header: "الحالة", key: "status", width: 16 }, { header: "مرجع Moyasar", key: "reference", width: 28 }]; visiblePayments.forEach((p) => sheet.addRow({ date: p.completedAt || p.createdAt, client: p.companyName, source: p.source, amount: p.amount, status: p.status, reference: p.moyasarId })); sheet.getRow(1).font = { bold: true }; const buffer = await book.xlsx.writeBuffer(); downloadPaymentFile(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `audiencew-payments-${new Date().toISOString().slice(0, 10)}.xlsx`); }

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics admin-metrics-five">
          <article>
            <span>{t("إجمالي المحصل", "Total collected")}</span><strong>{formatNumber(completedTotal)}</strong><small>{t("ر.س مدفوعة ومؤكدة", "SAR paid and confirmed")}</small>
          </article>
          <article>
            <span>{t("المستحق", "Outstanding")}</span><strong>{formatNumber(pendingTotal)}</strong><small>{formatNumber(pendingPayments.length)} {t("طلبات بانتظار الدفع", "pending requests")}</small>
          </article>
          <article>
            <span>{t("المتأخر", "Overdue")}</span><strong>{formatNumber(pendingPayments.filter((p) => PAYMENT_REFERENCE_TIME - Date.parse(p.createdAt) > 7 * 86400000).length)}</strong><small>{t("معلّقة لأكثر من 7 أيام", "Pending over 7 days")}</small>
          </article>
          <article>
            <span>{t("فشل الدفع", "Failed")}</span><strong>{formatNumber(failedPayments.length)}</strong><small>{t("تحتاج إعادة محاولة", "Need retry")}</small>
          </article>
          <article><span>{t("المسترد", "Refunded")}</span><strong>{formatNumber(refundedPayments.reduce((sum,p) => sum + p.amount, 0))}</strong><small>{formatNumber(refundedPayments.length)} {t("عمليات استرداد", "refunds")}</small></article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("المدفوعات", "Payments")} ({formatNumber(visiblePayments.length)} {t("من", "of")} {formatNumber(payments.length)})</h2>
            <p>{t("سجل كل طلبات الدفع عبر Moyasar لكل عميل - اشتراكات وشحن رصيد رسائل الحملات معًا - بحالتها الفعلية.", "A log of every payment request via Moyasar for each client - subscriptions and campaign message top-ups together - with their actual status.")}</p>
          </div>
          <div className="admin-card-actions"><button type="button" onClick={exportCsv}>CSV</button><button type="button" onClick={exportExcel}>Excel</button></div>
        </div>
        <div className="admin-payment-filters"><label><span>{t("من تاريخ", "From")}</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label><label><span>{t("إلى تاريخ", "To")}</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label><label><span>{t("أقل مبلغ", "Min amount")}</span><input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} /></label><label><span>{t("أعلى مبلغ", "Max amount")}</span><input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} /></label><button type="button" onClick={() => { setFromDate(""); setToDate(""); setMinAmount(""); setMaxAmount(""); setSelectedPaymentClient("all"); setStatusFilter("الكل"); setSourceFilter("الكل"); setSearchQuery(""); }}>{t("إعادة تعيين", "Reset")}</button></div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder={t("ابحث بالعميل أو معرّف Moyasar...", "Search by client or Moyasar ID...")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div className="admin-filter-chips">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                className={`admin-filter-chip ${statusFilter === status ? "active" : ""}`}
                onClick={() => setStatusFilter(status)}
              >
                {statusLabel(status, t)}
              </button>
            ))}
          </div>
          <div className="admin-filter-chips">
            {SOURCE_FILTERS.map((source) => (
              <button
                key={source}
                type="button"
                className={`admin-filter-chip ${sourceFilter === source ? "active" : ""}`}
                onClick={() => setSourceFilter(source)}
              >
                {sourceLabel(source, t)}
              </button>
            ))}
          </div>
          <CustomSelect
            value={selectedPaymentClient}
            onChange={setSelectedPaymentClient}
            options={[{ value: "all", label: t("كل العملاء", "All Clients") }, ...subscriptions.map((client) => ({ value: client.tenantId, label: client.companyName }))]}
          />
          <CustomSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as SortKey)}
            options={SORT_OPTIONS.map((option) => ({ value: option.value, label: `${t("ترتيب", "Sort")}: ${sortLabel(option.value, t)}` }))}
          />
        </div>

        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("العميل", "Client")}</th>
                <th>{t("المبلغ", "Amount")}</th>
                <th>{t("الحالة", "Status")}</th>
                <th>{t("التاريخ", "Date")}</th>
                <th>{t("النوع", "Type")}</th>
                <th></th>
              </tr>
              <tr className="admin-table-summary-row">
                <th>{t("الإجمالي", "Total")}</th>
                <th>{formatNumber(visiblePayments.reduce((sum, p) => sum + p.amount, 0))} {t("ر.س", "SAR")}</th>
                <th colSpan={4}>{formatNumber(visiblePayments.length)} {t("عملية", "payments")}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map((payment) => {
                const expanded = expandedId === payment.id;
                return (
                <Fragment key={payment.id}>
                  <tr>
                    <td>{payment.companyName}</td>
                    <td>{formatNumber(payment.amount)} {t("ر.س", "SAR")}</td>
                    <td>
                      <span className={`admin-pill ${statusClass(payment.status)}`}>{statusLabel(payment.status, t)}</span>
                    </td>
                    <td>{payment.completedAt || payment.createdAt}</td>
                    <td>{sourceLabel(payment.source, t)}</td>
                    <td>
                      <button type="button" className="admin-table-expand" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : payment.id)}>
                        {t("التفاصيل", "Details")} {expanded ? "▴" : "▾"}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="admin-table-detail-row">
                      <td colSpan={6}>
                        <div className="admin-table-detail">
                          {payment.messages ? <span>{t("الرسائل", "Messages")}: <b>{formatNumber(payment.messages)}</b></span> : null}
                          <span>{t("معرّف Moyasar", "Moyasar ID")}: <b dir="ltr">{payment.moyasarId || "—"}</b></span>
                          {payment.status === "قيد الانتظار" && payment.paymentUrl ? (
                            <a className="admin-table-link" href={payment.paymentUrl} target="_blank" rel="noreferrer">
                              {t("فتح رابط الدفع", "Open Payment Link")}
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {payments.length === 0 ? (
          <p className="admin-empty-state">{t("لا توجد مدفوعات مسجّلة حتى الآن.", "No payments recorded yet.")}</p>
        ) : visiblePayments.length === 0 ? (
          <p className="admin-empty-state">{t("لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.", "No results match the current search or filter.")}</p>
        ) : null}
      </section>
    </>
  );
}
