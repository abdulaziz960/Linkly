"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Method = {
  id: string;
  name: string;
  price: number;
  freeOver: number;
  eta: string;
  cities: string[];
  active: boolean;
};

type Form = { id: string; name: string; price: string; freeOver: string; eta: string; allCities: boolean; cities: string };

const emptyForm: Form = { id: "", name: "", price: "", freeOver: "", eta: "", allCities: true, cities: "" };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, error: payload?.error || "حدث خطأ" };
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }
}

/** Shipping companies (or the merchant's own delivery): price, free-shipping threshold, estimate and the cities each serves. */
export default function ShippingPanel() {
  const { t } = useLanguage();
  const [methods, setMethods] = useState<Method[]>([]);
  const [storeConnected, setStoreConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await api<{ methods: Method[]; storeConnected: boolean }>("/api/catalog/shipping");
    if (result.ok && result.data) {
      setMethods(result.data.methods);
      setStoreConnected(result.data.storeConnected);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openNew() {
    setForm(emptyForm);
    setFormError("");
    setOpen(true);
  }

  function openEdit(method: Method) {
    setForm({ id: method.id, name: method.name, price: String(method.price), freeOver: method.freeOver > 0 ? String(method.freeOver) : "", eta: method.eta, allCities: method.cities.length === 0, cities: method.cities.join("\n") });
    setFormError("");
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.allCities && !form.cities.trim()) {
      setFormError(t("اكتب المدن التي تخدمها، أو اختر «كل المدن»", "Enter the cities you serve, or choose “All cities”"));
      return;
    }
    setSaving(true);
    setFormError("");
    const body = JSON.stringify({ name: form.name, price: form.price, freeOver: form.freeOver, eta: form.eta, cities: form.allCities ? "" : form.cities });
    const result = await api<Method>(form.id ? `/api/catalog/shipping/${encodeURIComponent(form.id)}` : "/api/catalog/shipping", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error || t("تعذر الحفظ", "Could not save"));
      return;
    }
    setOpen(false);
    setMessage({ type: "success", text: form.id ? t("تم حفظ التعديل", "Saved") : t("تمت إضافة طريقة الشحن", "Delivery option added") });
    await load();
  }

  async function toggle(method: Method) {
    const result = await api<Method>(`/api/catalog/shipping/${encodeURIComponent(method.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !method.active }) });
    if (!result.ok) setMessage({ type: "error", text: result.error || t("تعذر التحديث", "Could not update") });
    await load();
  }

  async function remove(method: Method) {
    if (!window.confirm(t(`حذف «${method.name}»؟`, `Delete “${method.name}”?`))) return;
    const result = await api<{ deleted: boolean }>(`/api/catalog/shipping/${encodeURIComponent(method.id)}`, { method: "DELETE" });
    if (!result.ok) setMessage({ type: "error", text: result.error || t("تعذر الحذف", "Could not delete") });
    await load();
  }

  const citiesText = (method: Method) => (method.cities.length === 0 ? t("كل المدن", "All cities") : method.cities.length <= 4 ? method.cities.join("، ") : `${method.cities.slice(0, 4).join("، ")} ${t(`و${method.cities.length - 4} أخرى`, `and ${method.cities.length - 4} more`)}`);

  if (storeConnected) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>{t("الشحن", "Shipping")}</h2></div>
        <div className="panel-body"><p className="muted-copy">{t("متجرك مربوط بمنصة متاجر (زد أو سلة أو شوبيفاي)، فالشحن وأسعاره يُدارون من المتجر نفسه ولا تُستخدم هذه الإعدادات.", "Your store is connected to a store platform (Zid, Salla or Shopify), so shipping and its prices are managed there and these settings are not used.")}</p></div>
      </div>
    );
  }

  return (
    <>
      {message ? <p className={`automation-feedback ${message.type}`} role="status">{message.text}</p> : null}

      <div className="panel">
        <div className="panel-head">
          <h2>{t("الشحن والتوصيل", "Shipping and delivery")} ({methods.length})</h2>
          <span />
          <button className="btn primary" type="button" onClick={openNew}>{t("إضافة شركة شحن", "Add shipping company")}</button>
        </div>
        <div className="panel-body">
          <p className="muted-copy">{t("عند إتمام الدفع يسأل لنكلي العميل عن مدينته، فيعرض له الخيارات التي تخدمها، ثم يطلب العنوان ويضيف رسوم التوصيل إلى إجمالي الطلب. إن لم تضف أي شركة، لا يُسأل العميل عن التوصيل.", "At checkout Linkly asks the customer for their city, offers the options that serve it, takes the address and adds the delivery fee to the order total. With no company added, delivery is not asked about.")}</p>
        </div>
        <div className="panel-body table-wrap">
          <table className="mobile-card-table">
            <thead><tr><th>{t("شركة الشحن", "Company")}</th><th>{t("السعر", "Price")}</th><th>{t("شحن مجاني فوق", "Free over")}</th><th>{t("المدة", "Time")}</th><th>{t("المدن", "Cities")}</th><th>{t("الحالة", "Status")}</th><th /></tr></thead>
            <tbody>
              {methods.map((method) => (
                <tr key={method.id}>
                  <td data-label={t("شركة الشحن", "Company")}><b>{method.name}</b></td>
                  <td data-label={t("السعر", "Price")}>{method.price} {t("ر.س", "SAR")}</td>
                  <td data-label={t("شحن مجاني فوق", "Free over")}>{method.freeOver > 0 ? `${method.freeOver} ${t("ر.س", "SAR")}` : "-"}</td>
                  <td data-label={t("المدة", "Time")}>{method.eta || "-"}</td>
                  <td data-label={t("المدن", "Cities")}>{citiesText(method)}</td>
                  <td data-label={t("الحالة", "Status")}>
                    <label className="automation-switch">
                      <input type="checkbox" checked={method.active} aria-label={t("تفعيل الشحن", "Delivery active")} onChange={() => void toggle(method)} />
                      <span>{method.active ? t("مفعّل", "On") : t("متوقف", "Off")}</span>
                    </label>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn soft" type="button" onClick={() => openEdit(method)}>{t("تعديل", "Edit")}</button>
                      <button className="btn danger" type="button" onClick={() => void remove(method)}>{t("حذف", "Delete")}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!methods.length ? <tr><td colSpan={7}>{loading ? t("جاري التحميل...", "Loading...") : t("لا توجد شركات شحن بعد. اضغط «إضافة شركة شحن».", "No delivery options yet. Press “Add shipping company”.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("شركة شحن", "Shipping company")} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل شركة شحن", "Edit shipping company") : t("إضافة شركة شحن", "Add shipping company")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="split-fields">
                <label>
                  <span>{t("اسم شركة الشحن", "Company name")}</span>
                  <input value={form.name} maxLength={60} autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("مثال: سمسا أو توصيل المحل", "e.g. SMSA or our own delivery")} required />
                </label>
                <label>
                  <span>{t("سعر التوصيل (ر.س)", "Delivery price (SAR)")}</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0" required />
                </label>
              </div>
              <div className="split-fields">
                <label>
                  <span>{t("شحن مجاني للطلبات فوق (ر.س)", "Free shipping over (SAR)")}</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={form.freeOver} onChange={(event) => setForm({ ...form, freeOver: event.target.value })} placeholder={t("اختياري", "Optional")} />
                </label>
                <label>
                  <span>{t("مدة التوصيل", "Delivery time")}</span>
                  <input value={form.eta} maxLength={40} onChange={(event) => setForm({ ...form, eta: event.target.value })} placeholder={t("مثال: 2-3 أيام", "e.g. 2-3 days")} />
                </label>
              </div>
              <label className="automation-switch">
                <input type="checkbox" checked={form.allCities} onChange={(event) => setForm({ ...form, allCities: event.target.checked })} />
                <span>{t("تخدم كل المدن", "Serves every city")}</span>
              </label>
              {!form.allCities ? (
                <label>
                  <span>{t("المدن التي تخدمها (مدينة في كل سطر، أو افصل بينها بفاصلة)", "Cities served (one per line, or separated by commas)")}</span>
                  <textarea rows={5} value={form.cities} onChange={(event) => setForm({ ...form, cities: event.target.value })} placeholder={t("الرياض\nجدة\nالدمام", "Riyadh\nJeddah\nDammam")} />
                </label>
              ) : null}
              {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ...", "Saving...") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}
