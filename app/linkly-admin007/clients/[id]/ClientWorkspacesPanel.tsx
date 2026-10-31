"use client";

import { useEffect, useState } from "react";
import { Button, Section } from "../../ds/primitives";
import { useToast } from "../../ds/Toast";

type Info = {
  plan: string;
  planSupportsProjects: boolean;
  enabled: boolean;
  extraProjects: number;
  includedByPlan: number;
  maxProjects: number;
  projectsUsed: number;
  unitPrice: number;
  monthlyAddition: number;
};

/** Switches projects (workspaces) on for one client and sets how many extra projects they bought; each one adds to their subscription. */
export default function ClientWorkspacesPanel({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [extra, setExtra] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/workspaces`)
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: Info }) => {
        if (cancelled || !result.ok || !result.data) return;
        setInfo(result.data);
        setEnabled(result.data.enabled);
        setExtra(String(result.data.extraProjects));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [tenantId]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/workspaces`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, extraProjects: Number(extra) })
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Info } | null;
      if (!response.ok || !result?.ok || !result.data) {
        toast("error", "تعذر الحفظ", result?.error);
        return;
      }
      setInfo(result.data);
      toast("success", "تم حفظ إعدادات المشاريع", "المبلغ الإضافي يدخل في أول فاتورة أو تجديد قادم للعميل.");
    } catch {
      toast("error", "تعذر الحفظ", "تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  if (!info) return <Section title="مساحات العمل (المشاريع)" description="جارٍ التحميل…"><div className="ds-card ds-card-pad" /></Section>;

  const extraNumber = Number.isInteger(Number(extra)) && Number(extra) >= 0 ? Number(extra) : 0;
  return (
    <Section
      title="مساحات العمل (المشاريع)"
      description={`باقة العميل: ${info.plan}. تدعم المشاريع باقات المؤسسات الصغيرة فما فوق. المشروع الإضافي يُضاف إلى اشتراكه ${info.unitPrice} ريال شهريًا (قبل الضريبة).`}
      actions={<Button variant="primary" loading={saving} onClick={() => void save()}>حفظ</Button>}
    >
      <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 16 }}>
        {!info.planSupportsProjects ? <p className="ds-fieldset-hint">هذه الباقة لا تدعم المشاريع. اطلب من العميل الترقية أولًا.</p> : null}
        <label className="ds-check" data-on={enabled || undefined}>
          <input type="checkbox" checked={enabled} disabled={!info.planSupportsProjects} onChange={(event) => setEnabled(event.target.checked)} />
          <span>تفعيل المشاريع لهذا الحساب</span>
        </label>
        <div className="ds-num-row">
          <label className="ds-field" htmlFor="ws-extra">
            مشاريع إضافية مشتراة
            <small>{info.includedByPlan ? `الباقة تشمل ${info.includedByPlan} مشروعًا إضافيًا مجانًا، وهذا العدد فوقها.` : "كل مشروع إضافي يُحتسب على اشتراك العميل."}</small>
          </label>
          <input id="ws-extra" className="ds-input" type="number" min={0} max={50} inputMode="numeric" disabled={!info.planSupportsProjects} value={extra} onChange={(event) => setExtra(event.target.value)} />
        </div>
        <dl className="ds-fieldset-hint" style={{ display: "grid", gap: 6, margin: 0 }}>
          <div>الحد الأعلى للمشاريع (مع المشروع الأساسي): <b>{info.includedByPlan + extraNumber + 1}</b></div>
          <div>المستخدم الآن: <b>{info.projectsUsed}</b></div>
          <div>يُضاف على الاشتراك: <b>{extraNumber * info.unitPrice} ريال</b> شهريًا (قبل الضريبة)، بنفس خصم الدورة السنوية.</div>
        </dl>
      </div>
    </Section>
  );
}
