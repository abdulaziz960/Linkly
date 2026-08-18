"use client";

import { useState } from "react";
import type { PaymentRow, SubscriptionRow } from "../types";
import { formatNumber, statusClass } from "../utils";

type PaymentsViewProps = {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
};

export default function PaymentsView({ subscriptions, payments }: PaymentsViewProps) {
  const [selectedPaymentClient, setSelectedPaymentClient] = useState("all");
  const filteredPayments = selectedPaymentClient === "all" ? payments : payments.filter((payment) => payment.tenantId === selectedPaymentClient);

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h2>المدفوعات</h2>
          <p>سجل كل طلبات الدفع عبر Moyasar لكل عميل، بحالتها الفعلية.</p>
        </div>
        <label className="admin-log-filter">
          العميل
          <select value={selectedPaymentClient} onChange={(event) => setSelectedPaymentClient(event.target.value)}>
            <option value="all">كل العملاء</option>
            {subscriptions.map((client) => (
              <option key={client.tenantId} value={client.tenantId}>
                {client.companyName}
              </option>
            ))}
          </select>
        </label>
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
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.completedAt || payment.createdAt}</td>
                <td>{payment.companyName}</td>
                <td>{formatNumber(payment.amount)} ر.س</td>
                <td>
                  <span className={`admin-pill ${statusClass(payment.status)}`}>{payment.status}</span>
                </td>
                <td dir="ltr">{payment.moyasarId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredPayments.length === 0 ? <p className="admin-empty-state">لا توجد مدفوعات مسجّلة حتى الآن.</p> : null}
    </section>
  );
}
