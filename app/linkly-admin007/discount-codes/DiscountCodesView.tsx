"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DiscountCodeRow, PlanRow } from "../types";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, LinkButton, Section, Segmented, StatCard } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";
import { useQueryFlag } from "../ds/useQueryFlag";
import {
  EMPTY_CODE_DRAFT,
  SORT_OPTIONS,
  STATUS_FILTERS,
  STATUS_LABEL,
  STATUS_TONE,
  codePayload,
  codeStats,
  computeStatus,
  discountLabel,
  draftFromCode,
  filterCodes,
  planNames,
  sortCodes,
  validateCodeDraft,
  type CodeDraft,
  type CodeSort,
  type CodeStatusFilter
} from "./codes-data";

type Props = { discountCodes: DiscountCodeRow[]; plans: PlanRow[] };

export default function DiscountCodesView({ discountCodes, plans }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CodeStatusFilter>("الكل");
  const [sort, setSort] = useState<CodeSort>("created");
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; code: DiscountCodeRow } | null>(null);
  const [draft, setDraft] = useState<CodeDraft>(EMPTY_CODE_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stats = useMemo(() => codeStats(discountCodes, now), [discountCodes, now]);
  const visible = useMemo(() => sortCodes(filterCodes(discountCodes, status, query, now), sort), [discountCodes, status, query, sort, now]);
  const isEdit = dialog?.mode === "edit";

  function openCreate() {
    setDraft(EMPTY_CODE_DRAFT);
    setError("");
    setDialog({ mode: "create" });
  }
  useQueryFlag("new", openCreate);

  function openEdit(code: DiscountCodeRow) {
    setDraft(draftFromCode(code));
    setError("");
    setDialog({ mode: "edit", code });
  }

  function closeDialog() {
    if (saving) return;
    setDialog(null);
  }

  function setField<K extends keyof CodeDraft>(key: K, value: CodeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function togglePlan(id: string) {
    setDraft((current) => ({ ...current, selectedPlanIds: current.selectedPlanIds.includes(id) ? current.selectedPlanIds.filter((planId) => planId !== id) : [...current.selectedPlanIds, id] }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    const problem = validateCodeDraft(draft);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(dialog.mode === "edit" ? `/api/admin/discount-codes/${dialog.code.id}` : "/api/admin/discount-codes", {
        method: dialog.mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codePayload(draft))
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) return setError(result.error || "تعذر حفظ كود الخصم");
      setDialog(null);
      toast("success", dialog.mode === "edit" ? "تم تحديث كود الخصم" : "تم إنشاء كود الخصم");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(code: DiscountCodeRow) {
    const disabling = code.active === 1;
    try {
      const response = await fetch(`/api/admin/discount-codes/${code.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !disabling }) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) return toast("error", "تعذر تحديث الكود", result.error);
      toast("success", disabling ? "تم تعطيل الكود" : "تم تفعيل الكود");
      router.refresh();
    } catch {
      toast("error", "تعذر الاتصال بالخادم");
    }
  }

  async function remove(code: DiscountCodeRow) {
    const ok = await confirm({
      title: `حذف الكود ${code.code}؟`,
      description: code.usedCount > 0 ? "هذا الكود استُخدم من قبل ولا يمكن حذفه. عطّله بدلًا من ذلك." : "سيُحذف الكود نهائيًا ولا يمكن التراجع.",
      confirmLabel: "حذف الكود",
      tone: "danger"
    });
    if (!ok) return;
    try {
      const response = await fetch(`/api/admin/discount-codes/${code.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) return toast("error", "تعذر حذف كود الخصم", result.error);
      toast("success", "تم حذف الكود");
      router.refresh();
    } catch {
      toast("error", "تعذر الاتصال بالخادم");
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast("success", "تم نسخ الكود", code);
    } catch {
      toast("error", "تعذر النسخ");
    }
  }

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي الأكواد" value={formatNumber(stats.total)} hint={`${formatNumber(stats.active)} نشطة حاليًا`} icon="ticket" />
        <StatCard label="إجمالي الاستخدامات" value={formatNumber(stats.redemptions)} hint="عبر كل الأكواد" icon="checkCircle" tone="success" />
      </div>

      <Section
        title="أكواد الخصم"
        description="أكواد تُدخل في صفحة الدفع، ويمكن حصرها بباقات أو بالمستخدمين الجدد وأول اشتراك."
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>إنشاء كود خصم</Button>}
      >
        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث بالكود أو الاسم…" aria-label="بحث في أكواد الخصم" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Segmented label="تصفية حسب الحالة" value={status} onChange={setStatus} options={STATUS_FILTERS.map((value) => ({ value, label: `${value} (${formatNumber(stats.counts[value])})` }))} />
          <div className="ds-toolbar-end">
            <select className="ds-select" aria-label="ترتيب الأكواد" value={sort} onChange={(event) => setSort(event.target.value as CodeSort)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>ترتيب: {option.label}</option>)}
            </select>
          </div>
        </div>

        {discountCodes.length === 0 ? (
          <EmptyState icon="ticket" title="لا توجد أكواد خصم بعد" description="أنشئ كودًا ليستخدمه عملاؤك في صفحة الدفع." action={<Button variant="primary" icon="plus" onClick={openCreate}>إنشاء كود خصم</Button>} />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="لا توجد أكواد مطابقة" description="جرّب تغيير البحث أو التصفية." action={<Button variant="outline" onClick={() => { setQuery(""); setStatus("الكل"); }}>إزالة التصفية</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">الكود</th>
                  <th scope="col">الخصم</th>
                  <th scope="col">الباقات</th>
                  <th scope="col">الاستخدام</th>
                  <th scope="col">الانتهاء</th>
                  <th scope="col">الحالة</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((code) => {
                  const codeStatus = computeStatus(code, now);
                  const label = discountLabel(code, formatNumber);
                  const used = code.usageLimit === -1 ? null : Math.min(100, Math.round((code.usedCount / Math.max(code.usageLimit, 1)) * 100));
                  return (
                    <tr key={code.id}>
                      <td data-cell="main">
                        <div className="ds-cell-stack">
                          <strong dir="ltr" style={{ textAlign: "start", letterSpacing: "0.04em" }}>{code.code}</strong>
                          <small>{code.name}</small>
                          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {code.newUsersOnly === 1 ? <Badge tone="info" dot={false}>جدد فقط</Badge> : null}
                            {code.firstSubscriptionOnly === 1 ? <Badge tone="neutral" dot={false}>أول اشتراك</Badge> : null}
                          </span>
                        </div>
                      </td>
                      <td data-label="الخصم">
                        <div className="ds-cell-stack"><strong>{label.main}</strong>{label.note ? <small>{label.note}</small> : null}</div>
                      </td>
                      <td data-label="الباقات"><small style={{ color: "var(--ds-text-muted)" }}>{planNames(code.applicablePlanIds, plans)}</small></td>
                      <td data-label="الاستخدام">
                        <div className="ds-cell-stack">
                          <strong>{formatNumber(code.usedCount)} / {code.usageLimit === -1 ? "بلا حد" : formatNumber(code.usageLimit)}</strong>
                          {used !== null ? <span className="ds-meter" aria-hidden="true"><i style={{ width: `${used}%` }} /></span> : null}
                        </div>
                      </td>
                      <td data-label="الانتهاء">{code.expiresAt ? code.expiresAt.slice(0, 10) : "بلا انتهاء"}</td>
                      <td data-label="الحالة"><Badge tone={STATUS_TONE[codeStatus]}>{STATUS_LABEL[codeStatus]}</Badge></td>
                      <td>
                        <div className="ds-cell-actions">
                          <LinkButton href={`/linkly-admin007/discount-codes/${code.id}`} variant="outline">الاستخدامات</LinkButton>
                          <ActionMenu
                            label={`المزيد من الإجراءات للكود ${code.code}`}
                            items={[
                              { key: "edit", label: "تعديل", icon: "edit", onSelect: () => openEdit(code) },
                              { key: "copy", label: "نسخ الكود", icon: "ticket", onSelect: () => void copyCode(code.code) },
                              { key: "toggle", label: code.active === 1 ? "تعطيل" : "تفعيل", icon: code.active === 1 ? "shield" : "checkCircle", onSelect: () => void toggleActive(code) },
                              { key: "delete", label: "حذف", icon: "trash", tone: "danger", onSelect: () => void remove(code) }
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ds-table-foot">يُعرض {formatNumber(visible.length)} من {formatNumber(discountCodes.length)} كود.</div>
          </div>
        )}
      </Section>

      <Dialog
        open={Boolean(dialog)}
        onClose={closeDialog}
        size="lg"
        title={isEdit ? "تعديل كود الخصم" : "إنشاء كود خصم جديد"}
        footer={<><Button variant="outline" onClick={closeDialog}>إلغاء</Button><Button variant="primary" type="submit" form="code-form" loading={saving}>{isEdit ? "حفظ" : "إنشاء الكود"}</Button></>}
      >
        {dialog ? (
          <form id="code-form" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label className="ds-field">اسم الكود<input data-autofocus className="ds-input" required placeholder="مثال: ترحيب بالمستخدمين الجدد" value={draft.name} onChange={(event) => setField("name", event.target.value)} /></label>
              <label className="ds-field">كود الخصم<input className="ds-input" dir="ltr" required disabled={isEdit} placeholder="WELCOME20" value={draft.code} onChange={(event) => setField("code", event.target.value.toUpperCase())} /></label>
              <label className="ds-field">
                نوع الخصم
                <select className="ds-select" value={draft.discountType} onChange={(event) => setField("discountType", event.target.value === "fixed" ? "fixed" : "percentage")}>
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
              </label>
              <label className="ds-field">{draft.discountType === "percentage" ? "قيمة الخصم (٪)" : "قيمة الخصم (ر.س)"}<input className="ds-input" type="number" min="0" max={draft.discountType === "percentage" ? 100 : undefined} required value={draft.discountValue} onChange={(event) => setField("discountValue", event.target.value)} /></label>
              {draft.discountType === "percentage" ? (
                <label className="ds-field">الحد الأقصى للخصم (ر.س، اختياري)<input className="ds-input" type="number" min="0" value={draft.maxDiscountAmount} onChange={(event) => setField("maxDiscountAmount", event.target.value)} /></label>
              ) : null}
              <label className="ds-field">الحد الأدنى لقيمة الاشتراك (ر.س، اختياري)<input className="ds-input" type="number" min="0" value={draft.minimumAmount} onChange={(event) => setField("minimumAmount", event.target.value)} /></label>
              <label className="ds-field">الحد الأقصى للاستخدام<input className="ds-input" type="number" min="0" placeholder="بلا حد" value={draft.usageLimit} onChange={(event) => setField("usageLimit", event.target.value)} /><small>اتركه فارغًا لعدم التحديد</small></label>
              <label className="ds-field">حد الاستخدام لكل عميل<input className="ds-input" type="number" min="1" value={draft.usageLimitPerUser} onChange={(event) => setField("usageLimitPerUser", event.target.value)} /></label>
              <label className="ds-field">تاريخ البداية (اختياري)<input className="ds-input" type="date" value={draft.startsAt} onChange={(event) => setField("startsAt", event.target.value)} /></label>
              <label className="ds-field">تاريخ الانتهاء (اختياري)<input className="ds-input" type="date" min={draft.startsAt || undefined} value={draft.expiresAt} onChange={(event) => setField("expiresAt", event.target.value)} /></label>
            </div>

            <fieldset className="ds-fieldset">
              <legend>الباقات المشمولة</legend>
              <label className="ds-check" data-on={draft.applyToAllPlans || undefined} style={{ marginTop: 8 }}>
                <input type="checkbox" checked={draft.applyToAllPlans} onChange={(event) => setField("applyToAllPlans", event.target.checked)} />
                <span>ينطبق على كل الباقات</span>
              </label>
              {!draft.applyToAllPlans ? (
                <div className="ds-check-grid" style={{ marginTop: 8 }}>
                  {plans.map((plan) => (
                    <label key={plan.id} className="ds-check" data-on={draft.selectedPlanIds.includes(plan.id) || undefined}>
                      <input type="checkbox" checked={draft.selectedPlanIds.includes(plan.id)} onChange={() => togglePlan(plan.id)} />
                      <span>{plan.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </fieldset>

            <fieldset className="ds-fieldset">
              <legend>شروط الاستحقاق</legend>
              <div className="ds-check-grid" style={{ marginTop: 8 }}>
                <label className="ds-check" data-on={draft.newUsersOnly || undefined}>
                  <input type="checkbox" checked={draft.newUsersOnly} onChange={(event) => setDraft((current) => ({ ...current, newUsersOnly: event.target.checked, firstSubscriptionOnly: event.target.checked ? true : current.firstSubscriptionOnly }))} />
                  <span>للمستخدمين الجدد فقط</span>
                </label>
                <label className="ds-check" data-on={draft.firstSubscriptionOnly || undefined}>
                  <input type="checkbox" checked={draft.firstSubscriptionOnly} onChange={(event) => setField("firstSubscriptionOnly", event.target.checked)} />
                  <span>لأول اشتراك مدفوع فقط</span>
                </label>
              </div>
            </fieldset>

            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
