"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Employee, Lead } from "../types";

type LeadForm = Omit<Lead, "id"> & { id?: string };

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
      interest: "",
      budget: "",
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
        ? [lead.customer, lead.interest, lead.budget, lead.stage, lead.employee, lead.lastContact]
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
      <div className="panel">
        <div className="panel-head"><h2>العملاء المحتملون للعقار</h2><span /><button className="btn soft" type="button" onClick={() => setFilterOpen((current) => !current)}>تصفية</button><button className="btn primary" type="button" onClick={() => openForm()}>إضافة عميل محتمل</button></div>
        {filterOpen ? (
          <div className="inline-filter leads-filter">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم العميل، الاهتمام، الميزانية..." />
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
            <thead><tr><th>العميل</th><th>الاهتمام</th><th>الميزانية</th><th>المرحلة</th><th>الموظف</th><th>آخر تواصل</th><th>إجراء</th></tr></thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.customer}</td><td>{lead.interest}</td><td>{lead.budget}</td><td><span className="state warn">{lead.stage}</span></td><td>{lead.employee}</td><td>{lead.lastContact}</td>
                  <td className="row-actions"><button className="btn soft" type="button" onClick={() => openForm(lead)}>تعديل</button><button className="btn danger" type="button" onClick={() => deleteLead(lead)}>حذف</button></td>
                </tr>
              ))}
              {!filteredLeads.length ? (
                <tr>
                  <td colSpan={7}>لا توجد نتائج مطابقة للفلترة الحالية.</td>
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
              <label><span>الاهتمام</span><input value={form.interest} onChange={(event) => setForm((current) => ({ ...current, interest: event.target.value }))} /></label>
              <div className="split-fields">
                <label><span>الميزانية</span><input value={form.budget} onChange={(event) => setForm((current) => ({ ...current, budget: event.target.value }))} /></label>
                <label><span>المرحلة</span><input value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))} /></label>
              </div>
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
