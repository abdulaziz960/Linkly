"use client";

import { FormEvent, useState } from "react";
import type { RedirectRow } from "../../../lib/redirects";
import { callAdminApi, jsonInit } from "../content-api";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";

type Draft = { id: string; fromPath: string; toUrl: string; statusCode: 301 | 302 | 410; enabled: boolean; note: string };
const emptyDraft: Draft = { id: "", fromPath: "", toUrl: "", statusCode: 301, enabled: true, note: "" };
const SAVED = "يسري التحويل خلال نحو نصف دقيقة.";
const STATUS_LABEL: Record<number, string> = { 301: "301 دائم", 302: "302 مؤقت", 410: "410 محذوفة" };

export default function RedirectsAdminView({ initialRules }: { initialRules: RedirectRow[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [rules, setRules] = useState<RedirectRow[]>(initialRules);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const result = await callAdminApi<RedirectRow[]>("/api/admin/redirects");
    if (result.ok && result.data) setRules(result.data);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const { id, ...fields } = draft;
    const result = await callAdminApi<RedirectRow>(id ? `/api/admin/redirects/${id}` : "/api/admin/redirects", jsonInit(id ? "PATCH" : "POST", fields));
    setSaving(false);
    if (!result.ok) return setError(result.error || "تعذر الحفظ");
    setDraft(null);
    toast("success", "تم الحفظ", SAVED);
    await reload();
  }

  async function toggle(rule: RedirectRow) {
    const result = await callAdminApi(`/api/admin/redirects/${rule.id}`, jsonInit("PATCH", { ...rule, enabled: !rule.enabled }));
    if (!result.ok) return toast("error", "تعذر التحديث", result.error);
    toast("success", rule.enabled ? "تم إيقاف التحويل" : "تم تفعيل التحويل", SAVED);
    await reload();
  }

  async function remove(rule: RedirectRow) {
    const ok = await confirm({ title: `حذف التحويل ${rule.fromPath}؟`, description: "سيعود الرابط القديم لسلوكه الأصلي (صفحة غير موجودة إن لم تكن له صفحة).", confirmLabel: "حذف", tone: "danger" });
    if (!ok) return;
    const result = await callAdminApi(`/api/admin/redirects/${rule.id}`, { method: "DELETE" });
    if (!result.ok) return toast("error", "تعذر الحذف", result.error);
    toast("success", "تم حذف التحويل");
    await reload();
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <>
      <Section
        title={`قواعد التحويل (${formatNumber(rules.length)})`}
        description="استخدم 301 عند نقل صفحة نهائيًا ليحتفظ الرابط الجديد بقوة القديم في البحث."
        actions={<Button variant="primary" icon="plus" onClick={() => { setDraft(emptyDraft); setError(""); }}>قاعدة جديدة</Button>}
      >
        {rules.length === 0 ? (
          <EmptyState icon="code" title="لا توجد قواعد تحويل" description="أضف قاعدة عند تغيير رابط صفحة أو حذفها." action={<Button variant="primary" icon="plus" onClick={() => { setDraft(emptyDraft); setError(""); }}>قاعدة جديدة</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">من (القديم)</th>
                  <th scope="col">إلى (الجديد)</th>
                  <th scope="col">النوع</th>
                  <th scope="col">الحالة</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td data-cell="main"><div className="ds-cell-stack"><strong><bdi dir="ltr">{rule.fromPath}</bdi></strong>{rule.note ? <small>{rule.note}</small> : null}</div></td>
                    <td data-label="إلى">{rule.statusCode === 410 ? <small>—</small> : <bdi dir="ltr">{rule.toUrl}</bdi>}</td>
                    <td data-label="النوع"><Badge tone={rule.statusCode === 410 ? "danger" : "info"}>{STATUS_LABEL[rule.statusCode]}</Badge></td>
                    <td data-label="الحالة"><Badge tone={rule.enabled ? "success" : "neutral"} dot>{rule.enabled ? "فعّال" : "موقوف"}</Badge></td>
                    <td>
                      <div className="ds-cell-actions">
                        <Button variant="outline" onClick={() => { setDraft({ id: rule.id, fromPath: rule.fromPath, toUrl: rule.toUrl, statusCode: rule.statusCode, enabled: rule.enabled, note: rule.note }); setError(""); }}>تعديل</Button>
                        <ActionMenu
                          label={`المزيد للتحويل ${rule.fromPath}`}
                          items={[
                            { key: "toggle", label: rule.enabled ? "إيقاف" : "تفعيل", icon: rule.enabled ? "x" : "check", onSelect: () => void toggle(rule) },
                            { key: "delete", label: "حذف", icon: "trash", tone: "danger", onSelect: () => void remove(rule) }
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog
        open={Boolean(draft)}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "تعديل تحويل" : "تحويل جديد"}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="redirect-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="redirect-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">المسار القديم<input data-autofocus className="ds-input" dir="ltr" value={draft.fromPath} onChange={(event) => set({ fromPath: event.target.value })} placeholder="/old-page" maxLength={500} required /></label>
            <label className="ds-field">نوع التحويل
              <select className="ds-input" value={draft.statusCode} onChange={(event) => set({ statusCode: Number(event.target.value) as Draft["statusCode"] })}>
                <option value={301}>301 — انتقلت الصفحة نهائيًا (الأفضل لـ SEO)</option>
                <option value={302}>302 — تحويل مؤقت</option>
                <option value={410}>410 — الصفحة محذوفة نهائيًا</option>
              </select>
            </label>
            {draft.statusCode !== 410 ? (
              <label className="ds-field">الوجهة الجديدة<input className="ds-input" dir="ltr" value={draft.toUrl} onChange={(event) => set({ toUrl: event.target.value })} placeholder="/new-page أو https://..." maxLength={500} required /></label>
            ) : null}
            <label className="ds-field">ملاحظة (اختياري)<input className="ds-input" value={draft.note} onChange={(event) => set({ note: event.target.value })} maxLength={200} /></label>
            <label className="ds-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => set({ enabled: event.target.checked })} />فعّال</label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
