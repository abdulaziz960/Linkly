"use client";

import { FormEvent, useState } from "react";
import type { PageSeoRow } from "../../../lib/page-seo";
import { callAdminApi, jsonInit } from "../content-api";
import { Badge, Button, Section } from "../ds/primitives";
import { Dialog } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import ImageUploadField from "../ImageUploadField";

const SAVED = "تظهر التغييرات للزوار خلال نحو نصف دقيقة.";

export default function PageSeoAdminView({ initialRows }: { initialRows: PageSeoRow[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<PageSeoRow[]>(initialRows);
  const [draft, setDraft] = useState<PageSeoRow | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const result = await callAdminApi<PageSeoRow>("/api/admin/page-seo", jsonInit("PUT", draft));
    setSaving(false);
    if (!result.ok) return setError(result.error || "تعذر الحفظ");
    setRows((current) => current.map((row) => (row.path === draft.path ? { ...draft } : row)));
    setDraft(null);
    toast("success", "تم الحفظ", SAVED);
  }

  const set = (patch: Partial<PageSeoRow>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const customized = (row: PageSeoRow) => Boolean(row.metaTitle || row.metaDescription || row.canonicalUrl || row.ogTitle || row.ogDescription || row.ogImage || row.noindex);

  return (
    <>
      <Section title="الصفحات" description="الصفحة التي تُعلَّم Noindex تختفي من محركات البحث ومن خريطة الموقع.">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th scope="col">الصفحة</th>
                <th scope="col">الرابط</th>
                <th scope="col">الحالة</th>
                <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path}>
                  <td data-cell="main"><strong>{row.label}</strong></td>
                  <td data-label="الرابط"><bdi dir="ltr">{row.path}</bdi></td>
                  <td data-label="الحالة">
                    {row.noindex ? <Badge tone="danger">Noindex</Badge> : customized(row) ? <Badge tone="info">معدَّلة</Badge> : <small>افتراضية</small>}
                  </td>
                  <td><div className="ds-cell-actions"><Button variant="outline" onClick={() => { setDraft({ ...row }); setError(""); }}>تعديل</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog
        open={Boolean(draft)}
        onClose={() => !saving && setDraft(null)}
        title={draft ? `SEO — ${draft.label}` : ""}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="page-seo-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="page-seo-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">عنوان الصفحة (Meta Title) <small>{draft.metaTitle.length}/60 المثالي</small><input data-autofocus className="ds-input" value={draft.metaTitle} onChange={(event) => set({ metaTitle: event.target.value })} maxLength={120} placeholder="فارغ = العنوان الافتراضي" /></label>
            <label className="ds-field">وصف الصفحة (Meta Description) <small>{draft.metaDescription.length}/160 المثالي</small><textarea className="ds-textarea" rows={3} value={draft.metaDescription} onChange={(event) => set({ metaDescription: event.target.value })} maxLength={320} placeholder="فارغ = الوصف الافتراضي" /></label>
            <label className="ds-field">رابط Canonical (اختياري)<input className="ds-input" dir="ltr" value={draft.canonicalUrl} onChange={(event) => set({ canonicalUrl: event.target.value })} maxLength={500} placeholder="https://linklysa.io/..." /></label>
            <label className="ds-check"><input type="checkbox" checked={draft.noindex} onChange={(event) => set({ noindex: event.target.checked })} />Noindex — إخفاء الصفحة من محركات البحث (ومن خريطة الموقع)</label>
            <label className="ds-field">عنوان المشاركة (Open Graph Title)<input className="ds-input" value={draft.ogTitle} onChange={(event) => set({ ogTitle: event.target.value })} maxLength={120} /></label>
            <label className="ds-field">وصف المشاركة (Open Graph Description)<textarea className="ds-textarea" rows={2} value={draft.ogDescription} onChange={(event) => set({ ogDescription: event.target.value })} maxLength={320} /></label>
            <ImageUploadField label="صورة المشاركة (Open Graph Image)" value={draft.ogImage} onChange={(value) => set({ ogImage: value })} />
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
