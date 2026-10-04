"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { viewTitles } from "../../../dashboard/data/navigation";
import type { ViewKey } from "../../../dashboard/types";

type Props = {
  tenantId: string;
  plan: string;
  /** Pages this client's plan locks - the ones that can be unlocked here. */
  lockedViews: ViewKey[];
  granted: ViewKey[];
};

/** Per-client page access: unlock a page the client's plan doesn't include, without changing their plan. */
export default function ClientAccessPanel({ tenantId, plan, lockedViews, granted }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<ViewKey>>(new Set(granted));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function toggle(view: ViewKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(view)) next.delete(view);
      else next.add(view);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/grants`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ views: Array.from(selected) })
    });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !result?.ok) {
      setMessage(result?.error || "تعذر الحفظ");
      return;
    }
    setMessage("تم الحفظ، ستظهر الصفحات للعميل عند تحديث لوحته.");
    router.refresh();
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h2>صلاحيات الصفحات</h2>
          <p>افتح للعميل صفحات خارج باقته ({plan}) دون تغيير الباقة. الصفحة المفتوحة تفتح معها حدودها وخطوات الرد الآلي المرتبطة بها.</p>
        </div>
      </div>
      {lockedViews.length === 0 ? <p className="admin-empty-state">باقة العميل تشمل كل الصفحات.</p> : (
        <>
          <div className="admin-grants-grid">
            {lockedViews.map((view) => (
              <label key={view} className={selected.has(view) ? "on" : ""}>
                <input type="checkbox" checked={selected.has(view)} onChange={() => toggle(view)} />
                <span>{viewTitles[view]}</span>
              </label>
            ))}
          </div>
          <div className="admin-grants-actions">
            <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}</button>
            {message ? <small>{message}</small> : null}
          </div>
        </>
      )}
    </section>
  );
}
