"use client";

import { formatNumber } from "../../../lib/format";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import SallaLocationFields, { type LocationChoice } from "./SallaLocationFields";
import { shipToProblems, splitCoordinates } from "../../../lib/salla-ship-to";

type ShipTo = Record<"name" | "email" | "phone" | "country" | "city" | "address_line" | "street_number" | "block" | "short_address" | "building_number" | "additional_number" | "postal_code" | "lat" | "lng", string>;
type Draft = { orderId: string; reference: string; paymentMethod: "cod" | "pre_paid"; shipTo: ShipTo; packages: Array<{ name: string; sku: string; price: number; quantity: number; weight: number }>; missing: Array<keyof ShipTo>; existing: { company: string; trackingNumber: string; trackingUrl: string } | null };
type Company = { id: string; name: string; type: string };
type Branch = { id: string; name: string };
type Created = { id: string; trackingNumber: string; trackingUrl: string; status: string };

/** Creates a shipment in Salla for an order, using the shipping companies the store has activated. */
export default function SallaShipmentForm({ orderId, reference, onClose }: { orderId: string; reference: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courierId, setCourierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [shipTo, setShipTo] = useState<ShipTo | null>(null);
  const [payment, setPayment] = useState<"cod" | "pre_paid">("pre_paid");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [replace, setReplace] = useState(false);
  const [manual, setManual] = useState({ name: "", quantity: "1", price: "", weight: "1" });

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
    fetch(`/api/store-integrations/salla/orders/${encodeURIComponent(orderId)}/shipment`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; error?: string; data?: { draft: Draft; companies: Company[]; branches: Branch[] } }) => {
        if (cancelled) return;
        if (!result?.ok || !result.data) {
          setError(result?.error || t("تعذر تجهيز الشحنة", "Could not prepare the shipment"));
          return;
        }
        setDraft(result.data.draft);
        setShipTo(result.data.draft.shipTo);
        setPayment(result.data.draft.paymentMethod);
        setCompanies(result.data.companies);
        setBranches(result.data.branches);
        if (result.data.branches.length === 1) setBranchId(result.data.branches[0].id);
      })
      .catch(() => !cancelled && setError(t("تعذر الاتصال بالخادم", "Could not reach the server")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function submit() {
    if (!draft || !shipTo) return;
    const problems = shipToProblems(shipTo);
    if (problems.length) {
      setError(problems.join(" — "));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/store-integrations/salla/orders/${encodeURIComponent(orderId)}/shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId, branchId, paymentMethod: payment, shipTo, packages: draft.packages, reference, replaceExisting: replace })
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Created } | null;
      if (!response.ok || !result?.ok) {
        setError(result?.error || t("تعذر إنشاء الشحنة", "Could not create the shipment"));
        return;
      }
      setCreated(result.data ?? { id: "", trackingNumber: "", trackingUrl: "", status: "" });
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="shipment-form">
        <b className="store-order-ok">{t("تم إنشاء الشحنة في سلة.", "Shipment created in Salla.")}</b>
        {created.trackingNumber ? <span dir="ltr">{t("رقم التتبع:", "Tracking number:")} {created.trackingNumber}</span> : <span>{t("سيظهر رقم التتبع عند اعتماده من شركة الشحن.", "The tracking number appears once the carrier confirms it.")}</span>}
        {created.trackingUrl ? <a href={created.trackingUrl} target="_blank" rel="noopener noreferrer">{t("رابط التتبع", "Tracking link")} ↗</a> : null}
        <button type="button" className="soft-action" onClick={onClose}>{t("إغلاق", "Close")}</button>
      </div>
    );
  }

  return (
    <div className="shipment-form">
      {!draft && !error ? <span>{t("جارٍ تجهيز الشحنة...", "Preparing the shipment...")}</span> : null}
      {draft && shipTo ? (
        <>
          {draft.existing ? (
            <div className="shipment-existing">
              <b>{t("هذا الطلب فيه شحنة منشأة بالفعل.", "This order already has a shipment.")}</b>
              <span>{draft.existing.company ? `${t("الشركة:", "Company:")} ${draft.existing.company}` : ""}{draft.existing.trackingNumber ? ` · ${t("رقم التتبع:", "Tracking:")} ${draft.existing.trackingNumber}` : ` · ${t("بدون رقم تتبع بعد (معلّقة)", "no tracking number yet (pending)")}`}</span>
              {draft.existing.trackingUrl ? <a href={draft.existing.trackingUrl} target="_blank" rel="noopener noreferrer">{t("رابط التتبع", "Tracking link")} ↗</a> : null}
              <label className="shipment-confirm">
                <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
                {draft.existing.trackingNumber ? t("أريد إنشاء شحنة جديدة رغم وجود هذه (قد تتكرر رسوم الشحن)", "Create a new shipment anyway (shipping may be charged twice)") : t("أريد استبدال الشحنة المعلّقة بشحنة جديدة", "Replace the pending shipment with a new one")}
              </label>
            </div>
          ) : null}
          <label>
            {t("شركة الشحن (المفعّلة في متجرك)", "Shipping company (activated in your store)")}
            <CustomSelect value={courierId} onChange={setCourierId} options={[{ value: "", label: t("اختر شركة الشحن", "Choose a shipping company") }, ...[...companies].sort((a, b) => (a.type === b.type ? 0 : a.type === "api" ? -1 : 1)).map((company) => ({ value: company.id, label: `${company.name}${company.type === "manual" ? ` (${t("يدوي، قد لا يدعم الإنشاء الآلي", "manual, may not support API creation")})` : ""}` }))]} />
          </label>
          {!companies.length ? <span className="store-orders-error">{t("لا توجد شركات شحن مفعّلة في متجرك. فعّلها من إعدادات الشحن في سلة.", "No shipping companies are activated in your store. Activate them in Salla's shipping settings.")}</span> : null}
          {branches.length > 1 ? (
            <label>
              {t("الفرع المرسِل", "Sending branch")}
              <CustomSelect value={branchId} onChange={setBranchId} options={[{ value: "", label: t("اختر الفرع", "Choose a branch") }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} />
            </label>
          ) : null}
          <label>
            {t("طريقة الدفع", "Payment")}
            <CustomSelect value={payment} onChange={(value) => setPayment(value as "cod" | "pre_paid")} options={[{ value: "pre_paid", label: t("مدفوع مسبقًا", "Prepaid") }, { value: "cod", label: t("الدفع عند الاستلام", "Cash on delivery") }]} />
          </label>
          {draft.missing.length ? <span className="store-orders-error">{t("بعض بيانات العنوان ناقصة في الطلب، أكملها قبل الإرسال.", "Some address details are missing from the order. Fill them in before sending.")}</span> : null}
          <div className="shipment-grid">
            <SallaLocationFields
              current={{ country: shipTo.country, city: shipTo.city, district: shipTo.block }}
              onChange={(choice: LocationChoice) => setShipTo((value) => (value ? { ...value, country: choice.countryCode || choice.country || value.country, city: choice.city || value.city, block: choice.district || value.block } : value))}
            />
            {(Object.keys(labels) as Array<keyof ShipTo>).filter((key) => key !== "country" && key !== "city" && key !== "block").map((key) => (
              <label key={key} className={draft.missing.includes(key) ? "is-missing" : ""}>
                {labels[key]}
                <input value={shipTo[key]} dir={key === "name" || key === "address_line" ? undefined : "ltr"} onChange={(event) => {
                  const pair = key === "lat" || key === "lng" ? splitCoordinates(event.target.value) : null;
                  setShipTo(pair ? { ...shipTo, lat: pair.lat, lng: pair.lng } : { ...shipTo, [key]: event.target.value });
                }} />
              </label>
            ))}
          </div>
          <span className="store-orders-hint">{t("الإحداثيات: افتح موقع العميل في خرائط جوجل، انسخ الرقمين (مثل 24.7136, 46.6753) والصقهما في خانة خط العرض وسيُقسَّمان تلقائيًا. العنوان المختصر: 4 أحرف إنجليزية ثم 4 أرقام مثل RHMA3184.", "Coordinates: open the customer's location in Google Maps, copy the two numbers (such as 24.7136, 46.6753) and paste them into the latitude field; they are split automatically. Short address: 4 letters then 4 digits, such as RHMA3184.")}</span>
          <span className="store-orders-hint">{t(`عدد المنتجات في الشحنة: ${draft.packages.length}`, `Items in the shipment: ${draft.packages.length}`)}</span>
          {draft.packages.length ? (
            <div className="shipment-packages">
              {draft.packages.map((item, index) => (
                <small key={`${item.name}-${index}`}>{item.name} × {item.quantity}{item.price ? ` · ${formatNumber(item.price)}` : ""}</small>
              ))}
            </div>
          ) : (
            <div className="shipment-grid">
              <span className="store-orders-error" style={{ gridColumn: "1 / -1" }}>{t("لم ترجع سلة منتجات هذا الطلب. أضف المنتج يدويًا (اسم وكمية وسعر ووزن بالكيلو).", "Salla returned no items for this order. Add the item manually (name, quantity, price and weight in kg).")}</span>
              <label>{t("اسم المنتج", "Item name")}<input value={manual.name} onChange={(event) => setManual({ ...manual, name: event.target.value })} /></label>
              <label>{t("الكمية", "Quantity")}<input dir="ltr" value={manual.quantity} onChange={(event) => setManual({ ...manual, quantity: event.target.value })} /></label>
              <label>{t("السعر", "Price")}<input dir="ltr" value={manual.price} onChange={(event) => setManual({ ...manual, price: event.target.value })} /></label>
              <label>{t("الوزن (كجم)", "Weight (kg)")}<input dir="ltr" value={manual.weight} onChange={(event) => setManual({ ...manual, weight: event.target.value })} /></label>
              <button type="button" className="soft-action" disabled={!manual.name.trim()} onClick={() => {
                setDraft({ ...draft, packages: [{ name: manual.name.trim(), sku: "", price: Number(manual.price) || 0, quantity: Math.max(1, Math.floor(Number(manual.quantity)) || 1), weight: Number(manual.weight) > 0 ? Number(manual.weight) : 1 }] });
              }}>{t("إضافة المنتج", "Add item")}</button>
            </div>
          )}
        </>
      ) : null}
      {error ? <span className="store-orders-error">{error}</span> : null}
      <div className="store-order-actions">
        <button type="button" className="primary-action" disabled={busy || !draft || !draft.packages.length || !courierId || Boolean(draft.existing && !replace)} onClick={() => void submit()}>{busy ? t("جارٍ الإرسال...", "Sending...") : t("إنشاء الشحنة", "Create shipment")}</button>
        <button type="button" className="soft-action" disabled={busy} onClick={onClose}>{t("إلغاء", "Cancel")}</button>
      </div>
    </div>
  );
}
