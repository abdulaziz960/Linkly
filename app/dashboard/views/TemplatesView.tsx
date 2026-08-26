"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import type { MessageTemplate } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

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
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const visibleTemplates = whatsappConnected ? templates : [];
  const approvedCount = visibleTemplates.filter((template) => template.status === "معتمد").length;
  const pendingCount = visibleTemplates.filter((template) => template.status === "قيد المراجعة").length;
  const rejectedCount = visibleTemplates.filter((template) => template.status === "مرفوض").length;

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
            <div className="template-topbar">
              <div className="template-topbar-title">
                <button className="template-back" type="button" aria-label={t("رجوع", "Back")} onClick={() => setFormOpen(false)}>{t("→", "←")}</button>
                <h2>{form.editing ? t("تعديل القالب", "Edit template") : t("قالب جديد", "New template")}</h2>
              </div>
              <div className="template-topbar-actions">
                {form.editing ? <button className="btn soft" type="button" onClick={() => deleteTemplate(form)}>{t("حذف القالب", "Delete template")}</button> : null}
                <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : form.editing ? t("حفظ", "Save") : t("إرسال إلى Meta", "Submit to Meta")}</button>
              </div>
            </div>
            <div className="template-modal-body">
              <div className="template-editor">
                <div className="template-section">
                  <div className="template-basics-row">
                    <label>
                      <span>{t("اسم القالب", "Template name")}</span>
                      <input
                        dir="ltr"
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: normalizeTemplateName(event.target.value) }))}
                        required
                        disabled={form.editing}
                        pattern={templateNamePattern}
                        placeholder="welcome_message"
                      />
                    </label>
                    <label>
                      <span>{t("الفئة", "Category")}</span>
                      <CustomSelect
                        value={form.category}
                        onChange={(value) => setForm((current) => ({ ...current, category: value as TemplateFormState["category"], type: value === "MARKETING" ? "تسويق" : "خدمة" }))}
                        options={[
                          { value: "UTILITY", label: "UTILITY" },
                          { value: "MARKETING", label: "MARKETING" },
                          { value: "AUTHENTICATION", label: "AUTHENTICATION" }
                        ]}
                      />
                    </label>
                    <label>
                      <span>{t("اللغة", "Language")}</span>
                      <CustomSelect
                        value={form.language}
                        onChange={(value) => setForm((current) => ({ ...current, language: value }))}
                        options={languages.map((lang) => ({ value: lang.value, label: lang.label }))}
                      />
                    </label>
                  </div>
                  <small className="field-hint">{t("حسب سياسة Meta: حروف إنجليزية صغيرة، أرقام، وشرطة سفلية فقط. مثال: welcome_message", "Per Meta's policy: lowercase letters, numbers, and underscores only. Example: welcome_message")}</small>
                </div>

                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("اختر نوع القالب", "Select template type")}</h3>
                  </div>
                  <div className="template-type-grid">
                    <button type="button" className="template-type-card active" aria-pressed="true">
                      <span className="template-type-icon">{DocIcon}</span>
                      {t("قياسي", "Standard")}
                    </button>
                    <button type="button" className="template-type-card" disabled title={t("قريبًا", "Coming soon")}>
                      <span className="template-type-soon">{t("قريبًا", "Soon")}</span>
                      <span className="template-type-icon">{CatalogIcon}</span>
                      {t("كتالوج", "Catalog")}
                    </button>
                    <button type="button" className="template-type-card" disabled title={t("قريبًا", "Coming soon")}>
                      <span className="template-type-soon">{t("قريبًا", "Soon")}</span>
                      <span className="template-type-icon">{CarouselIcon}</span>
                      {t("عرض متعدد", "Carousel")}
                    </button>
                    <button type="button" className="template-type-card" disabled title={t("قريبًا", "Coming soon")}>
                      <span className="template-type-soon">{t("قريبًا", "Soon")}</span>
                      <span className="template-type-icon">{OfferIcon}</span>
                      {t("عرض محدود", "Limited offer")}
                    </button>
                  </div>
                </div>

                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("عنوان القالب (اختياري)", "Header (optional)")}</h3>
                    <small>{t("أبرز رسالتك بنص واضح أعلى المحتوى", "Highlight your message with clear text above the content")}</small>
                  </div>
                  <div className="template-radio-row">
                    <label className="template-radio">
                      <input type="radio" name="headerType" checked={form.headerType === "NONE"} onChange={() => setForm((current) => ({ ...current, headerType: "NONE" }))} />
                      {t("بدون", "None")}
                    </label>
                    <label className="template-radio">
                      <input type="radio" name="headerType" checked={form.headerType === "TEXT"} onChange={() => setForm((current) => ({ ...current, headerType: "TEXT" }))} />
                      {t("نص", "Text")}
                    </label>
                    <label className="template-radio disabled" title={t("قريبًا", "Coming soon")}>
                      <input type="radio" name="headerType" disabled />
                      {t("صورة", "Image")}
                    </label>
                    <label className="template-radio disabled" title={t("قريبًا", "Coming soon")}>
                      <input type="radio" name="headerType" disabled />
                      {t("فيديو", "Video")}
                    </label>
                    <label className="template-radio disabled" title={t("قريبًا", "Coming soon")}>
                      <input type="radio" name="headerType" disabled />
                      {t("مستند", "Document")}
                    </label>
                  </div>
                  {form.headerType === "TEXT" ? (
                    <input value={form.headerText} onChange={(event) => setForm((current) => ({ ...current, headerText: event.target.value }))} placeholder={t("مثال: عرض اليوم فقط!", "Example: Today only!")} />
                  ) : null}
                </div>

                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("المحتوى", "Body")}</h3>
                    <button
                      className="template-variable-btn"
                      type="button"
                      onClick={() => insertAtCursor(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "{{1}}")}
                    >
                      {PlusIcon}
                      {t("إضافة متغيّر", "Add variable")}
                    </button>
                  </div>
                  <small className="field-hint">{t("خصص رسالتك بمتغيرات مثل {{1}} لزيادة معدل الرد.", "Personalize your message with variables like {{1}} to get more replies.")}</small>
                  <div className="template-body-field">
                    <div className="template-toolbar">
                      <button type="button" title={t("عريض", "Bold")} onClick={() => wrapSelection(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "*")}>{BoldIcon}</button>
                      <button type="button" title={t("مائل", "Italic")} onClick={() => wrapSelection(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "_")}>{ItalicIcon}</button>
                      <button type="button" title={t("يتوسطه خط", "Strikethrough")} onClick={() => wrapSelection(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "~")}>{StrikeIcon}</button>
                      <span className="template-toolbar-count">{form.message.length}/1024</span>
                    </div>
                    <textarea
                      ref={bodyRef}
                      value={form.message}
                      onChange={(event) => setForm((current) => ({ ...current, message: event.target.value.slice(0, 1024) }))}
                      rows={6}
                      maxLength={1024}
                      placeholder={t("اكتب محتوى الرسالة هنا...", "Write your template message…")}
                      required
                    />
                  </div>
                </div>

                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("تذييل الصفحة (اختياري)", "Footer (optional)")}</h3>
                    <small>{t("إخلاء مسؤولية أو ملاحظة قصيرة", "A disclaimer or a short note")}</small>
                  </div>
                  <input value={form.footer} onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))} placeholder={t("مثال: هذه رسالة آلية", "Example: This is an automated message")} />
                </div>

                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("الأزرار (اختياري)", "Buttons (optional)")}</h3>
                  </div>
                  <label>
                    <span>{t("نوع الزر", "Button type")}</span>
                    <CustomSelect
                      value={form.buttonType}
                      onChange={(value) => {
                        const buttonType = value as TemplateFormState["buttonType"];
                        setForm((current) => ({
                          ...current,
                          buttonType,
                          buttonText: buttonType === "NONE" ? "" : current.buttonText || defaultButtonText(buttonType, t),
                          buttonPhone: buttonType === "PHONE" ? current.buttonPhone : "",
                          buttonUrl: buttonType === "URL" ? current.buttonUrl : ""
                        }));
                      }}
                      options={[
                        { value: "NONE", label: t("لا شيء", "None") },
                        { value: "QUICK_REPLY", label: t("رد سريع", "Quick reply") },
                        { value: "URL", label: t("رابط", "URL") },
                        { value: "PHONE", label: t("اتصال", "Call") }
                      ]}
                    />
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
                        <CustomSelect value="PHONE" disabled options={[{ value: "PHONE", label: t("اتصال برقم الهاتف", "Call phone number") }]} />
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
                        <CustomSelect value="URL" disabled options={[{ value: "URL", label: t("فتح رابط", "Open URL") }]} />
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
                </div>

                <div className="template-section">
                  <div className="template-meta-status">
                    <span>{t("حالة Meta", "Meta status")}</span>
                    <b className={form.status === "معتمد" ? "state ok" : form.status === "مرفوض" ? "state off" : "state warn"}>{templateStatusLabel(form.status, t)}</b>
                    <small>{t("تتحدث تلقائيًا من Meta عند الضغط على تحديث الحالة.", "Updates automatically from Meta when you click sync status.")}</small>
                  </div>
                  {error ? <p className="form-error">{error}</p> : null}
                </div>
              </div>
              <div className="template-preview">
                <span className="template-preview-label">{t("معاينة", "Preview")}</span>
                <TemplatePreview form={form} language={language} t={t} />
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (value: string) => void,
  insert: string
) {
  const el = ref.current;
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = (value.slice(0, start) + insert + value.slice(end)).slice(0, 1024);
  setValue(next);
  window.requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(start + insert.length, start + insert.length);
  });
}

function wrapSelection(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (value: string) => void,
  marker: string
) {
  const el = ref.current;
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const selected = value.slice(start, end);
  const next = (value.slice(0, start) + marker + selected + marker + value.slice(end)).slice(0, 1024);
  setValue(next);
  window.requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(start + marker.length, start + marker.length + selected.length);
  });
}

const DocIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></svg>
);
const CatalogIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);
const CarouselIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="6" height="12" rx="1" /><rect x="9" y="4" width="6" height="16" rx="1" /><rect x="16" y="6" width="6" height="12" rx="1" /></svg>
);
const OfferIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1" /></svg>
);
const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
);
const BoldIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" /></svg>
);
const ItalicIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M19 4h-9M14 20H5M15 4 9 20" /></svg>
);
const StrikeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M17 4H8a3.5 3.5 0 0 0 0 7h3M6.5 17a3.5 3.5 0 0 0 3.5 3h5a3.5 3.5 0 0 0 0-7M3 12h18" /></svg>
);
const BackArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7M5 12h14" /></svg>
);
const CheckShieldIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Zm-1.2 13.6-3.4-3.4 1.4-1.4 2 2 4.6-4.6 1.4 1.4-6 6Z" /></svg>
);
const InfoIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".15" /><path d="M11 10h2v7h-2zM11 7h2v2h-2z" /></svg>
);
const AttachIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" /></svg>
);
const CameraIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" /><circle cx="12" cy="13" r="4" /></svg>
);
const MicIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" /></svg>
);
const HeadsetIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 15a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3v4Z" /><path d="M3 15a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H3v4Z" /></svg>
);
const VideoCallIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m23 7-7 5 7 5V7Z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
);
const PhoneCallSmallIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>
);
const MoreIcon = (
  <svg viewBox="0 0 24 24" fill="#fff"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
const SignalIcon = (
  <svg viewBox="0 0 24 24" fill="#fff"><rect x="2" y="14" width="3" height="6" rx=".5" /><rect x="8" y="10" width="3" height="10" rx=".5" /><rect x="14" y="6" width="3" height="14" rx=".5" /><rect x="20" y="2" width="3" height="18" rx=".5" /></svg>
);
const WifiIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r="1" fill="#fff" stroke="none" /></svg>
);
const BatteryIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><rect x="1" y="7" width="19" height="10" rx="2.5" /><rect x="3" y="9" width="13" height="6" fill="#fff" stroke="none" /><path d="M22 10v4" stroke="#fff" /></svg>
);
const ExternalLinkIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></svg>
);
const ReplyArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5M4 12h11a4 4 0 0 1 0 8h-1" /></svg>
);

function TemplatePreview({ form, t }: { form: TemplateFormState; language: string; t: (ar: string, en: string) => string }) {
  const now = new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" }).format(new Date());
  return (
    <div className="template-phone-frame">
    <span className="template-phone-btn volume-up" />
    <span className="template-phone-btn volume-down" />
    <span className="template-phone-btn power" />
    <div className="template-phone">
      <span className="template-phone-island" />
      <div className="template-phone-status">
        <span>{now}</span>
        <span className="template-phone-status-icons">{SignalIcon}{WifiIcon}{BatteryIcon}</span>
      </div>
      <div className="template-phone-header">
        {BackArrowIcon}
        <span className="template-phone-avatar">{HeadsetIcon}</span>
        <span className="template-phone-name">
          {t("نشاطك التجاري", "Your business")}
          {CheckShieldIcon}
        </span>
        <span className="template-phone-status-icons">{VideoCallIcon}{PhoneCallSmallIcon}{MoreIcon}</span>
      </div>
      <div className="template-phone-body">
        <p className="template-phone-notice">
          {InfoIcon}
          {t("هذا النشاط يستخدم خدمة آمنة من Meta لإدارة هذه المحادثة. اضغط لمعرفة المزيد", "This business uses a secure service from Meta to manage this chat. Tap to learn more")}
        </p>
        <div className="template-bubble">
          {form.headerType === "IMAGE" ? <div className="template-media">{form.headerMedia || t("صورة القالب", "Template image")}</div> : null}
          {form.headerType === "VIDEO" ? <div className="template-media">VIDEO</div> : null}
          {form.headerType === "TEXT" && form.headerText ? <b>{form.headerText}</b> : null}
          <p>{form.message || t("اكتب محتوى القالب هنا", "Write the template content here")}</p>
          {form.footer ? <small>{form.footer}</small> : null}
          {form.buttonType !== "NONE" && form.buttonText ? <button type="button">{buttonIcon(form.buttonType)}{form.buttonText}</button> : null}
          <time>{now}</time>
        </div>
      </div>
      <div className="template-phone-composer">
        {AttachIcon}
        <span />
        {CameraIcon}
        {MicIcon}
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
  if (buttonType === "PHONE") return PhoneCallSmallIcon;
  if (buttonType === "URL") return ExternalLinkIcon;
  if (buttonType === "QUICK_REPLY") return ReplyArrowIcon;
  return null;
}

function normalizeTemplateName(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_");
}
