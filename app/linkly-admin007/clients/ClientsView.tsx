"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PlanRow, SubscriptionRow } from "../types";
import { formatNumber, getRenewalAlert } from "../utils";
import { Badge, Button, EmptyState, LinkButton, Section, Segmented, StatCard, type Tone } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";
import { useQueryFlag } from "../ds/useQueryFlag";
import { SORT_OPTIONS, STATUS_FILTERS, clientCounts, filterClients, invoiceBreakdown, sortClients, type ClientSort, type ClientStatusFilter } from "./clients-data";

type Props = { subscriptions: SubscriptionRow[]; plans: PlanRow[] };

type ClientDraft = { company: string; owner: string; ownerEmail: string; plan: string; status: string; renewal: string; amount: string; billingCycle: string };
type CreatePayload = { company: string; owner: string; ownerEmail: string; plan: string; status: string; renewal: string; amount: number; billingCycle: string };
type Modal =
  | { kind: "add" }
  | { kind: "limit" | "plan" | "balance" | "charge"; client: SubscriptionRow }
  | null;

const STATUS_TONE: Record<string, Tone> = { نشط: "success", تجربة: "warning", متوقف: "danger" };
const BILLING_CYCLES = [
  { value: "تجربة 3 أيام", label: "تجربة 3 أيام" },
  { value: "شهري", label: "شهري" },
  { value: "ربع سنوي", label: "ربع سنوي (3 شهور)" },
  { value: "نصف سنوي", label: "نصف سنوي (6 شهور)" },
  { value: "سنوي", label: "سنوي (12 شهر)" }
];

async function call<T = unknown>(url: string, method: "POST" | "PATCH", body: unknown): Promise<{ ok: boolean; error?: string; data?: T }> {
  try {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: T; paymentUrl?: string };
    return { ok: response.ok && result.ok !== false, error: result.error, data: (result.data ?? (result.paymentUrl ? ({ paymentUrl: result.paymentUrl } as T) : undefined)) };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى." };
  }
}

function emptyDraft(plans: PlanRow[]): ClientDraft {
  const first = plans.find((plan) => plan.active === 1);
  return { company: "", owner: "", ownerEmail: "", plan: first?.name || "", status: "تجربة", renewal: "", amount: String(first?.monthlyPrice ?? 0), billingCycle: "تجربة 3 أيام" };
}

export default function ClientsView({ subscriptions, plans }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientStatusFilter>("الكل");
  const [sort, setSort] = useState<ClientSort>("recent");
  const [followUpOnly, setFollowUpOnly] = useState(false);

  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const activePlans = plans.filter((plan) => plan.active === 1);
  const [draft, setDraft] = useState<ClientDraft>(() => emptyDraft(plans));
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [review, setReview] = useState<CreatePayload | null>(null);
  const [inviteNotice, setInviteNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");

  const [limitValue, setLimitValue] = useState("");
  const [planValue, setPlanValue] = useState("");
  const [balanceMessages, setBalanceMessages] = useState("");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeGateway, setChargeGateway] = useState<"moyasar" | "stripe">("moyasar");
  const [chargeUrl, setChargeUrl] = useState("");

  const counts = useMemo(() => clientCounts(subscriptions), [subscriptions]);
  const visible = useMemo(() => sortClients(filterClients(subscriptions, { query, status, followUpOnly }), sort), [subscriptions, query, status, followUpOnly, sort]);
  const hasFilters = Boolean(query.trim()) || status !== "الكل" || followUpOnly;

  function openAdd() {
    setDraft(emptyDraft(plans));
    setStep("form");
    setReview(null);
    setInviteNotice("");
    setActivationUrl("");
    setError("");
    setModal({ kind: "add" });
  }
  useQueryFlag("new", openAdd);

  function closeModal() {
    if (busy) return;
    setModal(null);
    setError("");
  }

  function openEditor(kind: "limit" | "plan" | "balance" | "charge", client: SubscriptionRow) {
    setError("");
    setChargeUrl("");
    setLimitValue(String(client.employeeLimit));
    setPlanValue(client.plan);
    setBalanceMessages("");
    setBalanceAmount("");
    setChargeAmount(String(client.amount || 499));
    setChargeGateway("moyasar");
    setModal({ kind, client });
  }

  async function finish(result: { ok: boolean; error?: string }, fallbackError: string, successTitle: string) {
    setBusy(false);
    if (!result.ok) {
      setError(result.error || fallbackError);
      return false;
    }
    setModal(null);
    toast("success", successTitle);
    router.refresh();
    return true;
  }

  async function submitLimit(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "limit") return;
    const employeeLimit = Number(limitValue);
    if (!Number.isInteger(employeeLimit) || employeeLimit < 1) return setError("اكتب حد مستخدمين صحيحًا (رقم صحيح لا يقل عن 1).");
    setBusy(true);
    setError("");
    await finish(await call(`/api/admin/clients/${modal.client.tenantId}`, "PATCH", { employeeLimit }), "تعذر تحديث حد المستخدمين", "تم تحديث حد المستخدمين");
  }

  async function submitPlan(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "plan") return;
    if (!planValue) return setError("اختر باقة.");
    setBusy(true);
    setError("");
    await finish(await call(`/api/admin/clients/${modal.client.tenantId}`, "PATCH", { plan: planValue }), "تعذر تغيير الباقة", "تم تغيير الباقة");
  }

  async function submitBalance(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "balance") return;
    const messages = Number(balanceMessages);
    if (!Number.isInteger(messages) || messages < 1) return setError("اكتب عدد رسائل صحيحًا (رقم صحيح لا يقل عن 1).");
    const amount = balanceAmount.trim() ? Number(balanceAmount) : 0;
    if (!Number.isFinite(amount) || amount < 0) return setError("اكتب مبلغًا صحيحًا.");
    setBusy(true);
    setError("");
    await finish(await call(`/api/admin/clients/${modal.client.tenantId}/campaign-balance`, "POST", { messages, amount }), "تعذر إضافة الرصيد", "تمت إضافة الرصيد");
  }

  async function submitCharge(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "charge") return;
    const amount = Number(chargeAmount);
    if (!Number.isFinite(amount) || amount < 1) return setError("اكتب قيمة فاتورة صحيحة (1 ر.س على الأقل).");
    setBusy(true);
    setError("");
    const result = await call<{ paymentUrl?: string }>("/api/admin/subscriptions/charge", "POST", { tenantId: modal.client.tenantId, amount, gateway: chargeGateway });
    setBusy(false);
    if (!result.ok || !result.data?.paymentUrl) return setError(result.error || "تعذر إنشاء رابط الدفع");
    setChargeUrl(result.data.paymentUrl);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("success", "تم نسخ الرابط");
    } catch {
      toast("error", "تعذر النسخ", "انسخ الرابط يدويًا من الحقل.");
    }
  }

  async function toggleStatus(client: SubscriptionRow) {
    const disabling = client.status !== "متوقف";
    const ok = await confirm({
      title: disabling ? `تعطيل حساب «${client.companyName}»؟` : `تفعيل حساب «${client.companyName}» من جديد؟`,
      description: disabling ? "سيفقد العميل الوصول إلى لوحته فورًا، ولا يُحذف أي شيء. يمكنك تفعيله في أي وقت." : "سيعود الوصول إلى العميل فورًا.",
      confirmLabel: disabling ? "تعطيل الحساب" : "تفعيل الحساب",
      tone: disabling ? "danger" : "default"
    });
    if (!ok) return;
    setTogglingId(client.tenantId);
    const result = await call(`/api/admin/clients/${client.tenantId}`, "PATCH", { status: disabling ? "متوقف" : "نشط" });
    setTogglingId("");
    if (!result.ok) return toast("error", "تعذر تحديث حالة العميل", result.error);
    toast("success", disabling ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
    router.refresh();
  }

  function setField<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const payload: CreatePayload = {
      company: draft.company.trim(),
      owner: draft.owner.trim(),
      ownerEmail: draft.ownerEmail.trim().toLowerCase(),
      plan: draft.plan,
      status: draft.status,
      renewal: draft.renewal,
      amount: Number(draft.amount || 0),
      billingCycle: draft.billingCycle
    };
    if (subscriptions.some((client) => client.ownerEmail.toLowerCase() === payload.ownerEmail)) {
      return setError("هذا البريد مرتبط بعميل موجود. افتح حسابه بدلًا من إنشاء حساب مكرر.");
    }
    if (!Number.isFinite(payload.amount) || payload.amount < 0) return setError("أدخل سعرًا صحيحًا لا يقل عن صفر.");
    setError("");
    setReview(payload);
    setStep("review");
  }

  async function confirmCreate() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    const result = await call<{ inviteDelivery?: { message?: string; activationUrl?: string } }>("/api/admin/clients", "POST", review);
    setBusy(false);
    if (!result.ok) {
      return setError(result.error || "تعذر حفظ العميل. تحقق من قائمة العملاء قبل إعادة المحاولة لتجنب التكرار.");
    }
    setInviteNotice(result.data?.inviteDelivery?.message || "تم إنشاء الحساب.");
    setActivationUrl(result.data?.inviteDelivery?.activationUrl || "");
    setStep("done");
    toast("success", "تم إنشاء العميل");
    router.refresh();
  }

  const planOptionLabel = (plan: PlanRow) => `${plan.name} (${formatNumber(plan.monthlyPrice)} ر.س)`;

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي العملاء" value={formatNumber(counts.total)} hint="الحسابات الحقيقية على المنصة" icon="users" />
        <StatCard label="نشط" value={formatNumber(counts.active)} hint="اشتراكات فعّالة حاليًا" icon="checkCircle" tone="success" />
        <StatCard label="تجربة" value={formatNumber(counts.trial)} hint="لم تتحول لاشتراك مدفوع بعد" icon="clock" tone="info" />
        <StatCard label="يحتاج متابعة" value={formatNumber(counts.followUp)} hint="تجديد قريب أو متأخر" icon="alert" tone={counts.followUp ? "warning" : "neutral"} />
      </div>

      <Section
        title={`العملاء (${formatNumber(visible.length)} من ${formatNumber(subscriptions.length)})`}
        description="حالة الاشتراك الفعلية وعدد المستخدمين والفاتورة الشهرية لكل عميل."
        actions={<Button variant="primary" icon="plus" onClick={openAdd}>إضافة عميل</Button>}
      >
        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث بالاسم أو البريد الإلكتروني…" aria-label="بحث في العملاء" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Segmented
            label="تصفية حسب الحالة"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTERS.map((value) => ({
              value,
              label: `${value} (${formatNumber(value === "الكل" ? counts.total : value === "نشط" ? counts.active : value === "تجربة" ? counts.trial : counts.paused)})`
            }))}
          />
          <div className="ds-toolbar-end">
            <Button variant={followUpOnly ? "primary" : "outline"} icon="alert" aria-pressed={followUpOnly} onClick={() => setFollowUpOnly((value) => !value)}>
              يحتاج متابعة
            </Button>
            <select className="ds-select" aria-label="ترتيب العملاء" value={sort} onChange={(event) => setSort(event.target.value as ClientSort)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>ترتيب: {option.label}</option>)}
            </select>
          </div>
        </div>

        {!subscriptions.length ? (
          <EmptyState icon="users" title="لا يوجد عملاء بعد" description="أنشئ أول حساب عميل وسيصله رابط التفعيل على بريده." action={<Button variant="primary" icon="plus" onClick={openAdd}>إضافة عميل</Button>} />
        ) : !visible.length ? (
          <EmptyState
            icon="search"
            title="لا توجد نتائج مطابقة"
            description="جرّب تغيير كلمات البحث أو إزالة التصفية."
            action={hasFilters ? <Button variant="outline" onClick={() => { setQuery(""); setStatus("الكل"); setFollowUpOnly(false); }}>إزالة التصفية</Button> : undefined}
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">العميل</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">الباقة</th>
                  <th scope="col">المستخدمون</th>
                  <th scope="col">الفاتورة الشهرية</th>
                  <th scope="col">التجديد</th>
                  <th scope="col">رصيد الحملات</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((client) => {
                  const invoice = invoiceBreakdown(client);
                  const alert = getRenewalAlert(client);
                  return (
                    <tr key={client.tenantId}>
                      <td data-cell="main">
                        <div className="ds-cell-main">
                          <span className="ds-avatar" aria-hidden="true">{client.companyName.slice(0, 1) || "ع"}</span>
                          <div>
                            <strong>{client.companyName}</strong>
                            <span>{client.ownerName} · <bdi dir="ltr">{client.ownerEmail}</bdi></span>
                          </div>
                        </div>
                      </td>
                      <td data-label="الحالة"><Badge tone={STATUS_TONE[client.status] ?? "neutral"}>{client.status}</Badge></td>
                      <td data-label="الباقة">
                        <div className="ds-cell-stack"><strong>{client.plan}</strong><small>{client.billingCycle}</small></div>
                      </td>
                      <td data-label="المستخدمون">
                        <div className="ds-cell-stack">
                          <strong>{formatNumber(client.employeeCount)} / {formatNumber(client.employeeLimit)}</strong>
                          <small>{invoice.extraUsers > 0 ? `${formatNumber(invoice.extraUsers)} مستخدم إضافي` : "ضمن حد الباقة"}</small>
                        </div>
                      </td>
                      <td data-label="الفاتورة الشهرية">
                        <div className="ds-cell-stack">
                          <strong>{formatNumber(invoice.total)} ر.س</strong>
                          <small>{invoice.extraAmount > 0 ? `${formatNumber(client.amount)} + ${formatNumber(invoice.extraAmount)} مستخدمين` : "اشتراك فقط"}</small>
                        </div>
                      </td>
                      <td data-label="التجديد">
                        <div className="ds-cell-stack">
                          <strong>{client.renewalAt || "غير محدد"}</strong>
                          {alert ? <Badge tone={alert.tier === "overdue" ? "danger" : "warning"}>{alert.label}</Badge> : null}
                        </div>
                      </td>
                      <td data-label="رصيد الحملات"><strong>{formatNumber(client.campaignBalance)}</strong></td>
                      <td>
                        <div className="ds-cell-actions">
                          <LinkButton href={`/linkly-admin007/clients/${encodeURIComponent(client.tenantId)}`} variant="outline">فتح الملف</LinkButton>
                          <ActionMenu
                            label={`المزيد من الإجراءات لـ ${client.companyName}`}
                            items={[
                              { key: "charge", label: "شحن / تجديد الاشتراك", icon: "wallet", onSelect: () => openEditor("charge", client) },
                              { key: "plan", label: "تغيير الباقة يدويًا", icon: "layers", onSelect: () => openEditor("plan", client) },
                              { key: "limit", label: "تعديل حد المستخدمين", icon: "users", onSelect: () => openEditor("limit", client) },
                              { key: "balance", label: "إضافة رصيد رسائل حملات", icon: "message", onSelect: () => openEditor("balance", client) },
                              { key: "logs", label: "سجل الحركة", icon: "scroll", href: `/linkly-admin007/logs?client=${client.tenantId}` },
                              {
                                key: "toggle",
                                label: togglingId === client.tenantId ? "جارٍ التحديث…" : client.status === "متوقف" ? "تفعيل الحساب" : "تعطيل الحساب",
                                icon: client.status === "متوقف" ? "checkCircle" : "shield",
                                tone: client.status === "متوقف" ? undefined : "danger",
                                disabled: togglingId === client.tenantId,
                                onSelect: () => toggleStatus(client)
                              }
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ds-table-foot">يُعرض {formatNumber(visible.length)} من {formatNumber(subscriptions.length)} عميل.</div>
          </div>
        )}
      </Section>

      {/* ---- Add client ---- */}
      <Dialog
        open={modal?.kind === "add"}
        onClose={closeModal}
        size="lg"
        title={step === "done" ? "تم إنشاء العميل" : step === "review" ? "راجع قبل الإنشاء" : "إضافة عميل جديد"}
        description={step === "form" ? "ينشئ حساب دخول حقيقيًا فورًا ويرسل رابط تفعيل إلى بريد صاحب الحساب." : undefined}
        footer={
          step === "done" ? (
            <Button variant="primary" onClick={closeModal}>تم</Button>
          ) : step === "review" ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => { setStep("form"); setError(""); }}>تعديل البيانات</Button>
              <Button variant="primary" loading={busy} onClick={confirmCreate}>تأكيد وإنشاء الحساب</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={closeModal}>إلغاء</Button>
              <Button variant="primary" type="submit" form="client-add-form">مراجعة البيانات</Button>
            </>
          )
        }
      >
        {step === "done" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>{inviteNotice}</p>
            {activationUrl ? (
              <div style={{ display: "grid", gap: 8 }}>
                <input className="ds-input" readOnly dir="ltr" value={activationUrl} aria-label="رابط التفعيل" onFocus={(event) => event.currentTarget.select()} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="outline" icon="external" onClick={() => window.open(activationUrl, "_blank", "noreferrer")}>فتح رابط التفعيل</Button>
                  <Button variant="outline" onClick={() => copyLink(activationUrl)}>نسخ الرابط</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : step === "review" && review ? (
          <div style={{ display: "grid", gap: 12 }}>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", margin: 0, fontSize: 14 }}>
              <dt style={{ color: "var(--ds-text-muted)" }}>العميل</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.company}</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>صاحب الحساب</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.owner}</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>البريد</dt><dd dir="ltr" style={{ margin: 0, fontWeight: 700, textAlign: "start" }}>{review.ownerEmail}</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>الباقة</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.plan}</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>الحالة</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.status}</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>السعر</dt><dd style={{ margin: 0, fontWeight: 700 }}>{formatNumber(review.amount)} ر.س</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>الفوترة</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.billingCycle}</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>التجديد</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.renewal || "بعد 3 أيام افتراضيًا"}</dd>
            </dl>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </div>
        ) : (
          <form id="client-add-form" onSubmit={submitDraft} style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label className="ds-field">اسم الشركة / العميل<input data-autofocus className="ds-input" required placeholder="مثال: متجر الرياض" value={draft.company} onChange={(event) => setField("company", event.target.value)} /></label>
            <label className="ds-field">اسم صاحب الحساب<input className="ds-input" required value={draft.owner} onChange={(event) => setField("owner", event.target.value)} /></label>
            <label className="ds-field">البريد الإلكتروني لصاحب الحساب<input className="ds-input" type="email" dir="ltr" required placeholder="owner@example.com" value={draft.ownerEmail} onChange={(event) => setField("ownerEmail", event.target.value)} /></label>
            <label className="ds-field">
              الباقة
              <select className="ds-select" value={draft.plan} onChange={(event) => { setField("plan", event.target.value); setField("amount", String(plans.find((plan) => plan.name === event.target.value)?.monthlyPrice ?? 0)); }}>
                {activePlans.map((plan) => <option key={plan.id} value={plan.name}>{planOptionLabel(plan)}</option>)}
              </select>
            </label>
            <label className="ds-field">
              حالة الاشتراك
              <select className="ds-select" value={draft.status} onChange={(event) => setField("status", event.target.value)}>
                <option value="تجربة">تجربة</option>
                <option value="نشط">نشط</option>
                <option value="متوقف">متوقف</option>
              </select>
            </label>
            <label className="ds-field">تاريخ التجديد<input className="ds-input" type="date" value={draft.renewal} onChange={(event) => setField("renewal", event.target.value)} /></label>
            <label className="ds-field">
              قيمة الباقة الشهرية (ر.س)
              <input className="ds-input" type="number" min="0" step="0.01" required value={draft.amount} onChange={(event) => setField("amount", event.target.value)} />
              <small>تُعبّأ من سعر الباقة، ويمكن تعديلها لهذا العميل.</small>
            </label>
            <label className="ds-field">
              دورة الفوترة
              <select className="ds-select" value={draft.billingCycle} onChange={(event) => setField("billingCycle", event.target.value)}>
                {BILLING_CYCLES.map((cycle) => <option key={cycle.value} value={cycle.value}>{cycle.label}</option>)}
              </select>
            </label>
            {error ? <p className="ds-field-error" role="alert" style={{ gridColumn: "1 / -1" }}><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        )}
      </Dialog>

      {/* ---- Edit user limit ---- */}
      <Dialog
        open={modal?.kind === "limit"}
        onClose={closeModal}
        title="تعديل حد المستخدمين"
        description="أي مستخدم فوق حد الباقة يُضاف تلقائيًا إلى الفاتورة الشهرية بقيمة 65 ريالًا للمستخدم."
        footer={<><Button variant="outline" onClick={closeModal}>إلغاء</Button><Button variant="primary" type="submit" form="client-limit-form" loading={busy}>حفظ الحد</Button></>}
      >
        {modal?.kind === "limit" ? (
          <form id="client-limit-form" onSubmit={submitLimit} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">العميل<input className="ds-input" readOnly value={modal.client.companyName} /></label>
            <label className="ds-field">عدد الموظفين الحالي فعليًا<input className="ds-input" readOnly value={`${formatNumber(modal.client.employeeCount)} موظف`} /></label>
            <label className="ds-field">الحد المطلوب<input data-autofocus className="ds-input" type="number" min="1" step="1" value={limitValue} onChange={(event) => setLimitValue(event.target.value)} /></label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>

      {/* ---- Change plan ---- */}
      <Dialog
        open={modal?.kind === "plan"}
        onClose={closeModal}
        title="تغيير الباقة يدويًا"
        description="يغيّر باقة العميل مباشرة دون إرسال رابط دفع. حد المستخدمين والسعر يتحدثان تلقائيًا حسب الباقة المختارة."
        footer={<><Button variant="outline" onClick={closeModal}>إلغاء</Button><Button variant="primary" type="submit" form="client-plan-form" loading={busy}>حفظ الباقة</Button></>}
      >
        {modal?.kind === "plan" ? (
          <form id="client-plan-form" onSubmit={submitPlan} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">العميل<input className="ds-input" readOnly value={modal.client.companyName} /></label>
            <label className="ds-field">الباقة الحالية<input className="ds-input" readOnly value={modal.client.plan} /></label>
            <label className="ds-field">
              الباقة الجديدة
              <select data-autofocus className="ds-select" value={planValue} onChange={(event) => setPlanValue(event.target.value)}>
                {activePlans.length ? activePlans.map((plan) => <option key={plan.id} value={plan.name}>{`${plan.name} (${formatNumber(plan.monthlyPrice)} ر.س - ${formatNumber(plan.employeeLimit)} مستخدم)`}</option>) : <option value={modal.client.plan}>{modal.client.plan}</option>}
              </select>
            </label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>

      {/* ---- Campaign balance ---- */}
      <Dialog
        open={modal?.kind === "balance"}
        onClose={closeModal}
        title="إضافة رصيد رسائل حملات"
        description="يُضاف الرصيد فورًا إلى حساب العميل ويظهر في صفحة الحملات لديه ضمن سجل الرصيد والشحن."
        footer={<><Button variant="outline" onClick={closeModal}>إلغاء</Button><Button variant="primary" type="submit" form="client-balance-form" loading={busy}>إضافة الرصيد</Button></>}
      >
        {modal?.kind === "balance" ? (
          <form id="client-balance-form" onSubmit={submitBalance} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">العميل<input className="ds-input" readOnly value={modal.client.companyName} /></label>
            <label className="ds-field">الرصيد الحالي<input className="ds-input" readOnly value={`${formatNumber(modal.client.campaignBalance)} رسالة`} /></label>
            <label className="ds-field">عدد الرسائل المضافة<input data-autofocus className="ds-input" type="number" min="1" step="1" placeholder="مثال: 1000" value={balanceMessages} onChange={(event) => setBalanceMessages(event.target.value)} /></label>
            <label className="ds-field">المبلغ المقابل (اختياري، ر.س)<input className="ds-input" type="number" min="0" placeholder="0" value={balanceAmount} onChange={(event) => setBalanceAmount(event.target.value)} /></label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>

      {/* ---- Charge / renew ---- */}
      <Dialog
        open={modal?.kind === "charge"}
        onClose={closeModal}
        title="شحن / تجديد الاشتراك"
        description="ينشئ رابط دفع حقيقيًا لإرساله للعميل. عند الدفع يتفعّل الاشتراك تلقائيًا."
        footer={chargeUrl ? <Button variant="primary" onClick={closeModal}>تم</Button> : <><Button variant="outline" onClick={closeModal}>إلغاء</Button><Button variant="primary" type="submit" form="client-charge-form" loading={busy}>إنشاء رابط الدفع</Button></>}
      >
        {modal?.kind === "charge" ? (
          chargeUrl ? (
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>تم إنشاء رابط الدفع. أرسله للعميل ليكمل الدفع:</p>
              <input className="ds-input" readOnly dir="ltr" value={chargeUrl} aria-label="رابط الدفع" onFocus={(event) => event.currentTarget.select()} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="outline" icon="external" onClick={() => window.open(chargeUrl, "_blank", "noreferrer")}>فتح رابط الدفع</Button>
                <Button variant="outline" onClick={() => copyLink(chargeUrl)}>نسخ الرابط</Button>
              </div>
            </div>
          ) : (
            <form id="client-charge-form" onSubmit={submitCharge} style={{ display: "grid", gap: 14 }}>
              <label className="ds-field">العميل<input className="ds-input" readOnly value={modal.client.companyName} /></label>
              <label className="ds-field">
                بوابة الدفع
                <select className="ds-select" value={chargeGateway} onChange={(event) => setChargeGateway(event.target.value as "moyasar" | "stripe")}>
                  <option value="moyasar">Moyasar</option>
                  <option value="stripe">Stripe (وضع اختبار)</option>
                </select>
              </label>
              <label className="ds-field">قيمة الفاتورة (ر.س)<input data-autofocus className="ds-input" type="number" min="1" value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} /></label>
              {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
            </form>
          )
        ) : null}
      </Dialog>
    </>
  );
}
