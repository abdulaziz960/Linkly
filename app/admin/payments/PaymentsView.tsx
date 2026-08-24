"use client";

import { useMemo, useState } from "react";
import type { PaymentRow, SubscriptionRow } from "../types";
import { formatNumber, statusClass } from "../utils";
import CustomSelect from "../../components/CustomSelect";

type PaymentsViewProps = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
};

const STATUS_FILTERS = ["الكل", "مكتمل", "قيد الانتظار"];
type SortKey = "recent" | "oldest" | "amount_desc" | "amount_asc";
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "الأحدث" },
  { value: "oldest", label: "الأقدم" },
  { value: "amount_desc", label: "أعلى مبلغ" },
  { value: "amount_asc", label: "أقل مبلغ" }
];

export default function PaymentsView({ subscriptions, payments }: PaymentsViewProps) {
  const [selectedPaymentClient, setSelectedPaymentClient] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const completedPayments = payments.filter((p) => p.status === "مكتمل");
  const pendingPayments = payments.filter((p) => p.status === "قيد الانتظار");
  const completedTotal = completedPayments.reduce((sum, p) => sum + p.amount, 0);

  const visiblePayments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = payments.filter((payment) => {
      if (selectedPaymentClient !== "all" && payment.tenantId !== selectedPaymentClient) return false;
      if (statusFilter !== "الكل" && payment.status !== statusFilter) return false;
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
  }, [payments, selectedPaymentClient, statusFilter, searchQuery, sortBy]);

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>إجمالي المدفوعات</span>
            <strong>{formatNumber(payments.length)}</strong>
            <small>كل طلبات الدفع المسجّلة</small>
          </article>
          <article>
            <span>مكتملة</span>
            <strong>{formatNumber(completedPayments.length)}</strong>
            <small>دُفعت وتأكدت عبر Moyasar</small>
          </article>
          <article>
            <span>قيد الانتظار</span>
            <strong>{formatNumber(pendingPayments.length)}</strong>
            <small>بانتظار إتمام العميل للدفع</small>
          </article>
          <article>
            <span>إجمالي المحصّل</span>
            <strong>{formatNumber(completedTotal)}</strong>
            <small>ريال من المدفوعات المكتملة</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>المدفوعات ({formatNumber(visiblePayments.length)} من {formatNumber(payments.length)})</h2>
            <p>سجل كل طلبات الدفع عبر Moyasar لكل عميل، بحالتها الفعلية.</p>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder="ابحث بالعميل أو معرّف Moyasar..."
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
                {status}
              </button>
            ))}
          </div>
          <CustomSelect
            value={selectedPaymentClient}
            onChange={setSelectedPaymentClient}
            options={[{ value: "all", label: "كل العملاء" }, ...subscriptions.map((client) => ({ value: client.tenantId, label: client.companyName }))]}
          />
          <CustomSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as SortKey)}
            options={SORT_OPTIONS.map((option) => ({ value: option.value, label: `ترتيب: ${option.label}` }))}
          />
        </div>

        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>العميل</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>معرّف Moyasar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.completedAt || payment.createdAt}</td>
                  <td>{payment.companyName}</td>
                  <td>{formatNumber(payment.amount)} ر.س</td>
                  <td>
                    <span className={`admin-pill ${statusClass(payment.status)}`}>{payment.status}</span>
                  </td>
                  <td dir="ltr">{payment.moyasarId || "—"}</td>
                  <td>
                    {payment.status === "قيد الانتظار" && payment.paymentUrl ? (
                      <a className="admin-table-link" href={payment.paymentUrl} target="_blank" rel="noreferrer">
                        فتح رابط الدفع
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payments.length === 0 ? (
          <p className="admin-empty-state">لا توجد مدفوعات مسجّلة حتى الآن.</p>
        ) : visiblePayments.length === 0 ? (
          <p className="admin-empty-state">لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.</p>
        ) : null}
      </section>
    </>
  );
}
