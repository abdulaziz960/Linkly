"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import SallaOrderEditForm from "./SallaOrderEditForm";
import SallaShipmentForm from "./SallaShipmentForm";

type Order = { id: string; reference: string; statusSlug: string; statusLabel: string; total: number; currency: string; trackingNumber: string; trackingUrl: string; shippingCompany: string };
type Status = { slug: string; label: string };
type Data = { connected: boolean; error?: string; orders: Order[]; statuses: Status[]; canManage: boolean };

/** The customer's orders in the connected Salla store, shown in the conversation's side panel with quick actions for staff who manage the store. */
export default function ConversationStoreOrders({ conversationId }: { conversationId: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<Data | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [panel, setPanel] = useState<{ id: string; kind: "ship" | "edit" } | null>(null);
  const [note, setNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function load() {
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/store-orders`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; data?: Data } | null;
      setData(response.ok && result?.ok && result.data ? result.data : null);
    } catch {
      setData(null);
    }
  }

  useEffect(() => {
    setData(null);
    setPanel(null);
    setNote(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function applyStatus(order: Order) {
    const status = choice[order.id];
    if (!status || status === order.statusSlug) return;
    setBusyId(order.id);
    setNote(null);
    try {
      const response = await fetch(`/api/store-integrations/salla/orders/${encodeURIComponent(order.id)}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reference: order.reference }) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setNote({ id: order.id, ok: false, text: result?.error || t("تعذر تغيير الحالة", "Could not change the status") });
        return;
      }
      const label = data?.statuses.find((item) => item.slug === status)?.label || status;
      setData((current) => (current ? { ...current, orders: current.orders.map((item) => (item.id === order.id ? { ...item, statusSlug: status, statusLabel: label } : item)) } : current));
      setNote({ id: order.id, ok: true, text: t("تم تغيير الحالة في سلة.", "Status changed in Salla.") });
    } catch {
      setNote({ id: order.id, ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusyId("");
    }
  }

  if (!data || !data.connected) return null;
  return (
    <div className="conversation-store-orders">
      <strong>{t("طلبات العميل في سلة", "Customer's Salla orders")}</strong>
      {data.error ? <span className="store-orders-error">{data.error}</span> : null}
      {!data.error && !data.orders.length ? <small>{t("لا توجد طلبات بهذا الرقم في آخر طلبات المتجر.", "No orders for this number among the store's latest orders.")}</small> : null}
      {data.orders.map((order) => (
        <div className="conversation-store-order" key={order.id}>
          <div className="conversation-store-order-head">
            <b dir="ltr">#{order.reference}</b>
            <span className="store-order-status">{order.statusLabel || order.statusSlug}</span>
          </div>
          <small>{order.total ? `${order.total.toLocaleString("en-US")} ${order.currency}` : ""}</small>
          {order.shippingCompany || order.trackingNumber ? (
            <small className="store-order-ship">🚚 {order.shippingCompany}{order.trackingNumber ? ` · ${order.trackingNumber}` : ""}{order.trackingUrl ? <> · <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">{t("تتبع", "Track")}</a></> : null}</small>
          ) : null}
          {data.canManage ? (
            <div className="conversation-store-order-actions">
              <CustomSelect className="store-status-select" ariaLabel={t("الحالة الجديدة", "New status")} value={choice[order.id] ?? order.statusSlug} onChange={(value) => setChoice((current) => ({ ...current, [order.id]: value }))} options={[...(!data.statuses.some((item) => item.slug === order.statusSlug) ? [{ value: order.statusSlug, label: order.statusLabel || order.statusSlug }] : []), ...data.statuses.map((item) => ({ value: item.slug, label: item.label }))]} />
              <button type="button" className="primary-action" disabled={busyId === order.id || !choice[order.id] || choice[order.id] === order.statusSlug} onClick={() => void applyStatus(order)}>{t("تحديث", "Update")}</button>
              <button type="button" className="soft-action" onClick={() => setPanel(panel?.id === order.id && panel.kind === "ship" ? null : { id: order.id, kind: "ship" })}>{t("شحنة", "Shipment")}</button>
              <button type="button" className="soft-action" onClick={() => setPanel(panel?.id === order.id && panel.kind === "edit" ? null : { id: order.id, kind: "edit" })}>{t("العنوان", "Address")}</button>
            </div>
          ) : null}
          {note?.id === order.id ? <small className={note.ok ? "store-order-ok" : "store-orders-error"}>{note.text}</small> : null}
          {panel?.id === order.id && panel.kind === "ship" ? <SallaShipmentForm orderId={order.id} reference={order.reference} onClose={() => { setPanel(null); void load(); }} /> : null}
          {panel?.id === order.id && panel.kind === "edit" ? <SallaOrderEditForm orderId={order.id} reference={order.reference} onClose={() => { setPanel(null); void load(); }} /> : null}
        </div>
      ))}
    </div>
  );
}
