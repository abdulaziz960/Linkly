"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminLog, ProviderClient, ProviderSubscription } from "../../lib/database";
import type { Campaign, DashboardUser, IntegrationSettings, MessageTemplate } from "../dashboard/types";

type AdminDashboardProps = {
  user: DashboardUser;
  clients: ProviderClient[];
  subscriptions: ProviderSubscription[];
  logs: AdminLog[];
  campaigns: Campaign[];
  templates: MessageTemplate[];
  integration: IntegrationSettings;
};

const numberFormatter = new Intl.NumberFormat("ar-SA");
const EXTRA_USER_PRICE = 65;
const PLAN_USER_LIMITS: Record<string, number> = {
  "باقة البداية": 3,
  "باقة النمو": 10,
  "باقة الأعمال": 25
};

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function getPlanUserLimit(plan: string) {
  return PLAN_USER_LIMITS[plan] ?? PLAN_USER_LIMITS["باقة البداية"];
}

function getExtraUserCount(client: ProviderClient, plan: string) {
  return Math.max(0, client.employees - getPlanUserLimit(plan));
}

function getExtraUserAmount(client: ProviderClient, plan: string) {
  return getExtraUserCount(client, plan) * EXTRA_USER_PRICE;
}

function statusClass(status: string) {
  if (status === "نشط" || status === "connected" || status === "مدفوع") return "is-good";
  if (
    status === "تجربة" ||
    status === "pending" ||
    status === "تجريبي" ||
    status === "تنبيه" ||
    status === "قيد التجهيز" ||
    status === "بانتظار الربط" ||
    status === "بانتظار الإكمال"
  )
    return "is-warn";
  return "is-danger";
}

export default function AdminDashboard({
  user,
  clients,
  subscriptions,
  logs,
  campaigns,
  templates,
  integration
}: AdminDashboardProps) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [userLimitClient, setUserLimitClient] = useState<ProviderClient | null>(null);
  const [userLimitValue, setUserLimitValue] = useState("");
  const [isUserLimitSaving, setIsUserLimitSaving] = useState(false);
  const [userLimitError, setUserLimitError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedLogClient, setSelectedLogClient] = useState("all");
  const activeClients = clients.filter((client) => client.status === "نشط").length;
  const trialClients = clients.filter((client) => client.status === "تجربة").length;
  const pendingClients = clients.filter((client) => client.status === "بانتظار الربط").length;
  const totalConversations = clients.reduce((sum, client) => sum + client.conversations, 0);
  const connectedClients = clients.filter((client) => client.wabaId !== "بانتظار الربط").length;
  const approvedTemplates = templates.filter((template) => template.status === "معتمد").length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status !== "الحملة أنجزت").length;
  const monthlyRevenue = clients.reduce((sum, client) => {
    const subscription = getSubscription(client);
    if (!subscription || subscription.status !== "مدفوع") return sum;
    return sum + subscription.amount + getExtraUserAmount(client, subscription.plan);
  }, 0);
  const pendingSubscriptions = subscriptions.filter((subscription) => subscription.status !== "مدفوع");
  const recentLogs = logs.slice(0, 5);
  const filteredLogs =
    selectedLogClient === "all" ? logs : logs.filter((log) => log.clientId === selectedLogClient);

  function getSubscription(client: ProviderClient) {
    return subscriptions.find((subscription) => subscription.clientId === client.id);
  }

  function showClientLogs(clientId: string) {
    setSelectedLogClient(clientId);
    window.setTimeout(() => document.getElementById("logs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function openUserLimitEditor(client: ProviderClient) {
    setUserLimitClient(client);
    setUserLimitValue(String(client.employees));
    setUserLimitError("");
  }

  async function handleUpdateUserLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userLimitClient) return;

    const employees = Number(userLimitValue);
    if (!Number.isFinite(employees) || employees < 1) {
      setUserLimitError("اكتب حد مستخدمين صحيح");
      return;
    }

    setIsUserLimitSaving(true);
    setUserLimitError("");

    const response = await fetch(`/api/admin/clients/${userLimitClient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees })
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsUserLimitSaving(false);

    if (!response.ok || !result.ok) {
      setUserLimitError(result.error || "تعذر تحديث حد المستخدمين");
      return;
    }

    setUserLimitClient(null);
    router.refresh();
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFormError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      company: String(formData.get("company") || ""),
      owner: String(formData.get("owner") || ""),
      plan: String(formData.get("plan") || ""),
      status: String(formData.get("status") || ""),
      subscriptionStatus: String(formData.get("subscriptionStatus") || ""),
      renewal: String(formData.get("renewal") || ""),
      phone: String(formData.get("phone") || ""),
      wabaId: String(formData.get("wabaId") || ""),
      employees: Number(formData.get("employees") || 1),
      amount: Number(formData.get("amount") || 0),
      billingCycle: String(formData.get("billingCycle") || ""),
      paymentMethod: String(formData.get("paymentMethod") || "")
    };

    const response = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setIsSaving(false);

    if (!response.ok || !result.ok) {
      setFormError(result.error || "تعذر حفظ العميل");
      return;
    }

    setIsAddOpen(false);
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
          <a href="#subscriptions">الاشتراكات</a>
          <a href="#integrations">الربط</a>
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
            <span>تابع الاشتراكات، الربط، السجلات، وحالة التشغيل لكل عميل.</span>
          </div>
          <div className="admin-header-actions">
            <a href="/dashboard">لوحة العميل</a>
            <button type="button" onClick={() => setIsAddOpen(true)}>
              إضافة عميل
            </button>
          </div>
        </header>

        <section className="admin-command-center" aria-label="ملخص التشغيل">
          <div className="admin-command-copy">
            <span>تشغيل المنصة</span>
            <strong>{connectedClients === clients.length ? "كل الحسابات مربوطة" : "يوجد حسابات تحتاج متابعة"}</strong>
            <p>
              {formatNumber(connectedClients)} حساب WhatsApp مربوط من أصل {formatNumber(clients.length)} عميل.
            </p>
          </div>
          <div className="admin-command-actions">
            <button type="button" onClick={() => setIsAddOpen(true)}>
              إنشاء عميل جديد
            </button>
            <a href="#logs">مراجعة السجلات</a>
          </div>
        </section>

        <section className="admin-section" id="overview">
          <div className="admin-metrics">
            <article className="accent-blue">
              <span>إجمالي العملاء</span>
              <strong>{formatNumber(clients.length)}</strong>
              <small>{formatNumber(activeClients)} نشط · {formatNumber(trialClients)} تجربة</small>
            </article>
            <article className="accent-green">
              <span>اشتراكات نشطة</span>
              <strong>{formatNumber(activeClients)}</strong>
              <small>{formatNumber(pendingClients)} بانتظار إكمال الربط</small>
            </article>
            <article className="accent-slate">
              <span>إيراد شهري متوقع</span>
              <strong>{formatNumber(monthlyRevenue)}</strong>
              <small>ريال من الاشتراكات المدفوعة</small>
            </article>
            <article className="accent-amber">
              <span>محادثات تحت الإدارة</span>
              <strong>{formatNumber(totalConversations)}</strong>
              <small>مجمعة من حسابات العملاء</small>
            </article>
            <article className="accent-cyan">
              <span>حسابات WhatsApp مربوطة</span>
              <strong>{formatNumber(connectedClients)}</strong>
              <small>من أصل {formatNumber(clients.length)} حساب</small>
            </article>
          </div>
        </section>

        <section className="admin-ops-grid">
          <article className="admin-ops-card">
            <span>قوالب WhatsApp</span>
            <strong>{formatNumber(approvedTemplates)} معتمد</strong>
            <p>{formatNumber(activeCampaigns)} حملة قيد المتابعة حاليًا.</p>
          </article>
          <article className="admin-ops-card">
            <span>اشتراكات تحتاج إجراء</span>
            <strong>{formatNumber(pendingSubscriptions.length)}</strong>
            <p>تجارب أو حسابات بانتظار تجهيز الدفع أو الربط.</p>
          </article>
          <article className="admin-ops-card">
            <span>آخر سجل</span>
            <strong>{logs[0]?.level || "معلومة"}</strong>
            <p>{logs[0]?.message || "لا توجد سجلات جديدة."}</p>
          </article>
        </section>

        <section className="admin-card" id="clients">
            <div className="admin-card-head">
              <div>
                <h2>العملاء</h2>
                <p>كل عميل وتحته حالة الربط، الاشتراك، الفواتير، الحملات، وشحن محفظة الرسائل.</p>
              </div>
              <div className="admin-card-actions">
                <button type="button">تصدير</button>
                <button type="button" onClick={() => setIsAddOpen(true)}>
                  إضافة
                </button>
              </div>
            </div>
            <div className="admin-client-cards">
              {clients.map((client) => {
                const subscription = getSubscription(client);
                const plan = subscription?.plan || client.plan;
                const baseInvoiceAmount = subscription?.amount || 0;
                const planUserLimit = getPlanUserLimit(plan);
                const extraUserCount = getExtraUserCount(client, plan);
                const extraUserAmount = getExtraUserAmount(client, plan);
                const invoiceTotal = baseInvoiceAmount + extraUserAmount;
                const isConnected = client.wabaId !== "بانتظار الربط";
                const clientCampaignLogs = logs.filter((log) => log.clientId === client.id && log.source === "Campaigns").length;
                const walletBalance = Math.max(0, 500 - client.conversations);

                return (
                  <article className="admin-client-card" key={client.id}>
                    <div className="admin-client-summary">
                      <div>
                        <strong>{client.company}</strong>
                        <span>{client.owner}</span>
                      </div>
                      <span className={`admin-pill ${statusClass(client.status)}`}>{client.status}</span>
                    </div>

                    <div className="admin-client-status-grid">
                      <div>
                        <span>حالة الربط</span>
                        <strong>
                          <span className={`admin-status-dot ${isConnected ? "is-online" : ""}`} />
                          {isConnected ? "مربوط" : "بانتظار الربط"}
                        </strong>
                        <small>{isConnected ? `WABA: ${client.wabaId}` : "لم يكتمل ربط Meta بعد"}</small>
                      </div>
                      <div>
                        <span>الاشتراك</span>
                        <strong>{subscription?.plan || client.plan}</strong>
                        <small>{subscription?.status || client.subscriptionStatus}</small>
                      </div>
                      <div>
                        <span>حد المستخدمين</span>
                        <strong>
                          {formatNumber(client.employees)} / {formatNumber(planUserLimit)}
                        </strong>
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
                          {formatNumber(baseInvoiceAmount)} ر.س اشتراك
                          {extraUserAmount > 0 ? ` + ${formatNumber(extraUserAmount)} ر.س مستخدمين` : ""}
                        </small>
                      </div>
                      <div>
                        <span>الحملات</span>
                        <strong>{formatNumber(clientCampaignLogs || (client.status === "نشط" ? activeCampaigns : 0))}</strong>
                        <small>{formatNumber(client.conversations)} محادثة مستخدمة</small>
                      </div>
                      <div>
                        <span>محفظة الرسائل</span>
                        <strong>{formatNumber(walletBalance)}</strong>
                        <small>رسالة تسويقية متاحة تقديريًا</small>
                      </div>
                    </div>

                    <div className="admin-client-actions">
                      <a className="admin-link-button" href="/dashboard">
                        فتح لوحة العميل
                      </a>
                      <button type="button" onClick={() => showClientLogs(client.id)}>
                        سجل الحركة
                      </button>
                      <button type="button" onClick={() => openUserLimitEditor(client)}>
                        تعديل حد المستخدمين
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
        </section>

        <section className="admin-grid">
          <article className="admin-card compact" id="subscriptions">
            <div className="admin-card-head">
              <div>
                <h2>الاشتراكات</h2>
                <p>متابعة الباقات والتجديدات القريبة.</p>
              </div>
            </div>
            <div className="admin-list">
              {subscriptions.map((subscription) => {
                const client = clients.find((item) => item.id === subscription.clientId);
                const extraAmount = client ? getExtraUserAmount(client, subscription.plan) : 0;
                const invoiceTotal = subscription.amount + extraAmount;

                return (
                  <div className="admin-list-row" key={subscription.id}>
                    <div>
                      <strong>{subscription.clientName}</strong>
                      <span>
                        {subscription.plan} · {formatNumber(invoiceTotal)} ر.س
                        {extraAmount > 0 ? ` شامل ${formatNumber(extraAmount)} ر.س مستخدمين إضافيين` : ""} · التجديد{" "}
                        {subscription.renewal}
                      </span>
                    </div>
                    <span className={`admin-pill ${statusClass(subscription.status)}`}>{subscription.status}</span>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="admin-grid lower">
          <article className="admin-card" id="integrations">
            <div className="admin-card-head">
              <div>
                <h2>الربط والويبهوك</h2>
                <p>حالة الربط العامة للحسابات التي تعتمد على Meta WhatsApp Cloud API.</p>
              </div>
            </div>
            <div className="admin-integration">
              <div>
                <span>حالة الربط</span>
                <strong>
                  <span className={`admin-status-dot ${integration.status === "connected" ? "is-online" : ""}`} />
                  {integration.status === "connected" ? "متصل" : "بانتظار الإكمال"}
                </strong>
              </div>
              <div>
                <span>App ID</span>
                <strong>{integration.appId}</strong>
              </div>
              <div>
                <span>Phone Number ID</span>
                <strong>{integration.phoneNumberId}</strong>
              </div>
              <div>
                <span>Webhook</span>
                <strong>{integration.webhookUrl}</strong>
              </div>
            </div>
          </article>

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
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company}
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
            {filteredLogs.length === 0 ? (
              <p className="admin-empty-state">لا توجد سجلات لهذا العميل حتى الآن.</p>
            ) : null}
          </article>
        </section>
      </section>

      {isAddOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
          <div className="admin-modal-card">
            <div className="admin-modal-head">
              <div>
                <h2 id="add-client-title">إضافة عميل جديد</h2>
                <p>أدخل بيانات العميل والاشتراك الأولي، وبعدها نقدر نربط حساب Meta من لوحة العميل.</p>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleCreateClient}>
              <label>
                اسم العميل
                <input name="company" placeholder="مثال: متجر الرياض" required />
              </label>
              <label>
                المسؤول
                <input name="owner" placeholder="اسم صاحب الحساب أو المسؤول" required />
              </label>
              <label>
                الباقة
                <select name="plan" defaultValue="باقة النمو">
                  <option>باقة البداية</option>
                  <option>باقة النمو</option>
                  <option>باقة الأعمال</option>
                </select>
              </label>
              <label>
                حالة العميل
                <select name="status" defaultValue="تجربة">
                  <option>تجربة</option>
                  <option>نشط</option>
                  <option>بانتظار الربط</option>
                </select>
              </label>
              <label>
                حالة الاشتراك
                <select name="subscriptionStatus" defaultValue="تجريبي">
                  <option>تجريبي</option>
                  <option>مدفوع</option>
                  <option>قيد التجهيز</option>
                </select>
              </label>
              <label>
                تاريخ التجديد
                <input name="renewal" type="date" />
              </label>
              <label>
                رقم واتساب
                <input name="phone" placeholder="+966 5x xxx xxxx" />
              </label>
              <label>
                WABA ID
                <input name="wabaId" placeholder="يترك فارغ إذا لم يربط بعد" />
              </label>
              <label>
                حد المستخدمين
                <input name="employees" type="number" min="1" defaultValue="1" />
              </label>
              <label>
                قيمة الباقة الأساسية
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
              <label>
                طريقة الدفع
                <select name="paymentMethod" defaultValue="بدون دفع">
                  <option>بدون دفع</option>
                  <option>تحويل بنكي</option>
                  <option>بطاقة</option>
                </select>
              </label>

              {formError ? <p className="admin-form-error">{formError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setIsAddOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "جاري الحفظ..." : "حفظ العميل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {userLimitClient ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="user-limit-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="user-limit-title">تعديل حد المستخدمين</h2>
                <p>أي مستخدم فوق حد الباقة يضاف تلقائيًا للفاتورة الشهرية بقيمة 65 ريال للمستخدم.</p>
              </div>
              <button type="button" onClick={() => setUserLimitClient(null)} aria-label="إغلاق">
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleUpdateUserLimit}>
              <label>
                العميل
                <input value={userLimitClient.company} readOnly />
              </label>
              <label>
                الباقة
                <input value={userLimitClient.plan} readOnly />
              </label>
              <label>
                حد الباقة الأساسي
                <input value={`${formatNumber(getPlanUserLimit(userLimitClient.plan))} مستخدم`} readOnly />
              </label>
              <label>
                الحد المطلوب
                <input
                  type="number"
                  min="1"
                  value={userLimitValue}
                  onChange={(event) => setUserLimitValue(event.target.value)}
                />
              </label>

              <div className="admin-billing-preview">
                <div>
                  <span>مستخدمون إضافيون</span>
                  <strong>
                    {formatNumber(Math.max(0, Number(userLimitValue || 0) - getPlanUserLimit(userLimitClient.plan)))}
                  </strong>
                </div>
                <div>
                  <span>إضافة تلقائية للفاتورة</span>
                  <strong>
                    {formatNumber(
                      Math.max(0, Number(userLimitValue || 0) - getPlanUserLimit(userLimitClient.plan)) * EXTRA_USER_PRICE
                    )}{" "}
                    ر.س
                  </strong>
                </div>
              </div>

              {userLimitError ? <p className="admin-form-error">{userLimitError}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setUserLimitClient(null)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isUserLimitSaving}>
                  {isUserLimitSaving ? "جاري الحفظ..." : "حفظ الحد"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
