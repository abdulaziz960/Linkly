"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Employee, Lead } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type LeadForm = Omit<Lead, "id"> & { id?: string };

function LeadsImportCard() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  useEffect(() => {
    if (!open || webhookUrl) return;
    fetch("/api/settings/integration?channel=leads")
      .then((response) => response.json())
      .then((data: { webhookUrl?: string; verifyToken?: string }) => {
        const path = data.webhookUrl || "/api/zapier/leads";
        setWebhookUrl(`${window.location.origin}${path}`);
        setSecret(data.verifyToken || "");
      })
      .catch(() => {});
  }, [open, webhookUrl]);

  function copy(value: string, field: "url" | "secret") {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("استيراد تلقائي من Zapier / إعلانات Meta وGoogle", "Automatic import from Zapier / Meta and Google Ads")}</h2>
        <span />
        <button className="btn soft" type="button" onClick={() => setOpen((current) => !current)}>
          {open ? t("إخفاء", "Hide") : t("عرض رابط الاستيراد", "Show import link")}
        </button>
      </div>
      {open ? (
        <div className="panel-body">
          <p className="muted-copy">{t("وصّل أي مصدر ليدات (Zapier، Make، نموذج إعلانات Meta أو Google) بهذا الرابط ليضاف كل ليد جديد هنا تلقائيًا، مع فتح محادثة واتساب معه فورًا.", "Connect any lead source (Zapier, Make, a Meta or Google Ads form) to this link so every new lead is added here automatically, with a WhatsApp conversation opened with them right away.")}</p>
          <div className="telegram-steps">
            <div><span>1</span><b>{t("رابط الويبهوك", "Webhook URL")}</b><small className="copy-row"><span dir="ltr">{webhookUrl || "..."}</span><button className="btn soft" type="button" onClick={() => copy(webhookUrl, "url")}>{copied === "url" ? t("تم النسخ", "Copied") : t("نسخ", "Copy")}</button></small></div>
            <div><span>2</span><b>{t("Secret Token", "Secret Token")}</b><small className="copy-row"><span dir="ltr">{secret || "..."}</span><button className="btn soft" type="button" onClick={() => copy(secret, "secret")}>{copied === "secret" ? t("تم النسخ", "Copied") : t("نسخ", "Copy")}</button></small></div>
            <div><span>3</span><b>{t("أرسله بهيدر", "Send it as a header")}</b><small dir="ltr">Authorization: Bearer {"{secret}"}</small></div>
            <div><span>4</span><b>{t("الحقول المتوقعة", "Expected fields")}</b><small>name, phone, interest, budget, source, notes (JSON)</small></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function LeadsView({
  employees,
  leads,
  onRefreshData
}: {
  employees: Employee[];
  leads: Lead[];
  onRefreshData: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const emptyForm = useMemo<LeadForm>(
    () => ({
      customer: "",
      phone: "",
      interest: "",
      budget: "",
      source: "",
      notes: "",
      stage: "مهتم",
      employee: employees[0]?.name || "بدون موظف",
      lastContact: "اليوم"
    }),
    [employees]
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("الكل");
  const [employeeFilter, setEmployeeFilter] = useState("الكل");

  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesQuery = normalizedQuery
        ? [lead.customer, lead.phone, lead.interest, lead.budget, lead.source, lead.notes, lead.stage, lead.employee, lead.lastContact]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true;
      const matchesStage = stageFilter === "الكل" || lead.stage === stageFilter;
      const matchesEmployee = employeeFilter === "الكل" || lead.employee === employeeFilter;

      return matchesQuery && matchesStage && matchesEmployee;
    });
  }, [employeeFilter, leads, query, stageFilter]);

  const stages = useMemo(() => Array.from(new Set(leads.map((lead) => lead.stage))).filter(Boolean), [leads]);

  function openForm(lead?: Lead) {
    setForm(lead ? { ...lead } : emptyForm);
    setFormOpen(true);
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await fetch(form.id ? `/api/leads/${form.id}` : "/api/leads", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(t(`حذف ${lead.customer}؟`, `Delete ${lead.customer}?`))) return;
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <LeadsImportCard />
      <div className="panel">
        <div className="panel-head"><h2>{t("العملاء المحتملون للعقار", "Real Estate Leads")}</h2><span /><button className="btn soft" type="button" onClick={() => setFilterOpen((current) => !current)}>{t("تصفية", "Filter")}</button><button className="btn primary" type="button" onClick={() => openForm()}>{t("إضافة عميل محتمل", "Add lead")}</button></div>
        {filterOpen ? (
          <div className="inline-filter leads-filter">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("بحث باسم العميل، الرقم، المصدر، الاهتمام...", "Search by customer name, number, source, interest...")} />
            <CustomSelect
              value={stageFilter}
              onChange={setStageFilter}
              options={[{ value: "الكل", label: t("الكل", "All") }, ...stages.map((stage) => ({ value: stage, label: stage }))]}
            />
            <CustomSelect
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: "الكل", label: t("الكل", "All") },
                ...employees.map((employee) => ({ value: employee.name, label: employee.name })),
                { value: "بدون موظف", label: t("بدون موظف", "No employee") }
              ]}
            />
            <button className="btn soft" type="button" onClick={() => { setQuery(""); setStageFilter("الكل"); setEmployeeFilter("الكل"); }}>{t("مسح", "Clear")}</button>
          </div>
        ) : null}
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>{t("العميل", "Customer")}</th><th>{t("الجوال", "Phone")}</th><th>{t("المصدر", "Source")}</th><th>{t("الاهتمام", "Interest")}</th><th>{t("الميزانية", "Budget")}</th><th>{t("المرحلة", "Stage")}</th><th>{t("الموظف", "Employee")}</th><th>{t("آخر تواصل", "Last contact")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.customer}</td><td dir="ltr">{lead.phone || "-"}</td><td>{lead.source || "-"}</td><td>{lead.interest}</td><td>{lead.budget}</td><td><span className="state warn">{lead.stage}</span></td><td>{lead.employee}</td><td>{lead.lastContact}</td>
                  <td className="row-actions"><button className="btn soft" type="button" onClick={() => openForm(lead)}>{t("تعديل", "Edit")}</button><button className="btn danger" type="button" onClick={() => deleteLead(lead)}>{t("حذف", "Delete")}</button></td>
                </tr>
              ))}
              {!filteredLeads.length ? (
                <tr>
                  <td colSpan={9}>{t("لا توجد نتائج مطابقة للفلترة الحالية.", "No results match the current filters.")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ عميل محتمل", "Save lead")} onSubmit={submitLead} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? t("تعديل عميل محتمل", "Edit lead") : t("إضافة عميل محتمل", "Add lead")}</h2></header>
            <div className="account-modal-body form-grid">
              <label><span>{t("اسم العميل", "Customer name")}</span><input value={form.customer} onChange={(event) => setForm((current) => ({ ...current, customer: event.target.value }))} required /></label>
              <label><span>{t("رقم الجوال", "Phone number")}</span><input dir="ltr" value={form.phone || ""} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label><span>{t("الاهتمام", "Interest")}</span><input value={form.interest} onChange={(event) => setForm((current) => ({ ...current, interest: event.target.value }))} /></label>
              <label><span>{t("المصدر", "Source")}</span><input value={form.source || ""} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} placeholder="Zapier / Meta Ads / Google Ads" /></label>
              <div className="split-fields">
                <label><span>{t("الميزانية", "Budget")}</span><input value={form.budget} onChange={(event) => setForm((current) => ({ ...current, budget: event.target.value }))} /></label>
                <label><span>{t("المرحلة", "Stage")}</span><input value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))} /></label>
              </div>
              <label className="full"><span>{t("ملاحظات الليد", "Lead notes")}</span><textarea rows={3} value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="split-fields">
                <label><span>{t("الموظف", "Employee")}</span><CustomSelect value={form.employee} onChange={(value) => setForm((current) => ({ ...current, employee: value }))} options={[...employees.map((employee) => ({ value: employee.name, label: employee.name })), { value: "بدون موظف", label: "بدون موظف" }]} /></label>
                <label><span>{t("آخر تواصل", "Last contact")}</span><input value={form.lastContact} onChange={(event) => setForm((current) => ({ ...current, lastContact: event.target.value }))} /></label>
              </div>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
