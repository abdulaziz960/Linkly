"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { PlanRow, SubscriptionRow } from "../types";
import { EXTRA_USER_PRICE, formatNumber, getRenewalAlert, statusClass } from "../utils";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

type ClientsViewProps = {
  subscriptions: SubscriptionRow[];
  plans: PlanRow[];
};

type TFunc = (ar: string, en: string) => string;

const STATUS_FILTERS = ["الكل", "نشط", "تجربة", "متوقف"];

type SortKey = "recent" | "name" | "renewal" | "revenue";

const SORT_OPTIONS: Array<{ value: SortKey; ar: string; en: string }> = [
  { value: "recent", ar: "الأحدث", en: "Most Recent" },
  { value: "name", ar: "اسم العميل", en: "Client Name" },
  { value: "renewal", ar: "أقرب تجديد", en: "Nearest Renewal" },
  { value: "revenue", ar: "أعلى إيراد", en: "Highest Revenue" }
];

function subscriptionStatusLabel(status: string, t: TFunc) {
  if (status === "نشط") return t("نشط", "Active");
  if (status === "تجربة") return t("تجربة", "Trial");
  if (status === "متوقف") return t("متوقف", "Paused");
  if (status === "الكل") return t("الكل", "All");
  return status;
}

function billingCycleLabel(cycle: string, t: TFunc) {
  if (cycle === "تجربة 3 أيام") return t("تجربة 3 أيام", "3-Day Trial");
  if (cycle === "تجربة 14 يوم") return t("تجربة 14 يوم", "14-Day Trial");
  if (cycle === "شهري") return t("شهري", "Monthly");
  if (cycle === "سنوي") return t("سنوي", "Annual");
  return cycle;
}

export default function ClientsView({ subscriptions, plans }: ClientsViewProps) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [limitClient, setLimitClient] = useState<SubscriptionRow | null>(null);
  const [limitValue, setLimitValue] = useState("");
  const [isLimitSaving, setIsLimitSaving] = useState(false);
  const [limitError, setLimitError] = useState("");
  const [chargeClient, setChargeClient] = useState<SubscriptionRow | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeGateway, setChargeGateway] = useState<"moyasar" | "stripe">("moyasar");
  const [isCharging, setIsCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeUrl, setChargeUrl] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [balanceClient, setBalanceClient] = useState<SubscriptionRow | null>(null);
  const [balanceMessages, setBalanceMessages] = useState("");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [isBalanceSaving, setIsBalanceSaving] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  function openLimitEditor(client: SubscriptionRow) {
    setLimitClient(client);
    setLimitValue(String(client.employeeLimit));
    setLimitError("");
  }

  async function handleUpdateLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!limitClient) return;

    const employeeLimit = Number(limitValue);
    if (!Number.isFinite(employeeLimit) || employeeLimit < 1) {
      setLimitError(t("اكتب حد مستخدمين صحيح", "Enter a valid user limit"));
      return;
    }

    setIsLimitSaving(true);
    setLimitError("");

    const response = await fetch(`/api/admin/clients/${limitClient.tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeLimit })
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsLimitSaving(false);

    if (!response.ok || !result.ok) {
      setLimitError(result.error || t("تعذر تحديث حد المستخدمين", "Could not update the user limit"));
      return;
    }

    setLimitClient(null);
    router.refresh();
  }

  function openChargeModal(client: SubscriptionRow) {
    setChargeClient(client);
    setChargeAmount(String(client.amount || 499));
    setChargeError("");
    setChargeUrl("");
  }

  async function handleDeleteClient(client: SubscriptionRow) {
    const confirmMessage =
      language === "en"
        ? `Permanently delete "${client.companyName}"? This deletes the login account, payment history, and activity log. This cannot be undone.`
        : `حذف "${client.companyName}" نهائيًا؟ هذا يحذف حساب الدخول وسجل المدفوعات والحركة، ولا يمكن التراجع.`;
    if (!window.confirm(confirmMessage)) return;

    setDeletingId(client.tenantId);
    const response = await fetch(`/api/admin/clients/${client.tenantId}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    setDeletingId("");

    if (!response.ok || !result.ok) {
      window.alert(result.error || t("تعذر حذف العميل", "Could not delete the client"));
      return;
    }

    router.refresh();
  }

  function openBalanceEditor(client: SubscriptionRow) {
    setBalanceClient(client);
    setBalanceMessages("");
    setBalanceAmount("");
    setBalanceError("");
  }

  async function handleAddBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!balanceClient) return;

    const messages = Number(balanceMessages);
    if (!Number.isFinite(messages) || messages < 1 || !Number.isInteger(messages)) {
      setBalanceError(t("اكتب عدد رسائل صحيح", "Enter a valid number of messages"));
      return;
    }
    const amount = balanceAmount.trim() ? Number(balanceAmount) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setBalanceError(t("اكتب مبلغ صحيح", "Enter a valid amount"));
      return;
    }

    setIsBalanceSaving(true);
    setBalanceError("");

    const response = await fetch(`/api/admin/clients/${balanceClient.tenantId}/campaign-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, amount })
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsBalanceSaving(false);

    if (!response.ok || !result.ok) {
      setBalanceError(result.error || t("تعذر إضافة الرصيد", "Could not add the balance"));
      return;
    }

    setBalanceClient(null);
    router.refresh();
  }

  async function handleCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chargeClient) return;

    const amount = Number(chargeAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setChargeError(t("اكتب قيمة فاتورة صحيحة", "Enter a valid invoice amount"));
      return;
    }

    setIsCharging(true);
    setChargeError("");
    setChargeUrl("");

    const response = await fetch("/api/admin/subscriptions/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: chargeClient.tenantId, amount, gateway: chargeGateway })
    });
    const result = (await response.json()) as { ok: boolean; paymentUrl?: string; error?: string };

    setIsCharging(false);

    if (!response.ok || !result.ok || !result.paymentUrl) {
      setChargeError(result.error || t("تعذر إنشاء طلب الدفع", "Could not create the payment request"));
      return;
    }

    setChargeUrl(result.paymentUrl);
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFormError("");
    setInviteNotice("");
    setActivationUrl("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      company: String(formData.get("company") || ""),
      owner: String(formData.get("owner") || ""),
      ownerEmail: String(formData.get("ownerEmail") || ""),
      plan: String(formData.get("plan") || ""),
      status: String(formData.get("status") || ""),
      renewal: String(formData.get("renewal") || ""),
      amount: Number(formData.get("amount") || 0),
      billingCycle: String(formData.get("billingCycle") || "")
    };

    const response = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: { inviteDelivery?: { message?: string; activationUrl?: string } };
    };

    setIsSaving(false);

    if (!response.ok || !result.ok) {
      setFormError(result.error || t("تعذر حفظ العميل", "Could not save the client"));
      return;
    }

    setInviteNotice(result.data?.inviteDelivery?.message || t("تم إنشاء الحساب.", "Account created."));
    setActivationUrl(result.data?.inviteDelivery?.activationUrl || "");
    router.refresh();
  }

  const activeCount = subscriptions.filter((s) => s.status === "نشط").length;
  const trialCount = subscriptions.filter((s) => s.status === "تجربة").length;
  const atRiskCount = subscriptions.filter((s) => getRenewalAlert(s) !== null).length;

  const visibleClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = subscriptions.filter((client) => {
      if (statusFilter !== "الكل" && client.status !== statusFilter) return false;
      if (!query) return true;
      return (
        client.companyName.toLowerCase().includes(query) ||
        client.ownerName.toLowerCase().includes(query) ||
        client.ownerEmail.toLowerCase().includes(query)
      );
    });

    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.companyName.localeCompare(b.companyName, "ar"));
    } else if (sortBy === "renewal") {
      sorted.sort((a, b) => (a.renewalAt || "9999").localeCompare(b.renewalAt || "9999"));
    } else if (sortBy === "revenue") {
      sorted.sort((a, b) => b.amount - a.amount);
    }
    return sorted;
  }, [subscriptions, searchQuery, statusFilter, sortBy]);

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي العملاء", "Total Clients")}</span>
            <strong>{formatNumber(subscriptions.length)}</strong>
            <small>{t("عدد الحسابات الحقيقية على المنصة", "Real accounts on the platform")}</small>
          </article>
          <article>
            <span>{t("نشط", "Active")}</span>
            <strong>{formatNumber(activeCount)}</strong>
            <small>{t("اشتراكات فعّالة حاليًا", "Currently active subscriptions")}</small>
          </article>
          <article>
            <span>{t("تجربة", "Trial")}</span>
            <strong>{formatNumber(trialCount)}</strong>
            <small>{t("لم تتحول لاشتراك مدفوع بعد", "Not yet converted to a paid subscription")}</small>
          </article>
          <article>
            <span>{t("يحتاج متابعة", "Needs Follow-up")}</span>
            <strong>{formatNumber(atRiskCount)}</strong>
            <small>{t("تجديد قريب أو متأخر", "Renewal due soon or overdue")}</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>
              {t(
                `العملاء (${formatNumber(visibleClients.length)} من ${formatNumber(subscriptions.length)})`,
                `Clients (${formatNumber(visibleClients.length)} of ${formatNumber(subscriptions.length)})`
              )}
            </h2>
            <p>
              {t(
                "كل عميل وتحته حالة اشتراكه الحقيقية، عدد الموظفين الفعلي، والمحادثات المستخدمة.",
                "Each client shows their real subscription status, actual employee count, and conversations used."
              )}
            </p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => setIsAddOpen(true)}>
              {t("إضافة عميل", "Add Client")}
            </button>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder={t("ابحث بالاسم أو البريد الإلكتروني...", "Search by name or email...")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div className="admin-filter-chips">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                className={`admin-filter-chip ${statusFilter === status ? "active" : ""}`}
                onClick={() => setStatusFilter(status)}
              >
                {subscriptionStatusLabel(status, t)}
              </button>
            ))}
          </div>
          <CustomSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as SortKey)}
            options={SORT_OPTIONS.map((option) => ({
              value: option.value,
              label: t(`ترتيب: ${option.ar}`, `Sort: ${option.en}`)
            }))}
          />
        </div>

        <div className="admin-client-cards">
          {visibleClients.map((client) => {
            const extraUserCount = Math.max(0, client.employeeCount - client.employeeLimit);
            const extraUserAmount = extraUserCount * EXTRA_USER_PRICE;
            const invoiceTotal = client.amount + extraUserAmount;

            return (
              <article className="admin-client-card" key={client.tenantId}>
                <div className="admin-client-summary">
                  <div className="admin-client-summary-main">
                    <span className="admin-client-avatar">{client.companyName.slice(0, 1) || t("ع", "C")}</span>
                    <div>
                      <strong>{client.companyName}</strong>
                      <span>{client.ownerName} · {client.ownerEmail}</span>
                    </div>
                  </div>
                  <span className={`admin-pill ${statusClass(client.status)}`}>
                    {subscriptionStatusLabel(client.status, t)}
                  </span>
                </div>

                <div className="admin-client-status-grid">
                  <div>
                    <span>{t("الباقة", "Plan")}</span>
                    <strong>{client.plan}</strong>
                    <small>{billingCycleLabel(client.billingCycle, t)}</small>
                  </div>
                  <div>
                    <span>{t("حد المستخدمين", "User Limit")}</span>
                    <strong>{formatNumber(client.employeeCount)} / {formatNumber(client.employeeLimit)}</strong>
                    <small>
                      {extraUserCount > 0
                        ? t(
                            `${formatNumber(extraUserCount)} إضافي × ${formatNumber(EXTRA_USER_PRICE)} ر.س`,
                            `${formatNumber(extraUserCount)} extra × ${formatNumber(EXTRA_USER_PRICE)} SAR`
                          )
                        : t("ضمن حد الباقة", "Within plan limit")}
                    </small>
                  </div>
                  <div>
                    <span>{t("الفاتورة الشهرية", "Monthly Invoice")}</span>
                    <strong>{t(`${formatNumber(invoiceTotal)} ر.س`, `${formatNumber(invoiceTotal)} SAR`)}</strong>
                    <small>
                      {t(
                        `${formatNumber(client.amount)} ر.س اشتراك${extraUserAmount > 0 ? ` + ${formatNumber(extraUserAmount)} ر.س مستخدمين` : ""}`,
                        `${formatNumber(client.amount)} SAR subscription${extraUserAmount > 0 ? ` + ${formatNumber(extraUserAmount)} SAR users` : ""}`
                      )}
                    </small>
                  </div>
                  <div>
                    <span>{t("المحادثات", "Conversations")}</span>
                    <strong>{formatNumber(client.conversationCount)}</strong>
                    <small>{t(`التجديد: ${client.renewalAt || "غير محدد"}`, `Renewal: ${client.renewalAt || "Not set"}`)}</small>
                  </div>
                  <div>
                    <span>{t("رصيد رسائل الحملات", "Campaign Message Balance")}</span>
                    <strong>{formatNumber(client.campaignBalance)}</strong>
                    <small>{t("رسالة متاحة", "messages available")}</small>
                  </div>
                </div>

                <div className="admin-client-actions">
                  <Link className="admin-client-primary-link" href={`/linkly-command-7f3a9/clients/${encodeURIComponent(client.tenantId)}`}>{t("فتح ملف العميل", "Open client profile")}</Link>
                  <button type="button" onClick={() => openChargeModal(client)}>
                    {t("شحن / تجديد الاشتراك", "Charge / Renew Subscription")}
                  </button>
                  <Link href={`/linkly-command-7f3a9/logs?client=${client.tenantId}`}>{t("سجل الحركة", "Activity Log")}</Link>
                  <button type="button" onClick={() => openLimitEditor(client)}>
                    {t("تعديل حد المستخدمين", "Edit User Limit")}
                  </button>
                  <button type="button" onClick={() => openBalanceEditor(client)}>
                    {t("إضافة رصيد رسائل حملات", "Add Campaign Message Balance")}
                  </button>
                  <button
                    type="button"
                    className="admin-danger-action"
                    disabled={deletingId === client.tenantId}
                    onClick={() => handleDeleteClient(client)}
                  >
                    {deletingId === client.tenantId ? t("جاري الحذف...", "Deleting...") : t("حذف العميل", "Delete Client")}
                  </button>
                </div>
              </article>
            );
          })}
          {!subscriptions.length ? (
            <p className="admin-empty-state">
              {t('لا يوجد عملاء بعد. اضغط "إضافة عميل" لإنشاء أول حساب.', 'No clients yet. Click "Add Client" to create the first account.')}
            </p>
          ) : !visibleClients.length ? (
            <p className="admin-empty-state">{t("لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.", "No results match the current search or filter.")}</p>
          ) : null}
        </div>
      </section>

      {isAddOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
          <div className="admin-modal-card">
            <div className="admin-modal-head">
              <div>
                <h2 id="add-client-title">{t("إضافة عميل جديد", "Add New Client")}</h2>
                <p>
                  {t(
                    "ينشئ هذا حساب دخول حقيقي فورًا ويرسل رابط تفعيل لصاحب الحساب على بريده.",
                    "This creates a real login account immediately and sends an activation link to the owner's email."
                  )}
                </p>
              </div>
              <button type="button" onClick={() => { setIsAddOpen(false); setInviteNotice(""); setActivationUrl(""); }} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            {inviteNotice ? (
              <div className="admin-invite-result">
                <p>{inviteNotice}</p>
                {activationUrl ? (
                  <a className="activation-link" href={activationUrl} target="_blank" rel="noreferrer">
                    {t("فتح رابط التفعيل", "Open Activation Link")}
                  </a>
                ) : null}
                <div className="admin-form-actions">
                  <button type="button" onClick={() => { setIsAddOpen(false); setInviteNotice(""); setActivationUrl(""); }}>
                    {t("تم", "Done")}
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleCreateClient}>
                <label>
                  {t("اسم الشركة/العميل", "Company / Client Name")}
                  <input name="company" placeholder={t("مثال: متجر الرياض", "e.g. Riyadh Store")} required />
                </label>
                <label>
                  {t("اسم صاحب الحساب", "Account Owner Name")}
                  <input name="owner" placeholder={t("اسم صاحب الحساب", "Account owner name")} required />
                </label>
                <label>
                  {t("البريد الإلكتروني لصاحب الحساب", "Account Owner Email")}
                  <input name="ownerEmail" type="email" dir="ltr" placeholder="owner@example.com" required />
                </label>
                <label>
                  {t("الباقة", "Plan")}
                  <CustomSelect
                    name="plan"
                    defaultValue={plans.find((p) => p.active === 1)?.name || "باقة النمو"}
                    options={
                      plans.length
                        ? plans.filter((p) => p.active === 1).map((p) => ({ value: p.name, label: `${p.name} (${formatNumber(p.monthlyPrice)} ${t("ر.س", "SAR")})` }))
                        : [{ value: "باقة البداية", label: "باقة البداية" }, { value: "باقة النمو", label: "باقة النمو" }, { value: "باقة الأعمال", label: "باقة الأعمال" }]
                    }
                  />
                </label>
                <label>
                  {t("حالة الاشتراك", "Subscription Status")}
                  <CustomSelect
                    name="status"
                    defaultValue="تجربة"
                    options={[
                      { value: "تجربة", label: t("تجربة", "Trial") },
                      { value: "نشط", label: t("نشط", "Active") },
                      { value: "متوقف", label: t("متوقف", "Paused") }
                    ]}
                  />
                </label>
                <label>
                  {t("تاريخ التجديد", "Renewal Date")}
                  <input name="renewal" type="date" />
                </label>
                <label>
                  {t("قيمة الباقة الشهرية", "Monthly Plan Amount")}
                  <input name="amount" type="number" min="0" defaultValue="0" />
                </label>
                <label>
                  {t("دورة الفوترة", "Billing Cycle")}
                  <CustomSelect
                    name="billingCycle"
                    defaultValue="تجربة 3 أيام"
                    options={[
                      { value: "تجربة 3 أيام", label: t("تجربة 3 أيام", "3-Day Trial") },
                      { value: "شهري", label: t("شهري", "Monthly") },
                      { value: "سنوي", label: t("سنوي", "Annual") }
                    ]}
                  />
                </label>

                {formError ? <p className="admin-form-error">{formError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setIsAddOpen(false)}>
                    {t("إلغاء", "Cancel")}
                  </button>
                  <button type="submit" disabled={isSaving}>
                    {isSaving ? t("جاري الحفظ...", "Saving...") : t("إنشاء الحساب", "Create Account")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {limitClient ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="user-limit-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="user-limit-title">{t("تعديل حد المستخدمين", "Edit User Limit")}</h2>
                <p>
                  {t(
                    "أي مستخدم فوق حد الباقة يضاف تلقائيًا للفاتورة الشهرية بقيمة 65 ريال للمستخدم.",
                    "Any user beyond the plan limit is automatically added to the monthly invoice at 65 SAR per user."
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setLimitClient(null)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleUpdateLimit}>
              <label>
                {t("العميل", "Client")}
                <input value={limitClient.companyName} readOnly />
              </label>
              <label>
                {t("الباقة", "Plan")}
                <input value={limitClient.plan} readOnly />
              </label>
              <label>
                {t("عدد الموظفين الحالي فعليًا", "Current Actual Employee Count")}
                <input value={t(`${formatNumber(limitClient.employeeCount)} موظف`, `${formatNumber(limitClient.employeeCount)} employees`)} readOnly />
              </label>
              <label>
                {t("الحد المطلوب", "Required Limit")}
                <input
                  type="number"
                  min="1"
                  value={limitValue}
                  onChange={(event) => setLimitValue(event.target.value)}
                />
              </label>

              {limitError ? <p className="admin-form-error">{limitError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setLimitClient(null)}>
                  {t("إلغاء", "Cancel")}
                </button>
                <button type="submit" disabled={isLimitSaving}>
                  {isLimitSaving ? t("جاري الحفظ...", "Saving...") : t("حفظ الحد", "Save Limit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {balanceClient ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-balance-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="campaign-balance-title">{t("إضافة رصيد رسائل حملات", "Add Campaign Message Balance")}</h2>
                <p>
                  {t(
                    "يضاف الرصيد فورًا لحساب العميل ويظهر في صفحة الحملات لديه ضمن سجل الرصيد والشحن.",
                    "The balance is added immediately to the client's account and appears on their Campaigns page in the balance and top-up history."
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setBalanceClient(null)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleAddBalance}>
              <label>
                {t("العميل", "Client")}
                <input value={balanceClient.companyName} readOnly />
              </label>
              <label>
                {t("الرصيد الحالي", "Current Balance")}
                <input value={t(`${formatNumber(balanceClient.campaignBalance)} رسالة`, `${formatNumber(balanceClient.campaignBalance)} messages`)} readOnly />
              </label>
              <label>
                {t("عدد الرسائل المضافة", "Number of Messages to Add")}
                <input
                  type="number"
                  min="1"
                  value={balanceMessages}
                  onChange={(event) => setBalanceMessages(event.target.value)}
                  placeholder={t("مثال: 1000", "e.g. 1000")}
                />
              </label>
              <label>
                {t("المبلغ المقابل (اختياري، ر.س)", "Corresponding Amount (optional, SAR)")}
                <input
                  type="number"
                  min="0"
                  value={balanceAmount}
                  onChange={(event) => setBalanceAmount(event.target.value)}
                  placeholder="0"
                />
              </label>

              {balanceError ? <p className="admin-form-error">{balanceError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setBalanceClient(null)}>
                  {t("إلغاء", "Cancel")}
                </button>
                <button type="submit" disabled={isBalanceSaving}>
                  {isBalanceSaving ? t("جاري الإضافة...", "Adding...") : t("إضافة الرصيد", "Add Balance")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {chargeClient ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="charge-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="charge-title">{t("شحن / تجديد الاشتراك", "Charge / Renew Subscription")}</h2>
                <p>
                  {t(
                    "ينشئ رابط دفع حقيقي لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا.",
                    "Creates a real payment link to send to the client. The subscription activates automatically once paid."
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setChargeClient(null)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            {chargeUrl ? (
              <div className="admin-invite-result">
                <p>{t("تم إنشاء رابط الدفع. أرسله للعميل ليكمل الدفع:", "Payment link created. Send it to the client to complete payment:")}</p>
                <a className="activation-link" href={chargeUrl} target="_blank" rel="noreferrer">
                  {t("فتح رابط الدفع", "Open Payment Link")}
                </a>
                <div className="admin-form-actions">
                  <button type="button" onClick={() => setChargeClient(null)}>
                    {t("تم", "Done")}
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleCharge}>
                <label>
                  {t("العميل", "Client")}
                  <input value={chargeClient.companyName} readOnly />
                </label>
                <label>
                  {t("بوابة الدفع", "Payment Gateway")}
                  <CustomSelect
                    value={chargeGateway}
                    onChange={(value) => setChargeGateway(value as "moyasar" | "stripe")}
                    options={[
                      { value: "moyasar", label: "Moyasar" },
                      { value: "stripe", label: t("Stripe (وضع اختبار)", "Stripe (test mode)") }
                    ]}
                  />
                </label>
                <label>
                  {t("قيمة الفاتورة (ر.س)", "Invoice Amount (SAR)")}
                  <input
                    type="number"
                    min="1"
                    value={chargeAmount}
                    onChange={(event) => setChargeAmount(event.target.value)}
                  />
                </label>

                {chargeError ? <p className="admin-form-error">{chargeError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setChargeClient(null)}>
                    {t("إلغاء", "Cancel")}
                  </button>
                  <button type="submit" disabled={isCharging}>
                    {isCharging ? t("جاري الإنشاء...", "Creating...") : t("إنشاء رابط الدفع", "Create Payment Link")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
