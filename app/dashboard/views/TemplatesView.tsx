"use client";

import { useUnsavedChanges } from "../use-unsaved-changes";
import { useDataLoading } from "../data-loading-context";
import { EmptyState } from "../components/StateBlocks";

import { CATALOG_TEMPLATE_DEFAULT_BUTTON, CATALOG_TEMPLATE_PREFIX, isCatalogTemplateName } from "../../../lib/catalog-template-shared";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import type { MessageTemplate } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { DonutChart } from "../components/MiniCharts";

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
  headerMediaDataUrl: string;
  /** The saved copy's public address (what Meta fetches on every send); empty when there is no copy. */
  headerMediaUrl: string;
  footer: string;
  buttonType: NonNullable<MessageTemplate["buttonType"]>;
  buttonText: string;
  buttonPhone: string;
  buttonUrl: string;
  lastUsed: string;
  editing: boolean;
  bodyExamples: Record<string, string>;
  buttonUrlExample: string;
};

// A URL button ending in "{{1}}" is a dynamic per-send suffix - lets a
// campaign's tracking link be sent as a real button instead of plain text
// inside the message body (see sendWhatsAppTemplate in lib/campaign-engine.ts).
const dynamicButtonUrlPattern = /\{\{\s*1\s*\}\}\s*$/;

// Meta rejects a template whose body starts or ends with a variable outright
// (no preview can render around it) - catching it here saves a round trip
// to their API for a mistake the create/edit form can flag immediately.
const edgePlaceholderPattern = /^\s*\{\{\s*[a-zA-Z0-9_]+\s*\}\}|\{\{\s*[a-zA-Z0-9_]+\s*\}\}\s*$/;

function extractPlaceholders(text: string) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      ordered.push(match[1]);
    }
  }
  return ordered;
}

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

type CarouselCardForm = { id: string; imageDataUrl: string; body: string; buttons: Array<{ text: string; url: string }> };
const newCarouselCard = (): CarouselCardForm => ({ id: `card-${Math.random().toString(36).slice(2, 10)}`, imageDataUrl: "", body: "", buttons: [] });

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
      headerMediaDataUrl: "",
      headerMediaUrl: "",
      footer: "",
      buttonType: "NONE",
      buttonText: "",
      buttonPhone: "",
      buttonUrl: "",
      lastUsed: "-",
      editing: false,
      bodyExamples: {},
      buttonUrlExample: ""
    }),
    []
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const dataLoading = useDataLoading();
  const { confirmClose: confirmCloseForm } = useUnsavedChanges(formOpen, form, t);
  async function requestCloseForm() {
    if (await confirmCloseForm()) setFormOpen(false);
  }
  // A multi-card (carousel) template is built from these cards; the buttons layout is shared by every card.
  const [carouselMode, setCarouselMode] = useState(false);
  const [carouselCards, setCarouselCards] = useState<CarouselCardForm[]>(() => [newCarouselCard(), newCarouselCard()]);
  const [carouselLayout, setCarouselLayout] = useState<Array<"QUICK_REPLY" | "URL">>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyPlaceholders = useMemo(() => extractPlaceholders(form.message), [form.message]);

  function updateCard(id: string, patch: Partial<CarouselCardForm>) {
    setCarouselCards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  }

  function updateCardButton(id: string, slot: number, patch: Partial<{ text: string; url: string }>) {
    setCarouselCards((current) => current.map((card) => {
      if (card.id !== id) return card;
      const buttons = [...card.buttons];
      buttons[slot] = { ...(buttons[slot] || { text: "", url: "" }), ...patch };
      return { ...card, buttons };
    }));
  }

  function handleCardImage(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError(t("الصورة أكبر من 4 ميجابايت.", "The image is larger than 4 MB."));
      event.target.value = "";
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => updateCard(id, { imageDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  function startCarouselKind() {
    setCarouselMode(true);
    setForm((current) => ({ ...current, category: "MARKETING", type: "تسويق", name: isCatalogTemplateName(current.name) ? current.name.slice(CATALOG_TEMPLATE_PREFIX.length) : current.name, headerType: "NONE", footer: "", buttonType: "NONE" }));
  }

  function handleHeaderImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const limitMb = form.headerType === "VIDEO" ? 16 : 5;
    if (file.size > limitMb * 1024 * 1024) {
      setError(t(`حجم الملف (${(file.size / 1024 / 1024).toFixed(1)} ميجابايت) أكبر من الحد المسموح في واتساب (${limitMb} ميجابايت). صغّره ثم أعد المحاولة.`, `The file (${(file.size / 1024 / 1024).toFixed(1)} MB) is larger than WhatsApp's ${limitMb} MB limit. Make it smaller and try again.`));
      event.target.value = "";
      return;
    }
    if (form.headerType === "IMAGE" && file.type && !["image/jpeg", "image/png"].includes(file.type)) {
      setError(t("صيغة الصورة غير مدعومة. استخدم JPG أو PNG.", "Unsupported image format. Use JPG or PNG."));
      event.target.value = "";
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setForm((current) => ({ ...current, headerMedia: dataUrl, headerMediaDataUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  const [savingMedia, setSavingMedia] = useState(false);
  // Attaches the chosen file to the existing template without touching Meta (no resubmission, no new review).
  async function saveMediaOnly() {
    if (!form.headerMedia.startsWith("data:")) return;
    setSavingMedia(true);
    setError("");
    const response = await fetch(`/api/templates/${encodeURIComponent(form.name)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headerMediaDataUrl: form.headerMedia })
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { headerMediaUrl?: string }; error?: string } | null;
    setSavingMedia(false);
    if (!response?.ok || !payload?.ok || !payload.data?.headerMediaUrl) {
      setError(payload?.error || t("تعذر حفظ الملف", "Could not save the file"));
      return;
    }
    setForm((current) => ({ ...current, headerMedia: "", headerMediaDataUrl: "", headerMediaUrl: payload.data?.headerMediaUrl || "" }));
    await onRefreshData();
  }

  function handleRemoveHeaderMedia() {
    setForm((current) => ({ ...current, headerMedia: "", headerMediaDataUrl: "" }));
  }

  const visibleTemplates = whatsappConnected ? templates : [];
  const [statusFilter, setStatusFilter] = useState<"all" | "معتمد" | "قيد المراجعة" | "مرفوض">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "MARKETING" | "UTILITY" | "AUTHENTICATION">("all");
  const [listSearch, setListSearch] = useState("");
  const approvedCount = visibleTemplates.filter((template) => template.status === "معتمد").length;
  const pendingCount = visibleTemplates.filter((template) => template.status === "قيد المراجعة").length;
  const rejectedCount = visibleTemplates.filter((template) => template.status === "مرفوض").length;

  function openCreateForm() {
    setError("");
    setCarouselMode(false);
    setCarouselCards([newCarouselCard(), newCarouselCard()]);
    setCarouselLayout([]);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(template: MessageTemplate) {
    setError("");
    if (template.carouselCards) {
      setError(t("القوالب متعددة العرض لا تُعدَّل بعد إرسالها لمراجعة Meta. احذف القالب وأنشئه من جديد.", "Carousel templates can't be edited once sent for Meta's review. Delete it and create a new one."));
      return;
    }
    setCarouselMode(false);
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
      headerMediaDataUrl: "",
      headerMediaUrl: template.headerMediaUrl || "",
      footer: template.footer || "",
      buttonType: template.buttonType || "NONE",
      buttonText: template.buttonText || "",
      buttonPhone: template.buttonPhone || "",
      buttonUrl: template.buttonUrl || "",
      lastUsed: template.lastUsed || "-",
      editing: true,
      bodyExamples: {},
      buttonUrlExample: ""
    });
    setFormOpen(true);
  }

  const isCatalogForm = isCatalogTemplateName(form.name);

  // The catalog kind is a normal template named catalog_* with one quick-reply
  // button; tapping it opens the dashboard catalog (see lib/catalog-template.ts).
  function chooseTemplateKind(catalog: boolean) {
    setForm((current) => {
      if (catalog) {
        return {
          ...current,
          name: isCatalogTemplateName(current.name) ? current.name : `${CATALOG_TEMPLATE_PREFIX}${current.name}`,
          buttonType: "QUICK_REPLY",
          buttonText: current.buttonType === "QUICK_REPLY" && current.buttonText ? current.buttonText : CATALOG_TEMPLATE_DEFAULT_BUTTON,
          buttonPhone: "",
          buttonUrl: "",
          message: current.message || t("أهلًا بك 👋 اطلع على منتجاتنا واختر ما يعجبك.", "Hi 👋 take a look at our products and pick what you like.")
        };
      }
      return { ...current, name: isCatalogTemplateName(current.name) ? current.name.slice(CATALOG_TEMPLATE_PREFIX.length) : current.name };
    });
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (edgePlaceholderPattern.test(form.message)) {
      setError(t("يجب ألا تكون المتغيرات في بداية القالب أو نهايته - أضف كلمة أو رمز قبل أول متغير وبعد آخر متغير.", "Variables can't be at the very start or end of the template - add a word or character before the first and after the last one."));
      return;
    }

    if (carouselMode && carouselCards.some((card) => !card.imageDataUrl || !card.body.trim())) {
      setError(t("كل بطاقة تحتاج صورة ونصًا.", "Every card needs an image and a text."));
      return;
    }

    setSaving(true);

    const carouselBody = carouselMode
      ? {
          carousel: carouselCards.map((card) => ({
            imageDataUrl: card.imageDataUrl,
            body: card.body,
            buttons: carouselLayout.map((type, slot) => ({ type, text: card.buttons[slot]?.text || "", ...(type === "URL" ? { url: card.buttons[slot]?.url || "" } : {}) }))
          }))
        }
      : {};
    const response = await fetch(form.editing ? `/api/templates/${encodeURIComponent(form.name)}` : "/api/templates", {
      method: form.editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...carouselBody })
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
    setSyncNotice("");
    // Without try/finally, a network error or a non-JSON response (e.g. a
    // platform timeout page) throws before setSyncing(false) ever runs,
    // leaving the button stuck on "جاري التحديث" forever with no way to
    // retry short of reloading the page.
    try {
      const response = await fetch("/api/templates/sync-meta", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { ok: boolean; synced?: number; error?: string } | null;
      if (!payload) {
        setError(t("انتهت مهلة الاتصال بـ Meta، حاول مرة أخرى.", "The request to Meta timed out - try again."));
      } else if (!payload.ok) {
        setError(payload.error || t("تعذر التحديث من Meta", "Unable to sync from Meta"));
      } else if (!payload.synced) {
        // A successful call with zero templates looks identical to doing
        // nothing at all otherwise - Meta genuinely has no templates for
        // this WABA, which is worth saying explicitly rather than silence.
        setSyncNotice(t("لا توجد قوالب على حساب Meta لهذا الرقم.", "Meta has no templates for this WhatsApp number."));
      }
      await onRefreshData();
    } catch {
      setError(t("تعذر الاتصال بالخادم، حاول مرة أخرى.", "Couldn't reach the server - try again."));
    } finally {
      setSyncing(false);
    }
  }

  function categoryOf(template: MessageTemplate) {
    return template.category || (template.type === "تسويق" ? "MARKETING" : "UTILITY");
  }
  function categoryLabel(category: string) {
    if (category === "MARKETING") return t("تسويقي", "Marketing");
    if (category === "UTILITY") return t("خدمي", "Utility");
    if (category === "AUTHENTICATION") return t("تحقق", "Authentication");
    return category;
  }
  const shownTemplates = templates.filter((template) => {
    if (statusFilter !== "all" && template.status !== statusFilter) return false;
    if (categoryFilter !== "all" && categoryOf(template) !== categoryFilter) return false;
    const query = listSearch.trim().toLowerCase();
    return !query || template.name.toLowerCase().includes(query) || template.message.toLowerCase().includes(query);
  });
  const marketingCount = templates.filter((template) => categoryOf(template) === "MARKETING").length;
  const utilityCount = templates.filter((template) => categoryOf(template) === "UTILITY").length;

  return (
    <section className="page-stack">
      <div className="seg-kpis">
        <div className="seg-kpi"><span>{t("كل القوالب", "All templates")}</span><b>{templates.length}</b><small>{t(`${marketingCount} تسويقي · ${utilityCount} خدمي`, `${marketingCount} marketing · ${utilityCount} utility`)}</small></div>
        <div className="seg-kpi seg-kpi-good"><span>{t("القوالب المعتمدة", "Approved templates")}</span><b>{approvedCount}</b><small>{t("جاهزة للإرسال", "Ready to send")}</small></div>
        <div className="seg-kpi seg-kpi-warn"><span>{t("بانتظار المراجعة", "Awaiting review")}</span><b>{pendingCount}</b><small>{t("لدى Meta", "With Meta")}</small></div>
        <div className="seg-kpi seg-kpi-bad"><span>{t("مرفوضة", "Rejected")}</span><b>{rejectedCount}</b><small>{t("تحتاج تعديل", "Needs changes")}</small></div>
      </div>
      <div className={templates.length ? "template-gallery-layout has-side" : "template-gallery-layout"}>
      <div className="panel template-gallery-main">
        <div className="panel-head">
          <h2>{t("قوالب واتساب", "WhatsApp Templates")}</h2>
          <span />
          <button className="btn soft" type="button" onClick={syncTemplatesFromMeta} disabled={syncing || !whatsappConnected}>{syncing ? t("جاري التحديث", "Syncing") : t("تحديث الحالة من Meta", "Sync status from Meta")}</button>
          <button className="btn primary" type="button" onClick={openCreateForm} disabled={!whatsappConnected}>{t("إنشاء قالب", "Create template")}</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {syncNotice ? <p className="muted-copy">{syncNotice}</p> : null}
        {!whatsappConnected ? (
          <p className="form-error">{t("اربط قناة واتساب من الإعدادات أولاً حتى تظهر القوالب.", "Connect a WhatsApp channel from Settings first for templates to show up.")}</p>
        ) : (
          <div className="panel-body">
            <div className="section-tabs campaign-tabs">
              {([["all", t("الكل", "All"), templates.length], ["معتمد", t("معتمد", "Approved"), approvedCount], ["قيد المراجعة", t("قيد المراجعة", "Pending"), pendingCount], ["مرفوض", t("مرفوض", "Rejected"), rejectedCount]] as Array<[typeof statusFilter, string, number]>).map(([key, label, count]) => (
                <button key={key} type="button" className={statusFilter === key ? "section-tab active" : "section-tab"} onClick={() => setStatusFilter(key)}>{label} <span>{count}</span></button>
              ))}
            </div>
            <div className="seg-toolbar">
              <input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder={t("ابحث باسم القالب أو نصه...", "Search by template name or text...")} />
              <CustomSelect value={categoryFilter} onChange={(value) => setCategoryFilter(value as typeof categoryFilter)} options={[{ value: "all", label: t("كل الفئات", "All categories") }, { value: "MARKETING", label: t("تسويقي", "Marketing") }, { value: "UTILITY", label: t("خدمي", "Utility") }, { value: "AUTHENTICATION", label: t("تحقق", "Authentication") }]} />
              <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{shownTemplates.length}</b></span>
            </div>
            {!templates.length && dataLoading ? <p className="muted-copy">{t("جارٍ تحميل القوالب", "Loading templates")}...</p> : null}
            {!templates.length && !dataLoading ? (
              <EmptyState
                                    title={t("لا توجد قوالب", "No templates yet")}
                                    description={t("القالب رسالة معتمدة من Meta تستطيع إرسالها للعملاء خارج نافذة الـ 24 ساعة وفي الحملات. أنشئ قالباً وانتظر اعتماده.", "A template is a Meta-approved message you can send customers outside the 24-hour window and in campaigns. Create one and wait for its approval.")}
                                    action={<button className="btn primary" type="button" onClick={openCreateForm}>{t("أنشئ أول قالب", "Create your first template")}</button>}
                                  />
            ) : null}
            <div className="template-card-grid">
              {shownTemplates.map((template) => (
                <article key={template.name} className={`template-card ${template.status === "معتمد" ? "is-approved" : template.status === "مرفوض" ? "is-rejected" : "is-pending"}`}>
                  <header>
                    <b dir="ltr">{template.name}</b>
                    <span className={template.status === "معتمد" ? "state ok" : template.status === "مرفوض" ? "state off" : "state warn"}>{templateStatusLabel(template.status || "", t)}</span>
                  </header>
                  <div className="template-card-bubble">
                    {template.headerText ? <strong>{template.headerText}</strong> : null}
                    <p>{template.message}</p>
                    {template.footer ? <small>{template.footer}</small> : null}
                    {template.buttonType && template.buttonType !== "NONE" && template.buttonText ? <span className="template-card-button">{template.buttonText}</span> : null}
                  </div>
                  {["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType || "") && !template.hasHeaderMediaSaved ? (
                    <button type="button" className="state warn template-media-missing" onClick={() => openEditForm(template)}>
                      {t("⚠ الملف غير محفوظ للإرسال - اضغط لإضافته", "⚠ File not saved for sending - click to add it")}
                    </button>
                  ) : null}
                  <footer>
                    <span className="template-card-meta">{categoryLabel(categoryOf(template))} · {template.language} · {template.syncedAt || "-"}</span>
                    <span className="row-actions">
                      <button className="btn soft" type="button" onClick={() => openEditForm(template)}>{t("عرض", "View")}</button>
                    </span>
                  </footer>
                </article>
              ))}
              {!shownTemplates.length ? <p className="muted-copy">{t("لا توجد قوالب مطابقة.", "No matching templates.")}</p> : null}
            </div>
          </div>
        )}
      </div>
      {templates.length ? (
        <aside className="panel template-gallery-side">
          <div className="panel-head"><h2>{t("حالة القوالب", "Template status")}</h2></div>
          <div className="panel-body">
            <DonutChart centerLabel={t("قالب", "templates")} slices={[
              { label: t("معتمد", "Approved"), value: approvedCount, color: "#2e9e6b" },
              { label: t("قيد المراجعة", "Pending"), value: pendingCount, color: "#f0ad4e" },
              { label: t("مرفوض", "Rejected"), value: rejectedCount, color: "#d9534f" }
            ]} />
          </div>
        </aside>
      ) : null}
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => void requestCloseForm()}>
          <form className="account-modal template-modal" role="dialog" aria-modal="true" aria-label={t("حفظ قالب واتساب", "Save WhatsApp template")} onSubmit={submitTemplate} onClick={(event) => event.stopPropagation()}>
            <div className="template-topbar">
              <div className="template-topbar-title">
                <button className="template-back" type="button" aria-label={t("رجوع", "Back")} onClick={() => void requestCloseForm()}>{t("→", "←")}</button>
                <h2>{form.editing ? t("تعديل القالب", "Edit template") : t("قالب جديد", "New template")}</h2>
              </div>
              <div className="template-topbar-actions">
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
                    <button type="button" className={`template-type-card ${isCatalogForm || carouselMode ? "" : "active"}`} aria-pressed={!isCatalogForm && !carouselMode} disabled={form.editing} onClick={() => { setCarouselMode(false); chooseTemplateKind(false); }}>
                      <span className="template-type-icon">{DocIcon}</span>
                      {t("قياسي", "Standard")}
                    </button>
                    <button type="button" className={`template-type-card ${isCatalogForm ? "active" : ""}`} aria-pressed={isCatalogForm} disabled={form.editing} onClick={() => { setCarouselMode(false); chooseTemplateKind(true); }}>
                      <span className="template-type-icon">{CatalogIcon}</span>
                      {t("كتالوج", "Catalog")}
                    </button>
                    <button type="button" className={`template-type-card ${carouselMode ? "active" : ""}`} aria-pressed={carouselMode} disabled={form.editing} onClick={startCarouselKind}>
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

                {!carouselMode ? (
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
                    <label className="template-radio">
                      <input type="radio" name="headerType" checked={form.headerType === "IMAGE"} onChange={() => setForm((current) => ({ ...current, headerType: "IMAGE" }))} />
                      {t("صورة", "Image")}
                    </label>
                    <label className="template-radio">
                      <input type="radio" name="headerType" checked={form.headerType === "VIDEO"} onChange={() => setForm((current) => ({ ...current, headerType: "VIDEO" }))} />
                      {t("فيديو", "Video")}
                    </label>
                    <label className="template-radio">
                      <input type="radio" name="headerType" checked={form.headerType === "DOCUMENT"} onChange={() => setForm((current) => ({ ...current, headerType: "DOCUMENT", headerMedia: current.headerType === "DOCUMENT" ? current.headerMedia : "", headerMediaDataUrl: current.headerType === "DOCUMENT" ? current.headerMediaDataUrl : "" }))} />
                      {t("مستند (PDF)", "Document (PDF)")}
                    </label>
                  </div>
                  {form.headerType === "TEXT" ? (
                    <input value={form.headerText} onChange={(event) => setForm((current) => ({ ...current, headerText: event.target.value }))} placeholder={t("مثال: عرض اليوم فقط!", "Example: Today only!")} />
                  ) : null}
                  {form.headerType === "IMAGE" || form.headerType === "VIDEO" || form.headerType === "DOCUMENT" ? (
                    <div className="template-header-image">
                      <label className="template-upload-btn">
                        {form.headerType === "IMAGE" ? t("اختر صورة", "Choose image") : form.headerType === "DOCUMENT" ? t("اختر ملف PDF", "Choose a PDF file") : t("اختر فيديو", "Choose video")}
                        <input type="file" accept={form.headerType === "IMAGE" ? "image/jpeg,image/png" : form.headerType === "DOCUMENT" ? "application/pdf" : "video/mp4,video/3gpp"} onChange={handleHeaderImageChange} hidden />
                      </label>
                      {!form.headerMedia.startsWith("data:") && form.headerMediaUrl ? (
                        <div className="template-header-media-preview-wrap">
                          {form.headerType === "IMAGE" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={form.headerMediaUrl} alt="" className="template-header-image-preview" />
                          ) : form.headerType === "DOCUMENT" ? (
                            <a className="template-media" href={form.headerMediaUrl} target="_blank" rel="noopener noreferrer">{t("ملف PDF محفوظ - فتح", "Saved PDF - open")}</a>
                          ) : (
                            <video src={form.headerMediaUrl} className="template-header-image-preview" controls />
                          )}
                          <small className="field-hint">{t("هذا الملف محفوظ ويُرسل مع كل رسالة من هذا القالب. اختر ملفاً جديداً لتغييره.", "This file is saved and sent with every message from this template. Choose a new file to change it.")}</small>
                        </div>
                      ) : null}
                      {form.editing && !form.headerMediaUrl && !form.headerMedia.startsWith("data:") ? (
                        <p className="form-error" role="alert">{t("لا توجد نسخة محفوظة من الملف لهذا القالب، فلن يُرسل مع الرسائل. اختر الملف ثم اضغط «حفظ الملف للإرسال»، دون إعادة مراجعة من Meta.", "No copy of the file is saved for this template, so it will not be sent with messages. Choose the file, then press “Save file for sending” - no new Meta review.")}</p>
                      ) : null}
                      {form.editing && !form.headerMediaUrl && form.headerMedia.startsWith("data:") ? (
                        <button type="button" className="btn primary" disabled={savingMedia} onClick={() => void saveMediaOnly()}>{savingMedia ? t("جاري الحفظ…", "Saving…") : t("حفظ الملف للإرسال", "Save file for sending")}</button>
                      ) : null}
                      {form.headerMedia.startsWith("data:") ? (
                        <div className="template-header-media-preview-wrap">
                          {form.headerType === "IMAGE" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={form.headerMedia} alt="" className="template-header-image-preview" />
                          ) : form.headerType === "DOCUMENT" ? (
                            <div className="template-media">{t("ملف PDF مرفق", "PDF attached")}</div>
                          ) : (
                            <video src={form.headerMedia} className="template-header-image-preview" controls />
                          )}
                          <button type="button" className="template-media-remove" onClick={handleRemoveHeaderMedia} aria-label={t("إزالة الملف", "Remove file")}>×</button>
                        </div>
                      ) : (
                        <small className="field-hint">
                          {form.headerType === "IMAGE"
                            ? t("الصورة مطلوبة كمثال يُرسل لمراجعة Meta", "An image is required as an example for Meta's review")
                            : form.headerType === "DOCUMENT"
                              ? t("ملف PDF مطلوب كمثال يُرسل لمراجعة Meta ويصل العميل مع كل رسالة (حتى 5 ميجابايت).", "A PDF is required as an example for Meta's review and is sent to the customer with every message (up to 5 MB).")
                              : t("الفيديو مطلوب كمثال يُرسل لمراجعة Meta", "A video is required as an example for Meta's review")}
                        </small>
                      )}
                    </div>
                  ) : null}
                </div>
                ) : null}

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
                      <button type="button" aria-label={t("عريض", "Bold")} title={t("عريض", "Bold")} onClick={() => wrapSelection(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "*")}>{BoldIcon}</button>
                      <button type="button" aria-label={t("مائل", "Italic")} title={t("مائل", "Italic")} onClick={() => wrapSelection(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "_")}>{ItalicIcon}</button>
                      <button type="button" aria-label={t("يتوسطه خط", "Strikethrough")} title={t("يتوسطه خط", "Strikethrough")} onClick={() => wrapSelection(bodyRef, form.message, (value) => setForm((current) => ({ ...current, message: value })), "~")}>{StrikeIcon}</button>
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
                  {bodyPlaceholders.length ? (
                    <div className="template-variable-examples">
                      <small className="field-hint">{t("أضف عينة لكل متغير حتى تتمكن Meta من مراجعة القالب - تُستخدم للمراجعة فقط ولن تُرسل إلى عملائك.", "Add a sample for each variable so Meta can review the template - used for review only, never sent to your customers.")}</small>
                      {bodyPlaceholders.map((placeholder) => (
                        <label key={placeholder}>
                          <span dir="ltr">{`{{${placeholder}}}`}</span>
                          <input
                            value={form.bodyExamples[placeholder] || ""}
                            onChange={(event) => setForm((current) => ({ ...current, bodyExamples: { ...current.bodyExamples, [placeholder]: event.target.value } }))}
                            placeholder={t("مثال: محمد", "Example: Mohammed")}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
                {carouselMode ? (
                  <div className="template-section">
                    <div className="template-section-head">
                      <h3>{t("بطاقات العرض المتعدد", "Carousel cards")}</h3>
                      <small>{t("من 2 إلى 10 بطاقات. كل بطاقة صورة ونص (حتى 160 حرفًا) وزرّان كحد أقصى. للتسويق فقط.", "2 to 10 cards. Each has an image, a text (up to 160 characters) and up to two buttons. Marketing only.")}</small>
                    </div>
                    <div className="template-radio-row">
                      <span className="field-hint">{t("أزرار البطاقات (نفسها في كل بطاقة):", "Card buttons (the same on every card):")}</span>
                      {[0, 1].map((slot) => (
                        <label key={slot} className="template-radio">
                          <CustomSelect
                            value={carouselLayout[slot] || ""}
                            onChange={(value) => setCarouselLayout((current) => { const next = current.slice(0, slot); if (value) next[slot] = value as "QUICK_REPLY" | "URL"; return slot === 0 && !value ? [] : next.filter(Boolean); })}
                            options={[{ value: "", label: t(`الزر ${slot + 1}: بدون`, `Button ${slot + 1}: none`) }, { value: "QUICK_REPLY", label: t(`الزر ${slot + 1}: رد سريع`, `Button ${slot + 1}: quick reply`) }, { value: "URL", label: t(`الزر ${slot + 1}: رابط`, `Button ${slot + 1}: link`) }]}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="carousel-cards">
                      {carouselCards.map((card, index) => (
                        <div className="carousel-card-editor" key={card.id}>
                          <div className="carousel-card-head">
                            <b>{t(`البطاقة ${index + 1}`, `Card ${index + 1}`)}</b>
                            {carouselCards.length > 2 ? <button type="button" className="btn soft" onClick={() => setCarouselCards((current) => current.filter((item) => item.id !== card.id))}>{t("حذف", "Remove")}</button> : null}
                          </div>
                          <div className="template-header-image">
                            <label className="template-upload-btn">
                              {card.imageDataUrl ? t("تغيير الصورة", "Change image") : t("اختر صورة (JPG أو PNG)", "Choose image (JPG or PNG)")}
                              <input type="file" accept="image/jpeg,image/png" hidden onChange={(event) => handleCardImage(card.id, event)} />
                            </label>
                            {card.imageDataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={card.imageDataUrl} alt="" className="template-header-image-preview" />
                            ) : null}
                          </div>
                          <textarea rows={2} maxLength={160} value={card.body} onChange={(event) => updateCard(card.id, { body: event.target.value })} placeholder={t("نص البطاقة", "Card text")} />
                          {carouselLayout.map((type, slot) => (
                            <div className="carousel-card-button" key={slot}>
                              <input maxLength={25} value={card.buttons[slot]?.text || ""} onChange={(event) => updateCardButton(card.id, slot, { text: event.target.value })} placeholder={t(`نص الزر ${slot + 1}`, `Button ${slot + 1} text`)} />
                              {type === "URL" ? <input dir="ltr" value={card.buttons[slot]?.url || ""} onChange={(event) => updateCardButton(card.id, slot, { url: event.target.value })} placeholder="https://" /> : null}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    {carouselCards.length < 10 ? <button type="button" className="btn soft" onClick={() => setCarouselCards((current) => [...current, newCarouselCard()])}>{t("+ إضافة بطاقة", "+ Add card")}</button> : null}
                  </div>
                ) : null}

                {!carouselMode ? (
                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("تذييل الصفحة (اختياري)", "Footer (optional)")}</h3>
                    <small>{t("إخلاء مسؤولية أو ملاحظة قصيرة", "A disclaimer or a short note")}</small>
                  </div>
                  <input value={form.footer} onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))} placeholder={t("مثال: هذه رسالة آلية", "Example: This is an automated message")} />
                </div>
                ) : null}

                {!carouselMode ? (
                <div className="template-section">
                  <div className="template-section-head">
                    <h3>{t("الأزرار (اختياري)", "Buttons (optional)")}</h3>
                  </div>
                  <label>
                    <span>{t("نوع الزر", "Button type")}</span>
                    <CustomSelect
                      value={form.buttonType}
                      disabled={isCatalogForm}
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
                        <div className="template-button-url-row">
                          <input dir="ltr" value={form.buttonUrl} onChange={(event) => setForm((current) => ({ ...current, buttonUrl: event.target.value }))} placeholder="https://example.com" />
                          <button
                            type="button"
                            className="btn soft template-button-url-fill"
                            disabled={dynamicButtonUrlPattern.test(form.buttonUrl)}
                            onClick={() => setForm((current) => {
                              const base = current.buttonUrl.trim();
                              const withSlash = base && !base.endsWith("/") ? `${base}/` : base;
                              return { ...current, buttonUrl: `${withSlash}api/campaigns/t/{{1}}` };
                            })}
                          >
                            {t("اضغط هنا لجعل الرابط رابط تتبع", "Click here to make this a tracking link")}
                          </button>
                        </div>
                      </label>
                    </div>
                  ) : null}
                  {form.buttonType === "URL" && dynamicButtonUrlPattern.test(form.buttonUrl) ? (
                    <label className="template-button-url-example">
                      <span>{t("مثال للرابط", "URL example")}</span>
                      <input
                        dir="ltr"
                        value={form.buttonUrlExample || form.buttonUrl.replace(dynamicButtonUrlPattern, "sample123")}
                        onChange={(event) => setForm((current) => ({ ...current, buttonUrlExample: event.target.value }))}
                      />
                      <small>{t("مثال يُستخدم لمراجعة Meta فقط، ما يصل للعملاء.", "Example used only for Meta's review — never sent to customers.")}</small>
                    </label>
                  ) : null}
                </div>
                ) : null}

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
                <TemplatePreview form={form} language={language} t={t} carouselCards={carouselMode ? carouselCards : undefined} />
              </div>
            </div>
            <div className="template-modal-foot">
              <button className="btn soft close-red" type="button" onClick={() => void requestCloseForm()}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : form.editing ? t("حفظ", "Save") : t("إرسال إلى Meta", "Submit to Meta")}</button>
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

function TemplatePreview({ form, t, carouselCards }: { form: TemplateFormState; language: string; t: (ar: string, en: string) => string; carouselCards?: CarouselCardForm[] }) {
  const now = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date());
  return (
    <div className="template-phone-frame">
    <span className="template-phone-btn volume-up" />
    <span className="template-phone-btn volume-down" />
    <span className="template-phone-btn power" />
    <span className="template-phone-btn action" />
    <span className="template-phone-btn camera-control" />
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
          {form.headerType === "IMAGE" ? (
            form.headerMedia.startsWith("data:") || form.headerMediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.headerMedia.startsWith("data:") ? form.headerMedia : form.headerMediaUrl} alt="" className="template-media-image" />
            ) : (
              <div className="template-media">{t("صورة القالب", "Template image")}</div>
            )
          ) : null}
          {form.headerType === "VIDEO" ? (
            form.headerMedia.startsWith("data:") ? (
              <video src={form.headerMedia} className="template-media-image" muted />
            ) : (
              <div className="template-media">{t("فيديو القالب", "Template video")}</div>
            )
          ) : null}
          {form.headerType === "DOCUMENT" ? <div className="template-media">{form.headerMedia.startsWith("data:") ? t("ملف PDF مرفق", "PDF attached") : t("مستند القالب", "Template document")}</div> : null}
          {form.headerType === "TEXT" && form.headerText ? <b>{form.headerText}</b> : null}
          <p>{form.message || t("اكتب محتوى القالب هنا", "Write the template content here")}</p>
          {form.footer ? <small>{form.footer}</small> : null}
          {form.buttonType !== "NONE" && form.buttonText ? <button type="button">{buttonIcon(form.buttonType)}{form.buttonText}</button> : null}
          <time>{now}</time>
        </div>
        {carouselCards ? (
          <div className="carousel-preview" aria-label={t("معاينة البطاقات", "Cards preview")}>
            {carouselCards.map((card) => (
              <div className="carousel-preview-card" key={card.id}>
                {card.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imageDataUrl} alt="" />
                ) : <div className="template-media">{t("صورة", "Image")}</div>}
                <p>{card.body || t("نص البطاقة", "Card text")}</p>
              </div>
            ))}
          </div>
        ) : null}
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
