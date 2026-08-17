"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ConversationChannel, Customer } from "../types";

type CustomerFormState = {
  id?: string;
  name: string;
  phone: string;
};

type CustomerChannelTab = Extract<ConversationChannel, "whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "sms" | "tiktok">;

const customerTabs: { key: CustomerChannelTab; label: string }[] = [
  { key: "whatsapp", label: "عملاء الواتساب" },
  { key: "instagram", label: "عملاء الانستقرام" },
  { key: "facebook", label: "عملاء فيسبوك" },
  { key: "telegram", label: "عملاء تيليجرام" },
  { key: "x", label: "عملاء X" },
  { key: "google_maps", label: "عملاء خرائط Google" },
  { key: "email", label: "عملاء البريد الإلكتروني" },
  { key: "website", label: "عملاء الموقع الإلكتروني" },
  { key: "sms", label: "عملاء SMS" },
  { key: "tiktok", label: "عملاء TikTok" }
];

function getCustomerChannels(customer: Customer): ConversationChannel[] {
  if (customer.id.startsWith("ig-")) return ["instagram"];
  if (customer.id.startsWith("fb-")) return ["facebook"];
  if (customer.id.startsWith("tg-")) return ["telegram"];
  if (customer.id.startsWith("x-")) return ["x"];
  if (customer.id.startsWith("gm-")) return ["google_maps"];
  if (customer.id.startsWith("email-")) return ["email"];
  if (customer.id.startsWith("web-")) return ["website"];
  if (customer.id.startsWith("sms-")) return ["sms"];
  if (customer.id.startsWith("tt-")) return ["tiktok"];
  return customer.channels?.length ? customer.channels : ["whatsapp"];
}

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
  const [activeTab, setActiveTab] = useState<CustomerChannelTab>("whatsapp");
  const contactIdLabel = activeTab === "whatsapp"
    ? "رقم الجوال"
    : activeTab === "instagram"
      ? "معرف الانستقرام"
      : activeTab === "facebook"
        ? "معرف فيسبوك"
      : activeTab === "telegram"
        ? "معرف تيليجرام"
      : activeTab === "google_maps"
        ? "معرف تقييم Google"
      : activeTab === "email"
        ? "البريد الإلكتروني"
      : activeTab === "website"
        ? "معرّف الزائر"
      : activeTab === "sms"
        ? "رقم الجوال"
      : activeTab === "tiktok"
        ? "معرف TikTok"
        : "معرف X";

  const tabCounts = useMemo(() => ({
    whatsapp: customers.filter((customer) => getCustomerChannels(customer).includes("whatsapp")).length,
    instagram: customers.filter((customer) => getCustomerChannels(customer).includes("instagram")).length,
    facebook: customers.filter((customer) => getCustomerChannels(customer).includes("facebook")).length,
    telegram: customers.filter((customer) => getCustomerChannels(customer).includes("telegram")).length,
    x: customers.filter((customer) => getCustomerChannels(customer).includes("x")).length,
    google_maps: customers.filter((customer) => getCustomerChannels(customer).includes("google_maps")).length,
    email: customers.filter((customer) => getCustomerChannels(customer).includes("email")).length,
    website: customers.filter((customer) => getCustomerChannels(customer).includes("website")).length,
    sms: customers.filter((customer) => getCustomerChannels(customer).includes("sms")).length,
    tiktok: customers.filter((customer) => getCustomerChannels(customer).includes("tiktok")).length
  }), [customers]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const channelCustomers = customers.filter((customer) => getCustomerChannels(customer).includes(activeTab));
    if (!query) return channelCustomers;

    return channelCustomers.filter((customer) => (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.tags.join(" ").toLowerCase().includes(query)
    ));
  }, [activeTab, customers, search]);

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
          <div className="section-tabs contacts-tabs" role="tablist" aria-label="تصنيف العملاء حسب القناة">
            {customerTabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "section-tab active" : "section-tab"}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label} <span>{tabCounts[tab.key]}</span>
              </button>
            ))}
          </div>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث باسم العميل، الرقم، أو الوسم..." />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>مسح</button>
          </div>
          <table>
            <thead><tr><th>الاسم</th><th>{contactIdLabel}</th><th>الوسوم</th><th>إجراء</th></tr></thead>
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
