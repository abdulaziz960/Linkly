"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import SallaShipmentForm from "./SallaShipmentForm";

type Order = { id: string; reference: string; statusSlug: string; statusLabel: string; customerName: string; customerPhone: string; total: number; currency: string; trackingNumber?: string; shippingCompany?: string };
type Status = { slug: string; label: string };

/** Recent Salla orders with a status switcher; Salla then notifies the customer on WhatsApp through the order notifications. */
export default function SallaOrdersPanel() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [shippingId, setShippingId] = useState("");
  const [note, setNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/store-integrations/salla/orders", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { orders: Order[]; statuses: Status[] } } | null;
      if (!response.ok || !result?.ok || !result.data) {
        setError(result?.error || t("تعذر جلب الطلبات", "Could not load the orders"));
        return;
      }
      setOrders(result.data.orders);
      setStatuses(result.data.statuses);
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function apply(order: Order) {
    const status = choice[order.id];
    if (!status || status === order.statusSlug) return;
    setBusyId(order.id);
    setNote(null);
    try {
      const response = await fetch(`/api/store-integrations/salla/orders/${encodeURIComponent(order.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reference: order.reference })
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setNote({ id: order.id, ok: false, text: result?.error || t("تعذر تغيير الحالة", "Could not change the status") });
        return;
      }
      const label = statuses.find((item) => item.slug === status)?.label || status;
      setOrders((current) => (current ? current.map((item) => (item.id === order.id ? { ...item, statusSlug: status, statusLabel: label } : item)) : current));
      setNote({ id: order.id, ok: true, text: t("تم تغيير الحالة في سلة. سيصل العميل إشعار واتساب إن كان مفعّلًا لهذه الحالة.", "Status changed in Salla. The customer gets a WhatsApp notification if it is enabled for this status.") });
    } catch {
      setNote({ id: order.id, ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="store-orders-panel">
      <div className="store-orders-head">
        <h4>{t("طلبات سلة", "Salla orders")}</h4>
        <button type="button" className="soft-action" disabled={loading} onClick={() => void load()}>{loading ? t("جارٍ التحميل...", "Loading...") : t("تحديث", "Refresh")}</button>
      </div>
      <span className="store-orders-hint">{t("غيّر حالة الطلب من هنا وتُحدَّث في سلة مباشرة. يستقبل العميل إشعار واتساب حسب إعدادات «إشعارات الطلب».", "Change an order's status here and it updates in Salla right away. The customer is notified on WhatsApp per your “Order notifications” settings.")}</span>
      {error ? <p className="store-orders-error">{error}</p> : null}
      {orders && !orders.length && !error ? <p>{t("لا توجد طلبات.", "No orders.")}</p> : null}
      <div className="store-orders-list">
        {(orders || []).map((order) => (
          <div className="store-order-row" key={order.id}>
            <div className="store-order-main">
              <b dir="ltr">#{order.reference}</b>
              <span>{order.customerName || t("عميل", "Customer")}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</span>
              <small>{order.total ? `${order.total.toLocaleString("en-US")} ${order.currency}` : ""}</small>
              {order.shippingCompany || order.trackingNumber ? <small className="store-order-ship">🚚 {order.shippingCompany}{order.trackingNumber ? ` · ${order.trackingNumber}` : ""}</small> : null}
            </div>
            <span className="store-order-status">{order.statusLabel || order.statusSlug}</span>
            <div className="store-order-actions">
              <select value={choice[order.id] ?? order.statusSlug} onChange={(event) => setChoice((current) => ({ ...current, [order.id]: event.target.value }))} aria-label={t("الحالة الجديدة", "New status")}>
                {!statuses.some((item) => item.slug === order.statusSlug) ? <option value={order.statusSlug}>{order.statusLabel || order.statusSlug}</option> : null}
                {statuses.map((item) => (
                  <option key={item.slug} value={item.slug}>{item.label}</option>
                ))}
              </select>
              <button type="button" className="primary-action" disabled={busyId === order.id || !choice[order.id] || choice[order.id] === order.statusSlug} onClick={() => void apply(order)}>
                {busyId === order.id ? t("جارٍ التحديث...", "Updating...") : t("تحديث الحالة", "Update status")}
              </button>
              <button type="button" className="soft-action" onClick={() => setShippingId(shippingId === order.id ? "" : order.id)}>{t("إنشاء شحنة", "Create shipment")}</button>
            </div>
            {shippingId === order.id ? <SallaShipmentForm orderId={order.id} reference={order.reference} onClose={() => setShippingId("")} /> : null}
            {note?.id === order.id ? <span className={note.ok ? "store-order-ok" : "store-orders-error"}>{note.text}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
