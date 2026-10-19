"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type Discount = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  active: boolean;
};

type Form = { code: string; kind: "percent" | "fixed"; value: string; minOrder: string; maxUses: string; expiresAt: string };

const emptyForm: Form = { code: "", kind: "percent", value: "", minOrder: "", maxUses: "", expiresAt: "" };

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

function randomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
}

/** Discount codes customers can type into their chat cart: create, switch on/off, delete, and see how often each was used. */
export default function DiscountCodesPanel({ zidConnected = false }: { zidConnected?: boolean }) {
  const { t } = useLanguage();
  const [codes, setCodes] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    const result = await api<Discount[]>("/api/catalog/discounts");
    if (result.ok && result.data) setCodes(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm() {
    setForm(emptyForm);
    setFormError("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setMessage(null);
    const result = await api<Discount>("/api/catalog/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: form.code, kind: form.kind, value: form.value, minOrder: form.minOrder, maxUses: form.maxUses, expiresAt: form.expiresAt })
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error || t("تعذر الحفظ", "Could not save"));
      return;
    }
    setOpen(false);
    setForm(emptyForm);
    setMessage({ type: "success", text: t("تمت إضافة الكود", "Code added") });
    await load();
  }

  async function toggle(discount: Discount) {
    const result = await api<Discount>(`/api/catalog/discounts/${encodeURIComponent(discount.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !discount.active })
    });
    if (!result.ok) setMessage({ type: "error", text: result.error || t("تعذر التحديث", "Could not update") });
    await load();
  }

  async function remove(discount: Discount) {
    if (!window.confirm(t(`حذف الكود ${discount.code}؟`, `Delete the code ${discount.code}?`))) return;
    const result = await api<{ deleted: boolean }>(`/api/catalog/discounts/${encodeURIComponent(discount.id)}`, { method: "DELETE" });
    if (!result.ok) setMessage({ type: "error", text: result.error || t("تعذر الحذف", "Could not delete") });
    await load();
  }

  const describe = (discount: Discount) => (discount.kind === "percent" ? `${discount.value}%` : `${discount.value} ${t("ر.س", "SAR")}`);
  const expiry = (discount: Discount) => (discount.expiresAt ? new Date(discount.expiresAt).toLocaleDateString("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" }) : t("بلا انتهاء", "No expiry"));

  // A line under the form that shows what the customer would get, so a wrong value is seen before saving.
  const exampleOrder = 200;
  const typedValue = Number(form.value);
  const preview = Number.isFinite(typedValue) && typedValue > 0
    ? (() => {
        const off = form.kind === "percent" ? (exampleOrder * Math.min(typedValue, 90)) / 100 : Math.min(typedValue, exampleOrder - 1);
        return t(`مثال: طلب بقيمة ${exampleOrder} ر.س يصبح ${Math.round((exampleOrder - off) * 100) / 100} ر.س`, `Example: a ${exampleOrder} SAR order becomes ${Math.round((exampleOrder - off) * 100) / 100} SAR`);
      })()
    : "";

  return (
    <>
      {message ? <p className={`automation-feedback ${message.type}`} role="status">{message.text}</p> : null}

      <div className="panel">
        <div className="panel-head">
          <h2>{t("أكواد الخصم", "Discount codes")} ({codes.length})</h2>
          <span />
          <button className="btn primary" type="button" onClick={openForm}>{t("إضافة كود خصم", "Add discount code")}</button>
        </div>
        <div className="panel-body">
          <p className="muted-copy">{t("يكتب العميل الكود في سلة المحادثة (زر «لدي كود خصم») فيُخصم من إجمالي طلبه قبل الدفع.", "Customers enter the code in the chat cart (the “I have a discount code” button) and it comes off the total before payment.")}</p>
          {zidConnected ? <p className="muted-copy">{t("متجرك مربوط بزد: أكواد الخصم هنا غير مفعّلة مع زد، فاستخدم كوبونات زد.", "Your store is connected to Zid: codes here do not apply to Zid orders; use Zid coupons.")}</p> : null}
        </div>
        <div className="panel-body table-wrap">
          <table className="mobile-card-table">
            <thead><tr><th>{t("الكود", "Code")}</th><th>{t("الخصم", "Discount")}</th><th>{t("الحد الأدنى", "Minimum")}</th><th>{t("الاستخدام", "Uses")}</th><th>{t("الانتهاء", "Expiry")}</th><th>{t("الحالة", "Status")}</th><th /></tr></thead>
            <tbody>
              {codes.map((discount) => (
                <tr key={discount.id}>
                  <td data-label={t("الكود", "Code")} dir="ltr"><b>{discount.code}</b></td>
                  <td data-label={t("الخصم", "Discount")}>{describe(discount)}</td>
                  <td data-label={t("الحد الأدنى", "Minimum")}>{discount.minOrder > 0 ? `${discount.minOrder} ${t("ر.س", "SAR")}` : "-"}</td>
                  <td data-label={t("الاستخدام", "Uses")}>{discount.usedCount}{discount.maxUses > 0 ? ` / ${discount.maxUses}` : ""}</td>
                  <td data-label={t("الانتهاء", "Expiry")}>{expiry(discount)}</td>
                  <td data-label={t("الحالة", "Status")}>
                    <label className="automation-switch">
                      <input type="checkbox" checked={discount.active} aria-label={t("تفعيل الكود", "Code active")} onChange={() => void toggle(discount)} />
                      <span>{discount.active ? t("مفعّل", "On") : t("متوقف", "Off")}</span>
                    </label>
                  </td>
                  <td><button className="btn danger" type="button" onClick={() => void remove(discount)}>{t("حذف", "Delete")}</button></td>
                </tr>
              ))}
              {!codes.length ? <tr><td colSpan={7}>{loading ? t("جاري التحميل...", "Loading...") : t("لا توجد أكواد بعد. اضغط «إضافة كود خصم» لإنشاء أول كود.", "No codes yet. Press “Add discount code” to create the first one.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("إضافة كود خصم", "Add discount code")} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(false)}>×</button>
              <h2>{t("إضافة كود خصم", "Add discount code")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="split-fields">
                <label>
                  <span>{t("الكود", "Code")}</span>
                  <div className="row-actions">
                    <input dir="ltr" value={form.code} maxLength={20} autoFocus onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="SAVE10" required />
                    <button className="btn soft" type="button" onClick={() => setForm({ ...form, code: randomCode() })}>{t("توليد", "Generate")}</button>
                  </div>
                </label>
                <label>
                  <span>{t("نوع الخصم", "Discount type")}</span>
                  <CustomSelect value={form.kind} ariaLabel={t("نوع الخصم", "Discount type")} onChange={(value) => setForm({ ...form, kind: value === "fixed" ? "fixed" : "percent" })} options={[{ value: "percent", label: t("نسبة مئوية %", "Percentage %") }, { value: "fixed", label: t("مبلغ ثابت (ر.س)", "Fixed amount (SAR)") }]} />
                </label>
              </div>
              <div className="split-fields">
                <label>
                  <span>{form.kind === "percent" ? t("نسبة الخصم % (حتى 90)", "Discount % (up to 90)") : t("مبلغ الخصم (ر.س)", "Discount amount (SAR)")}</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required />
                </label>
                <label>
                  <span>{t("الحد الأدنى للطلب (ر.س)", "Minimum order (SAR)")}</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={form.minOrder} onChange={(event) => setForm({ ...form, minOrder: event.target.value })} placeholder={t("اختياري", "Optional")} />
                </label>
              </div>
              <div className="split-fields">
                <label>
                  <span>{t("عدد مرات الاستخدام", "Number of uses")}</span>
                  <input type="number" min="0" step="1" inputMode="numeric" value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} placeholder={t("بلا حد", "Unlimited")} />
                </label>
                <label>
                  <span>{t("ينتهي في", "Expires on")}</span>
                  <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
                </label>
              </div>
              {preview ? <p className="muted-copy">{preview}</p> : null}
              {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ...", "Saving...") : t("إضافة الكود", "Add code")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}
