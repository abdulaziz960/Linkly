"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Customer } from "../types";

type CustomerFormState = {
  id?: string;
  name: string;
  phone: string;
};

export default function ContactsView({
  customers,
  onOpenConversation,
  onRefreshData
}: {
  customers: Customer[];
  onOpenConversation: (conversationId: string) => void;
  onRefreshData: () => Promise<void>;
}) {
  const emptyForm = useMemo<CustomerFormState>(() => ({ name: "", phone: "" }), []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) => (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.tags.join(" ").toLowerCase().includes(query)
    ));
  }, [customers, search]);

  function openCreateForm() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(customer: Customer) {
    setError("");
    setForm({
      id: customer.id,
      name: customer.name,
      phone: customer.phone
    });
    setFormOpen(true);
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.id ? `/api/customers/${form.id}` : "/api/customers", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as { ok: boolean; data?: Customer; error?: string };

    if (!payload.ok) {
      setError(payload.error || "تعذر حفظ العميل");
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(`حذف العميل ${customer.name}؟ سيتم حذف المحادثة المرتبطة به أيضًا.`)) return;
    await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>العملاء</h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>إضافة عميل</button>
        </div>
        <div className="panel-body table-wrap">
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث باسم العميل، الرقم، أو الوسم..." />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>مسح</button>
          </div>
          <table>
            <thead><tr><th>الاسم</th><th>رقم الجوال</th><th>الوسوم</th><th>إجراء</th></tr></thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td><b>{customer.name}</b></td>
                  <td dir="ltr">{customer.phone}</td>
                  <td>{customer.tags.length ? customer.tags.join("، ") : "-"}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => onOpenConversation(customer.id)}>إرسال رسالة</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(customer)}>تعديل</button>
                    <button className="btn danger" type="button" onClick={() => deleteCustomer(customer)}>حذف</button>
                  </td>
                </tr>
              ))}
              {!filteredCustomers.length ? (
                <tr><td colSpan={4}>لا يوجد عملاء مطابقون للبحث الحالي.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ عميل" onSubmit={submitCustomer} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? "تعديل عميل" : "إضافة عميل"}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>اسم العميل</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>رقم الجوال</span>
                <input dir="ltr" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required placeholder="+9665XXXXXXXX" />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
