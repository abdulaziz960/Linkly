"use client";

import { FormEvent, useMemo, useState } from "react";
import type { MessageTemplate } from "../types";
import { useLanguage } from "../i18n";

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

function templateStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "معتمد") return t("معتمد", "Approved");
  if (status === "مرفوض") return t("مرفوض", "Rejected");
  if (status === "قيد المراجعة") return t("قيد المراجعة", "Pending review");
  return status;
}

export default function TemplatesView({
  onRefreshData,
  templates,
  whatsappConnected
}: {
  onRefreshData: () => Promise<void>;
  templates: MessageTemplate[];
  whatsappConnected: boolean;
}) {
  const { t, language } = useLanguage();
  const emptyForm = useMemo<TemplateFormState>(
    () => ({
      name: "",
      message: "",
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

  const visibleTemplates = whatsappConnected ? templates : [];
  const approvedCount = visibleTemplates.filter((template) => template.status === "معتمد").length;
  const pendingCount = visibleTemplates.filter((template) => template.status === "قيد المراجعة").length;
  const rejectedCount = visibleTemplates.filter((template) => template.status === "مرفوض").length;
  const lastSync = visibleTemplates.find((template) => template.syncedAt && template.syncedAt !== "-")?.syncedAt || "-";

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
      setError(payload.error || t("تعذر حفظ القالب", "Unable to save the template"));
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
    if (!payload.ok) setError(payload.error || t("تعذر التحديث من Meta", "Unable to sync from Meta"));
    await onRefreshData();
    setSyncing(false);
  }

  async function deleteTemplate(template: MessageTemplate) {
    if (!window.confirm(t(`حذف قالب ${template.name}؟`, `Delete the "${template.name}" template?`))) return;
    await fetch(`/api/templates/${encodeURIComponent(template.name)}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="stats-grid">
        <div className="stat"><span>{t("القوالب المعتمدة", "Approved templates")}</span><b>{approvedCount}</b><small>{t("جاهزة للإرسال", "Ready to send")}</small></div>
        <div className="stat"><span>{t("بانتظار المراجعة", "Awaiting review")}</span><b>{pendingCount}</b><small>{t("لدى Meta", "With Meta")}</small></div>
        <div className="stat"><span>{t("آخر مزامنة", "Last sync")}</span><b>{lastSync}</b><small>{t("من قوالب Meta", "From Meta templates")}</small></div>
        <div className="stat"><span>{t("مرفوضة", "Rejected")}</span><b>{rejectedCount}</b><small>{t("تحتاج تعديل", "Needs changes")}</small></div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>{t("قوالب واتساب", "WhatsApp Templates")}</h2>
          <span />
          <button className="btn soft" type="button" onClick={syncTemplatesFromMeta} disabled={syncing || !whatsappConnected}>{syncing ? t("جاري التحديث", "Syncing") : t("تحديث الحالة من Meta", "Sync status from Meta")}</button>
          <button className="btn primary" type="button" onClick={openCreateForm} disabled={!whatsappConnected}>{t("إنشاء قالب", "Create template")}</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {!whatsappConnected ? (
          <p className="form-error">{t("اربط قناة واتساب من الإعدادات أولاً حتى تظهر القوالب.", "Connect a WhatsApp channel from Settings first for templates to show up.")}</p>
        ) : (
          <div className="panel-body table-wrap">
            <table>
              <thead><tr><th>{t("القالب", "Template")}</th><th>{t("الفئة", "Category")}</th><th>{t("اللغة", "Language")}</th><th>{t("الحالة من Meta", "Meta status")}</th><th>{t("آخر مزامنة", "Last sync")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.name}>
                    <td>
                      <b>{template.name}</b>
                      <span className="table-subtitle">{template.message}</span>
                    </td>
                    <td>{template.category || (template.type === "تسويق" ? "MARKETING" : "UTILITY")}</td>
                    <td>{template.language}</td>
                    <td><span className={template.status === "معتمد" ? "state ok" : template.status === "مرفوض" ? "state off" : "state warn"}>{templateStatusLabel(template.status || "", t)}</span></td>
                    <td>{template.syncedAt || "-"}</td>
                    <td className="row-actions">
                      <button className="btn soft" type="button" onClick={() => openEditForm(template)}>{t("عرض", "View")}</button>
                      <button className="btn danger" type="button" onClick={() => deleteTemplate(template)}>{t("حذف", "Delete")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal template-modal" role="dialog" aria-modal="true" aria-label={t("حفظ قالب واتساب", "Save WhatsApp template")} onSubmit={submitTemplate} onClick={(event) => event.stopPropagation()}>
            <button className="template-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
            <div className="template-modal-body">
              <div className="template-editor">
                <h2>{t("قوالب الواتساب", "WhatsApp Templates")}</h2>
                <p>Edit your Template</p>
                <label>
                  <span>{t("الاسم", "Name")}</span>
                  <input
                    dir="ltr"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: normalizeTemplateName(event.target.value) }))}
                    required
                    disabled={form.editing}
                    pattern={templateNamePattern}
                    placeholder="welcome_message"
                  />
                  <small className="field-hint">{t("حسب سياسة Meta: حروف إنجليزية صغيرة، أرقام، وشرطة سفلية فقط. مثال: welcome_message", "Per Meta's policy: lowercase letters, numbers, and underscores only. Example: welcome_message")}</small>
                </label>
                <label>
                  <span>{t("الفئة", "Category")}</span>
                  <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as TemplateFormState["category"], type: event.target.value === "MARKETING" ? "تسويق" : "خدمة" }))}>
                    <option value="UTILITY">UTILITY</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </label>
                <label>
                  <span>{t("اللغة", "Language")}</span>
                  <select value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}>
                    {languages.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t("نوع العنوان", "Header type")}</span>
                  <select value={form.headerType} onChange={(event) => setForm((current) => ({ ...current, headerType: event.target.value as TemplateFormState["headerType"] }))}>
                    <option value="NONE">{t("لا شيء", "None")}</option>
                    <option value="TEXT">{t("نص", "Text")}</option>
                  </select>
                  <small className="field-hint">{t("عناوين الصور والفيديو غير مدعومة حاليًا في الإرسال إلى Meta.", "Image and video headers aren't currently supported when submitting to Meta.")}</small>
                </label>
                {form.headerType === "TEXT" ? (
                  <label>
                    <span>{t("نص العنوان", "Header text")}</span>
                    <input value={form.headerText} onChange={(event) => setForm((current) => ({ ...current, headerText: event.target.value }))} />
                  </label>
                ) : null}
                <label>
                  <span>{t("المحتوى", "Content")}</span>
                  <textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} rows={5} required />
                </label>
                <label>
                  <span>{t("تذييل الصفحة (اختياري)", "Footer (optional)")}</span>
                  <input value={form.footer} onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))} />
                </label>
                <label>
                  <span>{t("زر (اختياري)", "Button (optional)")}</span>
                  <select
                    value={form.buttonType}
                    onChange={(event) => {
                      const buttonType = event.target.value as TemplateFormState["buttonType"];
                      setForm((current) => ({
                        ...current,
                        buttonType,
                        buttonText: buttonType === "NONE" ? "" : current.buttonText || defaultButtonText(buttonType, t),
                        buttonPhone: buttonType === "PHONE" ? current.buttonPhone : "",
                        buttonUrl: buttonType === "URL" ? current.buttonUrl : ""
                      }));
                    }}
                  >
                    <option value="NONE">{t("لا شيء", "None")}</option>
                    <option value="QUICK_REPLY">{t("رد سريع", "Quick reply")}</option>
                    <option value="URL">{t("رابط", "URL")}</option>
                    <option value="PHONE">{t("اتصال", "Call")}</option>
                  </select>
                </label>
                {form.buttonType === "QUICK_REPLY" ? (
                  <label>
                    <span>{t("نص الزر", "Button text")}</span>
                    <input value={form.buttonText} onChange={(event) => setForm((current) => ({ ...current, buttonText: event.target.value }))} placeholder={t("مثال: اطلب الان", "Example: Order now")} />
                  </label>
                ) : null}
                {form.buttonType === "PHONE" ? (
                  <div className="template-action-grid">
                    <label>
                      <span>{t("نوع الإجراء", "Action type")}</span>
                      <select value="PHONE" disabled>
                        <option value="PHONE">{t("اتصال برقم الهاتف", "Call phone number")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("نص الزر", "Button text")}</span>
                      <input value={form.buttonText} onChange={(event) => setForm((current) => ({ ...current, buttonText: event.target.value }))} placeholder={t("اتصل", "Call")} />
                    </label>
                    <label>
                      <span>{t("رقم الهاتف", "Phone number")}</span>
                      <input dir="ltr" value={form.buttonPhone} onChange={(event) => setForm((current) => ({ ...current, buttonPhone: event.target.value }))} placeholder="966500000000" />
                    </label>
                  </div>
                ) : null}
                {form.buttonType === "URL" ? (
                  <div className="template-action-grid">
                    <label>
                      <span>{t("نوع الإجراء", "Action type")}</span>
                      <select value="URL" disabled>
                        <option value="URL">{t("فتح رابط", "Open URL")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("نص الزر", "Button text")}</span>
                      <input value={form.buttonText} onChange={(event) => setForm((current) => ({ ...current, buttonText: event.target.value }))} placeholder={t("افتح الرابط", "Open the link")} />
                    </label>
                    <label>
                      <span>{t("الرابط", "URL")}</span>
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
                        buttonText: current.buttonText || defaultButtonText("QUICK_REPLY", t)
                      }));
                    }
                  }}
                >
                  {t("إضافة زر جديد", "Add new button")}
                </button>
                <div className="template-meta-status">
                  <span>{t("حالة Meta", "Meta status")}</span>
                  <b className={form.status === "معتمد" ? "state ok" : form.status === "مرفوض" ? "state off" : "state warn"}>{templateStatusLabel(form.status, t)}</b>
                  <small>{t("تتحدث تلقائيًا من Meta عند الضغط على تحديث الحالة.", "Updates automatically from Meta when you click sync status.")}</small>
                </div>
                {error ? <p className="form-error">{error}</p> : null}
              </div>
              <TemplatePreview form={form} language={language} t={t} />
            </div>
            <footer className="template-modal-foot">
              {form.editing ? <button className="btn danger" type="button" onClick={() => deleteTemplate(form)}>{t("حذف القالب", "Delete template")}</button> : null}
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : form.editing ? t("حفظ", "Save") : t("إرسال إلى Meta", "Submit to Meta")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function TemplatePreview({ form, t }: { form: TemplateFormState; language: string; t: (ar: string, en: string) => string }) {
  return (
    <div className="template-preview">
      <div className="template-phone">
        <div className="template-bubble">
          {form.headerType === "IMAGE" ? <div className="template-media">{form.headerMedia || t("صورة القالب", "Template image")}</div> : null}
          {form.headerType === "VIDEO" ? <div className="template-media">VIDEO</div> : null}
          {form.headerType === "TEXT" && form.headerText ? <b>{form.headerText}</b> : null}
          <p>{form.message || t("اكتب محتوى القالب هنا", "Write the template content here")}</p>
          {form.footer ? <small>{form.footer}</small> : null}
          {form.buttonType !== "NONE" && form.buttonText ? <button type="button">{buttonIcon(form.buttonType)} {form.buttonText}</button> : null}
          <time>07:26</time>
        </div>
      </div>
    </div>
  );
}

function defaultButtonText(buttonType: TemplateFormState["buttonType"], t: (ar: string, en: string) => string) {
  if (buttonType === "PHONE") return t("اتصل", "Call");
  if (buttonType === "URL") return t("افتح الرابط", "Open the link");
  if (buttonType === "QUICK_REPLY") return t("اطلب الان", "Order now");
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
