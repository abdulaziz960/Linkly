"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PlanRow } from "../types";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section, StatCard, Switch } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import { useQueryFlag } from "../ds/useQueryFlag";
import { CHANNEL_CATALOG, parseAllowedChannels, type AllowedChannels } from "../../../lib/channel-catalog";
import { UNLIMITED_MESSAGE_QUOTA } from "../../../lib/message-quota";
import { EMPTY_PLAN_DRAFT, draftFromPlan, planPayload, planStats, validatePlanDraft, type PlanDraft } from "./plans-data";

type Props = { plans: PlanRow[]; subscriberCounts: Record<string, number> };

function ChannelPicker({ value, onChange }: { value: AllowedChannels; onChange: (value: AllowedChannels) => void }) {
  const unrestricted = value === "*";
  return (
    <fieldset className="ds-fieldset">
      <legend>القنوات المتاحة</legend>
      <label className="ds-check" data-on={unrestricted || undefined} style={{ marginTop: 8 }}>
        <input type="checkbox" checked={unrestricted} onChange={(event) => onChange(event.target.checked ? "*" : [])} />
        <span>كل القنوات (بدون قيود)</span>
      </label>
      {!unrestricted ? (
        <div className="ds-check-grid" style={{ marginTop: 8 }}>
          {CHANNEL_CATALOG.map((channel) => {
            const selected = Array.isArray(value) && value.includes(channel.key);
            return (
              <label key={channel.key} className="ds-check" data-on={selected || undefined}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => {
                    const current = Array.isArray(value) ? value : [];
                    onChange(event.target.checked ? [...current, channel.key] : current.filter((key) => key !== channel.key));
                  }}
                />
                <span>{channel.labelAr}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </fieldset>
  );
}

export default function PlansView({ plans, subscriberCounts }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; plan: PlanRow } | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_PLAN_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const stats = useMemo(() => planStats(plans, subscriberCounts), [plans, subscriberCounts]);

  function openCreate() {
    setDraft(EMPTY_PLAN_DRAFT);
    setError("");
    setDialog({ mode: "create" });
  }
  useQueryFlag("new", openCreate);

  function openEdit(plan: PlanRow) {
    setDraft(draftFromPlan(plan));
    setError("");
    setDialog({ mode: "edit", plan });
  }

  function closeDialog() {
    if (saving) return;
    setDialog(null);
  }

  function setField<K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    const problem = validatePlanDraft(draft, dialog.mode);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(dialog.mode === "create" ? "/api/admin/plans" : `/api/admin/plans/${dialog.plan.id}`, {
        method: dialog.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planPayload(draft, dialog.mode))
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error || (dialog.mode === "create" ? "تعذر إنشاء الباقة" : "تعذر تحديث الباقة"));
        return;
      }
      setDialog(null);
      toast("success", dialog.mode === "create" ? "تم إنشاء الباقة" : "تم تحديث الباقة");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: PlanRow) {
    const disabling = plan.active === 1;
    if (disabling) {
      const ok = await confirm({
        title: `تعطيل «${plan.name}»؟`,
        description: "لن تظهر هذه الباقة للعملاء الجدد ولا في إضافة العملاء. المشتركون الحاليون فيها لا يتأثرون.",
        confirmLabel: "تعطيل الباقة",
        tone: "danger"
      });
      if (!ok) return;
    }
    setTogglingId(plan.id);
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !disabling }) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) return toast("error", "تعذر تحديث الباقة", result.error);
      toast("success", disabling ? "تم تعطيل الباقة" : "تم تفعيل الباقة");
      router.refresh();
    } finally {
      setTogglingId("");
    }
  }

  const isEdit = dialog?.mode === "edit";

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي الباقات" value={formatNumber(stats.total)} hint={`${formatNumber(stats.active)} مفعّلة`} icon="layers" />
        <StatCard label="المشتركون" value={formatNumber(stats.subscribers)} hint="عميل موزّع على كل الباقات" icon="users" tone="success" />
        <StatCard label="متوسط السعر الشهري" value={`${formatNumber(stats.averagePrice)} ر.س`} hint="عبر كل الباقات" icon="receipt" />
        <StatCard label="باقات معطّلة" value={formatNumber(stats.disabled)} hint="لا تظهر عند إضافة عميل جديد" icon="shield" tone={stats.disabled ? "warning" : "neutral"} />
      </div>

      <Section title="الباقات" description="الباقات المعروضة للعملاء، وسعرها الشهري وحدودها." actions={<Button variant="primary" icon="plus" onClick={openCreate}>إضافة باقة</Button>}>
        {plans.length === 0 ? (
          <EmptyState icon="layers" title="لا توجد باقات بعد" description="أنشئ أول باقة ليتمكن العملاء من الاشتراك." action={<Button variant="primary" icon="plus" onClick={openCreate}>إضافة باقة</Button>} />
        ) : (
          <div className="ds-plan-grid">
            {plans.map((plan) => {
              const subscribers = subscriberCounts[plan.name] || 0;
              const channels = parseAllowedChannels(plan.allowedChannels || "*");
              return (
                <article key={plan.id} className="ds-card ds-plan" data-inactive={plan.active !== 1 || undefined}>
                  <div className="ds-plan-top">
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong>{plan.name}</strong>
                      {plan.active !== 1 ? <Badge tone="neutral">معطّلة</Badge> : null}
                    </div>
                    <Switch checked={plan.active === 1} disabled={togglingId === plan.id} label={`تفعيل باقة ${plan.name}`} onChange={() => void toggleActive(plan)} />
                  </div>
                  <div className="ds-plan-price"><strong>{formatNumber(plan.monthlyPrice)}</strong><span>ر.س / شهريًا</span></div>
                  <ul className="ds-plan-facts">
                    <li><span>حد المستخدمين</span><strong>{formatNumber(plan.employeeLimit)}</strong></li>
                    <li><span>مساعد AI</span><strong>{plan.aiDailyLimit > 0 ? `${formatNumber(plan.aiDailyLimit)} يوميًا` : "غير متاح"}</strong></li>
                    <li><span>المشتركون</span><strong>{formatNumber(subscribers)}</strong></li>
                    <li><span>القنوات</span><strong>{channels === "*" ? "بدون قيود" : formatNumber(channels.length)}</strong></li>
                    <li><span>رسائل تسويقية</span><strong>{plan.messageQuota === UNLIMITED_MESSAGE_QUOTA ? "غير محدود" : formatNumber(plan.messageQuota)}</strong></li>
                  </ul>
                  <Button variant="outline" icon="edit" onClick={() => openEdit(plan)}>تعديل الباقة</Button>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <Dialog
        open={Boolean(dialog)}
        onClose={closeDialog}
        size="lg"
        title={isEdit ? "تعديل الباقة" : "إضافة باقة جديدة"}
        description={isEdit ? "التغييرات تسري على العملاء المشتركين في هذه الباقة وعلى الاشتراكات الجديدة." : undefined}
        footer={<><Button variant="outline" onClick={closeDialog}>إلغاء</Button><Button variant="primary" type="submit" form="plan-form" loading={saving}>{isEdit ? "حفظ" : "إنشاء الباقة"}</Button></>}
      >
        {dialog ? (
          <form id="plan-form" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label className="ds-field">
                اسم الباقة
                <input data-autofocus={!isEdit || undefined} className="ds-input" required readOnly={isEdit} placeholder="مثال: باقة الأعمال" value={draft.name} onChange={(event) => setField("name", event.target.value)} />
              </label>
              <label className="ds-field">السعر الشهري (ر.س)<input data-autofocus={isEdit || undefined} className="ds-input" type="number" min="0" required value={draft.monthlyPrice} onChange={(event) => setField("monthlyPrice", event.target.value)} /></label>
              <label className="ds-field">حد المستخدمين<input className="ds-input" type="number" min="1" required value={draft.employeeLimit} onChange={(event) => setField("employeeLimit", event.target.value)} /></label>
              <label className="ds-field">
                حد مساعد AI اليومي
                <input className="ds-input" type="number" min="0" value={draft.aiDailyLimit} onChange={(event) => setField("aiDailyLimit", event.target.value)} />
                <small>0 = غير متاح في هذه الباقة</small>
              </label>
              <label className="ds-field">حد مساعد AI الشهري<input className="ds-input" type="number" min="0" value={draft.aiMonthlyLimit} onChange={(event) => setField("aiMonthlyLimit", event.target.value)} /></label>
              <label className="ds-field">
                حصة الرسائل التسويقية
                <input className="ds-input" type="number" min="0" disabled={draft.messageUnlimited} value={draft.messageQuota} onChange={(event) => setField("messageQuota", event.target.value)} />
                <small>تُضاف إلى رصيد الحملات مع كل دفعة</small>
              </label>
            </div>
            <label className="ds-check-inline">
              <input type="checkbox" checked={draft.messageUnlimited} onChange={(event) => setField("messageUnlimited", event.target.checked)} />
              رسائل غير محدودة
            </label>
            <ChannelPicker value={draft.channels} onChange={(channels) => setField("channels", channels)} />
            {isEdit ? (
              <label className="ds-check-inline">
                <input type="checkbox" checked={draft.active} onChange={(event) => setField("active", event.target.checked)} />
                مفعّلة (تظهر للعملاء الجدد)
              </label>
            ) : null}
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
