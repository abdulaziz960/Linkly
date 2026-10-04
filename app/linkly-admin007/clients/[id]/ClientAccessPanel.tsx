"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { viewTitles } from "../../../dashboard/data/navigation";
import { GRANT_FEATURE_LABELS, LIMIT_KIND_LABELS, type Grants } from "../../../../lib/plan-access";
import { channelLabel } from "../../../../lib/channel-catalog";

type Props = {
  tenantId: string;
  plan: string;
  /** Everything the plan does NOT include - the things that can be unlocked here. */
  grantable: Grants;
  /** The keys already unlocked (encoded as stored: "catalog", "feature:...", "channel:...", "limit:..."). */
  granted: string[];
};

type Group = { title: string; hint: string; items: Array<{ key: string; label: string }> };

/** Per-client access: unlock pages, features, channels or "unlimited" caps beyond the client's plan, without changing the plan. */
export default function ClientAccessPanel({ tenantId, plan, grantable, granted }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(granted));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const groups: Group[] = [
    { title: "الصفحات", hint: "صفحات اللوحة التي تقفلها الباقة. الصفحة المفتوحة تفتح معها حدودها وخطوات الرد الآلي المرتبطة بها.", items: grantable.views.map((view) => ({ key: view, label: viewTitles[view] })) },
    { title: "المزايا", hint: "مزايا داخل الصفحات المفتوحة أصلًا في الباقة.", items: grantable.features.map((feature) => ({ key: `feature:${feature}`, label: GRANT_FEATURE_LABELS[feature].ar })) },
    { title: "القنوات", hint: "قنوات ربط خارج قنوات الباقة.", items: grantable.channels.map((channel) => ({ key: `channel:${channel}`, label: channelLabel(channel, "ar") })) },
    { title: "رفع الحدود", hint: "إلغاء الحد الأقصى لهذا العميل (غير محدود).", items: grantable.limits.map((kind) => ({ key: `limit:${kind}`, label: `${LIMIT_KIND_LABELS[kind]} غير محدود` })) }
  ].filter((group) => group.items.length > 0);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/grants`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: Array.from(selected) })
    });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !result?.ok) {
      setMessage(result?.error || "تعذر الحفظ");
      return;
    }
    setMessage("تم الحفظ، تظهر التغييرات للعميل عند تحديث لوحته.");
    router.refresh();
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h2>صلاحيات وميزات استثنائية</h2>
          <p>افتح للعميل ما لا تشمله باقته ({plan}) دون تغيير الباقة: صفحات، مزايا، قنوات، أو رفع حد.</p>
        </div>
      </div>
      {groups.length === 0 ? <p className="admin-empty-state">باقة العميل تشمل كل شيء.</p> : (
        <>
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="admin-grants-title">{group.title}<small>{group.hint}</small></h3>
              <div className="admin-grants-grid">
                {group.items.map((item) => (
                  <label key={item.key} className={selected.has(item.key) ? "on" : ""}>
                    <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="admin-grants-actions">
            <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button>
            {message ? <small>{message}</small> : null}
          </div>
        </>
      )}
    </section>
  );
}
