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

type AdminDashboardProps = {
  user: { id: string; name: string; email: string };
  subscriptions: SubscriptionRow[];
  logs: AdminLog[];
};

const numberFormatter = new Intl.NumberFormat("ar-SA");
const EXTRA_USER_PRICE = 65;

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function statusClass(status: string) {
  if (status === "نشط" || status === "مكتمل" || status === "مدفوع") return "is-good";
  if (status === "تجربة" || status === "قيد الانتظار" || status === "معلومة" || status === "تنبيه") return "is-warn";
  return "is-danger";
}

export default function AdminDashboard({ user, subscriptions, logs }: AdminDashboardProps) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
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
            <article className="accent-blue">
              <span>إجمالي العملاء</span>
              <strong>{formatNumber(subscriptions.length)}</strong>
              <small>{formatNumber(activeClients)} نشط · {formatNumber(trialClients)} تجربة</small>
            </article>
            <article className="accent-green">
              <span>اشتراكات نشطة</span>
              <strong>{formatNumber(activeClients)}</strong>
              <small>{formatNumber(subscriptions.length - activeClients)} غير نشطة</small>
            </article>
            <article className="accent-slate">
              <span>إيراد شهري متوقع</span>
              <strong>{formatNumber(monthlyRevenue)}</strong>
              <small>ريال من الاشتراكات النشطة</small>
            </article>
            <article className="accent-amber">
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
                  <select name="plan" defaultValue="باقة النمو">
                    <option>باقة البداية</option>
                    <option>باقة النمو</option>
                    <option>باقة الأعمال</option>
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
    </main>
  );
}
