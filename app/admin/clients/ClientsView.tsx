"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { PlanRow, SubscriptionRow } from "../types";
import { EXTRA_USER_PRICE, formatNumber, getRenewalAlert, statusClass } from "../utils";

type ClientsViewProps = {
  subscriptions: SubscriptionRow[];
  plans: PlanRow[];
};

const STATUS_FILTERS = ["الكل", "نشط", "تجربة", "متوقف"];
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "الأحدث" },
  { value: "name", label: "اسم العميل" },
  { value: "renewal", label: "أقرب تجديد" },
  { value: "revenue", label: "أعلى إيراد" }
];

type SortKey = "recent" | "name" | "renewal" | "revenue";

export default function ClientsView({ subscriptions, plans }: ClientsViewProps) {
  const router = useRouter();
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
  const [togglingLeadsId, setTogglingLeadsId] = useState("");

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
      setLimitError("اكتب حد مستخدمين صحيح");
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
      setLimitError(result.error || "تعذر تحديث حد المستخدمين");
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
    if (!window.confirm(`حذف "${client.companyName}" نهائيًا؟ هذا يحذف حساب الدخول وسجل المدفوعات والحركة، ولا يمكن التراجع.`)) return;

    setDeletingId(client.tenantId);
    const response = await fetch(`/api/admin/clients/${client.tenantId}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    setDeletingId("");

    if (!response.ok || !result.ok) {
      window.alert(result.error || "تعذر حذف العميل");
      return;
    }

    router.refresh();
  }

  async function toggleLeadsAccess(client: SubscriptionRow) {
    setTogglingLeadsId(client.tenantId);
    const response = await fetch(`/api/admin/clients/${client.tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadsEnabled: !client.leadsEnabled })
    });
    const result = (await response.json()) as { ok: boolean; error?: string };
    setTogglingLeadsId("");

    if (!response.ok || !result.ok) {
      window.alert(result.error || "تعذر تحديث صلاحية العملاء المحتملين");
      return;
    }

    router.refresh();
  }

  async function handleCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chargeClient) return;

    const amount = Number(chargeAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setChargeError("اكتب قيمة فاتورة صحيحة");
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
      setChargeError(result.error || "تعذر إنشاء طلب الدفع");
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
      setFormError(result.error || "تعذر حفظ العميل");
      return;
    }

    setInviteNotice(result.data?.inviteDelivery?.message || "تم إنشاء الحساب.");
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
            <span>إجمالي العملاء</span>
            <strong>{formatNumber(subscriptions.length)}</strong>
            <small>عدد الحسابات الحقيقية على المنصة</small>
          </article>
          <article>
            <span>نشط</span>
            <strong>{formatNumber(activeCount)}</strong>
            <small>اشتراكات فعّالة حاليًا</small>
          </article>
          <article>
            <span>تجربة</span>
            <strong>{formatNumber(trialCount)}</strong>
            <small>لم تتحول لاشتراك مدفوع بعد</small>
          </article>
          <article>
            <span>يحتاج متابعة</span>
            <strong>{formatNumber(atRiskCount)}</strong>
            <small>تجديد قريب أو متأخر</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>العملاء ({formatNumber(visibleClients.length)} من {formatNumber(subscriptions.length)})</h2>
            <p>كل عميل وتحته حالة اشتراكه الحقيقية، عدد الموظفين الفعلي، والمحادثات المستخدمة.</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => setIsAddOpen(true)}>
              إضافة عميل
            </button>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
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
                {status}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                ترتيب: {option.label}
              </option>
            ))}
          </select>
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
                    <span className="admin-client-avatar">{client.companyName.slice(0, 1) || "ع"}</span>
                    <div>
                      <strong>{client.companyName}</strong>
                      <span>{client.ownerName} · {client.ownerEmail}</span>
                    </div>
                  </div>
                  <span className={`admin-pill ${statusClass(client.status)}`}>{client.status}</span>
                </div>

                <div className="admin-client-status-grid">
                  <div>
                    <span>الباقة</span>
                    <strong>{client.plan}</strong>
                    <small>{client.billingCycle}</small>
                  </div>
                  <div>
                    <span>حد المستخدمين</span>
                    <strong>{formatNumber(client.employeeCount)} / {formatNumber(client.employeeLimit)}</strong>
                    <small>
                      {extraUserCount > 0
                        ? `${formatNumber(extraUserCount)} إضافي × ${formatNumber(EXTRA_USER_PRICE)} ر.س`
                        : "ضمن حد الباقة"}
                    </small>
                  </div>
                  <div>
                    <span>الفاتورة الشهرية</span>
                    <strong>{formatNumber(invoiceTotal)} ر.س</strong>
                    <small>
                      {formatNumber(client.amount)} ر.س اشتراك
                      {extraUserAmount > 0 ? ` + ${formatNumber(extraUserAmount)} ر.س مستخدمين` : ""}
                    </small>
                  </div>
                  <div>
                    <span>المحادثات</span>
                    <strong>{formatNumber(client.conversationCount)}</strong>
                    <small>التجديد: {client.renewalAt || "غير محدد"}</small>
                  </div>
                </div>

                <div className="admin-client-actions">
                  <button type="button" onClick={() => openChargeModal(client)}>
                    شحن / تجديد الاشتراك
                  </button>
                  <Link href={`/admin/logs?client=${client.tenantId}`}>سجل الحركة</Link>
                  <button type="button" onClick={() => openLimitEditor(client)}>
                    تعديل حد المستخدمين
                  </button>
                  <div className="admin-leads-toggle" aria-disabled={togglingLeadsId === client.tenantId}>
                    <span>العملاء المحتملون (CRM)</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(client.leadsEnabled)}
                      className={`admin-switch${client.leadsEnabled ? " is-on" : ""}`}
                      disabled={togglingLeadsId === client.tenantId}
                      onClick={() => toggleLeadsAccess(client)}
                    >
                      <span className="admin-switch-thumb" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="admin-danger-action"
                    disabled={deletingId === client.tenantId}
                    onClick={() => handleDeleteClient(client)}
                  >
                    {deletingId === client.tenantId ? "جاري الحذف..." : "حذف العميل"}
                  </button>
                </div>
              </article>
            );
          })}
          {!subscriptions.length ? (
            <p className="admin-empty-state">لا يوجد عملاء بعد. اضغط "إضافة عميل" لإنشاء أول حساب.</p>
          ) : !visibleClients.length ? (
            <p className="admin-empty-state">لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.</p>
          ) : null}
        </div>
      </section>

      {isAddOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
          <div className="admin-modal-card">
            <div className="admin-modal-head">
              <div>
                <h2 id="add-client-title">إضافة عميل جديد</h2>
                <p>ينشئ هذا حساب دخول حقيقي فورًا ويرسل رابط تفعيل لصاحب الحساب على بريده.</p>
              </div>
              <button type="button" onClick={() => { setIsAddOpen(false); setInviteNotice(""); setActivationUrl(""); }} aria-label="إغلاق">
                ×
              </button>
            </div>

            {inviteNotice ? (
              <div className="admin-invite-result">
                <p>{inviteNotice}</p>
                {activationUrl ? (
                  <a className="activation-link" href={activationUrl} target="_blank" rel="noreferrer">
                    فتح رابط التفعيل
                  </a>
                ) : null}
                <div className="admin-form-actions">
                  <button type="button" onClick={() => { setIsAddOpen(false); setInviteNotice(""); setActivationUrl(""); }}>
                    تم
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleCreateClient}>
                <label>
                  اسم الشركة/العميل
                  <input name="company" placeholder="مثال: متجر الرياض" required />
                </label>
                <label>
                  اسم صاحب الحساب
                  <input name="owner" placeholder="اسم صاحب الحساب" required />
                </label>
                <label>
                  البريد الإلكتروني لصاحب الحساب
                  <input name="ownerEmail" type="email" dir="ltr" placeholder="owner@example.com" required />
                </label>
                <label>
                  الباقة
                  <select name="plan" defaultValue={plans.find((p) => p.active === 1)?.name || "باقة النمو"}>
                    {plans.length
                      ? plans
                          .filter((p) => p.active === 1)
                          .map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name} ({formatNumber(p.monthlyPrice)} ر.س)
                            </option>
                          ))
                      : (
                        <>
                          <option>باقة البداية</option>
                          <option>باقة النمو</option>
                          <option>باقة الأعمال</option>
                        </>
                      )}
                  </select>
                </label>
                <label>
                  حالة الاشتراك
                  <select name="status" defaultValue="تجربة">
                    <option>تجربة</option>
                    <option>نشط</option>
                    <option>متوقف</option>
                  </select>
                </label>
                <label>
                  تاريخ التجديد
                  <input name="renewal" type="date" />
                </label>
                <label>
                  قيمة الباقة الشهرية
                  <input name="amount" type="number" min="0" defaultValue="0" />
                </label>
                <label>
                  دورة الفوترة
                  <select name="billingCycle" defaultValue="تجربة 14 يوم">
                    <option>تجربة 14 يوم</option>
                    <option>شهري</option>
                    <option>سنوي</option>
                  </select>
                </label>

                {formError ? <p className="admin-form-error">{formError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setIsAddOpen(false)}>
                    إلغاء
                  </button>
                  <button type="submit" disabled={isSaving}>
                    {isSaving ? "جاري الحفظ..." : "إنشاء الحساب"}
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
                <h2 id="user-limit-title">تعديل حد المستخدمين</h2>
                <p>أي مستخدم فوق حد الباقة يضاف تلقائيًا للفاتورة الشهرية بقيمة 65 ريال للمستخدم.</p>
              </div>
              <button type="button" onClick={() => setLimitClient(null)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleUpdateLimit}>
              <label>
                العميل
                <input value={limitClient.companyName} readOnly />
              </label>
              <label>
                الباقة
                <input value={limitClient.plan} readOnly />
              </label>
              <label>
                عدد الموظفين الحالي فعليًا
                <input value={`${formatNumber(limitClient.employeeCount)} موظف`} readOnly />
              </label>
              <label>
                الحد المطلوب
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
                  إلغاء
                </button>
                <button type="submit" disabled={isLimitSaving}>
                  {isLimitSaving ? "جاري الحفظ..." : "حفظ الحد"}
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
                <h2 id="charge-title">شحن / تجديد الاشتراك</h2>
                <p>ينشئ رابط دفع حقيقي لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا.</p>
              </div>
              <button type="button" onClick={() => setChargeClient(null)} aria-label="إغلاق">
                ×
              </button>
            </div>

            {chargeUrl ? (
              <div className="admin-invite-result">
                <p>تم إنشاء رابط الدفع. أرسله للعميل ليكمل الدفع:</p>
                <a className="activation-link" href={chargeUrl} target="_blank" rel="noreferrer">
                  فتح رابط الدفع
                </a>
                <div className="admin-form-actions">
                  <button type="button" onClick={() => setChargeClient(null)}>
                    تم
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleCharge}>
                <label>
                  العميل
                  <input value={chargeClient.companyName} readOnly />
                </label>
                <label>
                  بوابة الدفع
                  <select value={chargeGateway} onChange={(event) => setChargeGateway(event.target.value as "moyasar" | "stripe")}>
                    <option value="moyasar">Moyasar</option>
                    <option value="stripe">Stripe (وضع اختبار)</option>
                  </select>
                </label>
                <label>
                  قيمة الفاتورة (ر.س)
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
                    إلغاء
                  </button>
                  <button type="submit" disabled={isCharging}>
                    {isCharging ? "جاري الإنشاء..." : "إنشاء رابط الدفع"}
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
