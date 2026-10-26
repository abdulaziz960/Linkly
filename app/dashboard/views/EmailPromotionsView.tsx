"use client";

import { formatNumber } from "../../../lib/format";
import CustomSelect from "../../components/CustomSelect";
import { SendIcon, StopIcon } from "../components/ActionIcons";
import EmailInsights from "../components/EmailInsights";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Conversation, Customer, EmailCampaignSummary, Tag } from "../types";
import { useLanguage } from "../i18n";

type FormState = {
  name: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  audienceMode: "all" | "tag" | "status" | "channel" | "custom" | "file" | "segment";
  segmentId: string;
  tagNames: string[];
  conversationStatus: string;
  channel: string;
  customerIds: string[];
  scheduledAt: string;
};

const emptyForm: FormState = {
  name: "",
  subject: "",
  senderName: "",
  senderEmail: "",
  bodyHtml: "<p></p>",
  ctaText: "",
  ctaUrl: "",
  audienceMode: "all",
  segmentId: "",
  tagNames: [],
  conversationStatus: "assigned",
  channel: "email",
  customerIds: [],
  scheduledAt: ""
};

const statusTabs = ["all", "draft", "scheduled", "sending", "sent", "failed"] as const;
const emailViewTabs = ["campaigns", "balance"] as const;
const emailPricingTiers = [
  { credits: 1000, price: 25 },
  { credits: 5000, price: 99 },
  { credits: 10000, price: 179 },
  { credits: 25000, price: 399 },
  { credits: 50000, price: 699 }
];

type EmailTransaction = {
  id: string;
  credits: number;
  amount: number;
  status: string;
  paymentMethod: string;
  gatewayStatus: string;
  createdAt: string;
  completedAt: string;
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function statusColor(status: string) {
  return ({ all: "#91a29e", draft: "#91a29e", scheduled: "#4a90d9", sending: "#f0ad4e", sent: "#2e9e6b", failed: "#d9534f", cancelled: "#d9534f" } as Record<string, string>)[status] || "#91a29e";
}

function statusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "draft") return t("مسودة", "Draft");
  if (status === "scheduled") return t("مجدولة", "Scheduled");
  if (status === "sending") return t("قيد الإرسال", "Sending");
  if (status === "sent") return t("مرسلة", "Sent");
  if (status === "failed") return t("فشلت", "Failed");
  if (status === "cancelled") return t("ملغاة", "Cancelled");
  return status;
}

function priceForEmailCredits(credits: number) {
  const tier = [...emailPricingTiers].reverse().find((item) => credits >= item.credits) || emailPricingTiers[0];
  const perEmail = tier.price / tier.credits;
  return { tier, total: Math.round(credits * perEmail * 100) / 100, perEmail };
}

function paymentStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "مكتمل" || status === "completed") return t("مكتملة", "Completed");
  if (status === "فشل" || status === "failed") return t("فشلت", "Failed");
  if (status === "ملغى" || status === "cancelled") return t("ملغاة", "Cancelled");
  return t("قيد الانتظار", "Pending");
}

export default function EmailPromotionsView({ customers, conversations, tags, hubTabs }: { customers: Customer[]; conversations: Conversation[]; tags: Tag[]; hubTabs?: ReactNode }) {
  const { t } = useLanguage();
  const editorRef = useRef<HTMLDivElement>(null);
  const [campaigns, setCampaigns] = useState<EmailCampaignSummary[]>([]);
  const [transactions, setTransactions] = useState<EmailTransaction[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState<(typeof emailViewTabs)[number]>(() => {
    if (typeof window === "undefined") return "campaigns";
    return new URLSearchParams(window.location.search).get("tab") === "balance" ? "balance" : "campaigns";
  });
  const [emailSegments, setEmailSegments] = useState<Array<{ id: string; name: string; recipientCount: number }>>([]);
  const [listSearch, setListSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [activeTab, setActiveTab] = useState<(typeof statusTabs)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"" | "draft" | "send" | "schedule">("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ count: number; sample: Array<{ name: string; email: string }> } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recipientFile, setRecipientFile] = useState<File | null>(null);
  const [emailBalance, setEmailBalance] = useState(0);
  const [creditsToAdd, setCreditsToAdd] = useState("1000");
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [chargeError, setChargeError] = useState("");

  useEffect(() => {
    if (!open || form.audienceMode !== "segment") return;
    fetch("/api/segments/email").then((response) => response.json().catch(() => null)).then((body) => setEmailSegments(body?.ok ? body.data ?? [] : [])).catch(() => setEmailSegments([]));
  }, [open, form.audienceMode]);

  const emailCustomers = useMemo(() => customers.filter((customer) => isEmail(customer.phone)), [customers]);
  const channelOptions = useMemo(() => Array.from(new Set(conversations.map((conversation) => conversation.channel))).sort(), [conversations]);
  const visibleCampaigns = campaigns.filter((campaign) => {
    if (activeTab !== "all" && campaign.status !== activeTab) return false;
    const day = (campaign.scheduledAt || campaign.updatedAt || campaign.createdAt).slice(0, 10);
    if (listFrom && day < listFrom) return false;
    if (listTo && day > listTo) return false;
    const query = listSearch.trim().toLowerCase();
    return !query || campaign.name.toLowerCase().includes(query) || campaign.subject.toLowerCase().includes(query);
  });

  function applyEmailPeriod(value: string) {
    setPeriod(value);
    const now = new Date();
    const iso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (value === "all") { setListFrom(""); setListTo(""); return; }
    const from = new Date(now);
    if (value === "week") from.setDate(from.getDate() - 6);
    if (value === "month") from.setDate(1);
    if (value === "year") { from.setMonth(0); from.setDate(1); }
    setListFrom(iso(from));
    setListTo(iso(now));
  }

  async function exportCampaigns() {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(t("حملات البريد", "Email campaigns"), { views: [{ rightToLeft: true }] });
    sheet.columns = [
      { header: t("الحملة", "Campaign"), key: "name", width: 28 }, { header: t("العنوان", "Subject"), key: "subject", width: 32 },
      { header: t("الحالة", "Status"), key: "status", width: 14 }, { header: t("المستلمين", "Recipients"), key: "recipients", width: 12 },
      { header: t("مرسلة", "Sent"), key: "sent", width: 10 }, { header: t("وصلت", "Delivered"), key: "delivered", width: 10 },
      { header: t("فتح", "Opens"), key: "opens", width: 10 }, { header: t("ضغط", "Clicks"), key: "clicks", width: 10 },
      { header: t("ارتداد", "Bounces"), key: "bounces", width: 10 }, { header: t("إلغاء اشتراك", "Unsubscribes"), key: "unsubs", width: 14 }
    ];
    visibleCampaigns.forEach((campaign) => sheet.addRow({ name: campaign.name, subject: campaign.subject, status: statusLabel(campaign.status, t), recipients: campaign.analytics.totalRecipients, sent: campaign.analytics.sentCount, delivered: campaign.analytics.deliveredCount, opens: campaign.analytics.openCount, clicks: campaign.analytics.clickCount, bounces: campaign.analytics.bounceCount, unsubs: campaign.analytics.unsubscribeCount }));
    sheet.getRow(1).font = { bold: true };
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "email-campaigns.xlsx"; anchor.click(); URL.revokeObjectURL(url);
  }
  const totals = useMemo(() => campaigns.reduce((sum, campaign) => ({
    recipients: sum.recipients + campaign.analytics.totalRecipients,
    sent: sum.sent + campaign.analytics.sentCount,
    opens: sum.opens + campaign.analytics.openCount,
    clicks: sum.clicks + campaign.analytics.clickCount
  }), { recipients: 0, sent: 0, opens: 0, clicks: 0 }), [campaigns]);
  const parsedCreditsToAdd = Math.max(0, Number(creditsToAdd.replace(/[^\d]/g, "")) || 0);
  const creditPrice = priceForEmailCredits(parsedCreditsToAdd || 1);
  const canBuyCredits = parsedCreditsToAdd >= emailPricingTiers[0].credits;
  const completedTransactions = transactions.filter((transaction) => transaction.status === "مكتمل" || transaction.status === "completed");
  const totalPurchasedCredits = completedTransactions.reduce((sum, transaction) => sum + transaction.credits, 0);

  async function loadCampaigns() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/email-promotions", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "load failed");
      setCampaigns(body.data?.campaigns || body.data || []);
      setEmailBalance(body.data?.balance || 0);
      setTransactions(body.data?.transactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تحميل الحملات البريدية", "Could not load email campaigns"));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  function audiencePayload() {
    if (form.audienceMode === "file") return { mode: "file", fileName: recipientFile?.name || "" };
    if (form.audienceMode === "tag") return { mode: "tag", tagNames: form.tagNames };
    if (form.audienceMode === "status") return { mode: "status", conversationStatus: form.conversationStatus };
    if (form.audienceMode === "channel") return { mode: "channel", channel: form.channel };
    if (form.audienceMode === "custom") return { mode: "custom", customerIds: form.customerIds };
    if (form.audienceMode === "segment") return { mode: "segment", segmentId: form.segmentId };
    return { mode: "all" };
  }

  async function loadPreview() {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const response = form.audienceMode === "file"
        ? await fetch("/api/email-promotions/preview", {
            method: "POST",
            body: (() => {
              const data = new FormData();
              if (recipientFile) data.set("file", recipientFile);
              return data;
            })()
          })
        : await fetch("/api/email-promotions/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audience: audiencePayload() })
          });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "preview failed");
      setPreview(body.data);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t("تعذر حساب الجمهور", "Could not preview audience"));
    }
    setPreviewLoading(false);
  }

  function syncEditor() {
    setForm((current) => ({ ...current, bodyHtml: editorRef.current?.innerHTML || "" }));
  }

  function editorCommand(command: "bold" | "italic" | "insertUnorderedList") {
    document.execCommand(command);
    syncEditor();
  }

  async function submit(action: "draft" | "send" | "schedule") {
    syncEditor();
    setSaving(action);
    setError("");
    setFeedback("");
    try {
      const next = { ...form, bodyHtml: editorRef.current?.innerHTML || form.bodyHtml };
      const response = form.audienceMode === "file"
        ? await fetch("/api/email-promotions", {
            method: "POST",
            body: (() => {
              const data = new FormData();
              data.set("name", next.name);
              data.set("subject", next.subject);
              data.set("senderName", next.senderName);
              data.set("senderEmail", next.senderEmail);
              data.set("bodyHtml", next.bodyHtml);
              data.set("ctaText", next.ctaText);
              data.set("ctaUrl", next.ctaUrl);
              data.set("scheduledAt", action === "schedule" ? next.scheduledAt : "");
              data.set("action", action);
              data.set("audience", JSON.stringify(audiencePayload()));
              if (recipientFile) data.set("file", recipientFile);
              return data;
            })()
          })
        : await fetch("/api/email-promotions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...next,
              action,
              audience: audiencePayload(),
              scheduledAt: action === "schedule" ? next.scheduledAt : ""
            })
          });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "save failed");
      setCampaigns(body.data.campaigns || []);
      setEmailBalance(body.data.balance || emailBalance);
      setTransactions(body.data.transactions || transactions);
      setForm(emptyForm);
      setScheduleEnabled(false);
      setRecipientFile(null);
      if (editorRef.current) editorRef.current.innerHTML = emptyForm.bodyHtml;
      setOpen(false);
      setFeedback(action === "draft" ? t("تم حفظ المسودة", "Draft saved") : action === "schedule" ? t("تمت جدولة الحملة", "Campaign scheduled") : t("بدأ إرسال الحملة", "Campaign sending started"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر حفظ الحملة", "Could not save campaign"));
    }
    setSaving("");
  }

  async function campaignAction(id: string, status: "sending" | "cancelled" | "delete") {
    setFeedback("");
    setError("");
    const response = await fetch(`/api/email-promotions/${id}`, { method: status === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: status === "delete" ? undefined : JSON.stringify({ status }) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      setError(body?.error || t("تعذر تنفيذ الإجراء", "Action failed"));
      return;
    }
    setCampaigns(body.data || []);
    setFeedback(t("تم تنفيذ الإجراء", "Action completed"));
  }

  async function createChargeRequest() {
    setChargeSubmitting(true);
    setChargeError("");
    try {
      const response = await fetch("/api/email-promotions/balance/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: parsedCreditsToAdd })
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "charge failed");
      window.location.href = `/billing/pay/email/${body.data.paymentId}`;
    } catch (err) {
      setChargeError(err instanceof Error ? err.message : t("تعذر إنشاء طلب الشراء", "Could not create payment request"));
    }
    setChargeSubmitting(false);
  }

  function pricingRangeLabel(tier: (typeof emailPricingTiers)[number]) {
    return `${formatNumber(tier.credits)} ${t("إيميل", "emails")}`;
  }

  return (
    <section className="page-stack campaigns-page">
      <div className="camp-hero">
        <div className="camp-hero-text">
          <small>{t("مركز الحملات", "CAMPAIGN CENTER")}</small>
          <h1>{t("حملات النشرات البريدية", "Email newsletters")}</h1>
          <p>{t("أنشئ حملات بريد تسويقية موجهة للعملاء الذين لديهم بريد صالح، مع تتبع الفتح والضغط وإلغاء الاشتراك.", "Create promotional email campaigns for customers with valid email addresses, with open, click and unsubscribe tracking.")}</p>
          <div className="camp-hero-chips">
            <span>{campaigns.length.toLocaleString("en-US")} {t("إجمالي الحملات", "campaigns")}</span>
            <span>{t("تصفية حسب الحالة", "Status filter")}: {activeTab === "all" ? t("الكل", "All") : statusLabel(activeTab, t)}</span>
          </div>
        </div>
        <label className="camp-hero-search"><span aria-hidden="true">🔍</span><input value={listSearch} onChange={(event) => { setListSearch(event.target.value); setActiveView("campaigns"); }} placeholder={t("بحث باسم الحملة...", "Search campaigns...")} aria-label={t("بحث في الحملات", "Search campaigns")} /></label>
        <CustomSelect className="camp-hero-period" value={period} onChange={applyEmailPeriod} options={[{ value: "all", label: t("كل الفترات", "All time") }, { value: "today", label: t("اليوم", "Today") }, { value: "week", label: t("آخر 7 أيام", "Last 7 days") }, { value: "month", label: t("هذا الشهر", "This month") }, { value: "year", label: t("هذه السنة", "This year") }]} />
        <button className="camp-hero-new" type="button" onClick={() => setOpen(true)}>＋ {t("حملة بريد جديدة", "New email campaign")}</button>
      </div>
      {hubTabs}

      {feedback ? <p role="status" className="success-banner">{feedback}</p> : null}
      {error ? <p role="alert" className="error-banner">{error}</p> : null}

      <div className="camp-subtabs">
        <button type="button" className={activeView === "campaigns" ? "on" : ""} onClick={() => setActiveView("campaigns")}>{t("نظرة الحملات", "Campaign overview")}</button>
        <button type="button" className={activeView === "balance" ? "on" : ""} onClick={() => setActiveView("balance")}>{t("الرصيد و الشحن", "Balance & Top-up")}</button>
      </div>

      {activeView === "campaigns" ? (
        <>
      <details className="camp-summary">
        <summary>{t("ملخص ومؤشرات الحملات", "Campaign summary and readiness")}</summary>
        <EmailInsights campaigns={campaigns} balance={emailBalance} customersWithEmail={emailCustomers.length} />
      </details>

      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <form className="account-modal form-modal campaign-create-modal campaign-builder-modal email-campaign-builder-modal" role="dialog" aria-modal="true" aria-label={t("إنشاء حملة بريدية", "Create email campaign")} onSubmit={(event) => event.preventDefault()} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head campaign-builder-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(false)}>×</button>
              <div><span>{t("منشئ العروض البريدية", "EMAIL CAMPAIGN BUILDER")}</span><h2>{t("إنشاء حملة بريدية جديدة", "Create a new email campaign")}</h2></div>
            </header>
            <div className="account-modal-body form-grid campaign-builder-fields email-builder-fields">
              <label><span>{t("اسم الحملة", "Campaign name")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("مثال: عرض نهاية الأسبوع", "Example: Weekend offer")} /></label>
              <label><span>{t("عنوان البريد", "Email subject")}</span><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder={t("عنوان يظهر في صندوق الوارد", "Subject shown in the inbox")} /></label>
              <label><span>{t("اسم المرسل", "Sender name")}</span><input value={form.senderName} onChange={(event) => setForm({ ...form, senderName: event.target.value })} placeholder={t("اسم الشركة أو الفرع", "Company or branch name")} /></label>
              <label><span>{t("بريد المرسل", "Sender email")}</span><input dir="ltr" value={form.senderEmail} onChange={(event) => setForm({ ...form, senderEmail: event.target.value })} placeholder="marketing@example.com" /></label>
              <label><span>{t("الجمهور", "Audience")}</span>
                <select value={form.audienceMode} onChange={(event) => { setForm({ ...form, audienceMode: event.target.value as FormState["audienceMode"] }); setPreview(null); }}>
                  <option value="all">{t("كل العملاء أصحاب البريد", "All customers with email")}</option>
                  <option value="file">{t("رفع ملف Excel أو CSV", "Upload Excel or CSV file")}</option>
                  <option value="tag">{t("حسب الوسم", "By tag")}</option>
                  <option value="status">{t("حسب حالة المحادثة", "By conversation status")}</option>
                  <option value="channel">{t("حسب المصدر/القناة", "By source/channel")}</option>
                  <option value="custom">{t("اختيار يدوي", "Custom selected customers")}</option>
                  <option value="segment">{t("تقسيم محفوظ", "Saved segment")}</option>
                </select>
              </label>
              {form.audienceMode === "segment" ? (
                <label><span>{t("التقسيم", "Segment")}</span>
                  <select value={form.segmentId} onChange={(event) => { setForm({ ...form, segmentId: event.target.value }); setPreview(null); }}>
                    <option value="">{t("اختر تقسيمًا...", "Choose a segment...")}</option>
                    {emailSegments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name} ({segment.recipientCount})</option>)}
                  </select>
                  {!emailSegments.length ? <small className="field-hint">{t("لا توجد تقسيمات بعد - أنشئها من تاب «تقسيم العملاء».", "No segments yet - create them in the Customer segments tab.")}</small> : null}
                </label>
              ) : null}
              {form.audienceMode === "file" ? (
                <label className="email-file-field"><span>{t("ملف الإيميلات", "Email file")}</span><input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { setRecipientFile(event.target.files?.[0] || null); setPreview(null); }} /><small>{recipientFile ? recipientFile.name : t("يدعم Excel و CSV. يفضّل وجود عمود email وعمود name اختياري.", "Supports Excel and CSV. Recommended columns: email and optional name.")}</small></label>
              ) : null}
              {form.audienceMode === "tag" ? (
                <label><span>{t("الوسوم", "Tags")}</span><select multiple value={form.tagNames} onChange={(event) => setForm({ ...form, tagNames: Array.from(event.currentTarget.selectedOptions).map((option) => option.value) })}>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label>
              ) : null}
              {form.audienceMode === "status" ? (
                <label><span>{t("حالة المحادثة", "Conversation status")}</span><select value={form.conversationStatus} onChange={(event) => setForm({ ...form, conversationStatus: event.target.value })}><option value="assigned">{t("مسندة", "Assigned")}</option><option value="unassigned">{t("غير مسندة", "Unassigned")}</option><option value="closed">{t("مغلقة", "Closed")}</option></select></label>
              ) : null}
              {form.audienceMode === "channel" ? (
                <label><span>{t("القناة", "Channel")}</span><select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>{channelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label>
              ) : null}
              {form.audienceMode === "custom" ? (
                <div className="email-custom-audience">
                  {emailCustomers.map((customer) => (
                    <label key={customer.id}>
                      <input type="checkbox" checked={form.customerIds.includes(customer.id)} onChange={(event) => setForm({ ...form, customerIds: event.target.checked ? [...form.customerIds, customer.id] : form.customerIds.filter((id) => id !== customer.id) })} />
                      <span>{customer.name}</span><small dir="ltr">{customer.phone}</small>
                    </label>
                  ))}
                  {!emailCustomers.length ? <p className="muted-copy">{t("لا يوجد عملاء لديهم بريد صالح حتى الآن.", "No customers with valid email yet.")}</p> : null}
                </div>
              ) : null}
              <label><span>{t("نص زر الدعوة", "CTA button text")}</span><input value={form.ctaText} onChange={(event) => setForm({ ...form, ctaText: event.target.value })} placeholder={t("مثال: احجز الآن", "Example: Book now")} /></label>
              <label><span>{t("رابط زر الدعوة", "CTA URL")}</span><input dir="ltr" value={form.ctaUrl} onChange={(event) => setForm({ ...form, ctaUrl: event.target.value })} placeholder="https://..." /></label>
              <div className="email-schedule-card schedule-toggle">
                <div>
                  <strong>{t("جدولة الحملة", "Schedule campaign")}</strong>
                  <small>{scheduleEnabled ? t("اختر التاريخ والوقت المناسب للإرسال.", "Choose the date and time to send.") : t("اتركها مغلقة للإرسال مباشرة الآن.", "Keep this off to send immediately.")}</small>
                </div>
                <button
                  className={scheduleEnabled ? "toggle on" : "toggle"}
                  type="button"
                  aria-pressed={scheduleEnabled}
                  aria-label={t("جدولة الحملة", "Schedule campaign")}
                  onClick={() => {
                    setScheduleEnabled((current) => {
                      if (current) setForm((next) => ({ ...next, scheduledAt: "" }));
                      return !current;
                    });
                  }}
                />
              </div>
              {scheduleEnabled ? (
                <label><span>{t("تاريخ ووقت الإرسال", "Send date and time")}</span><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} /></label>
              ) : null}
              <div className="email-editor-card">
                <div className="email-editor-head">
                  <span>{t("محتوى البريد", "Email body")}</span>
                  <div>
                    <button className="btn soft" type="button" onClick={() => editorCommand("bold")}>B</button>
                    <button className="btn soft" type="button" onClick={() => editorCommand("italic")}>I</button>
                    <button className="btn soft" type="button" onClick={() => editorCommand("insertUnorderedList")}>•</button>
                  </div>
                </div>
                <div ref={editorRef} className="textarea email-editor" dir="rtl" contentEditable suppressContentEditableWarning onInput={syncEditor} dangerouslySetInnerHTML={{ __html: form.bodyHtml }} />
                <small>{t("سيتم إضافة رابط إلغاء الاشتراك تلقائيًا لكل رسالة.", "An unsubscribe link is automatically added to every email.")}</small>
              </div>
            </div>
            <aside className="campaign-live-preview email-live-preview" aria-label={t("معاينة البريد", "Email preview")}>
              <div className="campaign-preview-title"><span>{t("معاينة البريد", "Email preview")}</span><small>{t("شكل تقريبي للرسالة والجمهور", "Approximate message and audience")}</small></div>
              <div className="email-preview-card">
                <div><b>{form.senderName || t("اسم المرسل", "Sender name")}</b><span dir="ltr">{form.senderEmail || "marketing@example.com"}</span></div>
                <h3>{form.subject || t("عنوان البريد يظهر هنا", "Email subject appears here")}</h3>
                {/* sandbox="" - no scripts, no same-origin access: whatever the markup contains cannot run in the dashboard. */}
                <iframe className="email-preview-body email-preview-frame" title={t("معاينة البريد", "Email preview")} sandbox="" srcDoc={`<!doctype html><html dir="rtl"><body style="margin:0;font-family:Arial,Tahoma,sans-serif;line-height:1.8;color:#1f2937">${form.bodyHtml || "<p></p>"}</body></html>`} />
                {form.ctaText ? <button type="button">{form.ctaText}</button> : null}
                <small>{t("رابط إلغاء الاشتراك يضاف تلقائيًا", "Unsubscribe link is added automatically")}</small>
              </div>
              <dl><div><dt>{t("الجمهور", "Audience")}</dt><dd>{form.audienceMode === "file" ? t("ملف مرفوع", "Uploaded file") : form.audienceMode === "all" ? t("كل العملاء", "All customers") : form.audienceMode === "segment" ? t("تقسيم محفوظ", "Saved segment") : t("تصفية مخصصة", "Custom filter")}</dd></div><div><dt>{t("المستلمين", "Recipients")}</dt><dd>{preview ? formatNumber(preview.count) : "—"}</dd></div>{recipientFile ? <div><dt>{t("الملف", "File")}</dt><dd>{recipientFile.name}</dd></div> : null}</dl>
              <button className="btn soft email-preview-count" type="button" disabled={previewLoading || (form.audienceMode === "file" && !recipientFile)} onClick={loadPreview}>{previewLoading ? t("جاري الحساب...", "Counting...") : t("معاينة الجمهور", "Preview audience")}</button>
            </aside>
            <footer className="modal-foot email-builder-foot">
              <button className="btn danger email-cancel-btn" type="button" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="button" disabled={!!saving || (scheduleEnabled && !form.scheduledAt)} onClick={() => submit(scheduleEnabled ? "schedule" : "send")}>
                {saving === "send" ? t("جاري الإرسال...", "Sending...") : saving === "schedule" ? t("جاري الجدولة...", "Scheduling...") : scheduleEnabled ? t("جدولة الحملة", "Schedule campaign") : t("إرسال الآن", "Send now")}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      <div className="camp-pills">
        {statusTabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? "camp-pill on" : "camp-pill"} onClick={() => setActiveTab(tab)}><i style={{ background: statusColor(tab) }} />{tab === "all" ? t("الكل", "All") : statusLabel(tab, t)} <b>{tab === "all" ? campaigns.length : campaigns.filter((campaign) => campaign.status === tab).length}</b></button>)}
      </div>

      <div className="campaign-board campaign-list-board">
        <div className="campaign-list-head"><div><h2>{t("كل حملات البريد", "All email campaigns")}</h2><p>{t("تابع حالة الإرسال والأداء من نفس الجدول.", "Track send state and performance from one table.")}</p></div><button className="reload" type="button" onClick={loadCampaigns}>↻ {t("تحديث البيانات", "Refresh data")}</button></div>
        <div className="seg-toolbar">
          <label className="entries">{t("من", "From")} <input type="date" value={listFrom} onChange={(event) => setListFrom(event.target.value)} /></label>
          <label className="entries">{t("إلى", "To")} <input type="date" value={listTo} onChange={(event) => setListTo(event.target.value)} /></label>
          <button className="btn soft" type="button" onClick={() => { setListSearch(""); setListFrom(""); setListTo(""); }}>{t("مسح", "Clear")}</button>
          <button className="btn soft" type="button" onClick={exportCampaigns} disabled={!visibleCampaigns.length}>{t("تصدير Excel", "Export Excel")}</button>
          <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{visibleCampaigns.length.toLocaleString("en-US")}</b></span>
        </div>
        <div className="table-wrap">
        <table className="mobile-card-table camp-table">
          <thead><tr><th>{t("الحملة", "Campaign")}</th><th>{t("تم إرساله / الإجمالي", "Sent / total")}</th><th>{t("التقدم", "Progress")}</th><th>{t("الحالة", "Status")}</th><th>{t("آخر تحديث", "Last update")}</th><th>{t("الإجراءات", "Actions")}</th></tr></thead>
          <tbody>
            {visibleCampaigns.map((campaign) => {
              const total = campaign.analytics.totalRecipients;
              const sent = campaign.analytics.sentCount;
              const progress = total > 0 ? Math.min(100, Math.floor((sent / total) * 1000) / 10) : 0;
              return (
              <tr key={campaign.id}>
                <td data-label={t("الحملة", "Campaign")}><div className="campaign-name"><span className="campaign-thumb">{(campaign.name.trim()[0] || "؟")}</span><span><b title={campaign.name}>{campaign.name}</b><small className="campaign-description">{campaign.subject}</small></span></div></td>
                <td data-label={t("تم إرساله / الإجمالي", "Sent / total")}><b>{formatNumber(sent)}</b><small className="campaign-cell-note"> {t("من", "of")} {formatNumber(total)}</small></td>
                <td data-label={t("التقدم", "Progress")}><div className="camp-progress"><div className="camp-bar"><i style={{ width: `${progress}%` }} /></div><span>{progress}%</span></div></td>
                <td data-label={t("الحالة", "Status")}><span className={campaign.status === "failed" || campaign.status === "cancelled" ? "state off" : campaign.status === "scheduled" || campaign.status === "draft" ? "state warn" : "state ok"}><i className="camp-dot" />{statusLabel(campaign.status, t)}</span></td>
                <td data-label={t("آخر تحديث", "Last update")}>{(campaign.updatedAt || "").slice(0, 16).replace("T", " ")}</td>
                <td data-label={t("الإجراءات", "Actions")} className="row-actions campaign-row-actions">
                  {campaign.status === "scheduled" || campaign.status === "draft" ? <button className="campaign-icon-btn" type="button" title={t("إرسال الآن", "Send now")} aria-label={t("إرسال الآن", "Send now")} onClick={() => campaignAction(campaign.id, "sending")}>{SendIcon}</button> : null}
                  {campaign.status === "scheduled" || campaign.status === "draft" ? <button className="campaign-icon-btn" type="button" title={t("إلغاء", "Cancel")} aria-label={t("إلغاء", "Cancel")} onClick={() => campaignAction(campaign.id, "cancelled")}>{StopIcon}</button> : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {loading ? <p>{t("جاري تحميل الحملات...", "Loading campaigns...")}</p> : null}
        {!loading && !visibleCampaigns.length ? <p className="muted-copy">{t("لا توجد حملات بريدية ضمن هذا التصنيف.", "No email campaigns in this view.")}</p> : null}
        </div>
      </div>
        </>
      ) : (
        <div className="balance-page email-balance-page">
          <section className="campaign-balance-hero">
            <div>
              <span>{t("رصيد البريد", "EMAIL BALANCE")}</span>
              <h2>{t("اشترِ رصيد الإيميلات قبل الإرسال", "Buy email credits before sending")}</h2>
              <p>{t("رصيد البريد منفصل عن رصيد حملات واتساب. عند نجاح الدفع ينضاف الرصيد تلقائيًا وتقدر ترسل حملاتك مباشرة.", "Email credits are separate from WhatsApp campaign credits. Once payment succeeds, credits are added automatically and campaigns can send right away.")}</p>
            </div>
            <div className="campaign-balance-total">
              <small>{t("الرصيد المتاح", "Available balance")}</small>
              <strong>{formatNumber(emailBalance)}</strong>
              <span>{t("إيميل", "emails")}</span>
              <button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>＋ {t("شراء رصيد", "Buy credits")}</button>
            </div>
          </section>

          <section className="balance-kpi-grid">
            <article><span>{t("الاستخدام الكلي", "Total usage")}</span><strong>{formatNumber(totals.sent)}</strong><small>{t("إيميل مرسل من الحملات", "campaign emails sent")}</small></article>
            <article><span>{t("المعاملات", "Transactions")}</span><strong>{formatNumber(transactions.length)}</strong><small>{formatNumber(totalPurchasedCredits)} {t("رصيد مضاف", "credits added")}</small></article>
            <article className="balance-pricing-card"><span>{t("أسعار الرسايل", "Message prices")}</span><strong>{(emailPricingTiers[emailPricingTiers.length - 1].price / emailPricingTiers[emailPricingTiers.length - 1].credits).toFixed(3)} {t("ريال / رسالة", "SAR / message")}</strong><button type="button" onClick={() => setChargeOpen(true)}>{t("عرض الأسعار", "View prices")} ←</button></article>
          </section>

          <div className="campaign-board campaign-list-board email-transactions-board">
            <div className="campaign-list-head">
              <div><h2>{t("سجل المعاملات", "Transaction history")}</h2><p>{t("هنا تظهر عمليات شراء وإضافة رصيد البريد التسويقي.", "Email credit purchases and top-ups appear here.")}</p></div>
              <button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>{t("أسعار الرسايل", "Message prices")}</button>
            </div>
            <div className="table-wrap">
              <table className="mobile-card-table">
                <thead><tr><th>{t("التاريخ", "Date")}</th><th>{t("الرصيد", "Credits")}</th><th>{t("المبلغ", "Amount")}</th><th>{t("سعر الرسالة", "Price/message")}</th><th>{t("الحالة", "Status")}</th><th>{t("طريقة الدفع", "Payment method")}</th></tr></thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{new Date(transaction.completedAt || transaction.createdAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" })}</td>
                      <td>{formatNumber(transaction.credits)}</td>
                      <td>{formatNumber(transaction.amount)} {t("ريال", "SAR")}</td>
                      <td>{(transaction.amount / Math.max(1, transaction.credits)).toFixed(3)} {t("ريال", "SAR")}</td>
                      <td><span className={transaction.status === "مكتمل" || transaction.status === "completed" ? "state ok" : transaction.status === "فشل" || transaction.status === "failed" ? "state off" : "state warn"}>{paymentStatusLabel(transaction.status, t)}</span></td>
                      <td>{transaction.paymentMethod || transaction.gatewayStatus || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!transactions.length ? <p className="muted-copy">{t("لا توجد معاملات رصيد بريد حتى الآن.", "No email credit transactions yet.")}</p> : null}
            </div>
          </div>
        </div>
      )}

      {chargeOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setChargeOpen(false)}>
          <div className="account-modal balance-modal email-pricing-modal" role="dialog" aria-modal="true" aria-label={t("أسعار رصيد البريد", "Email credit prices")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setChargeOpen(false)}>×</button>
              <div><span>{t("أسعار الرسايل", "MESSAGE PRICING")}</span><h2>{t("اختر باقة رصيد البريد", "Choose an email credit package")}</h2></div>
            </header>
            <div className="account-modal-body balance-modal-body">
              <div className="balance-selected-package">
                <span>{t("الباقة المختارة", "Selected package")}</span>
                <b>{formatNumber(parsedCreditsToAdd)} {t("إيميل", "emails")}</b>
                <strong>{formatNumber(creditPrice.total)} {t("ريال", "SAR")} · {creditPrice.perEmail.toFixed(3)} {t("ريال للرسالة", "SAR/message")}</strong>
              </div>
              <label className="email-custom-credits-field">
                <span>{t("عدد مخصص", "Custom quantity")}</span>
                <input inputMode="numeric" value={creditsToAdd} onChange={(event) => setCreditsToAdd(event.target.value)} placeholder="1000" />
                <small>{t("اكتب العدد المطلوب وسيظهر السعر تلقائيًا. الحد الأدنى 1,000 رسالة.", "Enter the quantity and the price updates automatically. Minimum is 1,000 messages.")}</small>
              </label>
              <div className="email-package-grid" aria-label={t("باقات رصيد البريد", "Email credit packages")}>
                {emailPricingTiers.map((tier) => (
                  <button key={tier.credits} className={creditPrice.tier.credits === tier.credits ? "email-package-card active" : "email-package-card"} type="button" onClick={() => setCreditsToAdd(String(tier.credits))}>
                    <span>{formatNumber(tier.credits)} {t("إيميل", "emails")}</span>
                    <b>{formatNumber(tier.price)} {t("ريال", "SAR")}</b>
                    <small>{(tier.price / tier.credits).toFixed(3)} {t("ريال لكل رسالة", "SAR per message")}</small>
                  </button>
                ))}
              </div>
              <div className="charge-calculator">
                <div><span>{t("الرصيد", "Credits")}</span><b>{pricingRangeLabel(creditPrice.tier)}</b></div>
                <div><span>{t("سعر الرسالة", "Price per message")}</span><b>{creditPrice.perEmail.toFixed(3)} {t("ريال", "SAR")}</b></div>
                <div><span>{t("الإجمالي", "Total")}</span><b>{formatNumber(creditPrice.total)} {t("ريال", "SAR")}</b></div>
              </div>
              <p style={{ color: "#d92d20", fontWeight: 800, fontSize: 13 }}>{t("الأسعار غير شاملة ضريبة القيمة المضافة (15%)، وتُضاف عند صفحة الدفع.", "Prices exclude VAT. 15% VAT is added on the payment page.")}</p>
              <p className="field-hint">{t("السعر يشمل رصيد رسائل الحملات البريدية فقط. رسائل النظام مثل التفعيل واستعادة كلمة المرور لا تخصم من هذا الرصيد.", "This price is for promotional email campaign credits only. System emails such as verification and password reset do not deduct from this balance.")}</p>
              {chargeError ? <p className="form-error">{chargeError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setChargeOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="button" disabled={!canBuyCredits || chargeSubmitting} onClick={createChargeRequest}>{chargeSubmitting ? t("جارٍ التجهيز...", "Preparing...") : t("متابعة إلى صفحة الدفع", "Continue to checkout")}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
