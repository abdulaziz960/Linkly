"use client";

import { useMemo, useState } from "react";
import type { UsageRow } from "../types";
import { formatNumber } from "../utils";
import { EmptyState, Segmented, StatCard } from "../ds/primitives";
import Icon from "../ds/Icon";
import { SORT_OPTIONS, costShare, filterUsage, sortUsage, usageTotals, type UsageSort } from "./usage-data";

export default function UsageView({ rows }: { rows: UsageRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<UsageSort>("aiCost");

  const totals = useMemo(() => usageTotals(rows), [rows]);
  const visible = useMemo(() => sortUsage(filterUsage(rows, query), sort), [rows, query, sort]);
  const maxCost = useMemo(() => Math.max(0, ...rows.map((row) => row.aiCostLast30dSar)), [rows]);

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="رسائل آخر 30 يومًا" value={formatNumber(totals.messages)} hint={`عبر ${formatNumber(totals.clients)} عميل`} icon="message" />
        <StatCard label="طلبات AI آخر 30 يومًا" value={formatNumber(totals.aiEvents)} hint={`${formatNumber(totals.activeAiClients)} عميل استخدم المساعد`} icon="zap" tone="info" />
        <StatCard label="تكلفة AI التقديرية" value={`${formatNumber(totals.aiCost)} ر.س`} hint="لآخر 30 يومًا" icon="wallet" tone={totals.aiCost > 0 ? "warning" : "neutral"} />
        <StatCard label="متوسط تكلفة الطلب" value={`${formatNumber(totals.costPerRequest)} ر.س`} hint="تكلفة AI ÷ عدد الطلبات" icon="chart" />
      </div>

      <section className="ds-section" aria-labelledby="usage-heading">
        <header className="ds-section-head">
          <div>
            <h2 id="usage-heading">الاستخدام لكل عميل</h2>
            <p>{formatNumber(visible.length)} من {formatNumber(rows.length)} عميل</p>
          </div>
        </header>

        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث باسم الشركة أو البريد…" aria-label="بحث في الاستخدام" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Segmented label="الترتيب" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="chart" title="لا توجد بيانات استخدام" description="ستظهر هنا إحصاءات كل عميل عند بدء الاستخدام." />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="لا توجد نتائج مطابقة" description="جرّب تغيير كلمات البحث." />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">العميل</th>
                  <th scope="col">رسائل / 30 يومًا</th>
                  <th scope="col">طلبات AI / 30 يومًا</th>
                  <th scope="col">تكلفة AI (ر.س)</th>
                  <th scope="col">المحادثات</th>
                  <th scope="col">رصيد الحملات</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.tenantId}>
                    <td data-cell="main">
                      <div className="ds-cell-stack">
                        <strong>{row.companyName}</strong>
                        <small>{row.plan} · {formatNumber(row.employeeCount)} موظف</small>
                      </div>
                    </td>
                    <td data-label="رسائل / 30 يومًا"><strong>{formatNumber(row.messagesLast30d)}</strong></td>
                    <td data-label="طلبات AI / 30 يومًا"><strong>{formatNumber(row.aiEventsLast30d)}</strong></td>
                    <td data-label="تكلفة AI (ر.س)">
                      <div className="ds-cell-stack" style={{ minWidth: 110 }}>
                        <strong>{formatNumber(row.aiCostLast30dSar)}</strong>
                        {row.aiCostLast30dSar > 0 ? <span className="ds-meter" aria-hidden="true"><i style={{ width: `${costShare(row, maxCost)}%` }} /></span> : null}
                      </div>
                    </td>
                    <td data-label="المحادثات">{formatNumber(row.conversationCount)}</td>
                    <td data-label="رصيد الحملات">{formatNumber(row.campaignBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
