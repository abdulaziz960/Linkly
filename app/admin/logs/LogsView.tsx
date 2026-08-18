"use client";

import { useMemo, useState } from "react";
import type { AdminLog } from "../../../lib/database";
import type { SubscriptionRow } from "../types";
import { formatNumber, statusClass } from "../utils";

type LogsViewProps = {
  subscriptions: SubscriptionRow[];
  logs: AdminLog[];
  initialClient: string;
};

const LEVEL_FILTERS: Array<AdminLog["level"] | "الكل"> = ["الكل", "معلومة", "تنبيه", "خطأ"];

export default function LogsView({ subscriptions, logs, initialClient }: LogsViewProps) {
  const [selectedLogClient, setSelectedLogClient] = useState(initialClient);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<AdminLog["level"] | "الكل">("الكل");

  const infoCount = logs.filter((l) => l.level === "معلومة").length;
  const warnCount = logs.filter((l) => l.level === "تنبيه").length;
  const errorCount = logs.filter((l) => l.level === "خطأ").length;

  const visibleLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = logs.filter((log) => {
      if (selectedLogClient !== "all" && log.clientId !== selectedLogClient) return false;
      if (levelFilter !== "الكل" && log.level !== levelFilter) return false;
      if (!query) return true;
      return (
        log.message.toLowerCase().includes(query) ||
        log.clientName.toLowerCase().includes(query) ||
        log.source.toLowerCase().includes(query)
      );
    });

    return filtered.slice().reverse();
  }, [logs, selectedLogClient, levelFilter, searchQuery]);

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>إجمالي السجلات</span>
            <strong>{formatNumber(logs.length)}</strong>
            <small>كل الأحداث المسجّلة</small>
          </article>
          <article>
            <span>معلومة</span>
            <strong>{formatNumber(infoCount)}</strong>
            <small>أحداث عادية</small>
          </article>
          <article>
            <span>تنبيه</span>
            <strong>{formatNumber(warnCount)}</strong>
            <small>يحتاج انتباه</small>
          </article>
          <article>
            <span>خطأ</span>
            <strong>{formatNumber(errorCount)}</strong>
            <small>يحتاج متابعة عاجلة</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>السجلات ({formatNumber(visibleLogs.length)} من {formatNumber(logs.length)})</h2>
            <p>فلتر السجلات حسب العميل واعرض سجل الحركة كامل لكل حساب.</p>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder="ابحث بالتفاصيل أو العميل أو المصدر..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div className="admin-filter-chips">
            {LEVEL_FILTERS.map((level) => (
              <button
                key={level}
                type="button"
                className={`admin-filter-chip ${levelFilter === level ? "active" : ""}`}
                onClick={() => setLevelFilter(level)}
              >
                {level}
              </button>
            ))}
          </div>
          <select value={selectedLogClient} onChange={(event) => setSelectedLogClient(event.target.value)}>
            <option value="all">كل العملاء</option>
            {subscriptions.map((client) => (
              <option key={client.tenantId} value={client.tenantId}>
                {client.companyName}
              </option>
            ))}
          </select>
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
              {visibleLogs.map((log) => (
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
        {logs.length === 0 ? (
          <p className="admin-empty-state">لا توجد سجلات مسجّلة حتى الآن.</p>
        ) : visibleLogs.length === 0 ? (
          <p className="admin-empty-state">لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.</p>
        ) : null}
      </section>
    </>
  );
}
