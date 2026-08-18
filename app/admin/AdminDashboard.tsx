"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminLog } from "../../lib/database";

type SubscriptionRow = {
  id: string;
  tenantId: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
  status: string;
  employeeLimit: number;
  amount: number;
  billingCycle: string;
  renewalAt: string;
  createdAt: string;
  updatedAt: string;
  employeeCount: number;
  conversationCount: number;
};

type PaymentRow = {
  id: string;
  tenantId: string;
  companyName: string;
  amount: number;
  status: string;
  moyasarId: string;
  paymentUrl: string;
  createdAt: string;
  completedAt: string;
};

type PlanRow = {
  id: string;
  name: string;
  monthlyPrice: number;
  employeeLimit: number;
  sortOrder: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

type TeamRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type AdminDashboardProps = {
  user: { id: string; name: string; email: string };
  subscriptions: SubscriptionRow[];
  logs: AdminLog[];
  payments: PaymentRow[];
  plans: PlanRow[];
  team: TeamRow[];
};

const numberFormatter = new Intl.NumberFormat("ar-SA");
const EXTRA_USER_PRICE = 65;
const RENEWAL_SOON_DAYS = 7;

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function statusClass(status: string) {
  if (status === "نشط" || status === "مكتمل" || status === "مدفوع") return "is-good";
  if (status === "تجربة" || status === "قيد الانتظار" || status === "معلومة" || status === "تنبيه") return "is-warn";
  return "is-danger";
}

function parseRenewalDate(renewalAt: string) {
  if (!renewalAt) return null;
  const date = new Date(`${renewalAt}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRenewalAlert(subscription: SubscriptionRow): { label: string; tier: "overdue" | "soon" } | null {
  if (subscription.status !== "نشط") return null;
  const renewalDate = parseRenewalDate(subscription.renewalAt);
  if (!renewalDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((renewalDate.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: `متأخر ${formatNumber(Math.abs(diffDays))} يوم`, tier: "overdue" };
  }
  if (diffDays <= RENEWAL_SOON_DAYS) {
    return { label: diffDays === 0 ? "يتجدد اليوم" : `يتجدد خلال ${formatNumber(diffDays)} يوم`, tier: "soon" };
  }
  return null;
}

export default function AdminDashboard({ user, subscriptions, logs, payments, plans, team }: AdminDashboardProps) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedPaymentClient, setSelectedPaymentClient] = useState("all");
  const [isTeamInviteOpen, setIsTeamInviteOpen] = useState(false);
  const [isTeamSaving, setIsTeamSaving] = useState(false);
  const [teamFormError, setTeamFormError] = useState("");
  const [teamInviteNotice, setTeamInviteNotice] = useState("");
  const [teamActivationUrl, setTeamActivationUrl] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false);
  const [isPlanSaving, setIsPlanSaving] = useState(false);
  const [planFormError, setPlanFormError] = useState("");
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null);
  const [editPlanPrice, setEditPlanPrice] = useState("");
  const [editPlanLimit, setEditPlanLimit] = useState("");
  const [editPlanActive, setEditPlanActive] = useState(true);
  const [isEditPlanSaving, setIsEditPlanSaving] = useState(false);
  const [editPlanError, setEditPlanError] = useState("");
  const [limitClient, setLimitClient] = useState<SubscriptionRow | null>(null);
  const [limitValue, setLimitValue] = useState("");
  const [isLimitSaving, setIsLimitSaving] = useState(false);
  const [limitError, setLimitError] = useState("");
  const [chargeClient, setChargeClient] = useState<SubscriptionRow | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [isCharging, setIsCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeUrl, setChargeUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [selectedLogClient, setSelectedLogClient] = useState("all");

  const activeClients = subscriptions.filter((s) => s.status === "نشط").length;
  const trialClients = subscriptions.filter((s) => s.status === "تجربة").length;
  const monthlyRevenue = subscriptions.reduce((sum, s) => {
    if (s.status !== "نشط") return sum;
    const extra = Math.max(0, s.employeeCount - s.employeeLimit) * EXTRA_USER_PRICE;
    return sum + s.amount + extra;
  }, 0);
  const totalConversations = subscriptions.reduce((sum, s) => sum + s.conversationCount, 0);
  const filteredLogs = selectedLogClient === "all" ? logs : logs.filter((log) => log.clientId === selectedLogClient);
  const filteredPayments = selectedPaymentClient === "all" ? payments : payments.filter((payment) => payment.tenantId === selectedPaymentClient);
  const renewalAlerts = subscriptions
    .map((subscription) => ({ subscription, alert: getRenewalAlert(subscription) }))
    .filter((item): item is { subscription: SubscriptionRow; alert: { label: string; tier: "overdue" | "soon" } } => item.alert !== null)
    .sort((a, b) => (a.alert.tier === "overdue" ? 0 : 1) - (b.alert.tier === "overdue" ? 0 : 1));

  function showClientLogs(tenantId: string) {
    setSelectedLogClient(tenantId);
    window.setTimeout(() => document.getElementById("logs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

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
      body: JSON.stringify({ tenantId: chargeClient.tenantId, amount })
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

  async function handleInviteTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTeamSaving(true);
    setTeamFormError("");
    setTeamInviteNotice("");
    setTeamActivationUrl("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || "")
    };

    const response = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: { delivery?: { message?: string; activationUrl?: string } };
    };

    setIsTeamSaving(false);

    if (!response.ok || !result.ok) {
      setTeamFormError(result.error || "تعذر إضافة العضو");
      return;
    }

    setTeamInviteNotice(result.data?.delivery?.message || "تم إنشاء الحساب.");
    setTeamActivationUrl(result.data?.delivery?.activationUrl || "");
    router.refresh();
  }

  async function handleRevokeTeamMember(memberId: string) {
    if (!window.confirm("هل تريد إزالة صلاحية الأدمن عن هذا العضو؟")) return;

    setRevokingId(memberId);
    const response = await fetch(`/api/admin/team/${memberId}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    setRevokingId("");

    if (!response.ok || !result.ok) {
      window.alert(result.error || "تعذر إزالة الصلاحية");
      return;
    }

    router.refresh();
  }

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPlanSaving(true);
    setPlanFormError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || ""),
      monthlyPrice: Number(formData.get("monthlyPrice") || 0),
      employeeLimit: Number(formData.get("employeeLimit") || 1)
    };

    const response = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsPlanSaving(false);

    if (!response.ok || !result.ok) {
      setPlanFormError(result.error || "تعذر إنشاء الباقة");
      return;
    }

    setIsAddPlanOpen(false);
    router.refresh();
  }

  function openEditPlan(plan: PlanRow) {
    setEditPlan(plan);
    setEditPlanPrice(String(plan.monthlyPrice));
    setEditPlanLimit(String(plan.employeeLimit));
    setEditPlanActive(plan.active === 1);
    setEditPlanError("");
  }

  async function handleUpdatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editPlan) return;

    const monthlyPrice = Number(editPlanPrice);
    const employeeLimit = Number(editPlanLimit);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || !Number.isFinite(employeeLimit) || employeeLimit < 1) {
      setEditPlanError("تحقق من السعر وحد المستخدمين");
      return;
    }

    setIsEditPlanSaving(true);
    setEditPlanError("");

    const response = await fetch(`/api/admin/plans/${editPlan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyPrice, employeeLimit, active: editPlanActive })
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsEditPlanSaving(false);

    if (!response.ok || !result.ok) {
      setEditPlanError(result.error || "تعذر تحديث الباقة");
      return;
    }

    setEditPlan(null);
    router.refresh();
  }

  return (
    <main className="admin-shell" dir="rtl">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">A</span>
          <div>
            <strong>AudienceW</strong>
            <span>لوحة المزوّد</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="تنقل لوحة المزوّد">
          <a href="#overview" className="active">
            نظرة عامة
          </a>
          <a href="#clients">العملاء</a>
          <a href="#alerts">تنبيهات التجديد</a>
          <a href="#payments">المدفوعات</a>
          <a href="#plans">الباقات</a>
          <a href="#team">الفريق</a>
          <a href="#logs">السجلات</a>
        </nav>

        <div className="admin-profile">
          <span>{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>مدير المنصة</small>
          </div>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div className="admin-header-copy">
            <p>لوحة التحكم الأساسية</p>
            <h1>إدارة عملاء AudienceW من مكان واحد</h1>
            <span>كل عميل هنا حساب حقيقي فعلي — إنشاء عميل جديد ينشئ حساب دخول حقيقي له فورًا.</span>
          </div>
          <div className="admin-header-actions">
            <button type="button" onClick={() => setIsAddOpen(true)}>
              إضافة عميل
            </button>
          </div>
        </header>

        <section className="admin-section" id="overview">
          <div className="admin-metrics">
            <article>
              <span>إجمالي العملاء</span>
              <strong>{formatNumber(subscriptions.length)}</strong>
              <small>{formatNumber(activeClients)} نشط · {formatNumber(trialClients)} تجربة</small>
            </article>
            <article>
              <span>اشتراكات نشطة</span>
              <strong>{formatNumber(activeClients)}</strong>
              <small>{formatNumber(subscriptions.length - activeClients)} غير نشطة</small>
            </article>
            <article>
              <span>إيراد شهري متوقع</span>
              <strong>{formatNumber(monthlyRevenue)}</strong>
              <small>ريال من الاشتراكات النشطة</small>
            </article>
            <article>
              <span>محادثات تحت الإدارة</span>
              <strong>{formatNumber(totalConversations)}</strong>
              <small>مجمعة من كل حسابات العملاء</small>
            </article>
          </div>
        </section>

        <section className="admin-card" id="clients">
          <div className="admin-card-head">
            <div>
              <h2>العملاء</h2>
              <p>كل عميل وتحته حالة اشتراكه الحقيقية، عدد الموظفين الفعلي، والمحادثات المستخدمة.</p>
            </div>
            <div className="admin-card-actions">
              <button type="button" onClick={() => setIsAddOpen(true)}>
                إضافة
              </button>
            </div>
          </div>
          <div className="admin-client-cards">
            {subscriptions.map((client) => {
              const extraUserCount = Math.max(0, client.employeeCount - client.employeeLimit);
              const extraUserAmount = extraUserCount * EXTRA_USER_PRICE;
              const invoiceTotal = client.amount + extraUserAmount;

              return (
                <article className="admin-client-card" key={client.tenantId}>
                  <div className="admin-client-summary">
                    <div>
                      <strong>{client.companyName}</strong>
                      <span>{client.ownerName} · {client.ownerEmail}</span>
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
                    <button type="button" onClick={() => showClientLogs(client.tenantId)}>
                      سجل الحركة
                    </button>
                    <button type="button" onClick={() => openLimitEditor(client)}>
                      تعديل حد المستخدمين
                    </button>
                  </div>
                </article>
              );
            })}
            {!subscriptions.length ? <p className="admin-empty-state">لا يوجد عملاء بعد. اضغط "إضافة عميل" لإنشاء أول حساب.</p> : null}
          </div>
        </section>

        <section className="admin-card" id="alerts">
          <div className="admin-card-head">
            <div>
              <h2>تنبيهات التجديد</h2>
              <p>اشتراكات نشطة تحتاج متابعة: تجديد قريب خلال {formatNumber(RENEWAL_SOON_DAYS)} أيام أو متأخرة عن موعدها.</p>
            </div>
          </div>
          <div className="admin-list">
            {renewalAlerts.map(({ subscription, alert }) => (
              <div className="admin-list-row" key={subscription.tenantId}>
                <div>
                  <strong>{subscription.companyName}</strong>
                  <span>{subscription.plan} · التجديد: {subscription.renewalAt || "غير محدد"}</span>
                </div>
                <span className={`admin-pill ${alert.tier === "overdue" ? "is-danger" : "is-warn"}`}>{alert.label}</span>
                <button type="button" onClick={() => openChargeModal(subscription)}>
                  شحن الاشتراك
                </button>
              </div>
            ))}
            {!renewalAlerts.length ? <p className="admin-empty-state">لا توجد اشتراكات تحتاج متابعة حاليًا.</p> : null}
          </div>
        </section>

        <section className="admin-card" id="payments">
          <div className="admin-card-head">
            <div>
              <h2>المدفوعات</h2>
              <p>سجل كل طلبات الدفع عبر Moyasar لكل عميل، بحالتها الفعلية.</p>
            </div>
            <label className="admin-log-filter">
              العميل
              <select value={selectedPaymentClient} onChange={(event) => setSelectedPaymentClient(event.target.value)}>
                <option value="all">كل العملاء</option>
                {subscriptions.map((client) => (
                  <option key={client.tenantId} value={client.tenantId}>
                    {client.companyName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>العميل</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>معرّف Moyasar</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.completedAt || payment.createdAt}</td>
                    <td>{payment.companyName}</td>
                    <td>{formatNumber(payment.amount)} ر.س</td>
                    <td>
                      <span className={`admin-pill ${statusClass(payment.status)}`}>{payment.status}</span>
                    </td>
                    <td dir="ltr">{payment.moyasarId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredPayments.length === 0 ? <p className="admin-empty-state">لا توجد مدفوعات مسجّلة حتى الآن.</p> : null}
        </section>

        <section className="admin-card" id="plans">
          <div className="admin-card-head">
            <div>
              <h2>الباقات</h2>
              <p>الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.</p>
            </div>
            <div className="admin-card-actions">
              <button type="button" onClick={() => { setIsAddPlanOpen(true); setPlanFormError(""); }}>
                إضافة باقة
              </button>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الباقة</th>
                  <th>السعر الشهري</th>
                  <th>حد المستخدمين</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.name}</td>
                    <td>{formatNumber(plan.monthlyPrice)} ر.س</td>
                    <td>{formatNumber(plan.employeeLimit)}</td>
                    <td>
                      <span className={`admin-pill ${plan.active === 1 ? "is-good" : "is-danger"}`}>
                        {plan.active === 1 ? "مفعّلة" : "معطّلة"}
                      </span>
                    </td>
                    <td>
                      <button type="button" onClick={() => openEditPlan(plan)}>
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plans.length === 0 ? <p className="admin-empty-state">لا توجد باقات بعد.</p> : null}
        </section>

        <section className="admin-card" id="team">
          <div className="admin-card-head">
            <div>
              <h2>فريق المنصة</h2>
              <p>الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.</p>
            </div>
            <div className="admin-card-actions">
              <button type="button" onClick={() => { setIsTeamInviteOpen(true); setTeamFormError(""); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
                إضافة عضو
              </button>
            </div>
          </div>
          <div className="admin-list">
            {team.map((member) => (
              <div className="admin-list-row" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span dir="ltr">{member.email}</span>
                </div>
                <span className="admin-pill is-good">{member.createdAt}</span>
                {member.id !== user.id ? (
                  <button type="button" disabled={revokingId === member.id} onClick={() => handleRevokeTeamMember(member.id)}>
                    {revokingId === member.id ? "جاري الإزالة..." : "إزالة الصلاحية"}
                  </button>
                ) : (
                  <span className="admin-pill is-warn">أنت</span>
                )}
              </div>
            ))}
            {team.length === 0 ? <p className="admin-empty-state">لا يوجد أعضاء بعد.</p> : null}
          </div>
        </section>

        <section className="admin-grid lower">
          <article className="admin-card" id="logs">
            <div className="admin-card-head">
              <div>
                <h2>السجلات</h2>
                <p>فلتر السجلات حسب العميل واعرض سجل الحركة كامل لكل حساب.</p>
              </div>
              <label className="admin-log-filter">
                العميل
                <select value={selectedLogClient} onChange={(event) => setSelectedLogClient(event.target.value)}>
                  <option value="all">كل العملاء</option>
                  {subscriptions.map((client) => (
                    <option key={client.tenantId} value={client.tenantId}>
                      {client.companyName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الوقت</th>
                    <th>العميل</th>
                    <th>المصدر</th>
                    <th>المستوى</th>
                    <th>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.at}</td>
                      <td>{log.clientName}</td>
                      <td>{log.source}</td>
                      <td>
                        <span className={`admin-pill ${statusClass(log.level)}`}>{log.level}</span>
                      </td>
                      <td>{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLogs.length === 0 ? <p className="admin-empty-state">لا توجد سجلات لهذا العميل حتى الآن.</p> : null}
          </article>
        </section>
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
                <p>ينشئ رابط دفع Moyasar حقيقي لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا.</p>
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

      {isTeamInviteOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="team-invite-title">
          <div className="admin-modal-card">
            <div className="admin-modal-head">
              <div>
                <h2 id="team-invite-title">إضافة عضو لفريق المنصة</h2>
                <p>ينشئ هذا حساب دخول حقيقي بصلاحية أدمن ويرسل رابط تفعيل على بريده.</p>
              </div>
              <button type="button" onClick={() => { setIsTeamInviteOpen(false); setTeamInviteNotice(""); setTeamActivationUrl(""); }} aria-label="إغلاق">
                ×
              </button>
            </div>

            {teamInviteNotice ? (
              <div className="admin-invite-result">
                <p>{teamInviteNotice}</p>
                {teamActivationUrl ? (
                  <a className="activation-link" href={teamActivationUrl} target="_blank" rel="noreferrer">
                    فتح رابط التفعيل
                  </a>
                ) : null}
                <div className="admin-form-actions">
                  <button type="button" onClick={() => { setIsTeamInviteOpen(false); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
                    تم
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleInviteTeamMember}>
                <label>
                  الاسم
                  <input name="name" placeholder="اسم العضو" required />
                </label>
                <label>
                  البريد الإلكتروني
                  <input name="email" type="email" dir="ltr" placeholder="admin@example.com" required />
                </label>

                {teamFormError ? <p className="admin-form-error">{teamFormError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setIsTeamInviteOpen(false)}>
                    إلغاء
                  </button>
                  <button type="submit" disabled={isTeamSaving}>
                    {isTeamSaving ? "جاري الحفظ..." : "إضافة"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {isAddPlanOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="add-plan-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="add-plan-title">إضافة باقة جديدة</h2>
              </div>
              <button type="button" onClick={() => setIsAddPlanOpen(false)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleCreatePlan}>
              <label>
                اسم الباقة
                <input name="name" placeholder="مثال: باقة الأعمال" required />
              </label>
              <label>
                السعر الشهري (ر.س)
                <input name="monthlyPrice" type="number" min="0" defaultValue="0" required />
              </label>
              <label>
                حد المستخدمين
                <input name="employeeLimit" type="number" min="1" defaultValue="1" required />
              </label>

              {planFormError ? <p className="admin-form-error">{planFormError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setIsAddPlanOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isPlanSaving}>
                  {isPlanSaving ? "جاري الحفظ..." : "إنشاء الباقة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editPlan ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="edit-plan-title">تعديل الباقة</h2>
              </div>
              <button type="button" onClick={() => setEditPlan(null)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleUpdatePlan}>
              <label>
                الباقة
                <input value={editPlan.name} readOnly />
              </label>
              <label>
                السعر الشهري (ر.س)
                <input
                  type="number"
                  min="0"
                  value={editPlanPrice}
                  onChange={(event) => setEditPlanPrice(event.target.value)}
                />
              </label>
              <label>
                حد المستخدمين
                <input
                  type="number"
                  min="1"
                  value={editPlanLimit}
                  onChange={(event) => setEditPlanLimit(event.target.value)}
                />
              </label>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={editPlanActive}
                  onChange={(event) => setEditPlanActive(event.target.checked)}
                />
                مفعّلة (تظهر عند إضافة عميل جديد)
              </label>

              {editPlanError ? <p className="admin-form-error">{editPlanError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setEditPlan(null)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isEditPlanSaving}>
                  {isEditPlanSaving ? "جاري الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
