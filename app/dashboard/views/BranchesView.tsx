"use client";

import { confirmDialog } from "../../../lib/ui-dialogs";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHero } from "../components/PageHero";
import { useLanguage } from "../i18n";
import { downloadBranchTemplate, parseBranchFile } from "../branch-import";

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
  const { t, language } = useLanguage();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // The link the branch was saved with: the location is read from the link again only when the link changes.
  const [savedMapUrl, setSavedMapUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ added: number; errors: string[] } | null>(null);

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
    setSavedMapUrl("");
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
    setSavedMapUrl(branch.mapUrl);
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
        // No coordinate fields in the form: the location comes from the Google Maps link. Saved coordinates are kept only
        // while the link is the one they were read from; a new or changed link is read again by the server.
        latitude: form.id && form.mapUrl.trim() === savedMapUrl.trim() ? form.latitude : "",
        longitude: form.id && form.mapUrl.trim() === savedMapUrl.trim() ? form.longitude : "",
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

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportReport(null);
    try {
      const rows = await parseBranchFile(file);
      if (!rows.length) {
        setImportReport({ added: 0, errors: [t("لم نجد صفوفًا صالحة. استخدم النموذج وتأكد من عمود «اسم الفرع».", "No valid rows found. Use the template and keep the \"Branch name\" column.")] });
        return;
      }
      let added = 0;
      const errors: string[] = [];
      for (const [index, row] of rows.entries()) {
        const response = await fetch("/api/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...row, active: true }) });
        const result = await response.json().catch(() => null);
        if (result?.ok) added += 1;
        else {
          errors.push(t(`الصف ${index + 2}: ${result?.error || "تعذر الحفظ"}`, `Row ${index + 2}: ${result?.error || "Could not save"}`));
          // A plan limit stops the rest: every further row would fail the same way.
          if (response.status === 403) break;
        }
      }
      setImportReport({ added, errors });
      await load();
    } catch {
      setImportReport({ added: 0, errors: [t("تعذر قراءة الملف. استخدم ملف Excel (.xlsx) أو CSV.", "Could not read the file. Use an Excel (.xlsx) or CSV file.")] });
    } finally {
      setImporting(false);
    }
  }

  async function toggle(branch: Branch) {
    await fetch(`/api/branches/${branch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...branch, active: !branch.active })
    });
    await load();
  }

  const mapHref = (branch: Branch) => branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`;

  return (
    <section className="page-stack">
      <PageHero
        eyebrow={t("الكتالوج والفروع", "CATALOG & BRANCHES")}
        title={t("الفروع", "Branches")}
        description={t("فروعك وساعات عملها وموقع كل فرع، ليختار العميل الأقرب له.", "Your branches, their opening hours and locations, so customers can pick the nearest.")}
        chips={[t(`${branches.length} فرع`, `${branches.length} branches`)]}
      >
        <div className="hero-actions-row">
          <button className="camp-hero-new camp-hero-ghost" type="button" onClick={() => void downloadBranchTemplate(language)}>{t("تنزيل نموذج Excel", "Download Excel template")}</button>
          <label className="camp-hero-new camp-hero-ghost" style={{ cursor: importing ? "wait" : "pointer", display: "inline-flex", alignItems: "center" }}>
            {importing ? t("جاري الاستيراد...", "Importing...") : t("رفع ملف الفروع", "Upload branches file")}
            <input type="file" accept=".xlsx,.csv" hidden disabled={importing} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <button className="camp-hero-new" type="button" onClick={openNew}>＋ {t("إضافة فرع", "Add branch")}</button>
        </div>
      </PageHero>
      <div className="panel">
        <div className="panel-body">
          {importReport ? (
            <div className={importReport.errors.length ? "form-error" : "automation-feedback success"} role="status">
              <b>{t(`تمت إضافة ${importReport.added} فرع`, `${importReport.added} branches added`)}</b>
              {importReport.errors.slice(0, 8).map((message) => <div key={message}>{message}</div>)}
              {importReport.errors.length > 8 ? <div>{t(`و${importReport.errors.length - 8} أخطاء أخرى`, `and ${importReport.errors.length - 8} more errors`)}</div> : null}
            </div>
          ) : null}
          <div className="branch-intro">
            <span className="branch-intro-icon" aria-hidden="true">📍</span>
            <p>{t("أضف فروعك ومواقعها. عند إضافة خطوة «أقرب فرع» في الرد الآلي، يطلب البوت من العميل مشاركة موقعه على واتساب ثم يرسل له أقرب فرع: الاسم والعنوان والمسافة ورابط الخريطة.", "Add your branches and their locations. With the \"Nearest branch\" auto-reply step, the bot asks the customer to share their WhatsApp location and replies with the closest branch: name, address, distance and map link.")}</p>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{t("قائمة الفروع", "Branch list")} ({branches.length})</h2>
        </div>
        <div className="panel-body table-wrap">
          {loading ? <p className="muted-copy">{t("جارٍ التحميل...", "Loading...")}</p> : branches.length === 0 ? (
            <div className="branch-empty">
              <span aria-hidden="true">📍</span>
              <b>{t("لا توجد فروع بعد", "No branches yet")}</b>
              <p>{t("أضف أول فرع بلصق رابط موقعه من خرائط Google.", "Add your first branch by pasting its Google Maps link.")}</p>
              <button className="btn primary" type="button" onClick={openNew}>{t("+ إضافة فرع", "+ Add branch")}</button>
            </div>
          ) : (
            <table className="mobile-card-table">
              <thead>
                <tr>
                  <th>{t("الفرع", "Branch")}</th>
                  <th>{t("المدينة", "City")}</th>
                  <th>{t("الدوام", "Hours")}</th>
                  <th>{t("الحالة", "Status")}</th>
                  <th>{t("إجراء", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td>
                      <span className="branch-cell">
                        <span className="branch-pin" aria-hidden="true">📍</span>
                        <span><b>{branch.name}</b>{branch.phone ? <small dir="ltr">{branch.phone}</small> : null}</span>
                      </span>
                    </td>
                    <td data-label={t("المدينة", "City")}>
                      <span className="branch-address">{branch.address || "-"}</span>
                      <a className="branch-map-link" href={mapHref(branch)} target="_blank" rel="noreferrer">{t("عرض على الخريطة ↗", "View on map ↗")}</a>
                    </td>
                    <td data-label={t("الدوام", "Hours")}>{branch.workingHours || "-"}</td>
                    <td data-label={t("الحالة", "Status")}><span className={branch.active ? "state ok" : "state muted"}>{branch.active ? t("ظاهر", "Visible") : t("مخفي", "Hidden")}</span></td>
                    <td className="row-actions" data-label={t("إجراء", "Action")}>
                      <button className="btn soft" type="button" onClick={() => openEdit(branch)}>{t("تعديل", "Edit")}</button>
                      <button className="btn soft" type="button" onClick={() => toggle(branch)}>{branch.active ? t("إخفاء", "Hide") : t("إظهار", "Show")}</button>
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
              <label><span>{t("المدينة", "City")}</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={300} /></label>
              <div className="split-fields">
                <label><span>{t("رقم الفرع", "Branch phone")}</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={40} dir="ltr" /></label>
                <label><span>{t("ساعات الدوام", "Working hours")}</span><input value={form.workingHours} onChange={(event) => setForm({ ...form, workingHours: event.target.value })} maxLength={200} placeholder={t("مثال: 9 ص - 10 م", "e.g. 9am - 10pm")} /></label>
                <small className="field-hint">{t("في الكتالوج يُخفى الفرع خارج هذه الساعات ويُخبَر العميل بموعد الفتح. اكتبها بصيغة «9 ص - 10 م» أو «09:00-22:00»؛ وإن تركتها فارغة يبقى الفرع مفتوحًا دائمًا.", "In the catalog the branch is hidden outside these hours and the customer is told when it opens. Write them like “9 am - 10 pm” or “09:00-22:00”; empty means always open.")}</small>
              </div>
              <label>
                <span>{t("رابط الموقع من خرائط Google", "Google Maps link")}</span>
                <input value={form.mapUrl} onChange={(event) => setForm({ ...form, mapUrl: event.target.value })} placeholder="https://maps.app.goo.gl/..." dir="ltr" required />
                <small className="field-hint">{t("افتح الفرع في خرائط Google ← مشاركة ← انسخ الرابط والصقه هنا، وسيُستخرج الموقع تلقائيًا.", "Open the branch in Google Maps → Share → copy the link and paste it here; the location is extracted automatically.")}</small>
              </label>
              <label className="automation-switch"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>{form.active ? t("ظاهر للعملاء", "Visible to customers") : t("مخفي عن العملاء", "Hidden from customers")}</span></label>
              {formError ? <p className="form-error">{formError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جارٍ الحفظ...", "Saving...") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
