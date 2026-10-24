"use client";

import { useCallback, useEffect, useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { shortOrderNumber } from "../../../lib/order-number";
import { useLanguage } from "../i18n";

type Report = {
  day: string;
  currency: string;
  orderCount: number;
  sales: number;
  paid: number;
  followUp: { count: number; total: number };
  awaiting: { count: number; total: number };
  cancelled: { count: number; total: number };
  discounts: number;
  deliveryFees: number;
  average: number;
  byFulfillment: Array<{ key: "delivery" | "store" | "car" | "other"; count: number; total: number }>;
  byBranch: Array<{ name: string; count: number; total: number }>;
  products: Array<{ name: string; quantity: number; total: number }>;
  orders: Array<{ id: string; time: string; customerName: string; customerPhone: string; total: number; status: string; fulfillment: string; branch: string }>;
};

const todayLocal = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

/** The end-of-day summary of the chat orders: totals, what was sold, by branch and by delivery / pickup, and the list. */
export default function DailyReportPanel() {
  const { t } = useLanguage();
  const [day, setDay] = useState(todayLocal());
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const money = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${t("ر.س", "SAR")}`;
  const statusText = (status: string) => ({ paid: t("مدفوع", "Paid"), fulfilled: t("تم التسليم", "Fulfilled"), new: t("جديد - متابعة", "New - follow-up"), awaiting_payment: t("بانتظار الدفع", "Awaiting payment"), cancelled: t("ملغي", "Cancelled") } as Record<string, string>)[status] ?? status;
  const fulfillmentText = (key: string) => ({ delivery: t("توصيل", "Delivery"), store: t("استلام من المحل", "Store pickup"), car: t("استلام من السيارة", "Car pickup"), other: t("غير محدد", "Not set") } as Record<string, string>)[key] ?? key;
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/catalog/daily-report?day=${encodeURIComponent(day)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "");
      setReport(payload.data as Report);
    } catch (reason) {
      setError((reason as Error).message || t("تعذر تحميل التقرير", "Could not load the report"));
    }
  }, [day, branch, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/catalog/branches").then((response) => response.json()).then((payload: { ok?: boolean; data?: Array<{ name: string }> }) => {
      if (payload?.ok) setBranches((payload.data ?? []).map((item) => item.name));
    }).catch(() => null);
  }, []);

  function downloadCsv() {
    if (!report) return;
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["رقم الطلب", "الوقت", "العميل", "الجوال", "الفرع", "الطريقة", "الحالة", "المبلغ"],
      ...report.orders.map((order) => [shortOrderNumber(order.id), timeOf(order.time), order.customerName, order.customerPhone, order.branch, fulfillmentText(order.fulfillment), statusText(order.status), order.total])
    ];
    const csv = `﻿${rows.map((row) => row.map(cell).join(",")).join("\n")}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `orders-${report.day}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="panel daily-report">
      <div className="panel-head">
        <h2>{t("إقفال اليوم", "Daily closing")}</h2>
        <span />
        <button className="btn soft" type="button" onClick={downloadCsv} disabled={!report?.orders.length}>{t("تنزيل Excel", "Download CSV")}</button>
        <button className="btn soft" type="button" onClick={() => window.print()}>{t("طباعة", "Print")}</button>
      </div>
      <div className="panel-body">
        <div className="daily-filters">
          <label><span>{t("اليوم", "Day")}</span><input type="date" dir="ltr" value={day} max={todayLocal()} onChange={(event) => event.target.value && setDay(event.target.value)} /></label>
          {branches.length ? (
            <label><span>{t("الفرع", "Branch")}</span>
              <CustomSelect value={branch} onChange={setBranch} ariaLabel={t("الفرع", "Branch")} options={[{ value: "", label: t("كل الفروع", "All branches") }, ...branches.map((name) => ({ value: name, label: name }))]} />
            </label>
          ) : null}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {report ? (
          <>
            <div className="daily-kpis">
              <article><span>{t("إجمالي المبيعات", "Total sales")}</span><strong>{money(report.sales)}</strong><small>{report.orderCount} {t("طلب", "orders")}</small></article>
              <article><span>{t("مدفوع إلكترونيًا", "Paid online")}</span><strong>{money(report.paid)}</strong></article>
              <article><span>{t("يُحصَّل عند الاستلام / متابعة", "To collect / follow-up")}</span><strong>{money(report.followUp.total)}</strong><small>{report.followUp.count} {t("طلب", "orders")}</small></article>
              <article><span>{t("متوسط الطلب", "Average order")}</span><strong>{money(report.average)}</strong></article>
              <article><span>{t("بانتظار الدفع", "Awaiting payment")}</span><strong>{money(report.awaiting.total)}</strong><small>{report.awaiting.count} {t("طلب", "orders")}</small></article>
              <article><span>{t("ملغي", "Cancelled")}</span><strong>{money(report.cancelled.total)}</strong><small>{report.cancelled.count} {t("طلب", "orders")}</small></article>
              <article><span>{t("الخصومات", "Discounts")}</span><strong>{money(report.discounts)}</strong></article>
              <article><span>{t("رسوم التوصيل", "Delivery fees")}</span><strong>{money(report.deliveryFees)}</strong></article>
            </div>

            <div className="daily-grid">
              <section>
                <h3>{t("حسب الطريقة", "By method")}</h3>
                <table className="daily-table"><tbody>
                  {report.byFulfillment.map((row) => <tr key={row.key}><td>{fulfillmentText(row.key)}</td><td>{row.count}</td><td>{money(row.total)}</td></tr>)}
                  {!report.byFulfillment.length ? <tr><td colSpan={3}>-</td></tr> : null}
                </tbody></table>
              </section>
              {report.byBranch.some((row) => row.name) ? (
                <section>
                  <h3>{t("حسب الفرع", "By branch")}</h3>
                  <table className="daily-table"><tbody>
                    {report.byBranch.map((row) => <tr key={row.name || "none"}><td>{row.name || t("بدون فرع", "No branch")}</td><td>{row.count}</td><td>{money(row.total)}</td></tr>)}
                  </tbody></table>
                </section>
              ) : null}
              <section>
                <h3>{t("الأصناف المباعة", "Items sold")}</h3>
                <table className="daily-table"><tbody>
                  {report.products.map((row) => <tr key={row.name}><td>{row.name}</td><td>× {row.quantity}</td><td>{money(row.total)}</td></tr>)}
                  {!report.products.length ? <tr><td colSpan={3}>-</td></tr> : null}
                </tbody></table>
              </section>
            </div>

            <h3>{t("طلبات اليوم", "Today's orders")} ({report.orders.length})</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("رقم الطلب", "Order no.")}</th><th>{t("الوقت", "Time")}</th><th>{t("العميل", "Customer")}</th><th>{t("الفرع", "Branch")}</th><th>{t("الطريقة", "Method")}</th><th>{t("الحالة", "Status")}</th><th>{t("المبلغ", "Amount")}</th></tr></thead>
                <tbody>
                  {report.orders.map((order) => (
                    <tr key={order.id}>
                      <td dir="ltr">{shortOrderNumber(order.id)}</td>
                      <td>{timeOf(order.time)}</td>
                      <td>{order.customerName || "-"}<br /><small dir="ltr">{order.customerPhone}</small></td>
                      <td>{order.branch || "-"}</td>
                      <td>{fulfillmentText(order.fulfillment)}</td>
                      <td>{statusText(order.status)}</td>
                      <td>{money(order.total)}</td>
                    </tr>
                  ))}
                  {!report.orders.length ? <tr><td colSpan={7}>{t("لا توجد طلبات في هذا اليوم.", "No orders on this day.")}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : !error ? <p className="muted-copy">{t("جاري التحميل...", "Loading...")}</p> : null}
      </div>
    </div>
  );
}
