"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Campaign, MessageTemplate } from "../types";

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

export default function CampaignsView({
  campaigns,
  templates,
  onRefreshData
}: {
  campaigns: Campaign[];
  templates: MessageTemplate[];
  onRefreshData: () => Promise<void>;
}) {
  const approvedTemplates = useMemo(
    () => templates.filter((template) => (
      template.status === "معتمد" &&
      template.type !== "خدمة" &&
      (template.category === "MARKETING" || template.type === "تسويق")
    )),
    [templates]
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
      setFormError("ارفع ملف Excel أو CSV يحتوي على أرقام العملاء");
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
      setFormError(payload?.error || "تعذر إنشاء الحملة");
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
    if (payload?.data?.balanceWarning) window.alert(payload.data.balanceWarning);
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!window.confirm(`حذف حملة ${campaign.name}؟`)) return;
    await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  async function stopCampaign(campaign: Campaign) {
    if (!window.confirm(`إيقاف حملة ${campaign.name}؟ الأرقام اللي ما وصلها الإرسال بعد بتبقى موقوفة.`)) return;
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
      setChargeError(payload?.error || "تعذر إنشاء طلب الشحن");
      setChargeSubmitting(false);
      return;
    }

    window.open(payload.paymentUrl, "_blank", "noopener");
    setChargeSubmitting(false);
    setChargeOpen(false);
    loadBalance();
  }

  function downloadCampaignReport(campaign: Campaign) {
    const header = ["رقم الهاتف", "الحالة", "التاريخ"];
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
        <button className={activeTab === "campaigns" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("campaigns")}>الحملات ✈</button>
        <button className={activeTab === "balance" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("balance")}>الرصيد و الشحن ▣</button>
      </div>

      {activeTab === "campaigns" ? (
        <div className="campaign-board">
          <div className="campaign-toolbar">
            <input value={campaignSearch} onChange={(event) => { setCampaignSearch(event.target.value); setCampaignPage(1); }} placeholder="بحث..." />
            <button className="btn primary" type="button" onClick={() => openForm()}>＋ إنشاء حملة</button>
            <button className="reload" type="button" onClick={onRefreshData}>↻ إعادة تحميل</button>
            <label className="entries">عرض <select value={campaignPageSize} onChange={(event) => { setCampaignPageSize(event.target.value); setCampaignPage(1); }}><option>10</option><option>25</option><option>50</option></select> إدخالات</label>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الحملة</th><th>الرسائل المرسلة</th><th>حالة تقدم الحملة</th><th>الحالة</th><th>آخر تحديث</th><th /></tr></thead>
              <tbody>
                {campaignPagination.items.map((campaign) => (
                  <tr key={campaign.id}>
                    <td><div className="campaign-name"><span className="campaign-thumb">▧</span><span><b>{campaign.name}</b></span></div></td>
                    <td>{campaign.sent}/{campaign.total}</td>
                    <td><div className="progress-bar"><span style={{ width: campaign.progress }}>{campaign.progress}</span></div></td>
                    <td><span className={campaign.status === "ملغاة" ? "state off" : "state ok"}>{campaign.status}</span></td>
                    <td><span className="campaign-date">◴ {campaign.updatedAt}</span></td>
                    <td className="row-actions">
                      <button className="campaign-report" type="button" onClick={() => openReport(campaign)}>↗ تقرير الحملة</button>
                      {campaign.status === "قيد الإرسال" || campaign.status === "مجدولة" ? (
                        <button className="btn soft" type="button" onClick={() => stopCampaign(campaign)}>إيقاف</button>
                      ) : null}
                      <button className="btn soft" type="button" onClick={() => openForm(campaign)}>تعديل الاسم</button>
                      <button className="btn danger" type="button" onClick={() => deleteCampaign(campaign)}>حذف</button>
                    </td>
                  </tr>
                ))}
                {!campaignPagination.items.length ? (
                  <tr><td colSpan={6}>لا توجد حملات مطابقة للبحث.</td></tr>
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
              <button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>شحن رصيد</button>
            </div>
            <div className="balance-metric used">
              <span>تم الاستخدام (كل الحملات)</span>
              <b>{usedCampaignMessages.toLocaleString("en-US")}</b>
            </div>
            <div className="balance-metric allowed">
              <span>الرصيد المتاح</span>
              <b>{balanceLoading ? "..." : balance.toLocaleString("en-US")}</b>
            </div>
          </div>

          <div className="campaign-board balance-board transactions-board">
            <div className="transactions-head">
              <span className="transactions-pulse">⌁</span>
              <h2>المعاملات</h2>
            </div>
            <div className="campaign-toolbar transactions-toolbar">
              <input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }} placeholder="بحث..." />
              <button className="btn primary" type="button" onClick={() => setPricingOpen(true)}>▭ أسعار الرسائل التسويقية</button>
              <label className="entries">
                عرض
                <select value={balancePageSize} onChange={(event) => { setBalancePageSize(event.target.value); setBalancePage(1); }}>
                  <option>10</option><option>25</option><option>50</option>
                </select>
                إدخالات
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>رصيد</th><th>الاستخدام</th><th>الحالة</th><th>التاريخ</th></tr></thead>
                <tbody>
                  {balancePagination.items.map((item) => (
                    <tr key={item.id}>
                      <td><span className={item.balance > 0 ? "balance-credit" : "balance-debit"}>{formatBalanceMovement(item.balance)}</span></td>
                      <td>{item.usage}</td>
                      <td><span className={item.status === "مكتمل" ? "state ok" : item.status === "قيد الانتظار" ? "state warn" : "state off"}>{item.status}</span></td>
                      <td dir="ltr">{item.date}</td>
                    </tr>
                  ))}
                  {!balancePagination.items.length ? (
                    <tr><td colSpan={4}>لا توجد معاملات مطابقة للبحث.</td></tr>
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
          <form className="account-modal form-modal campaign-create-modal" role="dialog" aria-modal="true" aria-label="حفظ حملة" onSubmit={submitCampaign} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? "تعديل اسم الحملة" : "إنشاء حملة"}</h2></header>
            <div className="account-modal-body form-grid">
              {!form.id ? <div className="campaign-warning">الرجاء قبل إرسال أي حملة قم بإنشاء حملة تجريبية تحتوي على رقمك فقط، لتتأكد من الإرسال ووصول الرسالة دون أي مشكلة في الإرسال</div> : null}
              <label><span>اسم الحملة</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="اسم الحملة" required /></label>
              {!form.id ? (
                <>
                  <label>
                    <span>قناة الواتس اب</span>
                    <select value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}>
                      <option value="واتساب">واتساب</option>
                    </select>
                  </label>
                  <label>
                    <span>النموذج</span>
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
                        <option value="">لا توجد قوالب معتمدة من Meta</option>
                      )}
                    </select>
                    <small className="field-hint">تظهر هنا فقط قوالب Meta التسويقية المعتمدة والجاهزة للإرسال.</small>
                  </label>
                  <label>
                    <span>ملف اكسل أو CSV</span>
                    <div className="file-picker">
                      <button type="button" onClick={() => document.getElementById("campaign-file-input")?.click()}>تصفح</button>
                      <span>{campaignFile?.name || "اختر ملف اكسل أو CSV أو أسقطه هنا ..."}</span>
                      <input
                        id="campaign-file-input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => setCampaignFile(event.target.files?.[0] || null)}
                      />
                    </div>
                    <small className="field-hint">يجب أن تكون أرقام العملاء في أول عمود بصيغة 966 أو +966.</small>
                  </label>
                  <label className="schedule-toggle">
                    <span>جدولة الحملة؟</span>
                    <button
                      className={form.scheduled ? "toggle on" : "toggle"}
                      type="button"
                      aria-pressed={form.scheduled}
                      onClick={() => setForm((current) => ({ ...current, scheduled: !current.scheduled, scheduledAt: current.scheduled ? "" : current.scheduledAt }))}
                    />
                  </label>
                  {form.scheduled ? (
                    <label><span>تاريخ ووقت الإرسال</span><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label>
                  ) : null}
                  {!approvedTemplates.length ? <p className="form-error">لا يمكن إنشاء حملة حتى تتم مزامنة قالب تسويقي معتمد من Meta.</p> : null}
                </>
              ) : null}
              {formError ? <p className="form-error">{formError}</p> : null}
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn primary" type="submit" disabled={saving || (!form.id && !approvedTemplates.length)}>{saving ? "جاري الحفظ" : form.id ? "حفظ" : "إرسال"}</button></footer>
          </form>
        </div>
      ) : null}

      {reportCampaign ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReportCampaign(null)}>
          <div className="account-modal campaign-report-modal" role="dialog" aria-modal="true" aria-label={`تقرير الحملة ${reportCampaign.name}`} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setReportCampaign(null)}>×</button>
              <h2>تقرير الحملة - {reportCampaign.name}</h2>
            </header>
            <div className="campaign-report-body">
              <div className="campaign-toolbar report-toolbar">
                <input value={reportSearch} onChange={(event) => { setReportSearch(event.target.value); setReportPage(1); }} placeholder="بحث..." />
                <button className="btn primary" type="button" onClick={() => downloadCampaignReport(reportCampaign)}>تنزيل</button>
                <label className="entries">عرض <select value={reportPageSize} onChange={(event) => { setReportPageSize(event.target.value); setReportPage(1); }}><option>10</option><option>25</option><option>50</option></select> إدخالات</label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>رقم الهاتف</th><th>الحالة</th><th>التاريخ</th></tr></thead>
                  <tbody>
                    {reportLoading ? <tr><td colSpan={3}>جارٍ التحميل...</td></tr> : null}
                    {!reportLoading ? reportPagination.items.map((row) => (
                      <tr key={row.phone}>
                        <td dir="ltr">{row.phone}</td>
                        <td><span className={row.status === "تم الإرسال" ? "state ok" : row.status === "قيد الإرسال" ? "state warn" : "state off"} title={row.error || undefined}>{row.status}</span></td>
                        <td><span className="campaign-date">◴ {row.date}</span></td>
                      </tr>
                    )) : null}
                    {!reportLoading && !reportPagination.items.length ? (
                      <tr><td colSpan={3}>لا توجد أرقام مطابقة للبحث.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={reportPagination.page} totalPages={reportPagination.totalPages} onPageChange={setReportPage} />
            </div>
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setReportCampaign(null)}>حسنًا</button></footer>
          </div>
        </div>
      ) : null}

      {chargeOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setChargeOpen(false)}>
          <div className="account-modal balance-modal" role="dialog" aria-modal="true" aria-label="شحن رصيد الحملات" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setChargeOpen(false)}>×</button>
              <h2>شحن رصيد الحملات</h2>
            </header>
            <div className="account-modal-body balance-modal-body">
              <div className="balance-selected-package">
                <span>الرصيد المطلوب</span>
                <b>{parsedChargeMessages.toLocaleString("en-US")} رسالة</b>
                <strong>{chargeTier ? `${formatCurrency(chargeTier.rate)} لكل رسالة` : "أدخل 1,000 رسالة أو أكثر"}</strong>
              </div>
              <label>
                <span>عدد رسائل الحملات</span>
                <input
                  inputMode="numeric"
                  min="1000"
                  value={chargeMessages}
                  onChange={(event) => setChargeMessages(event.target.value)}
                  placeholder="مثال: 5000"
                />
              </label>
              <div className="charge-presets" aria-label="اختيارات سريعة للشحن">
                {[1000, 5000, 10000, 25000, 50000, 100000].map((value) => (
                  <button key={value} type="button" onClick={() => setChargeMessages(String(value))}>
                    {value.toLocaleString("en-US")} رسالة
                  </button>
                ))}
              </div>
              <div className="charge-calculator">
                <div><span>الشريحة</span><b>{chargeTier?.range ?? "غير محددة"}</b></div>
                <div><span>سعر الرسالة</span><b>{chargeTier ? formatCurrency(chargeTier.rate) : "-"}</b></div>
                <div><span>إجمالي الشحن</span><b>{chargeTier ? formatCurrency(chargeTotal) : "-"}</b></div>
              </div>
              <p className="field-hint">بالضغط على "إنشاء طلب الشحن" بتنفتح لك صفحة دفع آمنة من Moyasar لإتمام العملية ببطاقتك. الرصيد ينضاف تلقائيًا بعد نجاح الدفع.</p>
              {chargeError ? <p className="form-error">{chargeError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setChargeOpen(false)}>إلغاء</button>
              <button className="btn primary" type="button" disabled={!chargeTier || chargeSubmitting} onClick={createChargeRequest}>{chargeSubmitting ? "جارٍ التجهيز..." : "إنشاء طلب الشحن"}</button>
            </footer>
          </div>
        </div>
      ) : null}

      {pricingOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPricingOpen(false)}>
          <div className="account-modal pricing-modal" role="dialog" aria-modal="true" aria-label="أسعار رسائل التسويقية" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setPricingOpen(false)}>×</button>
              <h2>أسعار الرسائل التسويقية</h2>
            </header>
            <div className="account-modal-body">
              <div className="pricing-card">
                <p>أسعار رسائل الحملات التسويقية حسب عدد الرسائل تبدأ من 3 هللات وتصل إلى 1.2 هللة.</p>
                <ul>
                  {marketingMessagePrices.map((tier) => (
                    <li key={tier.range}><span>{tier.range}</span><b>{formatCurrency(tier.rate)}</b></li>
                  ))}
                </ul>
                <strong>*ملاحظة: جميع الأسعار لا تشمل رسوم واتساب أو أي رسوم خارجية من Meta.</strong>
              </div>
            </div>
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setPricingOpen(false)}>حسنًا</button></footer>
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

function formatCurrency(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} ريال`;
}

function formatBalanceMovement(value: number) {
  const sign = value > 0 ? "+" : "-";
  return `${sign} ${Math.abs(value).toLocaleString("en-US")}`;
}

function escapeCsvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}
