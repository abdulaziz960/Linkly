"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { viewTitles } from "../../../dashboard/data/navigation";
import { GRANT_FEATURE_LABELS, GRANT_NUMBER_LABELS, LIMIT_KIND_LABELS, parseGrantKeys, type Grantable, type GrantNumber } from "../../../../lib/plan-access";
import type { PlanLimitKind } from "../../../../lib/plan-access";
import { channelLabel } from "../../../../lib/channel-catalog";
import { Button, Section } from "../../ds/primitives";
import { useToast } from "../../ds/Toast";

type Props = {
  tenantId: string;
  plan: string;
  /** Everything that can be unlocked or customized for this client's plan. */
  grantable: Grantable;
  /** The keys already set (as stored: "catalog", "feature:...", "channel:...", "limit:branches=12", "num:aiDaily=100"). */
  granted: string[];
  /** What the plan itself gives for each number, shown as a hint ("حسب الباقة: 10"). */
  defaults: Record<string, string>;
};

type NumberState = { unlimited: boolean; value: string };

/** Per-client access: unlock pages, features and channels, and set custom numbers, beyond the client's plan - without changing the plan. */
export default function ClientAccessPanel({ tenantId, plan, grantable, granted, defaults }: Props) {
  const router = useRouter();
  const toast = useToast();
  const initial = parseGrantKeys(granted);
  const [selected, setSelected] = useState<Set<string>>(new Set([...initial.views, ...initial.features.map((f) => `feature:${f}`), ...initial.channels.map((c) => `channel:${c}`)]));
  const [numbers, setNumbers] = useState<Record<string, NumberState>>(() => {
    const state: Record<string, NumberState> = {};
    for (const kind of Object.keys(initial.limits) as PlanLimitKind[]) {
      const value = initial.limits[kind];
      state[`limit:${kind}`] = { unlimited: value === null, value: value === null || value === undefined ? "" : String(value) };
    }
    for (const name of Object.keys(initial.numbers) as GrantNumber[]) state[`num:${name}`] = { unlimited: false, value: String(initial.numbers[name]) };
    return state;
  });
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setNumber(key: string, patch: Partial<NumberState>) {
    setNumbers((current) => ({ ...current, [key]: { ...(current[key] ?? { unlimited: false, value: "" }), ...patch } }));
  }

  async function save() {
    setSaving(true);
    const keys = Array.from(selected);
    for (const [key, state] of Object.entries(numbers)) {
      if (key.startsWith("limit:")) {
        if (state.unlimited) keys.push(`${key}=unlimited`);
        else if (state.value.trim() !== "") keys.push(`${key}=${state.value.trim()}`);
      } else if (state.value.trim() !== "") {
        keys.push(`${key}=${state.value.trim()}`);
      }
    }
    try {
      const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        toast("error", "تعذر الحفظ", result?.error);
        return;
      }
      toast("success", "تم حفظ الصلاحيات", "تظهر التغييرات للعميل عند تحديث لوحته. القيم غير الصالحة تُتجاهل.");
      router.refresh();
    } catch {
      toast("error", "تعذر الحفظ", "تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  const checkGroups = [
    { title: "الصفحات", hint: "صفحات اللوحة التي تقفلها الباقة. الصفحة المفتوحة تفتح معها حدودها وخطوات الرد الآلي المرتبطة بها.", items: grantable.views.map((view) => ({ key: view, label: viewTitles[view] })) },
    { title: "المزايا", hint: "مزايا إضافية على ما تشمله الباقة.", items: grantable.features.map((feature) => ({ key: `feature:${feature}`, label: GRANT_FEATURE_LABELS[feature].ar })) },
    { title: "القنوات", hint: "قنوات ربط خارج قنوات الباقة.", items: grantable.channels.map((channel) => ({ key: `channel:${channel}`, label: channelLabel(channel, "ar") })) }
  ].filter((group) => group.items.length > 0);

  const numberRows = [
    ...grantable.limits.map((kind) => ({ key: `limit:${kind}`, label: LIMIT_KIND_LABELS[kind], hint: "", canUnlimit: true })),
    ...grantable.numbers.map((name) => ({ key: `num:${name}`, label: GRANT_NUMBER_LABELS[name].ar, hint: GRANT_NUMBER_LABELS[name].hint, canUnlimit: false }))
  ];

  return (
    <Section
      title="صلاحيات وميزات استثنائية"
      description={`خصّص للعميل ما لا تشمله باقته (${plan}) دون تغيير الباقة: صفحات، مزايا، قنوات، وأرقام (حدود).`}
      actions={<Button variant="primary" loading={saving} onClick={() => void save()}>حفظ الصلاحيات</Button>}
    >
      <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 22 }}>
        {checkGroups.map((group) => (
          <fieldset key={group.title} className="ds-fieldset">
            <legend>{group.title}</legend>
            <p className="ds-fieldset-hint">{group.hint}</p>
            <div className="ds-check-grid">
              {group.items.map((item) => (
                <label key={item.key} className="ds-check" data-on={selected.has(item.key) || undefined}>
                  <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        {numberRows.length ? (
          <fieldset className="ds-fieldset">
            <legend>الأرقام والحدود</legend>
            <p className="ds-fieldset-hint">اترك الخانة فارغة لاستخدام رقم الباقة. أي رقم تكتبه يحل محل رقم الباقة لهذا العميل فقط.</p>
            <div className="ds-num-grid">
              {numberRows.map((row) => {
                const state = numbers[row.key] ?? { unlimited: false, value: "" };
                return (
                  <div key={row.key} className="ds-num-row" data-on={state.unlimited || state.value ? "true" : undefined}>
                    <label className="ds-field" htmlFor={`grant-${row.key}`}>
                      {row.label}
                      <small>{defaults[row.key] ? `حسب الباقة: ${defaults[row.key]}` : row.hint}</small>
                    </label>
                    <input
                      id={`grant-${row.key}`}
                      className="ds-input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      disabled={state.unlimited}
                      value={state.value}
                      placeholder="حسب الباقة"
                      onChange={(event) => setNumber(row.key, { value: event.target.value, unlimited: false })}
                    />
                    {row.canUnlimit ? (
                      <label className="ds-check-inline">
                        <input type="checkbox" checked={state.unlimited} onChange={(event) => setNumber(row.key, { unlimited: event.target.checked, value: event.target.checked ? "" : state.value })} />
                        غير محدود
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>
    </Section>
  );
}
