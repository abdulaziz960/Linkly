"use client";

import { useState } from "react";
import type { AdminLog } from "../../../lib/database";
import type { SubscriptionRow } from "../types";
import { statusClass } from "../utils";

type LogsViewProps = {
  subscriptions: SubscriptionRow[];
  logs: AdminLog[];
  initialClient: string;
};

export default function LogsView({ subscriptions, logs, initialClient }: LogsViewProps) {
  const [selectedLogClient, setSelectedLogClient] = useState(initialClient);
  const filteredLogs = selectedLogClient === "all" ? logs : logs.filter((log) => log.clientId === selectedLogClient);

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h2>السجلات</h2>
          <p>فلتر السجلات حسب العميل واعرض سجل الحركة كامل لكل حساب.</p>
        </div>
        <label className="admin-log-filter">
          العميل
          <select value={selectedLogClient} onChange={(event) => setSelectedLogClient(event.target.value)}>
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
              <th>الوقت</th>
              <th>العميل</th>
              <th>المصدر</th>
              <th>المستوى</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.at}</td>
                <td>{log.clientName}</td>
                <td>{log.source}</td>
                <td>
                  <span className={`admin-pill ${statusClass(log.level)}`}>{log.level}</span>
                </td>
                <td>{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredLogs.length === 0 ? <p className="admin-empty-state">لا توجد سجلات لهذا العميل حتى الآن.</p> : null}
    </section>
  );
}
