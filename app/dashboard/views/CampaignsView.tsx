"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Campaign, MessageTemplate } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import { formatDateTime } from "../../../lib/time";

const pageSizeOptions = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" }
];

type CampaignForm = {
  id?: string;
  name: string;
  channel: string;
  templateName: string;
  fileName: string;
  scheduled: boolean;
  scheduledAt: string;
};

type PricingTier = {
  range: string;
  min: number;
  max: number;
  rate: number;
};

type BalanceTransaction = {
  id: string;
  balance: number;
  usage: string;
  date: string;
  status: string;
  cost?: number;
};

type ReportRow = {
  phone: string;
  name: string;
  status: string;
  error: string;
  date: string;
};

const marketingMessagePrices: PricingTier[] = [
  { range: "1k إلى 5k", min: 1000, max: 5000, rate: 0.03 },
  { range: "5k إلى 10k", min: 5001, max: 10000, rate: 0.028 },
  { range: "10k إلى 25k", min: 10001, max: 25000, rate: 0.026 },
  { range: "25k إلى 50k", min: 25001, max: 50000, rate: 0.023 },
  { range: "50k إلى 100k", min: 50001, max: 100000, rate: 0.02 },
  { range: "100k إلى 150k", min: 100001, max: 150000, rate: 0.018 },
  { range: "150k إلى 250k", min: 150001, max: 250000, rate: 0.016 },
  { range: "250k إلى 500k", min: 250001, max: 500000, rate: 0.014 },
  { range: "500k إلى 1m", min: 500001, max: 1000000, rate: 0.012 }
];

function pricingRangeLabel(range: string, language: string) {
  if (language !== "en") return range;
  return range.replace("إلى", "to");
}

function campaignStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "الحملة أنجزت") return t("الحملة أنجزت", "Completed");
  if (status === "قيد الإرسال") return t("قيد الإرسال", "Sending");
  if (status === "مجدولة") return t("مجدولة", "Scheduled");
  if (status === "ملغاة") return t("ملغاة", "Cancelled");
  return status;
}

function transactionStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "مكتمل") return t("مكتمل", "Completed");
  if (status === "قيد الانتظار") return t("قيد الانتظار", "Pending");
  if (status === "فشل") return t("فشل", "Failed");
  return status;
}

function reportRowStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "تم الإرسال") return t("تم الإرسال", "Sent");
  if (status === "قيد الإرسال") return t("قيد الإرسال", "Sending");
  if (status === "فشل") return t("فشل", "Failed");
  return status;
}

export default function CampaignsView({
  campaigns,
  templates,
  whatsappConnected,
  onRefreshData
}: {
  campaigns: Campaign[];
  templates: MessageTemplate[];
  whatsappConnected: boolean;
  onRefreshData: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const approvedTemplates = useMemo(
    () => !whatsappConnected ? [] : templates.filter((template) => (
      template.status === "معتمد" &&
      template.type !== "خدمة" &&
      (template.category === "MARKETING" || template.type === "تسويق")
    )),
    [templates, whatsappConnected]
  );
  const defaultTemplateName = approvedTemplates[0]?.name || "";
  const emptyForm = useMemo<CampaignForm>(
    () => ({
      name: "",
      channel: "واتساب",
      templateName: defaultTemplateName,
      fileName: "",
      scheduled: false,
      scheduledAt: ""
    }),
    [defaultTemplateName]
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [campaignFile, setCampaignFile] = useState<File | null>(null);
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
  const [brokenThumbIds, setBrokenThumbIds] = useState<Set<string>>(new Set());
  const selectedTemplate = approvedTemplates.find((template) => template.name === form.templateName);
  const needsHeaderMedia = Boolean(selectedTemplate && ["IMAGE", "VIDEO"].includes(selectedTemplate.headerType || "NONE"));
  const templateHasSavedMedia = Boolean(selectedTemplate?.hasHeaderMediaSaved);
  const [recipientPreview, setRecipientPreview] = useState<number | null>(null);
  const [recipientPreviewLoading, setRecipientPreviewLoading] = useState(false);
  const [recipientPreviewError, setRecipientPreviewError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"campaigns" | "balance">("campaigns");
  const [reportCampaign, setReportCampaign] = useState<Campaign | null>(null);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeMessages, setChargeMessages] = useState("5000");
  const [chargeError, setChargeError] = useState("");
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [balanceTransactions, setBalanceTransactions] = useState<BalanceTransaction[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceLoadError, setBalanceLoadError] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("all");
  const [campaignSort, setCampaignSort] = useState("latest");
  const [campaignPageSize, setCampaignPageSize] = useState("10");
  const [campaignPage, setCampaignPage] = useState(1);
  const [reportSearch, setReportSearch] = useState("");
  const [reportPageSize, setReportPageSize] = useState("10");
  const [reportPage, setReportPage] = useState(1);
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balancePageSize, setBalancePageSize] = useState("10");
  const [balancePage, setBalancePage] = useState(1);

  const parsedChargeMessages = Math.max(0, Number(chargeMessages.replace(/[^\d]/g, "")) || 0);
  const chargeTier = findMarketingMessageTier(parsedChargeMessages);
  const chargeTotal = chargeTier ? parsedChargeMessages * chargeTier.rate : 0;

  async function loadBalance() {
    setBalanceLoading(true);
    setBalanceLoadError("");
    try {
      const response = await fetch("/api/campaigns/balance");
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setBalanceLoadError(body?.error || `تعذر تحميل الرصيد (${response.status})`);
      } else {
        setBalance(body.data?.balance ?? 0);
        setBalanceTransactions(body.data?.transactions ?? []);
      }
    } catch {
      setBalanceLoadError("تعذر الاتصال بالسيرفر لتحميل الرصيد");
    }
    setBalanceLoading(false);
  }

  useEffect(() => {
    if (activeTab === "balance") loadBalance();
  }, [activeTab]);

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    const rows = campaigns.filter((campaign) => (
      (campaignStatusFilter === "all" || campaign.status === campaignStatusFilter) &&
      (!query || campaign.name.toLowerCase().includes(query) || campaign.status.toLowerCase().includes(query) || campaign.updatedAt.toLowerCase().includes(query) || `${campaign.sent}/${campaign.total}`.includes(query))
    ));
    if (campaignSort === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (campaignSort === "sent") return [...rows].sort((a, b) => b.sent - a.sent);
    if (campaignSort === "progress") return [...rows].sort((a, b) => Number.parseFloat(b.progress) - Number.parseFloat(a.progress));
    return rows;
  }, [campaignSearch, campaignSort, campaignStatusFilter, campaigns]);
  const campaignPagination = paginate(filteredCampaigns, campaignPage, Number(campaignPageSize));
  const filteredReportRows = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    if (!query) return reportRows;

    return reportRows.filter((row) => (
      row.phone.includes(query) ||
      row.status.toLowerCase().includes(query) ||
      row.date.toLowerCase().includes(query)
    ));
  }, [reportRows, reportSearch]);
  const reportPagination = paginate(filteredReportRows, reportPage, Number(reportPageSize));
  const filteredBalanceTransactions = useMemo(() => {
    const query = balanceSearch.trim().toLowerCase();
    if (!query) return balanceTransactions;
    return balanceTransactions.filter((item) => (
      item.id.toLowerCase().includes(query) ||
      item.usage.toLowerCase().includes(query) ||
      item.status.toLowerCase().includes(query) ||
      item.date.toLowerCase().includes(query) ||
      String(item.balance).includes(query)
    ));
  }, [balanceSearch, balanceTransactions]);
  const balancePagination = paginate(filteredBalanceTransactions, balancePage, Number(balancePageSize));
  const usedCampaignMessages = useMemo(() => campaigns.reduce((total, campaign) => total + campaign.sent, 0), [campaigns]);
  const campaignOverview = useMemo(() => {
    const recipients = campaigns.reduce((total, campaign) => total + campaign.total, 0);
    const sent = campaigns.reduce((total, campaign) => total + campaign.sent, 0);
    return {
      recipients,
      sent,
      remaining: Math.max(0, recipients - sent),
      sendRate: recipients ? Math.round((sent / recipients) * 100) : 0,
      completed: campaigns.filter((campaign) => campaign.status === "الحملة أنجزت").length,
      active: campaigns.filter((campaign) => campaign.status === "قيد الإرسال" || campaign.status === "مجدولة").length
    };
  }, [campaigns]);

  async function handleCampaignFileChange(file: File | null) {
    setCampaignFile(file);
    setRecipientPreview(null);
    setRecipientPreviewError("");
    if (!file) return;

    setRecipientPreviewLoading(true);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/campaigns/preview-recipients", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    setRecipientPreviewLoading(false);

    if (!response.ok || !payload?.ok) {
      setRecipientPreviewError(payload?.error || t("تعذر قراءة الملف", "Unable to read the file"));
      return;
    }
    setRecipientPreview(payload.data?.count ?? 0);
  }

  function openForm(campaign?: Campaign) {
    setFormError("");
    setCampaignFile(null);
    setHeaderMediaFile(null);
    setRecipientPreview(campaign?.total ?? null);
    setRecipientPreviewError("");
    setForm(
      campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            channel: "واتساب",
            templateName: defaultTemplateName,
            fileName: "",
            scheduled: false,
            scheduledAt: ""
          }
        : emptyForm
    );
    setFormOpen(true);
  }

  async function openReport(campaign: Campaign) {
    setReportSearch("");
    setReportPage(1);
    setReportPageSize("10");
    setReportCampaign(campaign);
    setReportLoading(true);
    const response = await fetch(`/api/campaigns/${campaign.id}/report`);
    const body = await response.json().catch(() => null);
    setReportRows(response.ok && body?.ok ? body.data ?? [] : []);
    setReportLoading(false);
  }

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    if (form.id) {
      await fetch(`/api/campaigns/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name })
      });
      await onRefreshData();
      setSaving(false);
      setFormOpen(false);
      return;
    }

    if (!campaignFile) {
      setFormError(t("ارفع ملف Excel أو CSV يحتوي على أرقام العملاء", "Upload an Excel or CSV file containing your customers' numbers"));
      setSaving(false);
      return;
    }

    if (needsHeaderMedia && !templateHasSavedMedia && !headerMediaFile) {
      setFormError(t("هذا القالب يحتاج صورة أو فيديو بالرأس - ارفعها قبل إنشاء الحملة", "This template needs a header image or video - upload one before creating the campaign"));
      setSaving(false);
      return;
    }

    const body = new FormData();
    body.set("name", form.name);
    body.set("templateName", form.templateName);
    body.set("scheduled", String(form.scheduled));
    body.set("scheduledAt", form.scheduledAt);
    body.set("file", campaignFile);
    if (headerMediaFile) body.set("headerMedia", headerMediaFile);

    const response = await fetch("/api/campaigns", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setFormError(payload?.error || t("تعذر إنشاء الحملة", "Unable to create the campaign"));
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
    if (payload?.data?.balanceWarning) window.alert(payload.data.balanceWarning);
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!window.confirm(t(`حذف حملة ${campaign.name}؟`, `Delete the "${campaign.name}" campaign?`))) return;
    await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  async function stopCampaign(campaign: Campaign) {
    if (!window.confirm(t(`إيقاف حملة ${campaign.name}؟ الأرقام اللي ما وصلها الإرسال بعد بتبقى موقوفة.`, `Stop the "${campaign.name}" campaign? Numbers that haven't been messaged yet will remain unsent.`))) return;
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ملغاة" })
    });
    await onRefreshData();
  }

  async function sendCampaignNow(campaign: Campaign) {
    if (!window.confirm(t(`إرسال حملة ${campaign.name} الآن إلى ${campaign.total.toLocaleString("en-US")} مستلم؟`, `Send the "${campaign.name}" campaign now to ${campaign.total.toLocaleString("en-US")} recipient(s)?`))) return;
    const response = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendNow: true })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error || t("تعذر بدء إرسال الحملة", "Unable to start the campaign"));
      return;
    }
    await onRefreshData();
  }

  async function createChargeRequest() {
    if (!chargeTier) return;
    setChargeError("");
    setChargeSubmitting(true);

    const response = await fetch("/api/campaigns/balance/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: parsedChargeMessages })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setChargeError(payload?.error || t("تعذر إنشاء طلب الشحن", "Unable to create the top-up request"));
      setChargeSubmitting(false);
      return;
    }

    window.open(payload?.data?.paymentUrl, "_blank", "noopener");
    setChargeSubmitting(false);
    setChargeOpen(false);
    loadBalance();
  }

  function downloadCampaignReport(campaign: Campaign) {
    const header = [t("رقم الهاتف", "Phone number"), t("الحالة", "Status"), t("التاريخ", "Date")];
    const csv = [header, ...reportRows.map((row) => [row.phone, row.status, formatDateTime(row.date)])]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaign.name}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page-stack campaigns-page">
      <header className="campaigns-hero">
        <div><span>{t("مركز الحملات", "CAMPAIGN CENTER")}</span><h1>{t("حملات أوضح، من التجهيز حتى الإرسال", "Clear campaigns from setup to delivery")}</h1><p>{t("أنشئ جمهورك، اختر القالب، راجع التفاصيل ثم تابع التنفيذ من مكان واحد.", "Build your audience, choose a template, review details, and track execution in one place.")}</p></div>
        <button className="btn primary campaign-create-cta" type="button" onClick={() => openForm()}>＋ {t("حملة جديدة", "New campaign")}</button>
      </header>
      <div className="section-tabs campaign-tabs">
        <button className={activeTab === "campaigns" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("campaigns")}>{t("نظرة الحملات", "Campaign overview")}</button>
        <button className={activeTab === "balance" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("balance")}>{t("الرصيد و الشحن", "Balance & Top-up")}</button>
      </div>

      {activeTab === "campaigns" ? (
        <>
          <section className="campaign-health-grid" aria-label={t("جاهزية الحملات", "Campaign readiness")}>
            <article className={whatsappConnected ? "is-ready" : "is-blocked"}><span>◉</span><div><b>{t("قناة الإرسال", "Sending channel")}</b><strong>{whatsappConnected ? t("واتساب متصل", "WhatsApp connected") : t("تحتاج ربط", "Connection required")}</strong></div></article>
            <article className={approvedTemplates.length ? "is-ready" : "is-blocked"}><span>◇</span><div><b>{t("القوالب الجاهزة", "Ready templates")}</b><strong>{approvedTemplates.length} {t("قالب معتمد", "approved templates")}</strong></div></article>
            <article><span>↗</span><div><b>{t("نسبة الإرسال", "Send rate")}</b><strong>{campaignOverview.sendRate}%</strong><small>{campaignOverview.sent.toLocaleString("en-US")} / {campaignOverview.recipients.toLocaleString("en-US")}</small></div></article>
          </section>
          <section className="campaign-kpis" aria-label={t("ملخص الحملات", "Campaign summary")}>
            <article><span>{t("تم إرسالها", "Sent")}</span><strong>{campaignOverview.sent.toLocaleString("en-US")}</strong><small>{t("رسالة عبر جميع الحملات", "messages across campaigns")}</small></article>
            <article><span>{t("بانتظار الإرسال", "Pending")}</span><strong>{campaignOverview.remaining.toLocaleString("en-US")}</strong><small>{t("من الجمهور المستهدف", "of the target audience")}</small></article>
            <article><span>{t("حملات مكتملة", "Completed")}</span><strong>{campaignOverview.completed}</strong><small>{t("أنهت عملية الإرسال", "finished sending")}</small></article>
            <article><span>{t("نشطة أو مجدولة", "Active or scheduled")}</span><strong>{campaignOverview.active}</strong><small>{t("تحتاج متابعة تشغيلية", "need operational follow-up")}</small></article>
          </section>
          <div className="campaign-board campaign-list-board">
            <div className="campaign-list-head"><div><h2>{t("كل الحملات", "All campaigns")}</h2><p>{t("تابع التنفيذ وافتح التقرير أو أوقف الحملة من نفس الصف.", "Track execution, open reports, or stop a campaign from the same row.")}</p></div><button className="reload" type="button" onClick={onRefreshData}>↻ {t("تحديث البيانات", "Refresh data")}</button></div>
            <div className="campaign-toolbar campaign-filterbar">
              <input value={campaignSearch} onChange={(event) => { setCampaignSearch(event.target.value); setCampaignPage(1); }} placeholder={t("ابحث باسم الحملة أو الحالة…", "Search name or status…")} />
              <CustomSelect value={campaignStatusFilter} onChange={(value) => { setCampaignStatusFilter(value); setCampaignPage(1); }} options={[{value:"all",label:t("كل الحالات","All statuses")},{value:"قيد الإرسال",label:t("قيد الإرسال","Sending")},{value:"مجدولة",label:t("مجدولة","Scheduled")},{value:"الحملة أنجزت",label:t("مكتملة","Completed")},{value:"ملغاة",label:t("ملغاة","Cancelled")}]} />
              <CustomSelect value={campaignSort} onChange={setCampaignSort} options={[{value:"latest",label:t("الأحدث أولاً","Latest first")},{value:"sent",label:t("الأكثر إرسالاً","Most sent")},{value:"progress",label:t("الأعلى تقدماً","Highest progress")},{value:"name",label:t("حسب الاسم","By name")}]} />
              <label className="entries">{t("عرض", "Show")} <CustomSelect className="page-size" value={campaignPageSize} onChange={(value) => { setCampaignPageSize(value); setCampaignPage(1); }} options={pageSizeOptions} /></label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("الحملة", "Campaign")}</th><th>{t("الإرسال", "Sending")}</th><th>{t("التقدم", "Progress")}</th><th>{t("الحالة", "Status")}</th><th>{t("آخر تحديث", "Last update")}</th><th>{t("الإجراءات", "Actions")}</th></tr></thead>
                <tbody>
                  {campaignPagination.items.map((campaign) => (
                    <tr key={campaign.id}>
                      <td><div className="campaign-name"><span className="campaign-thumb">{campaign.hasHeaderMedia && !brokenThumbIds.has(campaign.id) ? <img src={`/api/whatsapp/campaign-media/${campaign.id}`} alt="" onError={() => setBrokenThumbIds((current) => new Set(current).add(campaign.id))} /> : campaign.name.trim().charAt(0) || "؟"}</span><span><b title={campaign.name}>{campaign.name}</b></span></div></td>
                      <td><b>{campaign.sent.toLocaleString("en-US")}</b><small className="campaign-cell-note"> {t("من", "of")} {campaign.total.toLocaleString("en-US")}</small></td>
                      <td><div className="progress-bar"><span style={{ width: campaign.progress }}>{campaign.progress}</span></div></td>
                      <td><span className={campaign.status === "ملغاة" ? "state off" : campaign.status === "مجدولة" ? "state warn" : "state ok"}>{campaignStatusLabel(campaign.status, t)}</span></td>
                      <td><span className="campaign-date">◴ {campaign.updatedAt}</span></td>
                      <td className="row-actions campaign-row-actions">
                        <button className="campaign-report" type="button" onClick={() => openReport(campaign)}>{t("التقرير", "Report")}</button>
                        {campaign.status === "مجدولة" && campaign.total > 0 ? <button className="btn primary" type="button" onClick={() => sendCampaignNow(campaign)}>{t("إرسال الآن", "Send now")}</button> : null}
                        {campaign.status === "قيد الإرسال" || campaign.status === "مجدولة" ? <button className="btn soft" type="button" onClick={() => stopCampaign(campaign)}>{t("إيقاف", "Stop")}</button> : null}
                        <button className="btn soft" type="button" onClick={() => openForm(campaign)}>{t("تعديل", "Edit")}</button>
                        <button className="btn danger" type="button" onClick={() => deleteCampaign(campaign)}>{t("حذف", "Delete")}</button>
                      </td>
                    </tr>
                  ))}
                  {!campaignPagination.items.length ? <tr><td colSpan={6}><div className="campaign-empty"><strong>{t("لا توجد حملات مطابقة", "No matching campaigns")}</strong><span>{t("غيّر البحث أو الحالة، أو أنشئ حملة جديدة.", "Adjust the filters or create a new campaign.")}</span></div></td></tr> : null}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={campaignPagination.page} totalPages={campaignPagination.totalPages} onPageChange={setCampaignPage} />
          </div>
        </>
      ) : (
        <div className="balance-page">
          {balanceLoadError ? <p className="form-error">{balanceLoadError}</p> : null}
          <section className="campaign-balance-hero">
            <div><span>{t("رصيد الحملات", "CAMPAIGN BALANCE")}</span><h2>{t("تحكّم في رصيد الإرسال من مكان واحد", "Manage your sending balance in one place")}</h2><p>{t("اشحن الرصيد حسب احتياجك، ثم راقب كل عملية إضافة أو استخدام في السجل المالي أدناه.", "Top up as needed, then review every credit and usage entry in the ledger below.")}</p></div>
            <div className="campaign-balance-total"><small>{t("الرصيد المتاح", "Available balance")}</small><strong>{balanceLoading ? "..." : balance.toLocaleString("en-US")}</strong><span>{t("رسالة", "messages")}</span><button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>＋ {t("شحن الرصيد", "Top up balance")}</button></div>
          </section>
          <section className="balance-kpi-grid">
            <article><span>{t("الاستخدام الكلي", "Total usage")}</span><strong>{usedCampaignMessages.toLocaleString("en-US")}</strong><small>{t("رسالة مستخدمة في الحملات", "messages used in campaigns")}</small></article>
            <article><span>{t("المعاملات المسجلة", "Recorded transactions")}</span><strong>{balanceTransactions.length}</strong><small>{t("عمليات شحن واستخدام", "top-up and usage entries")}</small></article>
            <article className="balance-pricing-card"><span>{t("التسعير حسب الحجم", "Volume pricing")}</span><strong>{t("ابتداءً من 0.012 ريال", "From SAR 0.012")}</strong><button type="button" onClick={() => setPricingOpen(true)}>{t("عرض جدول الأسعار", "View pricing table")} ←</button></article>
          </section>

          <div className="campaign-board balance-board transactions-board">
            <div className="transactions-head">
              <div><h2>{t("سجل المعاملات", "Transaction ledger")}</h2><p>{t("جميع حركات الرصيد مرتبة داخل جدول واحد.", "All balance movements in one table.")}</p></div>
            </div>
            <div className="campaign-toolbar transactions-toolbar">
              <input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }} placeholder={t("ابحث في الاستخدام أو الحالة أو التاريخ…", "Search usage, status, or date…")} />
              <label className="entries">
                {t("عرض", "Show")}
                <CustomSelect className="page-size" value={balancePageSize} onChange={(value) => { setBalancePageSize(value); setBalancePage(1); }} options={pageSizeOptions} />
                {t("صفوف", "rows")}
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("رصيد", "Balance")}</th><th>{t("الاستخدام", "Usage")}</th><th>{t("الحالة", "Status")}</th><th>{t("التاريخ", "Date")}</th></tr></thead>
                <tbody>
                  {balancePagination.items.map((item) => (
                    <tr key={item.id}>
                      <td><span className={item.balance > 0 ? "balance-credit" : "balance-debit"}>{formatBalanceMovement(item.balance)}</span></td>
                      <td>{item.usage}</td>
                      <td><span className={item.status === "مكتمل" ? "state ok" : item.status === "قيد الانتظار" ? "state warn" : "state off"}>{transactionStatusLabel(item.status, t)}</span></td>
                      <td dir="ltr">{formatDateTime(item.date)}</td>
                    </tr>
                  ))}
                  {!balancePagination.items.length ? (
                    <tr><td colSpan={4}>{t("لا توجد معاملات مطابقة للبحث.", "No transactions match your search.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={balancePagination.page} totalPages={balancePagination.totalPages} onPageChange={setBalancePage} />
          </div>
        </div>
      )}

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal campaign-create-modal campaign-builder-modal" role="dialog" aria-modal="true" aria-label={t("حفظ حملة", "Save campaign")} onSubmit={submitCampaign} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head campaign-builder-head"><button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button><div><span>{t("منشئ الحملات", "CAMPAIGN BUILDER")}</span><h2>{form.id ? t("تعديل اسم الحملة", "Edit campaign name") : t("إنشاء حملة جديدة", "Create a new campaign")}</h2></div></header>
            <div className="account-modal-body form-grid campaign-builder-fields">
              {!form.id ? <div className="campaign-warning">{t("الرجاء قبل إرسال أي حملة قم بإنشاء حملة تجريبية تحتوي على رقمك فقط، لتتأكد من الإرسال ووصول الرسالة دون أي مشكلة في الإرسال", "Before sending any campaign, please create a test campaign with just your own number to confirm the message sends and arrives without issues.")}</div> : null}
              <label><span>{t("اسم الحملة", "Campaign name")}</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("اسم الحملة", "Campaign name")} required /></label>
              {!form.id ? (
                <>
                  <label>
                    <span>{t("قناة الواتس اب", "WhatsApp channel")}</span>
                    <input value={t("واتساب", "WhatsApp")} readOnly />
                  </label>
                  <label>
                    <span>{t("النموذج", "Template")}</span>
                    <CustomSelect
                      value={form.templateName}
                      onChange={(value) => setForm((current) => ({ ...current, templateName: value }))}
                      disabled={!approvedTemplates.length}
                      options={
                        approvedTemplates.length
                          ? approvedTemplates.map((template) => ({ value: template.name, label: template.name }))
                          : [{
                              value: "",
                              label: !whatsappConnected
                                ? t("اربط قناة واتساب أولاً", "Connect a WhatsApp channel first")
                                : t("لا توجد قوالب معتمدة من Meta", "No templates approved by Meta")
                            }]
                      }
                    />
                    <small className="field-hint">{t("تظهر هنا فقط قوالب Meta التسويقية المعتمدة والجاهزة للإرسال.", "Only Meta marketing templates that are approved and ready to send appear here.")}</small>
                  </label>
                  {needsHeaderMedia ? (
                    <label>
                      <span>{t("أضف صورة أو فيديو", "Add image or video")}</span>
                      <div className="file-picker">
                        <button type="button" onClick={() => document.getElementById("campaign-header-media-input")?.click()}>{t("تصفح", "Browse")}</button>
                        <span>
                          {headerMediaFile?.name
                            || (templateHasSavedMedia
                              ? t("سيتم استخدام الصورة/الفيديو المحفوظة (اختياري: ارفع ملفاً لاستبدالها لهذه الحملة)", "The saved image/video will be used (optional: upload a file to override it for this campaign)")
                              : t("اختر صورة أو فيديو أو أسقطه هنا ...", "Choose an image or video, or drop it here..."))}
                        </span>
                        <input
                          id="campaign-header-media-input"
                          type="file"
                          accept="image/jpeg,image/png,video/mp4,video/3gpp"
                          onChange={(event) => setHeaderMediaFile(event.target.files?.[0] || null)}
                        />
                      </div>
                      <small className="field-hint">{t("الحد الأقصى 16 ميجابايت.", "Max 16MB.")}</small>
                    </label>
                  ) : null}
                  <label>
                    <span>{t("ملف اكسل أو CSV", "Excel or CSV file")}</span>
                    <div className="file-picker">
                      <button type="button" onClick={() => document.getElementById("campaign-file-input")?.click()}>{t("تصفح", "Browse")}</button>
                      <span>{campaignFile?.name || t("اختر ملف اكسل أو CSV أو أسقطه هنا ...", "Choose an Excel or CSV file, or drop it here...")}</span>
                      <input
                        id="campaign-file-input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => handleCampaignFileChange(event.target.files?.[0] || null)}
                      />
                    </div>
                    <small className="field-hint">{t("يجب أن تكون أرقام العملاء في أول عمود بصيغة 966 أو +966.", "Customer numbers must be in the first column, formatted as 966 or +966.")}</small>
                    {recipientPreviewLoading ? (
                      <small className="field-hint">{t("جاري فحص الملف...", "Checking the file...")}</small>
                    ) : recipientPreviewError ? (
                      <p className="form-error">{recipientPreviewError}</p>
                    ) : recipientPreview !== null ? (
                      <small className="field-hint">
                        {recipientPreview > 0
                          ? t(`تم العثور على ${recipientPreview.toLocaleString("en-US")} رقم صحيح في الملف.`, `Found ${recipientPreview.toLocaleString("en-US")} valid numbers in the file.`)
                          : t("ما لقينا أي أرقام صالحة في الملف. تأكد إن الأرقام بالعمود الأول.", "No valid numbers found in the file. Make sure numbers are in the first column.")}
                      </small>
                    ) : null}
                  </label>
                  <label className="schedule-toggle">
                    <span>{t("جدولة الحملة؟", "Schedule the campaign?")}</span>
                    <button
                      className={form.scheduled ? "toggle on" : "toggle"}
                      type="button"
                      aria-pressed={form.scheduled}
                      onClick={() => setForm((current) => ({ ...current, scheduled: !current.scheduled, scheduledAt: current.scheduled ? "" : current.scheduledAt }))}
                    />
                  </label>
                  {form.scheduled ? (
                    <label><span>{t("تاريخ ووقت الإرسال", "Send date and time")}</span><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label>
                  ) : null}
                  {!approvedTemplates.length ? (
                    <p className="form-error">
                      {!whatsappConnected
                        ? t("لا يمكن إنشاء حملة قبل ربط قناة واتساب من الإعدادات.", "You can't create a campaign before connecting a WhatsApp channel from Settings.")
                        : t("لا يمكن إنشاء حملة حتى تتم مزامنة قالب تسويقي معتمد من Meta.", "You can't create a campaign until an approved Meta marketing template has been synced.")}
                    </p>
                  ) : null}
                </>
              ) : null}
              {formError ? <p className="form-error">{formError}</p> : null}
            </div>
            <aside className="campaign-live-preview" aria-label={t("معاينة الحملة", "Campaign preview")}>
              <div className="campaign-preview-title"><span>{t("معاينة مباشرة", "Live preview")}</span><small>{t("شكل تقريبي للرسالة", "Approximate message appearance")}</small></div>
              <div className="campaign-phone"><div className="campaign-phone-bar"><span>Linkly</span><i>•••</i></div><div className="campaign-phone-notice">{t("محادثة أعمال موثقة وآمنة", "Verified and secure business chat")}</div><div className="campaign-message-preview"><b>{form.name || t("اسم الحملة", "Campaign name")}</b><p>{approvedTemplates.find((template) => template.name === form.templateName)?.message || t("اختر قالباً معتمداً لتظهر معاينة نص الرسالة هنا.", "Choose an approved template to preview its message here.")}</p><time>3:34 PM</time></div></div>
              <dl><div><dt>{t("الجمهور", "Audience")}</dt><dd>{recipientPreview === null ? "—" : recipientPreview.toLocaleString("en-US")}</dd></div><div><dt>{t("طريقة الإرسال", "Delivery")}</dt><dd>{form.scheduled ? t("مجدولة", "Scheduled") : t("فوري", "Immediate")}</dd></div></dl>
            </aside>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving || (!form.id && (!approvedTemplates.length || !campaignFile || !recipientPreview || (needsHeaderMedia && !templateHasSavedMedia && !headerMediaFile)))}>{saving ? t("جاري الحفظ", "Saving") : form.id ? t("حفظ", "Save") : form.scheduled ? t("جدولة الحملة", "Schedule campaign") : t("إرسال الحملة", "Send campaign")}</button></footer>
          </form>
        </div>
      ) : null}

      {reportCampaign ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReportCampaign(null)}>
          <div className="account-modal campaign-report-modal" role="dialog" aria-modal="true" aria-label={t(`تقرير الحملة ${reportCampaign.name}`, `Campaign report for ${reportCampaign.name}`)} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setReportCampaign(null)}>×</button>
              <h2>{t("تقرير الحملة", "Campaign report")} - {reportCampaign.name}</h2>
            </header>
            <div className="campaign-report-body">
              <div className="campaign-toolbar report-toolbar">
                <input value={reportSearch} onChange={(event) => { setReportSearch(event.target.value); setReportPage(1); }} placeholder={t("بحث...", "Search...")} />
                <button className="btn primary" type="button" onClick={() => downloadCampaignReport(reportCampaign)}>{t("تنزيل", "Download")}</button>
                <label className="entries">{t("عرض", "Show")} <CustomSelect className="page-size" value={reportPageSize} onChange={(value) => { setReportPageSize(value); setReportPage(1); }} options={pageSizeOptions} /> {t("إدخالات", "entries")}</label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t("رقم الهاتف", "Phone number")}</th><th>{t("الحالة", "Status")}</th><th>{t("التاريخ", "Date")}</th></tr></thead>
                  <tbody>
                    {reportLoading ? <tr><td colSpan={3}>{t("جارٍ التحميل...", "Loading...")}</td></tr> : null}
                    {!reportLoading ? reportPagination.items.map((row) => (
                      <tr key={row.phone}>
                        <td dir="ltr">{row.phone}</td>
                        <td>
                          <span className={row.status === "تم الإرسال" ? "state ok" : row.status === "قيد الإرسال" ? "state warn" : "state off"} title={row.error || undefined}>{reportRowStatusLabel(row.status, t)}</span>
                          {row.error ? <small className="campaign-report-error">{row.error}</small> : null}
                        </td>
                        <td><span className="campaign-date">◴ {formatDateTime(row.date)}</span></td>
                      </tr>
                    )) : null}
                    {!reportLoading && !reportPagination.items.length ? (
                      <tr><td colSpan={3}>{t("لا توجد أرقام مطابقة للبحث.", "No numbers match your search.")}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={reportPagination.page} totalPages={reportPagination.totalPages} onPageChange={setReportPage} />
            </div>
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setReportCampaign(null)}>{t("حسنًا", "OK")}</button></footer>
          </div>
        </div>
      ) : null}

      {chargeOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setChargeOpen(false)}>
          <div className="account-modal balance-modal" role="dialog" aria-modal="true" aria-label={t("شحن رصيد الحملات", "Top up campaign balance")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setChargeOpen(false)}>×</button>
              <h2>{t("شحن رصيد الحملات", "Top up campaign balance")}</h2>
            </header>
            <div className="account-modal-body balance-modal-body">
              <div className="balance-selected-package">
                <span>{t("الرصيد المطلوب", "Requested balance")}</span>
                <b>{parsedChargeMessages.toLocaleString("en-US")} {t("رسالة", "messages")}</b>
                <strong>{chargeTier ? t(`${formatCurrency(chargeTier.rate, "ar")} لكل رسالة`, `${formatCurrency(chargeTier.rate, "en")} per message`) : t("أدخل 1,000 رسالة أو أكثر", "Enter 1,000 messages or more")}</strong>
              </div>
              <label>
                <span>{t("عدد رسائل الحملات", "Number of campaign messages")}</span>
                <input
                  inputMode="numeric"
                  min="1000"
                  value={chargeMessages}
                  onChange={(event) => setChargeMessages(event.target.value)}
                  placeholder={t("مثال: 5000", "Example: 5000")}
                />
              </label>
              <div className="charge-presets" aria-label={t("اختيارات سريعة للشحن", "Quick top-up options")}>
                {[1000, 5000, 10000, 25000, 50000, 100000].map((value) => (
                  <button key={value} type="button" onClick={() => setChargeMessages(String(value))}>
                    {value.toLocaleString("en-US")} {t("رسالة", "messages")}
                  </button>
                ))}
              </div>
              <div className="charge-calculator">
                <div><span>{t("الشريحة", "Tier")}</span><b>{chargeTier ? pricingRangeLabel(chargeTier.range, language) : t("غير محددة", "Not set")}</b></div>
                <div><span>{t("سعر الرسالة", "Price per message")}</span><b>{chargeTier ? formatCurrency(chargeTier.rate, language) : "-"}</b></div>
                <div><span>{t("إجمالي الشحن", "Total top-up")}</span><b>{chargeTier ? formatCurrency(chargeTotal, language) : "-"}</b></div>
              </div>
              <p className="field-hint">{t('بالضغط على "إنشاء طلب الشحن" بتنفتح لك صفحة دفع آمنة من Moyasar لإتمام العملية ببطاقتك. الرصيد ينضاف تلقائيًا بعد نجاح الدفع.', 'Clicking "Create top-up request" opens a secure Moyasar payment page to complete the transaction with your card. The balance is added automatically once payment succeeds.')}</p>
              {chargeError ? <p className="form-error">{chargeError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setChargeOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="button" disabled={!chargeTier || chargeSubmitting} onClick={createChargeRequest}>{chargeSubmitting ? t("جارٍ التجهيز...", "Preparing...") : t("إنشاء طلب الشحن", "Create top-up request")}</button>
            </footer>
          </div>
        </div>
      ) : null}

      {pricingOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPricingOpen(false)}>
          <div className="account-modal pricing-modal" role="dialog" aria-modal="true" aria-label={t("أسعار الرسائل التسويقية", "Marketing message pricing")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setPricingOpen(false)}>×</button>
              <h2>{t("أسعار الرسائل التسويقية", "Marketing message pricing")}</h2>
            </header>
            <div className="account-modal-body">
              <div className="pricing-card pricing-table-card">
                <div className="pricing-intro"><span>{t("تسعير مرن", "FLEXIBLE PRICING")}</span><h3>{t("كلما زاد حجم الإرسال، انخفض سعر الرسالة", "The larger the volume, the lower the message price")}</h3><p>{t("اختر الشريحة المناسبة لحجم حملتك، ويُحسب الإجمالي تلقائياً عند شحن الرصيد.", "Choose the tier matching your campaign volume; the total is calculated automatically during top-up.")}</p></div>
                <div className="pricing-table" role="table" aria-label={t("شرائح أسعار الرسائل", "Message pricing tiers")}>
                  <div className="pricing-table-head" role="row"><span>{t("حجم الرسائل", "Message volume")}</span><span>{t("سعر الرسالة", "Price per message")}</span><span>{t("التوفير", "Saving")}</span></div>
                  {marketingMessagePrices.map((tier) => (
                    <div className="pricing-tier-row" role="row" key={tier.range}><span>{pricingRangeLabel(tier.range, language)}</span><b>{formatCurrency(tier.rate, language)}</b><em>{Math.round((1 - tier.rate / marketingMessagePrices[0].rate) * 100)}%</em></div>
                  ))}
                </div>
                <div className="pricing-note"><span>i</span><p>{t("الأسعار المعروضة خاصة برصيد Linkly ولا تشمل رسوم واتساب أو أي رسوم خارجية تفرضها Meta.", "Displayed prices cover Linkly balance only and exclude WhatsApp or other external Meta fees.")}</p></div>
              </div>
            </div>
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setPricingOpen(false)}>{t("حسنًا", "OK")}</button></footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    totalPages
  };
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="campaign-pages">
      <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>‹</button>
      <button className="active" type="button">{currentPage}</button>
      <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>›</button>
    </div>
  );
}

function findMarketingMessageTier(messages: number) {
  return marketingMessagePrices.find((tier) => messages >= tier.min && messages <= tier.max) ?? null;
}

function formatCurrency(value: number, language: string = "ar") {
  const currencyLabel = language === "en" ? "SAR" : "ريال";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${currencyLabel}`;
}

function formatBalanceMovement(value: number) {
  const sign = value > 0 ? "+" : "-";
  return `${sign} ${Math.abs(value).toLocaleString("en-US")}`;
}

function escapeCsvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}
