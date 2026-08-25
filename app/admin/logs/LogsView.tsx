"use client";

import { useMemo, useState } from "react";
import type { AdminLog } from "../../../lib/database";
import type { SubscriptionRow } from "../types";
import { formatNumber, statusClass } from "../utils";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

type LogsViewProps = {
  subscriptions: SubscriptionRow[];
  logs: AdminLog[];
  initialClient: string;
};

const LEVEL_FILTERS: Array<AdminLog["level"] | "الكل"> = ["الكل", "معلومة", "تنبيه", "خطأ"];

function levelLabel(level: AdminLog["level"] | "الكل", t: (ar: string, en: string) => string) {
  switch (level) {
    case "الكل":
      return t("الكل", "All");
    case "معلومة":
      return t("معلومة", "Info");
    case "تنبيه":
      return t("تنبيه", "Warning");
    case "خطأ":
      return t("خطأ", "Error");
    default:
      return level;
  }
}

export default function LogsView({ subscriptions, logs, initialClient }: LogsViewProps) {
  const { t } = useLanguage();
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
            <span>{t("إجمالي السجلات", "Total Logs")}</span>
            <strong>{formatNumber(logs.length)}</strong>
            <small>{t("كل الأحداث المسجّلة", "All recorded events")}</small>
          </article>
          <article>
            <span>{t("معلومة", "Info")}</span>
            <strong>{formatNumber(infoCount)}</strong>
            <small>{t("أحداث عادية", "Routine events")}</small>
          </article>
          <article>
            <span>{t("تنبيه", "Warning")}</span>
            <strong>{formatNumber(warnCount)}</strong>
            <small>{t("يحتاج انتباه", "Needs attention")}</small>
          </article>
          <article>
            <span>{t("خطأ", "Error")}</span>
            <strong>{formatNumber(errorCount)}</strong>
            <small>{t("يحتاج متابعة عاجلة", "Needs urgent follow-up")}</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("السجلات", "Logs")} ({formatNumber(visibleLogs.length)} {t("من", "of")} {formatNumber(logs.length)})</h2>
            <p>{t("فلتر السجلات حسب العميل واعرض سجل الحركة كامل لكل حساب.", "Filter logs by client and view the full activity history for each account.")}</p>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder={t("ابحث بالتفاصيل أو العميل أو المصدر...", "Search by details, client, or source...")}
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
                {levelLabel(level, t)}
              </button>
            ))}
          </div>
          <CustomSelect
            value={selectedLogClient}
            onChange={setSelectedLogClient}
            options={[{ value: "all", label: t("كل العملاء", "All Clients") }, ...subscriptions.map((client) => ({ value: client.tenantId, label: client.companyName }))]}
          />
        </div>

        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("الوقت", "Time")}</th>
                <th>{t("العميل", "Client")}</th>
                <th>{t("المصدر", "Source")}</th>
                <th>{t("المستوى", "Level")}</th>
                <th>{t("التفاصيل", "Details")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.at}</td>
                  <td>{log.clientName}</td>
                  <td>{log.source}</td>
                  <td>
                    <span className={`admin-pill ${statusClass(log.level)}`}>{levelLabel(log.level, t)}</span>
                  </td>
                  <td>{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 ? (
          <p className="admin-empty-state">{t("لا توجد سجلات مسجّلة حتى الآن.", "No logs recorded yet.")}</p>
        ) : visibleLogs.length === 0 ? (
          <p className="admin-empty-state">{t("لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.", "No results match the current search or filter.")}</p>
        ) : null}
      </section>
    </>
  );
}
