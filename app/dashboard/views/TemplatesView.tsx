"use client";

import { FormEvent, useMemo, useState } from "react";
import type { MessageTemplate } from "../types";

type TemplateFormState = {
  name: string;
  message: string;
  type: NonNullable<MessageTemplate["type"]>;
  category: NonNullable<MessageTemplate["category"]>;
  language: string;
  status: NonNullable<MessageTemplate["status"]>;
  headerType: NonNullable<MessageTemplate["headerType"]>;
  headerText: string;
  headerMedia: string;
  footer: string;
  buttonType: NonNullable<MessageTemplate["buttonType"]>;
  buttonText: string;
  buttonPhone: string;
  buttonUrl: string;
  lastUsed: string;
  editing: boolean;
};

const languages = [
  { label: "Arabic", value: "ar" },
  { label: "English", value: "en_US" }
];

const templateNamePattern = "^[a-z0-9_]+$";

export default function TemplatesView({
  onRefreshData,
  templates
}: {
  onRefreshData: () => Promise<void>;
  templates: MessageTemplate[];
}) {
  const emptyForm = useMemo<TemplateFormState>(
    () => ({
      name: "",
      message: "السلام عليكم ورحمة الله وبركاته\nالرجاء الرد على الرسالة لخدمتكم",
      type: "تسويق",
      category: "MARKETING",
      language: "ar",
      status: "قيد المراجعة",
      headerType: "NONE",
      headerText: "",
      headerMedia: "",
      footer: "",
      buttonType: "NONE",
      buttonText: "",
      buttonPhone: "",
      buttonUrl: "",
      lastUsed: "-",
      editing: false
    }),
    []
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const approvedCount = templates.filter((template) => template.status === "معتمد").length;
  const pendingCount = templates.filter((template) => template.status === "قيد المراجعة").length;
  const rejectedCount = templates.filter((template) => template.status === "مرفوض").length;
  const lastSync = templates.find((template) => template.syncedAt && template.syncedAt !== "-")?.syncedAt || "-";

  function openCreateForm() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(template: MessageTemplate) {
    setError("");
    setForm({
      name: template.name,
      message: template.message,
      type: template.type || "خدمة",
      category: template.category || "UTILITY",
      language: template.language || "ar",
      status: template.status || "قيد المراجعة",
      headerType: template.headerType || "NONE",
      headerText: template.headerText || "",
      headerMedia: template.headerMedia || "",
      footer: template.footer || "",
      buttonType: template.buttonType || "NONE",
      buttonText: template.buttonText || "",
      buttonPhone: template.buttonPhone || "",
      buttonUrl: template.buttonUrl || "",
      lastUsed: template.lastUsed || "-",
      editing: true
    });
    setFormOpen(true);
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.editing ? `/api/templates/${encodeURIComponent(form.name)}` : "/api/templates", {
      method: form.editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!payload.ok) {
      setError(payload.error || "تعذر حفظ القالب");
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function syncTemplatesFromMeta() {
    setSyncing(true);
    setError("");
    const response = await fetch("/api/templates/sync-meta", { method: "POST" });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!payload.ok) setError(payload.error || "تعذر التحديث من Meta");
    await onRefreshData();
    setSyncing(false);
  }

  async function deleteTemplate(template: MessageTemplate) {
    if (!window.confirm(`حذف قالب ${template.name}؟`)) return;
    await fetch(`/api/templates/${encodeURIComponent(template.name)}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="stats-grid">
        <div className="stat"><span>القوالب المعتمدة</span><b>{approvedCount}</b><small>جاهزة للإرسال</small></div>
        <div className="stat"><span>بانتظار المراجعة</span><b>{pendingCount}</b><small>لدى Meta</small></div>
        <div className="stat"><span>آخر مزامنة</span><b>{lastSync}</b><small>من قوالب Meta</small></div>
        <div className="stat"><span>مرفوضة</span><b>{rejectedCount}</b><small>تحتاج تعديل</small></div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>قوالب واتساب</h2>
          <span />
          <button className="btn soft" type="button" onClick={syncTemplatesFromMeta} disabled={syncing}>{syncing ? "جاري التحديث" : "تحديث الحالة من Meta"}</button>
          <button className="btn primary" type="button" onClick={openCreateForm}>إنشاء قالب</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>القالب</th><th>الفئة</th><th>اللغة</th><th>الحالة من Meta</th><th>آخر مزامنة</th><th>إجراء</th></tr></thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.name}>
                  <td>
                    <b>{template.name}</b>
                    <span className="table-subtitle">{template.message}</span>
                  </td>
                  <td>{template.category || (template.type === "تسويق" ? "MARKETING" : "UTILITY")}</td>
                  <td>{template.language}</td>
                  <td><span className={template.status === "معتمد" ? "state ok" : template.status === "مرفوض" ? "state off" : "state warn"}>{template.status}</span></td>
                  <td>{template.syncedAt || "-"}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => openEditForm(template)}>عرض</button>
                    <button className="btn danger" type="button" onClick={() => deleteTemplate(template)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal template-modal" role="dialog" aria-modal="true" aria-label="حفظ قالب واتساب" onSubmit={submitTemplate} onClick={(event) => event.stopPropagation()}>
            <button className="template-close" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
            <div className="template-modal-body">
              <div className="template-editor">
                <h2>قوالب الواتساب</h2>
                <p>Edit your Template</p>
                <label>
                  <span>الاسم</span>
                  <input
                    dir="ltr"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: normalizeTemplateName(event.target.value) }))}
                    required
                    disabled={form.editing}
                    pattern={templateNamePattern}
                    placeholder="welcome_message"
                  />
                  <small className="field-hint">حسب سياسة Meta: حروف إنجليزية صغيرة، أرقام، وشرطة سفلية فقط. مثال: welcome_message</small>
                </label>
                <label>
                  <span>الفئة</span>
                  <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as TemplateFormState["category"], type: event.target.value === "MARKETING" ? "تسويق" : "خدمة" }))}>
                    <option value="UTILITY">UTILITY</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </label>
                <label>
                  <span>اللغة</span>
                  <select value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}>
                    {languages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>نوع العنوان</span>
                  <select value={form.headerType} onChange={(event) => setForm((current) => ({ ...current, headerType: event.target.value as TemplateFormState["headerType"] }))}>
                    <option value="NONE">لا شيء</option>
                    <option value="TEXT">نص</option>
                    <option value="IMAGE">صورة</option>
                    <option value="VIDEO">VIDEO</option>
                  </select>
                </label>
                {form.headerType === "TEXT" ? (
                  <label>
                    <span>نص العنوان</span>
                    <input value={form.headerText} onChange={(event) => setForm((current) => ({ ...current, headerText: event.target.value }))} />
                  </label>
                ) : null}
                {form.headerType === "IMAGE" || form.headerType === "VIDEO" ? (
                  <label>
                    <span>ملف العنوان</span>
                    <input type="file" onChange={(event) => setForm((current) => ({ ...current, headerMedia: event.target.files?.[0]?.name || "" }))} />
                  </label>
                ) : null}
                <label>
                  <span>المحتوى</span>
                  <textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} rows={5} required />
                </label>
                <label>
                  <span>تذييل الصفحة (اختياري)</span>
                  <input value={form.footer} onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))} />
                </label>
                <label>
                  <span>زر (اختياري)</span>
                  <select
                    value={form.buttonType}
                    onChange={(event) => {
                      const buttonType = event.target.value as TemplateFormState["buttonType"];
                      setForm((current) => ({
                        ...current,
                        buttonType,
                        buttonText: buttonType === "NONE" ? "" : current.buttonText || defaultButtonText(buttonType),
                        buttonPhone: buttonType === "PHONE" ? current.buttonPhone : "",
                        buttonUrl: buttonType === "URL" ? current.buttonUrl : ""
                      }));
                    }}
                  >
                    <option value="NONE">لا شيء</option>
                    <option value="QUICK_REPLY">رد سريع</option>
                    <option value="URL">رابط</option>
                    <option value="PHONE">اتصال</option>
                  </select>
                </label>
                {form.buttonType === "QUICK_REPLY" ? (
                  <label>
                    <span>نص الزر</span>
                    <input value={form.buttonText} onChange={(event) => setForm((current) => ({ ...current, buttonText: event.target.value }))} placeholder="مثال: اطلب الان" />
                  </label>
                ) : null}
                {form.buttonType === "PHONE" ? (
                  <div className="template-action-grid">
                    <label>
                      <span>نوع الإجراء</span>
                      <select value="PHONE" disabled>
                        <option value="PHONE">اتصال برقم الهاتف</option>
                      </select>
                    </label>
                    <label>
                      <span>نص الزر</span>
                      <input value={form.buttonText} onChange={(event) => setForm((current) => ({ ...current, buttonText: event.target.value }))} placeholder="اتصل" />
                    </label>
                    <label>
                      <span>رقم الهاتف</span>
                      <input dir="ltr" value={form.buttonPhone} onChange={(event) => setForm((current) => ({ ...current, buttonPhone: event.target.value }))} placeholder="966500000000" />
                    </label>
                  </div>
                ) : null}
                {form.buttonType === "URL" ? (
                  <div className="template-action-grid">
                    <label>
                      <span>نوع الإجراء</span>
                      <select value="URL" disabled>
                        <option value="URL">فتح رابط</option>
                      </select>
                    </label>
                    <label>
                      <span>نص الزر</span>
                      <input value={form.buttonText} onChange={(event) => setForm((current) => ({ ...current, buttonText: event.target.value }))} placeholder="افتح الرابط" />
                    </label>
                    <label>
                      <span>الرابط</span>
                      <input dir="ltr" value={form.buttonUrl} onChange={(event) => setForm((current) => ({ ...current, buttonUrl: event.target.value }))} placeholder="https://example.com" />
                    </label>
                  </div>
                ) : null}
                <button
                  className="template-add-button"
                  type="button"
                  onClick={() => {
                    if (form.buttonType === "NONE") {
                      setForm((current) => ({
                        ...current,
                        buttonType: "QUICK_REPLY",
                        buttonText: current.buttonText || defaultButtonText("QUICK_REPLY")
                      }));
                    }
                  }}
                >
                  إضافة زر جديد
                </button>
                <div className="template-meta-status">
                  <span>حالة Meta</span>
                  <b className={form.status === "معتمد" ? "state ok" : form.status === "مرفوض" ? "state off" : "state warn"}>{form.status}</b>
                  <small>تتحدث تلقائيًا من Meta عند الضغط على تحديث الحالة.</small>
                </div>
                {error ? <p className="form-error">{error}</p> : null}
              </div>
              <TemplatePreview form={form} />
            </div>
            <footer className="template-modal-foot">
              {form.editing ? <button className="btn danger" type="button" onClick={() => deleteTemplate(form)}>حذف القالب</button> : null}
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : form.editing ? "حفظ" : "إرسال إلى Meta"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function TemplatePreview({ form }: { form: TemplateFormState }) {
  return (
    <div className="template-preview">
      <div className="template-phone">
        <div className="template-bubble">
          {form.headerType === "IMAGE" ? <div className="template-media">{form.headerMedia || "صورة القالب"}</div> : null}
          {form.headerType === "VIDEO" ? <div className="template-media">VIDEO</div> : null}
          {form.headerType === "TEXT" && form.headerText ? <b>{form.headerText}</b> : null}
          <p>{form.message || "اكتب محتوى القالب هنا"}</p>
          {form.footer ? <small>{form.footer}</small> : null}
          {form.buttonType !== "NONE" && form.buttonText ? <button type="button">{buttonIcon(form.buttonType)} {form.buttonText}</button> : null}
          <time>07:26</time>
        </div>
      </div>
    </div>
  );
}

function defaultButtonText(buttonType: TemplateFormState["buttonType"]) {
  if (buttonType === "PHONE") return "اتصل";
  if (buttonType === "URL") return "افتح الرابط";
  if (buttonType === "QUICK_REPLY") return "اطلب الان";
  return "";
}

function buttonIcon(buttonType: TemplateFormState["buttonType"]) {
  if (buttonType === "PHONE") return "☎";
  if (buttonType === "URL") return "↗";
  if (buttonType === "QUICK_REPLY") return "↩";
  return "";
}

function normalizeTemplateName(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_");
}
