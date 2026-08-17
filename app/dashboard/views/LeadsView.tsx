"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Employee, Lead } from "../types";

type LeadForm = Omit<Lead, "id"> & { id?: string };

function LeadsImportCard() {
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
        <h2>استيراد تلقائي من Zapier / إعلانات Meta وGoogle</h2>
        <span />
        <button className="btn soft" type="button" onClick={() => setOpen((current) => !current)}>
          {open ? "إخفاء" : "عرض رابط الاستيراد"}
        </button>
      </div>
      {open ? (
        <div className="panel-body">
          <p className="muted-copy">وصّل أي مصدر ليدات (Zapier، Make، نموذج إعلانات Meta أو Google) بهذا الرابط ليضاف كل ليد جديد هنا تلقائيًا، مع فتح محادثة واتساب معه فورًا.</p>
          <div className="telegram-steps">
            <div><span>1</span><b>رابط الويبهوك</b><small className="copy-row"><span dir="ltr">{webhookUrl || "..."}</span><button className="btn soft" type="button" onClick={() => copy(webhookUrl, "url")}>{copied === "url" ? "تم النسخ" : "نسخ"}</button></small></div>
            <div><span>2</span><b>Secret Token</b><small className="copy-row"><span dir="ltr">{secret || "..."}</span><button className="btn soft" type="button" onClick={() => copy(secret, "secret")}>{copied === "secret" ? "تم النسخ" : "نسخ"}</button></small></div>
            <div><span>3</span><b>أرسله بهيدر</b><small dir="ltr">Authorization: Bearer {"{secret}"}</small></div>
            <div><span>4</span><b>الحقول المتوقعة</b><small>name, phone, interest, budget, source, notes (JSON)</small></div>
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
    if (!window.confirm(`حذف ${lead.customer}؟`)) return;
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <LeadsImportCard />
      <div className="panel">
        <div className="panel-head"><h2>العملاء المحتملون للعقار</h2><span /><button className="btn soft" type="button" onClick={() => setFilterOpen((current) => !current)}>تصفية</button><button className="btn primary" type="button" onClick={() => openForm()}>إضافة عميل محتمل</button></div>
        {filterOpen ? (
          <div className="inline-filter leads-filter">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم العميل، الرقم، المصدر، الاهتمام..." />
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option>الكل</option>
              {stages.map((stage) => <option key={stage}>{stage}</option>)}
            </select>
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
              <option>الكل</option>
              {employees.map((employee) => <option key={employee.id}>{employee.name}</option>)}
              <option>بدون موظف</option>
            </select>
            <button className="btn soft" type="button" onClick={() => { setQuery(""); setStageFilter("الكل"); setEmployeeFilter("الكل"); }}>مسح</button>
          </div>
        ) : null}
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>العميل</th><th>الجوال</th><th>المصدر</th><th>الاهتمام</th><th>الميزانية</th><th>المرحلة</th><th>الموظف</th><th>آخر تواصل</th><th>إجراء</th></tr></thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.customer}</td><td dir="ltr">{lead.phone || "-"}</td><td>{lead.source || "-"}</td><td>{lead.interest}</td><td>{lead.budget}</td><td><span className="state warn">{lead.stage}</span></td><td>{lead.employee}</td><td>{lead.lastContact}</td>
                  <td className="row-actions"><button className="btn soft" type="button" onClick={() => openForm(lead)}>تعديل</button><button className="btn danger" type="button" onClick={() => deleteLead(lead)}>حذف</button></td>
                </tr>
              ))}
              {!filteredLeads.length ? (
                <tr>
                  <td colSpan={9}>لا توجد نتائج مطابقة للفلترة الحالية.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ عميل محتمل" onSubmit={submitLead} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? "تعديل عميل محتمل" : "إضافة عميل محتمل"}</h2></header>
            <div className="account-modal-body form-grid">
              <label><span>اسم العميل</span><input value={form.customer} onChange={(event) => setForm((current) => ({ ...current, customer: event.target.value }))} required /></label>
              <label><span>رقم الجوال</span><input dir="ltr" value={form.phone || ""} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label><span>الاهتمام</span><input value={form.interest} onChange={(event) => setForm((current) => ({ ...current, interest: event.target.value }))} /></label>
              <label><span>المصدر</span><input value={form.source || ""} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} placeholder="Zapier / Meta Ads / Google Ads" /></label>
              <div className="split-fields">
                <label><span>الميزانية</span><input value={form.budget} onChange={(event) => setForm((current) => ({ ...current, budget: event.target.value }))} /></label>
                <label><span>المرحلة</span><input value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))} /></label>
              </div>
              <label className="full"><span>ملاحظات الليد</span><textarea rows={3} value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="split-fields">
                <label><span>الموظف</span><select value={form.employee} onChange={(event) => setForm((current) => ({ ...current, employee: event.target.value }))}>{employees.map((employee) => <option key={employee.id}>{employee.name}</option>)}<option>بدون موظف</option></select></label>
                <label><span>آخر تواصل</span><input value={form.lastContact} onChange={(event) => setForm((current) => ({ ...current, lastContact: event.target.value }))} /></label>
              </div>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
