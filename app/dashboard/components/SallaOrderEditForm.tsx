"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import SallaLocationFields, { type LocationChoice } from "./SallaLocationFields";

type ShipTo = Record<"name" | "email" | "phone" | "country" | "city" | "address_line" | "street_number" | "block" | "short_address" | "building_number" | "additional_number" | "postal_code" | "lat" | "lng", string>;

const TEXT_KEYS = ["name", "email", "phone", "address_line", "street_number", "short_address", "building_number", "additional_number", "postal_code", "lat", "lng"] as const;

/** Corrects the recipient and the delivery address of a Salla order. Items and status are changed elsewhere. */
export default function SallaOrderEditForm({ orderId, reference, onClose }: { orderId: string; reference: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [shipTo, setShipTo] = useState<ShipTo | null>(null);
  const [ids, setIds] = useState({ countryId: "", cityId: "", districtId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const labels: Record<(typeof TEXT_KEYS)[number], string> = {
    name: t("اسم المستلم", "Recipient name"),
    email: t("البريد الإلكتروني", "Email"),
    phone: t("الجوال", "Phone"),
    address_line: t("العنوان", "Address"),
    street_number: t("رقم الشارع", "Street number"),
    short_address: t("العنوان المختصر (مثل RHMA3184)", "Short address (such as RHMA3184)"),
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
        body: JSON.stringify({ shipTo, reference, ...ids })
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
          <span className="store-orders-hint">{t("يعدّل المستلم وعنوان التوصيل فقط. الدولة والمدينة والحي تُختار من قوائم سلة. تغيير المنتجات والكميات يتم من لوحة سلة، وترفض سلة غالبًا التعديل بعد اكتمال الطلب.", "This changes the recipient and delivery address only. Country, city and district are chosen from Salla's lists. Items and quantities are changed in Salla, and Salla usually refuses changes once the order is completed.")}</span>
          <div className="shipment-grid">
            <SallaLocationFields
              current={{ country: shipTo.country, city: shipTo.city, district: shipTo.block }}
              onChange={(choice: LocationChoice) => {
                setIds({ countryId: choice.countryId, cityId: choice.cityId, districtId: choice.districtId });
                setShipTo((value) => (value ? { ...value, country: choice.countryCode || choice.country || value.country, city: choice.city || value.city, block: choice.district || value.block } : value));
              }}
            />
            {TEXT_KEYS.map((key) => (
              <label key={key}>
                {labels[key]}
                <input value={shipTo[key]} dir={key === "name" || key === "address_line" ? undefined : "ltr"} onChange={(event) => setShipTo({ ...shipTo, [key]: event.target.value })} />
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
