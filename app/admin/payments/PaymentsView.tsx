"use client";

import { useMemo, useState } from "react";
import type { PaymentRow, SubscriptionRow } from "../types";
import { formatNumber, statusClass } from "../utils";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

type PaymentsViewProps = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
};

const STATUS_FILTERS = ["الكل", "مكتمل", "قيد الانتظار"];
const SOURCE_FILTERS = ["الكل", "اشتراك", "شحن رسائل حملات"];
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

export default function PaymentsView({ subscriptions, payments }: PaymentsViewProps) {
  const { t } = useLanguage();
  const [selectedPaymentClient, setSelectedPaymentClient] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [sourceFilter, setSourceFilter] = useState("الكل");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const completedPayments = payments.filter((p) => p.status === "مكتمل");
  const pendingPayments = payments.filter((p) => p.status === "قيد الانتظار");
  const completedTotal = completedPayments.reduce((sum, p) => sum + p.amount, 0);

  const visiblePayments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = payments.filter((payment) => {
      if (selectedPaymentClient !== "all" && payment.tenantId !== selectedPaymentClient) return false;
      if (statusFilter !== "الكل" && payment.status !== statusFilter) return false;
      if (sourceFilter !== "الكل" && payment.source !== sourceFilter) return false;
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
  }, [payments, selectedPaymentClient, statusFilter, sourceFilter, searchQuery, sortBy]);

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي المدفوعات", "Total Payments")}</span>
            <strong>{formatNumber(payments.length)}</strong>
            <small>{t("كل طلبات الدفع المسجّلة", "All recorded payment requests")}</small>
          </article>
          <article>
            <span>{t("مكتملة", "Completed")}</span>
            <strong>{formatNumber(completedPayments.length)}</strong>
            <small>{t("دُفعت وتأكدت عبر Moyasar", "Paid and confirmed via Moyasar")}</small>
          </article>
          <article>
            <span>{t("قيد الانتظار", "Pending")}</span>
            <strong>{formatNumber(pendingPayments.length)}</strong>
            <small>{t("بانتظار إتمام العميل للدفع", "Awaiting the client to complete payment")}</small>
          </article>
          <article>
            <span>{t("إجمالي المحصّل", "Total Collected")}</span>
            <strong>{formatNumber(completedTotal)}</strong>
            <small>{t("ريال من المدفوعات المكتملة", "SAR from completed payments")}</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("المدفوعات", "Payments")} ({formatNumber(visiblePayments.length)} {t("من", "of")} {formatNumber(payments.length)})</h2>
            <p>{t("سجل كل طلبات الدفع عبر Moyasar لكل عميل - اشتراكات وشحن رصيد رسائل الحملات معًا - بحالتها الفعلية.", "A log of every payment request via Moyasar for each client - subscriptions and campaign message top-ups together - with their actual status.")}</p>
          </div>
        </div>

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
                <th>{t("التاريخ", "Date")}</th>
                <th>{t("العميل", "Client")}</th>
                <th>{t("النوع", "Type")}</th>
                <th>{t("الرسائل", "Messages")}</th>
                <th>{t("المبلغ", "Amount")}</th>
                <th>{t("الحالة", "Status")}</th>
                <th>{t("معرّف Moyasar", "Moyasar ID")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.completedAt || payment.createdAt}</td>
                  <td>{payment.companyName}</td>
                  <td>{sourceLabel(payment.source, t)}</td>
                  <td>{payment.messages ? formatNumber(payment.messages) : "—"}</td>
                  <td>{formatNumber(payment.amount)} {t("ر.س", "SAR")}</td>
                  <td>
                    <span className={`admin-pill ${statusClass(payment.status)}`}>{statusLabel(payment.status, t)}</span>
                  </td>
                  <td dir="ltr">{payment.moyasarId || "—"}</td>
                  <td>
                    {payment.status === "قيد الانتظار" && payment.paymentUrl ? (
                      <a className="admin-table-link" href={payment.paymentUrl} target="_blank" rel="noreferrer">
                        {t("فتح رابط الدفع", "Open Payment Link")}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
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
