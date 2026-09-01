"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ConversationChannel, Customer } from "../types";
import { ChannelIcon } from "./SettingsView";
import { useLanguage } from "../i18n";

type CustomerFormState = {
  id?: string;
  name: string;
  phone: string;
};

type CustomerChannelTab = Extract<ConversationChannel, "whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "sms" | "tiktok">;

const customerTabs: { key: CustomerChannelTab; label: [string, string] }[] = [
  { key: "whatsapp", label: ["واتساب", "WhatsApp"] },
  { key: "instagram", label: ["إنستغرام", "Instagram"] },
  { key: "facebook", label: ["فيسبوك", "Facebook"] },
  { key: "telegram", label: ["تيليجرام", "Telegram"] },
  { key: "x", label: ["X", "X"] },
  { key: "google_maps", label: ["خرائط Google", "Google Maps"] },
  { key: "email", label: ["البريد الإلكتروني", "Email"] },
  { key: "website", label: ["الموقع", "Website"] },
  { key: "sms", label: ["SMS", "SMS"] },
  { key: "tiktok", label: ["TikTok", "TikTok"] }
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
  const { t } = useLanguage();
  const emptyForm = useMemo<CustomerFormState>(() => ({ name: "", phone: "" }), []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CustomerChannelTab>("whatsapp");
  const contactIdLabel = activeTab === "whatsapp"
    ? t("رقم الجوال", "Phone Number")
    : activeTab === "instagram"
      ? t("معرف الانستقرام", "Instagram ID")
      : activeTab === "facebook"
        ? t("معرف فيسبوك", "Facebook ID")
      : activeTab === "telegram"
        ? t("معرف تيليجرام", "Telegram ID")
      : activeTab === "google_maps"
        ? t("معرف تقييم Google", "Google Review ID")
      : activeTab === "email"
        ? t("البريد الإلكتروني", "Email")
      : activeTab === "website"
        ? t("معرّف الزائر", "Visitor ID")
      : activeTab === "sms"
        ? t("رقم الجوال", "Phone Number")
      : activeTab === "tiktok"
        ? t("معرف TikTok", "TikTok ID")
        : t("معرف X", "X ID");

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
      setError(payload.error || t("تعذر حفظ العميل", "Could not save the customer"));
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(t(`حذف العميل ${customer.name}؟ سيتم حذف المحادثة المرتبطة به أيضًا.`, `Delete customer ${customer.name}? Their linked conversation will also be deleted.`))) return;
    await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("العملاء", "Customers")}</h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة عميل", "Add Customer")}</button>
        </div>
        <div className="panel-body table-wrap">
          <div className="contacts-summary">
            <div>
              <span>{t("إجمالي العملاء", "Total Customers")}</span>
              <strong>{customers.length}</strong>
            </div>
            <p>{t("اختر المنصة لعرض العملاء القادمين منها وإدارة بياناتهم ومحادثاتهم.", "Choose a platform to view customers coming from it and manage their data and conversations.")}</p>
          </div>
          <div className="section-tabs contacts-tabs" role="tablist" aria-label={t("تصنيف العملاء حسب القناة", "Filter customers by channel")}>
            {customerTabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "section-tab active" : "section-tab"}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className={`contact-channel-logo ${tab.key}`} aria-hidden="true"><ChannelIcon id={tab.key} /></span>
                <span className="contact-channel-copy"><b>{t(tab.label[0], tab.label[1])}</b><small>{t("عميل", "customer")}</small></span>
                <strong>{tabCounts[tab.key]}</strong>
              </button>
            ))}
          </div>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("بحث باسم العميل، الرقم، أو الوسم...", "Search by customer name, number, or tag...")} />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>{t("مسح", "Clear")}</button>
          </div>
          <table>
            <thead><tr><th>{t("الاسم", "Name")}</th><th>{contactIdLabel}</th><th>{t("الوسوم", "Tags")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td><b>{customer.name}</b></td>
                  <td dir="ltr">{customer.phone}</td>
                  <td>{customer.tags.length ? customer.tags.join(t("، ", ", ")) : "-"}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => onOpenConversation(customer.id)}>{t("إرسال رسالة", "Send Message")}</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(customer)}>{t("تعديل", "Edit")}</button>
                    <button className="btn danger" type="button" onClick={() => deleteCustomer(customer)}>{t("حذف", "Delete")}</button>
                  </td>
                </tr>
              ))}
              {!filteredCustomers.length ? (
                <tr><td colSpan={4}>{t("لا يوجد عملاء مطابقون للبحث الحالي.", "No customers match the current search.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ عميل", "Save Customer")} onSubmit={submitCustomer} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل عميل", "Edit Customer") : t("إضافة عميل", "Add Customer")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("اسم العميل", "Customer Name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("رقم الجوال", "Phone Number")}</span>
                <input dir="ltr" type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required pattern="^(00966|\+966|966|0)?5\d{8}$" title={t("أدخل رقم جوال سعودي صحيح", "Enter a valid Saudi phone number")} placeholder="+9665XXXXXXXX" />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
