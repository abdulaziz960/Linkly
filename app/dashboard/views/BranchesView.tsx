"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Branch = {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  workingHours: string;
  mapUrl: string;
  active: boolean;
};

type BranchForm = { id: string; name: string; address: string; phone: string; workingHours: string; mapUrl: string; latitude: string; longitude: string; active: boolean };

const emptyForm: BranchForm = { id: "", name: "", address: "", phone: "", workingHours: "", mapUrl: "", latitude: "", longitude: "", active: true };

export default function BranchesView() {
  const { t } = useLanguage();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCoords, setShowCoords] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/branches", { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (result?.ok) setBranches(result.data as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setForm(emptyForm);
    setShowCoords(false);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(branch: Branch) {
    setForm({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      workingHours: branch.workingHours,
      mapUrl: branch.mapUrl,
      latitude: String(branch.latitude),
      longitude: String(branch.longitude),
      active: branch.active
    });
    setShowCoords(true);
    setFormError("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const response = await fetch(form.id ? `/api/branches/${form.id}` : "/api/branches", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        address: form.address,
        phone: form.phone,
        workingHours: form.workingHours,
        mapUrl: form.mapUrl,
        latitude: form.latitude,
        longitude: form.longitude,
        active: form.active
      })
    });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!result?.ok) {
      setFormError(result?.error || t("تعذر الحفظ", "Could not save"));
      return;
    }
    setFormOpen(false);
    await load();
  }

  async function toggle(branch: Branch) {
    await fetch(`/api/branches/${branch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...branch, active: !branch.active })
    });
    await load();
  }

  async function remove(branch: Branch) {
    if (!window.confirm(t(`حذف الفرع "${branch.name}"؟`, `Delete "${branch.name}"?`))) return;
    await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="view-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("الفروع", "Branches")}</h2>
          <button className="primary-btn" type="button" onClick={openNew}>{t("إضافة فرع", "Add branch")}</button>
        </div>
        <div className="panel-body">
          <p>{t("أضف فروعك ومواقعها. عند إضافة خطوة «أقرب فرع» في الرد الآلي، يطلب البوت من العميل مشاركة موقعه على واتساب ثم يرسل له أقرب فرع (الاسم والعنوان والمسافة ورابط الخريطة).", "Add your branches and their locations. With the \"Nearest branch\" auto-reply step, the bot asks the customer to share their WhatsApp location and replies with the closest branch (name, address, distance and map link).")}</p>
          {loading ? <p>{t("جارٍ التحميل...", "Loading...")}</p> : branches.length === 0 ? (
            <p>{t("لا توجد فروع بعد.", "No branches yet.")}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("الفرع", "Branch")}</th>
                  <th>{t("العنوان", "Address")}</th>
                  <th>{t("الدوام", "Hours")}</th>
                  <th>{t("الحالة", "Status")}</th>
                  <th>{t("إجراء", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td data-label={t("الفرع", "Branch")}><b>{branch.name}</b><br /><small>{branch.phone}</small></td>
                    <td data-label={t("العنوان", "Address")}>{branch.address || "-"}<br /><small><a href={branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`} target="_blank" rel="noreferrer">{t("عرض على الخريطة", "View on map")}</a></small></td>
                    <td data-label={t("الدوام", "Hours")}>{branch.workingHours || "-"}</td>
                    <td data-label={t("الحالة", "Status")}>{branch.active ? t("ظاهر", "Active") : t("مخفي", "Hidden")}</td>
                    <td data-label={t("إجراء", "Actions")}>
                      <div className="row-actions">
                        <button className="ghost-btn" type="button" onClick={() => openEdit(branch)}>{t("تعديل", "Edit")}</button>
                        <button className="ghost-btn" type="button" onClick={() => toggle(branch)}>{branch.active ? t("إخفاء", "Hide") : t("إظهار", "Show")}</button>
                        <button className="ghost-btn danger" type="button" onClick={() => remove(branch)}>{t("حذف", "Delete")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("فرع", "Branch")} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? t("تعديل فرع", "Edit branch") : t("إضافة فرع", "Add branch")}</h2></header>
            <div className="account-modal-body form-grid">
              <label><span>{t("اسم الفرع", "Branch name")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} /></label>
              <label><span>{t("العنوان", "Address")}</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={300} /></label>
              <div className="split-fields">
                <label><span>{t("رقم الفرع", "Branch phone")}</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={40} dir="ltr" /></label>
                <label><span>{t("ساعات الدوام", "Working hours")}</span><input value={form.workingHours} onChange={(event) => setForm({ ...form, workingHours: event.target.value })} maxLength={200} placeholder={t("مثال: 9 ص - 10 م", "e.g. 9am - 10pm")} /></label>
              </div>
              <label>
                <span>{t("رابط الموقع من خرائط Google", "Google Maps link")}</span>
                <input value={form.mapUrl} onChange={(event) => setForm({ ...form, mapUrl: event.target.value })} placeholder="https://maps.app.goo.gl/..." dir="ltr" />
                <small className="field-hint">{t("افتح الفرع في خرائط Google ← مشاركة ← انسخ الرابط والصقه هنا، وسيُستخرج الموقع تلقائيًا.", "Open the branch in Google Maps → Share → copy the link and paste it here; the location is extracted automatically.")}</small>
              </label>
              {showCoords ? (
                <div className="split-fields">
                  <label><span>{t("خط العرض", "Latitude")}</span><input value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} dir="ltr" inputMode="decimal" /></label>
                  <label><span>{t("خط الطول", "Longitude")}</span><input value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} dir="ltr" inputMode="decimal" /></label>
                </div>
              ) : (
                <button className="ghost-btn" type="button" onClick={() => setShowCoords(true)}>{t("أو أدخل الإحداثيات يدويًا", "Or enter coordinates manually")}</button>
              )}
              <label className="checkbox-row"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>{t("الفرع ظاهر للعملاء", "Visible to customers")}</span></label>
              {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="ghost-btn" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="primary-btn" type="submit" disabled={saving}>{saving ? t("جارٍ الحفظ...", "Saving...") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
