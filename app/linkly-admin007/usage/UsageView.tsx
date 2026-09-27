"use client";

import { useMemo, useState } from "react";
import type { UsageRow } from "../types";
import { formatNumber } from "../utils";
import { useLanguage } from "../i18n";

type SortKey = "messages" | "aiCost" | "aiEvents" | "conversations";

export default function UsageView({ rows }: { rows: UsageRow[] }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("aiCost");

  const totals = useMemo(() => ({
    messages: rows.reduce((sum, row) => sum + row.messagesLast30d, 0),
    aiEvents: rows.reduce((sum, row) => sum + row.aiEventsLast30d, 0),
    aiCost: Math.round(rows.reduce((sum, row) => sum + row.aiCostLast30dSar, 0) * 100) / 100
  }), [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? rows.filter((row) => row.companyName.toLowerCase().includes(needle) || row.ownerEmail.toLowerCase().includes(needle)) : rows;
    const sorted = [...filtered];
    if (sortKey === "messages") sorted.sort((a, b) => b.messagesLast30d - a.messagesLast30d);
    else if (sortKey === "aiEvents") sorted.sort((a, b) => b.aiEventsLast30d - a.aiEventsLast30d);
    else if (sortKey === "conversations") sorted.sort((a, b) => b.conversationCount - a.conversationCount);
    else sorted.sort((a, b) => b.aiCostLast30dSar - a.aiCostLast30dSar);
    return sorted;
  }, [rows, query, sortKey]);

  return (
    <>
      <section className="admin-section" aria-label={t("ملخص الاستخدام", "Usage summary")}>
        <div className="admin-metrics">
          <div className="log-metric log-level-all"><span>{t("رسائل آخر 30 يوم", "Messages, last 30 days")}</span><strong>{formatNumber(totals.messages)}</strong></div>
          <div className="log-metric log-level-info"><span>{t("طلبات AI آخر 30 يوم", "AI requests, last 30 days")}</span><strong>{formatNumber(totals.aiEvents)}</strong></div>
          <div className="log-metric log-level-warning"><span>{t("تكلفة AI التقديرية (ر.س)", "Estimated AI cost (SAR)")}</span><strong>{formatNumber(totals.aiCost)}</strong></div>
        </div>
      </section>
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("الاستخدام لكل عميل", "Usage per client")}</h2>
            <p>{t(`${formatNumber(visible.length)} من ${formatNumber(rows.length)} عميل`, `${visible.length} of ${rows.length} clients`)}</p>
          </div>
        </div>
        <div className="logs-filters">
          <label className="logs-search">
            <span className="sr-only">{t("بحث", "Search")}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ابحث باسم الشركة أو البريد…", "Search by company or email…")} />
          </label>
          <div className="admin-alert-buckets">
            {([["aiCost", t("الأعلى تكلفة", "Highest cost")], ["messages", t("الأكثر رسائل", "Most messages")], ["aiEvents", t("الأكثر استخدام AI", "Most AI usage")], ["conversations", t("الأكثر محادثات", "Most conversations")]] as [SortKey, string][]).map(([value, label]) => (
              <button key={value} type="button" className={sortKey === value ? "active" : ""} onClick={() => setSortKey(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="admin-list">
          {visible.map((row) => (
            <div className="admin-list-row" key={row.tenantId}>
              <div>
                <strong>{row.companyName}</strong>
                <span>{row.plan} · {row.employeeCount} {t("موظف", "employees")} · {formatNumber(row.conversationCount)} {t("محادثة", "conversations")}</span>
                <small>{t("رصيد رسائل الحملات:", "Campaign message balance:")} {formatNumber(row.campaignBalance)}</small>
              </div>
              <div className="admin-usage-stats">
                <span><b>{formatNumber(row.messagesLast30d)}</b><small>{t("رسالة/30 يوم", "msgs/30d")}</small></span>
                <span><b>{formatNumber(row.aiEventsLast30d)}</b><small>{t("طلب AI/30 يوم", "AI reqs/30d")}</small></span>
                <span><b>{formatNumber(row.aiCostLast30dSar)}</b><small>{t("ر.س تكلفة AI", "SAR AI cost")}</small></span>
              </div>
            </div>
          ))}
          {!visible.length ? <p className="admin-empty-state">{t("لا توجد نتائج مطابقة.", "No matching results.")}</p> : null}
        </div>
      </section>
    </>
  );
}
