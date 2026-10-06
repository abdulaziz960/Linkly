"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PlanRow, SubscriptionRow } from "../types";
import { formatNumber, getRenewalAlert } from "../utils";
import { Badge, Button, EmptyState, LinkButton, Section, Segmented, StatCard, type Tone } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import ChargeDialog from "./ChargeDialog";
import Icon from "../ds/Icon";
import { useQueryFlag } from "../ds/useQueryFlag";
import { useAdminPermissions } from "../ds/permissions-context";
import Pagination from "../ds/Pagination";
import { useSavedViews } from "../ds/useSavedViews";
import { RENEWAL_FILTER_OPTIONS, USAGE_FILTER_OPTIONS } from "./clients-filter-options";
import { NO_ADVANCED_FILTERS, clientsToCsv, countAdvancedFilters, deriveClient, matchesAdvanced, paginate, type AdvancedFilters, type RenewalFilter, type UsageFilter } from "./clients-filters";
import { SORT_OPTIONS, STATUS_FILTERS, clientCounts, filterClients, formatRenewalDate, invoiceBreakdown, sortClients, type ClientSort, type ClientStatusFilter } from "./clients-data";

type Props = { subscriptions: SubscriptionRow[]; plans: PlanRow[]; generatedAt: number; hiddenCount: number; showingHidden: boolean };

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

export default function ClientsView({ subscriptions, plans, generatedAt, hiddenCount, showingHidden }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const { can } = useAdminPermissions();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientStatusFilter>("الكل");
  const [sort, setSort] = useState<ClientSort>("recent");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(NO_ADVANCED_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { views, save: saveView, remove: removeView } = useSavedViews<{ query: string; status: ClientStatusFilter; followUpOnly: boolean; advanced: AdvancedFilters }>("linkly_admin_clients_views");

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

  const counts = useMemo(() => clientCounts(subscriptions), [subscriptions]);
  const derived = useMemo(() => new Map(subscriptions.map((client) => [client.tenantId, deriveClient(client, generatedAt)])), [subscriptions, generatedAt]);
  const advancedCount = countAdvancedFilters(advanced);
  const visible = useMemo(
    () => sortClients(filterClients(subscriptions, { query, status, followUpOnly }), sort).filter((client) => matchesAdvanced(client, derived.get(client.tenantId)!, advanced)),
    [subscriptions, query, status, followUpOnly, sort, advanced, derived]
  );
  const hasFilters = Boolean(query.trim()) || status !== "الكل" || followUpOnly || advancedCount > 0;
  const paged = useMemo(() => paginate(visible, page, pageSize), [visible, page, pageSize]);
  const planNames = useMemo(() => Array.from(new Set([...plans.map((plan) => plan.name), ...subscriptions.map((client) => client.plan)])).filter(Boolean), [plans, subscriptions]);
  const selectedClients = useMemo(() => subscriptions.filter((client) => selected.has(client.tenantId)), [subscriptions, selected]);

  // Back to page 1 whenever the result set changes; selection never outlives its rows.
  useEffect(() => setPage(1), [query, status, followUpOnly, sort, advanced, pageSize]);
  useEffect(() => setSelected((current) => new Set([...current].filter((key) => subscriptions.some((client) => client.tenantId === key)))), [subscriptions]);

  function clearFilters() {
    setQuery("");
    setStatus("الكل");
    setFollowUpOnly(false);
    setAdvanced(NO_ADVANCED_FILTERS);
  }

  function exportCsv(rows: SubscriptionRow[], label: string) {
    const blob = new Blob([clientsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `linkly-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("success", "تم تصدير الملف", `${formatNumber(rows.length)} عميل (${label})`);
  }

  async function bulkSetStatus(targets: SubscriptionRow[], next: "نشط" | "متوقف") {
    if (!targets.length) return;
    const disabling = next === "متوقف";
    const names = targets.slice(0, 5).map((client) => client.companyName).join("، ") + (targets.length > 5 ? ` و${formatNumber(targets.length - 5)} آخرين` : "");
    const ok = await confirm({
      title: disabling ? `تعطيل ${formatNumber(targets.length)} حساب؟` : `تفعيل ${formatNumber(targets.length)} حساب؟`,
      description: disabling ? `سيفقد العملاء الوصول إلى لوحاتهم فورًا (${names}). لا يُحذف أي شيء ويمكن إعادة التفعيل في أي وقت.` : `سيعود الوصول إلى العملاء فورًا (${names}).`,
      confirmLabel: disabling ? "تعطيل الحسابات" : "تفعيل الحسابات",
      tone: disabling ? "danger" : "default",
      requireText: disabling && targets.length > 1 ? "تعطيل" : undefined
    });
    if (!ok) return;
    setBulkBusy(true);
    let failed = 0;
    let lastError = "";
    for (const client of targets) {
      const result = await call(`/api/admin/clients/${client.tenantId}`, "PATCH", { status: next });
      if (!result.ok) { failed += 1; lastError = result.error || ""; }
    }
    setBulkBusy(false);
    if (failed === 0) toast("success", disabling ? "تم تعطيل الحسابات" : "تم تفعيل الحسابات", `${formatNumber(targets.length)} حساب`);
    else toast("error", `تعذر تحديث ${formatNumber(failed)} من ${formatNumber(targets.length)}`, lastError);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkSetHidden(targets: SubscriptionRow[], hidden: boolean) {
    if (!targets.length) return;
    const names = targets.slice(0, 5).map((client) => client.companyName).join("، ") + (targets.length > 5 ? ` و${formatNumber(targets.length - 5)} آخرين` : "");
    const ok = await confirm({
      title: hidden ? `إخفاء ${formatNumber(targets.length)} حساب من القوائم؟` : `إظهار ${formatNumber(targets.length)} حساب في القوائم؟`,
      description: hidden
        ? `(${names}) لن تظهر في قائمة العملاء ولا الأرقام ولا الإشعارات. لا يُحذف أي شيء ولا يتغير وصولهم أو اشتراكهم، ويمكنك إظهارهم من زر «المخفية».`
        : `(${names}) سيعودون إلى قائمة العملاء والأرقام والإشعارات.`,
      confirmLabel: hidden ? "إخفاء" : "إظهار"
    });
    if (!ok) return;
    setBulkBusy(true);
    const result = await call("/api/admin/clients/hidden", "POST", { tenantIds: targets.map((client) => client.tenantId), hidden });
    setBulkBusy(false);
    if (result.ok) toast("success", hidden ? "تم الإخفاء" : "تم الإظهار", `${formatNumber(targets.length)} حساب`);
    else toast("error", "تعذر التنفيذ", result.error);
    setSelected(new Set());
    router.refresh();
  }

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
    setLimitValue(String(client.employeeLimit));
    setPlanValue(client.plan);
    setBalanceMessages("");
    setBalanceAmount("");
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
        actions={<>
          {showingHidden || hiddenCount > 0 ? (
            <Button variant="outline" onClick={() => router.push(showingHidden ? "/linkly-admin007/clients" : "/linkly-admin007/clients?hidden=1")}>
              {showingHidden ? "العودة للقائمة" : `المخفية (${formatNumber(hiddenCount)})`}
            </Button>
          ) : null}
          <Button variant="primary" icon="plus" onClick={openAdd}>إضافة عميل</Button>
        </>}
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
            <Button variant={showAdvanced ? "primary" : "outline"} icon="filter" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
              فلاتر متقدمة{advancedCount ? ` (${formatNumber(advancedCount)})` : ""}
            </Button>
            <Button variant="outline" icon="download" disabled={!visible.length} onClick={() => exportCsv(visible, "النتائج الحالية")}>تصدير CSV</Button>
            <Button variant={followUpOnly ? "primary" : "outline"} icon="alert" aria-pressed={followUpOnly} onClick={() => setFollowUpOnly((value) => !value)}>
              يحتاج متابعة
            </Button>
            <select className="ds-select" aria-label="ترتيب العملاء" value={sort} onChange={(event) => setSort(event.target.value as ClientSort)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>ترتيب: {option.label}</option>)}
            </select>
          </div>
        </div>

        {showAdvanced ? (
          <div className="ds-filter-panel" role="group" aria-label="فلاتر العملاء المتقدمة">
            <div className="ds-field" style={{ gridColumn: "span 2" }}>
              <span>الباقة</span>
              <div className="ds-chip-row">
                {planNames.map((plan) => (
                  <button key={plan} type="button" className="ds-chip" aria-pressed={advanced.plans.includes(plan)} onClick={() => setAdvanced((current) => ({ ...current, plans: current.plans.includes(plan) ? current.plans.filter((item) => item !== plan) : [...current.plans, plan] }))}>{plan}</button>
                ))}
              </div>
            </div>
            <label className="ds-field"><span>موعد التجديد</span>
              <select className="ds-select" value={advanced.renewal} onChange={(event) => setAdvanced((current) => ({ ...current, renewal: event.target.value as RenewalFilter }))}>
                {RENEWAL_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="ds-field"><span>الاستخدام</span>
              <select className="ds-select" value={advanced.usage} onChange={(event) => setAdvanced((current) => ({ ...current, usage: event.target.value as UsageFilter }))}>
                {USAGE_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="ds-field"><span>انضم من</span><input className="ds-input" type="date" value={advanced.joinedFrom} max={advanced.joinedTo || undefined} onChange={(event) => setAdvanced((current) => ({ ...current, joinedFrom: event.target.value }))} /></label>
            <label className="ds-field"><span>انضم حتى</span><input className="ds-input" type="date" value={advanced.joinedTo} min={advanced.joinedFrom || undefined} onChange={(event) => setAdvanced((current) => ({ ...current, joinedTo: event.target.value }))} /></label>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <Button variant="ghost" disabled={!hasFilters} onClick={clearFilters}>مسح كل الفلاتر</Button>
              <Button variant="outline" disabled={!hasFilters} onClick={() => {
                const name = window.prompt("اسم العرض المحفوظ:");
                if (name?.trim()) { saveView(name.trim(), { query, status, followUpOnly, advanced }); toast("success", "تم حفظ العرض", name.trim()); }
              }}>حفظ كعرض</Button>
            </div>
            {views.length ? (
              <div className="ds-field" style={{ gridColumn: "1 / -1" }}>
                <span>العروض المحفوظة (على هذا المتصفح)</span>
                <div className="ds-chip-row">
                  {views.map((view) => (
                    <span key={view.id} className="ds-chip" style={{ paddingInlineEnd: 4 }}>
                      <button type="button" style={{ all: "unset", cursor: "pointer" }} onClick={() => { setQuery(view.filters.query); setStatus(view.filters.status); setFollowUpOnly(view.filters.followUpOnly); setAdvanced(view.filters.advanced); }}>{view.name}</button>
                      <button type="button" className="ds-icon-btn" style={{ width: 24, height: 24 }} aria-label={`حذف العرض ${view.name}`} onClick={() => removeView(view.id)}><Icon name="x" size={13} /></button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {selected.size > 0 ? (
          <div className="ds-bulkbar" role="region" aria-label="إجراءات جماعية">
            <span>{formatNumber(selected.size)} محدد</span>
            <div className="ds-bulkbar-spacer" />
            <Button variant="outline" icon="download" onClick={() => exportCsv(selectedClients, "المحدد")}>تصدير المحدد</Button>
            <Button variant="outline" loading={bulkBusy} disabled={!selectedClients.some((client) => client.status === "متوقف")} onClick={() => bulkSetStatus(selectedClients.filter((client) => client.status === "متوقف"), "نشط")}>تفعيل</Button>
            <Button variant="danger" loading={bulkBusy} disabled={!selectedClients.some((client) => client.status !== "متوقف")} onClick={() => bulkSetStatus(selectedClients.filter((client) => client.status !== "متوقف"), "متوقف")}>تعطيل</Button>
            {can("clients") ? <Button variant="outline" loading={bulkBusy} onClick={() => bulkSetHidden(selectedClients, !showingHidden)}>{showingHidden ? "إظهار في القوائم" : "إخفاء من القوائم"}</Button> : null}
            <Button variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
          </div>
        ) : null}

        {!subscriptions.length ? (
          <EmptyState icon="users" title="لا يوجد عملاء بعد" description="أنشئ أول حساب عميل وسيصله رابط التفعيل على بريده." action={<Button variant="primary" icon="plus" onClick={openAdd}>إضافة عميل</Button>} />
        ) : !visible.length ? (
          <EmptyState
            icon="search"
            title="لا توجد نتائج مطابقة"
            description="جرّب تغيير كلمات البحث أو إزالة التصفية."
            action={hasFilters ? <Button variant="outline" onClick={clearFilters}>إزالة التصفية</Button> : undefined}
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col" className="ds-table-check">
                    <input
                      type="checkbox"
                      aria-label="تحديد كل العملاء في هذه الصفحة"
                      checked={paged.rows.length > 0 && paged.rows.every((client) => selected.has(client.tenantId))}
                      ref={(element) => { if (element) element.indeterminate = paged.rows.some((client) => selected.has(client.tenantId)) && !paged.rows.every((client) => selected.has(client.tenantId)); }}
                      onChange={(event) => setSelected((current) => { const next = new Set(current); for (const client of paged.rows) { if (event.target.checked) next.add(client.tenantId); else next.delete(client.tenantId); } return next; })}
                    />
                  </th>
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
                {paged.rows.map((client) => {
                  const invoice = invoiceBreakdown(client);
                  const alert = getRenewalAlert(client);
                  return (
                    <tr key={client.tenantId} data-selected={selected.has(client.tenantId) || undefined}>
                      <td className="ds-table-check">
                        <input type="checkbox" aria-label={`تحديد ${client.companyName}`} checked={selected.has(client.tenantId)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(client.tenantId)) next.delete(client.tenantId); else next.add(client.tenantId); return next; })} />
                      </td>
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
                          <strong>{formatRenewalDate(client.renewalAt)}</strong>
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
                              ...(can("billing") ? [{ key: "charge", label: "شحن / تجديد الاشتراك", icon: "wallet" as const, onSelect: () => openEditor("charge", client) }] : []),
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
        {visible.length ? <Pagination page={paged.page} pageCount={paged.pageCount} total={visible.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /> : null}
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

      <ChargeDialog client={modal?.kind === "charge" ? modal.client : null} onClose={() => setModal(null)} />
    </>
  );
}
