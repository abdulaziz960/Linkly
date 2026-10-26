"use client";

import { useDataLoading } from "../data-loading-context";
import { EmptyState, SkeletonTableRows } from "../components/StateBlocks";

import CustomSelect from "../../components/CustomSelect";
import { FormEvent, useMemo, useState } from "react";
import type { ConversationChannel, Customer, Tag } from "../types";
import { ChatIcon, EditIcon, MergeIcon } from "../components/ActionIcons";
import { BarList } from "../components/MiniCharts";
import { ChannelIcon } from "./SettingsView";
import { useLanguage } from "../i18n";
import { channelNames } from "../../channel-names";

type CustomerFormState = {
  id?: string;
  name: string;
  phone: string;
};

type CustomerChannelTab = Extract<ConversationChannel, "whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "sms" | "tiktok">;

const customerTabs: { key: CustomerChannelTab; label: [string, string] }[] = [
  { key: "whatsapp", label: [channelNames.whatsapp.ar, channelNames.whatsapp.en] },
  { key: "instagram", label: [channelNames.instagram.ar, channelNames.instagram.en] },
  { key: "facebook", label: [channelNames.facebook.ar, channelNames.facebook.en] },
  { key: "telegram", label: [channelNames.telegram.ar, channelNames.telegram.en] },
  { key: "x", label: [channelNames.x.ar, channelNames.x.en] },
  { key: "google_maps", label: [channelNames.google_maps.ar, channelNames.google_maps.en] },
  { key: "email", label: [channelNames.email.ar, channelNames.email.en] },
  { key: "website", label: [channelNames.website.ar, channelNames.website.en] },
  { key: "sms", label: [channelNames.sms.ar, channelNames.sms.en] },
  { key: "tiktok", label: [channelNames.tiktok.ar, channelNames.tiktok.en] }
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
  tagList = [],
  onOpenConversation,
  onRefreshData
}: {
  customers: Customer[];
  tagList?: Tag[];
  onOpenConversation: (conversationId: string) => void;
  onRefreshData: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const emptyForm = useMemo<CustomerFormState>(() => ({ name: "", phone: "" }), []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mergeTarget, setMergeTarget] = useState<Customer | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CustomerChannelTab>("whatsapp");
  const [tagFilter, setTagFilter] = useState("");
  const [page, setPage] = useState(1);
  const contactIdLabel = activeTab === "whatsapp"
    ? t("رقم الجوال", "Phone Number")
    : activeTab === "instagram"
      ? t("معرّف إنستغرام", "Instagram ID")
      : activeTab === "facebook"
        ? t("معرف فيسبوك", "Facebook ID")
      : activeTab === "telegram"
        ? t("معرف تيليجرام", "Telegram ID")
      : activeTab === "google_maps"
        ? t("معرّف تقييم جوجل", "Google Review ID")
      : activeTab === "email"
        ? t("البريد الإلكتروني", "Email")
      : activeTab === "website"
        ? t("معرّف الزائر", "Visitor ID")
      : activeTab === "sms"
        ? t("رقم الجوال", "Phone Number")
      : activeTab === "tiktok"
        ? t("معرّف تيك توك", "TikTok ID")
        : t("معرّف إكس", "X ID");

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
    const channelCustomers = customers.filter((customer) => getCustomerChannels(customer).includes(activeTab) && (!tagFilter || customer.tags.includes(tagFilter)));
    if (!query) return channelCustomers;

    return channelCustomers.filter((customer) => (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.tags.join(" ").toLowerCase().includes(query)
    ));
  }, [activeTab, customers, search, tagFilter]);

  const dataLoading = useDataLoading();
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredCustomers.slice((safePage - 1) * pageSize, safePage * pageSize);
  const withTags = customers.filter((customer) => customer.tags.length).length;
  const activePlatforms = customerTabs.filter((tab) => tabCounts[tab.key] > 0).length;
  const tagColor = (name: string) => tagList.find((tag) => tag.name === name)?.color || "#178a82";
  const avatarColors = ["#178a82", "#4a90d9", "#8e6bbf", "#c9831b", "#d9534f", "#2e9e6b"];
  const avatarColor = (id: string) => avatarColors[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarColors.length];

  async function exportCustomers() {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(t("العملاء", "Customers"), { views: [{ rightToLeft: true }] });
    sheet.columns = [{ header: t("الاسم", "Name"), key: "name", width: 28 }, { header: contactIdLabel, key: "phone", width: 24 }, { header: t("الوسوم", "Tags"), key: "tags", width: 32 }];
    filteredCustomers.forEach((customer) => sheet.addRow({ name: customer.name, phone: customer.phone, tags: customer.tags.join("، ") }));
    sheet.getRow(1).font = { bold: true };
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "customers.xlsx"; anchor.click(); URL.revokeObjectURL(url);
  }

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

  function openMergeForm(customer: Customer) {
    setMergeError("");
    setMergeSourceId("");
    setMergeTarget(customer);
  }

  async function submitMerge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mergeTarget || !mergeSourceId) return;
    setMerging(true);
    setMergeError("");

    const response = await fetch(`/api/customers/${mergeTarget.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: mergeSourceId })
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!payload.ok) {
      setMergeError(payload.error || t("تعذر دمج العميلين", "Could not merge the customers"));
      setMerging(false);
      return;
    }

    await onRefreshData();
    setMerging(false);
    setMergeTarget(null);
  }

  return (
    <section className="page-stack">
      <div className="camp-hero">
        <div className="camp-hero-text">
          <small>{t("العملاء", "CUSTOMERS")}</small>
          <h1>{t("العملاء", "Customers")}</h1>
          <p>{t("اختر المنصة لعرض العملاء القادمين منها وإدارة بياناتهم ومحادثاتهم.", "Choose a platform to view customers coming from it and manage their data and conversations.")}</p>
          <div className="camp-hero-chips"><span>{customers.length.toLocaleString("en-US")} {t("إجمالي العملاء", "customers")}</span><span>{t("المنصة", "Platform")}: {t(customerTabs.find((tab) => tab.key === activeTab)?.label[0] ?? "", customerTabs.find((tab) => tab.key === activeTab)?.label[1] ?? "")}</span></div>
        </div>
        <label className="camp-hero-search"><span aria-hidden="true">🔍</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("بحث باسم العميل، الرقم، أو الوسم...", "Search by customer name, number, or tag...")} aria-label={t("بحث في العملاء", "Search customers")} /></label>
        <button className="camp-hero-new" type="button" onClick={openCreateForm}>＋ {t("إضافة عميل", "Add Customer")}</button>
      </div>

      <div className="seg-kpis">
        <div className="seg-kpi seg-kpi-b"><span>{t("إجمالي العملاء", "Total customers")}</span><b>{customers.length.toLocaleString("en-US")}</b><small>{t("كل المنصات", "All platforms")}</small></div>
        <div className="seg-kpi seg-kpi-good"><span>{t("لديهم وسوم", "With tags")}</span><b>{withTags.toLocaleString("en-US")}</b><small>{customers.length ? Math.round((withTags / customers.length) * 100) : 0}%</small></div>
        <div className="seg-kpi seg-kpi-warn"><span>{t("بدون وسوم", "Without tags")}</span><b>{(customers.length - withTags).toLocaleString("en-US")}</b><small>{customers.length ? Math.round(((customers.length - withTags) / customers.length) * 100) : 0}%</small></div>
        <div className="seg-kpi seg-kpi-unsub"><span>{t("منصات فعّالة", "Active platforms")}</span><b>{activePlatforms}</b><small>{t(`من ${customerTabs.length}`, `of ${customerTabs.length}`)}</small></div>
      </div>

      <div className="contacts-two">
        <div className="panel">
          <div className="panel-head"><h2>{t("العملاء حسب المنصة", "Customers by platform")}</h2></div>
          <div className="panel-body">
            <div className="contacts-channels" role="tablist" aria-label={t("تصنيف العملاء حسب القناة", "Filter customers by channel")}>
              {customerTabs.map((tab) => (
                <button key={tab.key} className={activeTab === tab.key ? "contacts-channel on" : "contacts-channel"} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => { setActiveTab(tab.key); setPage(1); }}>
                  <span className={`contact-channel-logo ${tab.key}`} aria-hidden="true"><ChannelIcon id={tab.key} /></span>
                  <span className="contact-channel-copy"><b>{t(tab.label[0], tab.label[1])}</b><small>{t("عميل", "customer")}</small></span>
                  <em>{tabCounts[tab.key]}</em>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>{t("توزيع العملاء", "Distribution")}</h2></div>
          <div className="panel-body">
            {customers.length ? <BarList items={customerTabs.filter((tab) => tabCounts[tab.key] > 0).map((tab) => ({ label: t(tab.label[0], tab.label[1]), value: tabCounts[tab.key] })).sort((a, b) => b.value - a.value)} /> : <p className="muted-copy">{t("لا يوجد عملاء بعد.", "No customers yet.")}</p>}
          </div>
        </div>
      </div>

      <div className="panel contacts-table-card">
        <div className="seg-toolbar">
          <CustomSelect value={tagFilter} onChange={(value) => { setTagFilter(value); setPage(1); }} options={[{ value: "", label: t("كل الوسوم", "All tags") }, ...tagList.map((tag) => ({ value: tag.name, label: tag.name }))]} />
          <button className="btn soft" type="button" onClick={() => { setSearch(""); setTagFilter(""); setPage(1); }}>{t("مسح", "Clear")}</button>
          <button className="btn soft" type="button" onClick={exportCustomers} disabled={!filteredCustomers.length}>{t("تصدير Excel", "Export Excel")}</button>
          <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{filteredCustomers.length.toLocaleString("en-US")}</b></span>
        </div>
        <div className="table-wrap">
          <table className="mobile-card-table camp-table">
            <thead><tr><th>{t("العميل", "Customer")}</th><th>{contactIdLabel}</th><th>{t("المنصة", "Platform")}</th><th>{t("الوسوم", "Tags")}</th><th>{t("الإجراءات", "Actions")}</th></tr></thead>
            <tbody>
              {pageRows.map((customer) => (
                <tr key={customer.id}>
                  <td data-label={t("العميل", "Customer")}><div className="contact-who"><span className="contact-avatar" style={{ background: avatarColor(customer.id) }}>{(customer.initial || customer.name.trim()[0] || "؟").toUpperCase()}</span><b>{customer.name}</b></div></td>
                  <td data-label={contactIdLabel} dir="ltr" className="contact-phone">{customer.phone}</td>
                  <td data-label={t("المنصة", "Platform")}><span className="contact-platform"><span className={`contact-channel-logo small ${activeTab}`} aria-hidden="true"><ChannelIcon id={activeTab} /></span>{t(customerTabs.find((tab) => tab.key === activeTab)?.label[0] ?? "", customerTabs.find((tab) => tab.key === activeTab)?.label[1] ?? "")}</span></td>
                  <td data-label={t("الوسوم", "Tags")}>{customer.tags.length ? customer.tags.map((tag) => <span key={tag} className="contact-tag" style={{ ["--tag" as string]: tagColor(tag) }}>{tag}</span>) : "-"}</td>
                  <td data-label={t("الإجراءات", "Actions")} className="row-actions campaign-row-actions">
                    <button className="campaign-icon-btn" type="button" title={t("إرسال رسالة", "Send Message")} aria-label={t("إرسال رسالة", "Send Message")} onClick={() => onOpenConversation(customer.id)}>{ChatIcon}</button>
                    <button className="campaign-icon-btn" type="button" title={t("تعديل", "Edit")} aria-label={t("تعديل", "Edit")} onClick={() => openEditForm(customer)}>{EditIcon}</button>
                    <button className="campaign-icon-btn" type="button" title={t("دمج", "Merge")} aria-label={t("دمج", "Merge")} onClick={() => openMergeForm(customer)} disabled={customers.length < 2}>{MergeIcon}</button>
                  </td>
                </tr>
              ))}
              {!filteredCustomers.length && dataLoading ? <SkeletonTableRows columns={5} label={t("جارٍ تحميل العملاء", "Loading customers")} /> : null}
              {!filteredCustomers.length && !dataLoading ? (
                <tr><td colSpan={5}>{customers.length ? t("لا يوجد عملاء مطابقون للبحث الحالي.", "No customers match the current search.") : (
                  <EmptyState
                    title={t("لا يوجد عملاء بعد", "No customers yet")}
                    description={t("يظهر هنا كل من يراسلك على قنواتك. يمكنك أيضاً إضافة عميل يدوياً لتبدأ محادثة معه.", "Everyone who messages you on your channels shows up here. You can also add a customer manually to start a conversation.")}
                    action={<button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة أول عميل", "Add your first customer")}</button>}
                  />
                )}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="contacts-pager">
            <span>{t(`صفحة ${safePage} من ${totalPages}`, `Page ${safePage} of ${totalPages}`)}</span>
            <span><button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button><button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button></span>
          </div>
        ) : null}
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ عميل", "Save Customer")} onSubmit={submitCustomer} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل عميل", "Edit Customer") : t("إضافة عميل", "Add Customer")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("اسم العميل", "Customer Name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("رقم الجوال", "Phone Number")}</span>
                <input dir="ltr" type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required title={t("أدخل رقم جوال سعودي صحيح", "Enter a valid Saudi phone number")} placeholder="+9665XXXXXXXX" />
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

      {mergeTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setMergeTarget(null)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("دمج عملاء مكررين", "Merge duplicate customers")} onSubmit={submitMerge} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setMergeTarget(null)}>×</button>
              <h2>{t("دمج عميل مكرر في", "Merge a duplicate customer into")} {mergeTarget.name}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <p>{t("كل محادثات العميل المختار ستنتقل إلى هذا العميل، وسيتم حذف السجل المكرر نهائيًا. لا يمكن التراجع عن هذا الإجراء.", "All conversations from the selected customer will move here, and the duplicate record will be permanently deleted. This can't be undone.")}</p>
              <label>
                <span>{t("العميل المكرر (سيُحذف)", "Duplicate customer (will be deleted)")}</span>
                <CustomSelect value={mergeSourceId} onChange={setMergeSourceId} placeholder={t("اختر عميلًا…", "Choose a customer…")} options={[{ value: "", label: t("اختر عميلًا…", "Choose a customer…") }, ...customers.filter((customer) => customer.id !== mergeTarget.id).map((customer) => ({ value: customer.id, label: `${customer.name} · ${customer.phone}` }))]} />
              </label>
              {mergeError ? <p className="form-error">{mergeError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setMergeTarget(null)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={merging || !mergeSourceId}>{merging ? t("جاري الدمج", "Merging") : t("دمج", "Merge")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
