"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type ShipTo = Record<"name" | "email" | "phone" | "country" | "city" | "address_line" | "street_number" | "block" | "short_address" | "building_number" | "additional_number" | "postal_code" | "lat" | "lng", string>;

/** Corrects the recipient and the delivery address of a Salla order. Items and status are changed elsewhere. */
export default function SallaOrderEditForm({ orderId, reference, onClose }: { orderId: string; reference: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [shipTo, setShipTo] = useState<ShipTo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const labels: Record<keyof ShipTo, string> = {
    name: t("اسم المستلم", "Recipient name"),
    email: t("البريد الإلكتروني", "Email"),
    phone: t("الجوال", "Phone"),
    country: t("الدولة (رمز مثل SA)", "Country (code such as SA)"),
    city: t("المدينة", "City"),
    address_line: t("العنوان", "Address"),
    street_number: t("رقم الشارع", "Street number"),
    block: t("الحي", "District"),
    short_address: t("العنوان المختصر", "Short address"),
    building_number: t("رقم المبنى", "Building number"),
    additional_number: t("الرقم الإضافي", "Additional number"),
    postal_code: t("الرمز البريدي", "Postal code"),
    lat: t("خط العرض", "Latitude"),
    lng: t("خط الطول", "Longitude")
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store-integrations/salla/orders/${encodeURIComponent(orderId)}/details`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; error?: string; data?: { shipTo: ShipTo } }) => {
        if (cancelled) return;
        if (!result?.ok || !result.data) setError(result?.error || t("تعذر جلب بيانات الطلب", "Could not load the order"));
        else setShipTo(result.data.shipTo);
      })
      .catch(() => !cancelled && setError(t("تعذر الاتصال بالخادم", "Could not reach the server")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function save() {
    if (!shipTo) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/store-integrations/salla/orders/${encodeURIComponent(orderId)}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipTo, reference })
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setError(result?.error || t("تعذر حفظ التعديل", "Could not save the change"));
        return;
      }
      setSaved(true);
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="shipment-form">
        <b className="store-order-ok">{t("تم تعديل بيانات المستلم والعنوان في سلة.", "Recipient and address updated in Salla.")}</b>
        <button type="button" className="soft-action" onClick={onClose}>{t("إغلاق", "Close")}</button>
      </div>
    );
  }

  return (
    <div className="shipment-form">
      {!shipTo && !error ? <span>{t("جارٍ تحميل بيانات الطلب...", "Loading the order...")}</span> : null}
      {shipTo ? (
        <>
          <span className="store-orders-hint">{t("يعدّل المستلم وعنوان التوصيل فقط. تغيير المنتجات والكميات يتم من لوحة سلة، وترفض سلة غالبًا التعديل بعد اكتمال الطلب.", "This changes the recipient and delivery address only. Items and quantities are changed in Salla, and Salla usually refuses changes once the order is completed.")}</span>
          <div className="shipment-grid">
            {(Object.keys(labels) as Array<keyof ShipTo>).map((key) => (
              <label key={key}>
                {labels[key]}
                <input value={shipTo[key]} dir={key === "name" || key === "address_line" || key === "city" || key === "block" ? undefined : "ltr"} onChange={(event) => setShipTo({ ...shipTo, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        </>
      ) : null}
      {error ? <span className="store-orders-error">{error}</span> : null}
      <div className="store-order-actions">
        <button type="button" className="primary-action" disabled={busy || !shipTo} onClick={() => void save()}>{busy ? t("جارٍ الحفظ...", "Saving...") : t("حفظ التعديل في سلة", "Save to Salla")}</button>
        <button type="button" className="soft-action" disabled={busy} onClick={onClose}>{t("إلغاء", "Cancel")}</button>
      </div>
    </div>
  );
}
