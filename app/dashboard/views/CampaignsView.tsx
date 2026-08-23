"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Campaign, MessageTemplate } from "../types";
import { useLanguage } from "../i18n";

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
  const [campaignSearch, setCampaignSearch] = useState("");
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
    const response = await fetch("/api/campaigns/balance");
    if (response.ok) {
      const data = await response.json();
      setBalance(data.balance ?? 0);
      setBalanceTransactions(data.transactions ?? []);
    }
    setBalanceLoading(false);
  }

  useEffect(() => {
    if (activeTab === "balance") loadBalance();
  }, [activeTab]);

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    if (!query) return campaigns;

    return campaigns.filter((campaign) => (
      campaign.name.toLowerCase().includes(query) ||
      campaign.status.toLowerCase().includes(query) ||
      campaign.updatedAt.toLowerCase().includes(query) ||
      `${campaign.sent}/${campaign.total}`.includes(query)
    ));
  }, [campaignSearch, campaigns]);
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

  function openForm(campaign?: Campaign) {
    setFormError("");
    setCampaignFile(null);
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
    setReportRows(response.ok ? await response.json() : []);
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

    const body = new FormData();
    body.set("name", form.name);
    body.set("templateName", form.templateName);
    body.set("scheduled", String(form.scheduled));
    body.set("scheduledAt", form.scheduledAt);
    body.set("file", campaignFile);

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

    window.open(payload.paymentUrl, "_blank", "noopener");
    setChargeSubmitting(false);
    setChargeOpen(false);
    loadBalance();
  }

  function downloadCampaignReport(campaign: Campaign) {
    const header = [t("رقم الهاتف", "Phone number"), t("الحالة", "Status"), t("التاريخ", "Date")];
    const csv = [header, ...reportRows.map((row) => [row.phone, row.status, row.date])]
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
    <section className="page-stack">
      <div className="section-tabs campaign-tabs">
        <button className={activeTab === "campaigns" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("campaigns")}>{t("الحملات", "Campaigns")} ✈</button>
        <button className={activeTab === "balance" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("balance")}>{t("الرصيد و الشحن", "Balance & Top-up")} ▣</button>
      </div>

      {activeTab === "campaigns" ? (
        <div className="campaign-board">
          <div className="campaign-toolbar">
            <input value={campaignSearch} onChange={(event) => { setCampaignSearch(event.target.value); setCampaignPage(1); }} placeholder={t("بحث...", "Search...")} />
            <button className="btn primary" type="button" onClick={() => openForm()}>＋ {t("إنشاء حملة", "Create campaign")}</button>
            <button className="reload" type="button" onClick={onRefreshData}>↻ {t("إعادة تحميل", "Reload")}</button>
            <label className="entries">{t("عرض", "Show")} <select value={campaignPageSize} onChange={(event) => { setCampaignPageSize(event.target.value); setCampaignPage(1); }}><option>10</option><option>25</option><option>50</option></select> {t("إدخالات", "entries")}</label>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t("الحملة", "Campaign")}</th><th>{t("الرسائل المرسلة", "Messages sent")}</th><th>{t("حالة تقدم الحملة", "Progress")}</th><th>{t("الحالة", "Status")}</th><th>{t("آخر تحديث", "Last update")}</th><th /></tr></thead>
              <tbody>
                {campaignPagination.items.map((campaign) => (
                  <tr key={campaign.id}>
                    <td><div className="campaign-name"><span className="campaign-thumb">▧</span><span><b>{campaign.name}</b></span></div></td>
                    <td>{campaign.sent}/{campaign.total}</td>
                    <td><div className="progress-bar"><span style={{ width: campaign.progress }}>{campaign.progress}</span></div></td>
                    <td><span className={campaign.status === "ملغاة" ? "state off" : "state ok"}>{campaignStatusLabel(campaign.status, t)}</span></td>
                    <td><span className="campaign-date">◴ {campaign.updatedAt}</span></td>
                    <td className="row-actions">
                      <button className="campaign-report" type="button" onClick={() => openReport(campaign)}>↗ {t("تقرير الحملة", "Campaign report")}</button>
                      {campaign.status === "قيد الإرسال" || campaign.status === "مجدولة" ? (
                        <button className="btn soft" type="button" onClick={() => stopCampaign(campaign)}>{t("إيقاف", "Stop")}</button>
                      ) : null}
                      <button className="btn soft" type="button" onClick={() => openForm(campaign)}>{t("تعديل الاسم", "Edit name")}</button>
                      <button className="btn danger" type="button" onClick={() => deleteCampaign(campaign)}>{t("حذف", "Delete")}</button>
                    </td>
                  </tr>
                ))}
                {!campaignPagination.items.length ? (
                  <tr><td colSpan={6}>{t("لا توجد حملات مطابقة للبحث.", "No campaigns match your search.")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={campaignPagination.page} totalPages={campaignPagination.totalPages} onPageChange={setCampaignPage} />
        </div>
      ) : (
        <div className="balance-page">
          <div className="balance-metrics">
            <div className="balance-metric action">
              <button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>{t("شحن رصيد", "Top up balance")}</button>
            </div>
            <div className="balance-metric used">
              <span>{t("تم الاستخدام (كل الحملات)", "Used (all campaigns)")}</span>
              <b>{usedCampaignMessages.toLocaleString("en-US")}</b>
            </div>
            <div className="balance-metric allowed">
              <span>{t("الرصيد المتاح", "Available balance")}</span>
              <b>{balanceLoading ? "..." : balance.toLocaleString("en-US")}</b>
            </div>
          </div>

          <div className="campaign-board balance-board transactions-board">
            <div className="transactions-head">
              <span className="transactions-pulse">⌁</span>
              <h2>{t("المعاملات", "Transactions")}</h2>
            </div>
            <div className="campaign-toolbar transactions-toolbar">
              <input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }} placeholder={t("بحث...", "Search...")} />
              <button className="btn primary" type="button" onClick={() => setPricingOpen(true)}>▭ {t("أسعار الرسائل التسويقية", "Marketing message pricing")}</button>
              <label className="entries">
                {t("عرض", "Show")}
                <select value={balancePageSize} onChange={(event) => { setBalancePageSize(event.target.value); setBalancePage(1); }}>
                  <option>10</option><option>25</option><option>50</option>
                </select>
                {t("إدخالات", "entries")}
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
                      <td dir="ltr">{item.date}</td>
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
          <form className="account-modal form-modal campaign-create-modal" role="dialog" aria-modal="true" aria-label={t("حفظ حملة", "Save campaign")} onSubmit={submitCampaign} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? t("تعديل اسم الحملة", "Edit campaign name") : t("إنشاء حملة", "Create campaign")}</h2></header>
            <div className="account-modal-body form-grid">
              {!form.id ? <div className="campaign-warning">{t("الرجاء قبل إرسال أي حملة قم بإنشاء حملة تجريبية تحتوي على رقمك فقط، لتتأكد من الإرسال ووصول الرسالة دون أي مشكلة في الإرسال", "Before sending any campaign, please create a test campaign with just your own number to confirm the message sends and arrives without issues.")}</div> : null}
              <label><span>{t("اسم الحملة", "Campaign name")}</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("اسم الحملة", "Campaign name")} required /></label>
              {!form.id ? (
                <>
                  <label>
                    <span>{t("قناة الواتس اب", "WhatsApp channel")}</span>
                    <select value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}>
                      <option value="واتساب">{t("واتساب", "WhatsApp")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("النموذج", "Template")}</span>
                    <select
                      value={form.templateName}
                      onChange={(event) => setForm((current) => ({ ...current, templateName: event.target.value }))}
                      required
                      disabled={!approvedTemplates.length}
                    >
                      {approvedTemplates.length ? (
                        approvedTemplates.map((template) => (
                          <option key={template.name} value={template.name}>{template.name}</option>
                        ))
                      ) : (
                        <option value="">
                          {!whatsappConnected
                            ? t("اربط قناة واتساب أولاً", "Connect a WhatsApp channel first")
                            : t("لا توجد قوالب معتمدة من Meta", "No templates approved by Meta")}
                        </option>
                      )}
                    </select>
                    <small className="field-hint">{t("تظهر هنا فقط قوالب Meta التسويقية المعتمدة والجاهزة للإرسال.", "Only Meta marketing templates that are approved and ready to send appear here.")}</small>
                  </label>
                  <label>
                    <span>{t("ملف اكسل أو CSV", "Excel or CSV file")}</span>
                    <div className="file-picker">
                      <button type="button" onClick={() => document.getElementById("campaign-file-input")?.click()}>{t("تصفح", "Browse")}</button>
                      <span>{campaignFile?.name || t("اختر ملف اكسل أو CSV أو أسقطه هنا ...", "Choose an Excel or CSV file, or drop it here...")}</span>
                      <input
                        id="campaign-file-input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => setCampaignFile(event.target.files?.[0] || null)}
                      />
                    </div>
                    <small className="field-hint">{t("يجب أن تكون أرقام العملاء في أول عمود بصيغة 966 أو +966.", "Customer numbers must be in the first column, formatted as 966 or +966.")}</small>
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
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving || (!form.id && !approvedTemplates.length)}>{saving ? t("جاري الحفظ", "Saving") : form.id ? t("حفظ", "Save") : t("إرسال", "Submit")}</button></footer>
          </form>
        </div>
      ) : null}

      {reportCampaign ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReportCampaign(null)}>
          <div className="account-modal campaign-report-modal" role="dialog" aria-modal="true" aria-label={t(`تقرير الحملة ${reportCampaign.name}`, `Campaign report for ${reportCampaign.name}`)} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setReportCampaign(null)}>×</button>
              <h2>{t("تقرير الحملة", "Campaign report")} - {reportCampaign.name}</h2>
            </header>
            <div className="campaign-report-body">
              <div className="campaign-toolbar report-toolbar">
                <input value={reportSearch} onChange={(event) => { setReportSearch(event.target.value); setReportPage(1); }} placeholder={t("بحث...", "Search...")} />
                <button className="btn primary" type="button" onClick={() => downloadCampaignReport(reportCampaign)}>{t("تنزيل", "Download")}</button>
                <label className="entries">{t("عرض", "Show")} <select value={reportPageSize} onChange={(event) => { setReportPageSize(event.target.value); setReportPage(1); }}><option>10</option><option>25</option><option>50</option></select> {t("إدخالات", "entries")}</label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t("رقم الهاتف", "Phone number")}</th><th>{t("الحالة", "Status")}</th><th>{t("التاريخ", "Date")}</th></tr></thead>
                  <tbody>
                    {reportLoading ? <tr><td colSpan={3}>{t("جارٍ التحميل...", "Loading...")}</td></tr> : null}
                    {!reportLoading ? reportPagination.items.map((row) => (
                      <tr key={row.phone}>
                        <td dir="ltr">{row.phone}</td>
                        <td><span className={row.status === "تم الإرسال" ? "state ok" : row.status === "قيد الإرسال" ? "state warn" : "state off"} title={row.error || undefined}>{reportRowStatusLabel(row.status, t)}</span></td>
                        <td><span className="campaign-date">◴ {row.date}</span></td>
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
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setChargeOpen(false)}>×</button>
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
          <div className="account-modal pricing-modal" role="dialog" aria-modal="true" aria-label={t("أسعار رسائل التسويقية", "Marketing message pricing")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setPricingOpen(false)}>×</button>
              <h2>{t("أسعار الرسائل التسويقية", "Marketing message pricing")}</h2>
            </header>
            <div className="account-modal-body">
              <div className="pricing-card">
                <p>{t("أسعار رسائل الحملات التسويقية حسب عدد الرسائل تبدأ من 3 هللات وتصل إلى 1.2 هللة.", "Marketing campaign message pricing by volume starts at 3 halalas and goes down to 1.2 halalas.")}</p>
                <ul>
                  {marketingMessagePrices.map((tier) => (
                    <li key={tier.range}><span>{pricingRangeLabel(tier.range, language)}</span><b>{formatCurrency(tier.rate, language)}</b></li>
                  ))}
                </ul>
                <strong>{t("*ملاحظة: جميع الأسعار لا تشمل رسوم واتساب أو أي رسوم خارجية من Meta.", "*Note: all prices exclude WhatsApp fees or any external fees charged by Meta.")}</strong>
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
