"use client";

import { FormEvent, useState } from "react";
import type { LegalAdminRow } from "../../../lib/legal-store";
import type { SiteLink } from "../../../lib/blog-links";
import { callAdminApi, jsonInit } from "../content-api";
import { Badge, Button, LinkButton, Section } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import BodyTools from "../blog/BodyTools";

const SAVED = "تظهر التغييرات للزوار خلال نحو نصف دقيقة.";
const PUBLIC_PATH: Record<string, string> = { privacy: "/privacy", terms: "/terms", "data-deletion": "/data-deletion", contact: "/contact" };

export default function LegalPagesAdminView({ initialPages, siteLinks }: { initialPages: LegalAdminRow[]; siteLinks: { ar: SiteLink[]; en: SiteLink[] } }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [pages, setPages] = useState<LegalAdminRow[]>(initialPages);
  const [draft, setDraft] = useState<LegalAdminRow | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const result = await callAdminApi<LegalAdminRow[]>("/api/admin/legal-pages");
    if (result.ok && result.data) setPages(result.data);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const result = await callAdminApi<LegalAdminRow>("/api/admin/legal-pages", jsonInit("PUT", draft));
    setSaving(false);
    if (!result.ok) return setError(result.error || "تعذر الحفظ");
    setDraft(null);
    toast("success", "تم الحفظ", SAVED);
    await reload();
  }

  async function reset(page: LegalAdminRow) {
    const ok = await confirm({ title: `إرجاع «${page.label}» إلى نصها الأصلي؟`, description: "يُحذف النص الذي حفظته لهذه الصفحة وتعود إلى النص المكتوب مع المنصة.", confirmLabel: "إرجاع", tone: "danger" });
    if (!ok) return;
    const result = await callAdminApi(`/api/admin/legal-pages?slug=${encodeURIComponent(page.slug)}`, { method: "DELETE" });
    if (!result.ok) return toast("error", "تعذر الإرجاع", result.error);
    toast("success", "عادت الصفحة إلى نصها الأصلي", SAVED);
    await reload();
  }

  const set = (patch: Partial<LegalAdminRow>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <>
      <Section title="الصفحات" description="الشروط والخصوصية وحذف البيانات. عنوان SEO ووصف كل صفحة من «SEO الصفحات».">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th scope="col">الصفحة</th>
                <th scope="col">الحالة</th>
                <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.slug}>
                  <td data-cell="main"><div className="ds-cell-stack"><strong>{page.titleAr}</strong><small><bdi dir="ltr">{PUBLIC_PATH[page.slug]}</bdi></small></div></td>
                  <td data-label="الحالة">{page.customized ? <Badge tone="info">معدَّلة</Badge> : <small>النص الأصلي</small>}</td>
                  <td>
                    <div className="ds-cell-actions">
                      <Button variant="outline" onClick={() => { setDraft({ ...page }); setError(""); }}>تعديل</Button>
                      <LinkButton variant="outline" href={PUBLIC_PATH[page.slug]} icon="external">عرض</LinkButton>
                      {page.customized ? <Button variant="outline" onClick={() => void reset(page)}>إرجاع للأصل</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog
        open={Boolean(draft)}
        onClose={() => !saving && setDraft(null)}
        title={draft ? `تعديل — ${draft.label}` : ""}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="legal-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="legal-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">العنوان (عربي)<input data-autofocus className="ds-input" value={draft.titleAr} onChange={(event) => set({ titleAr: event.target.value })} maxLength={200} required /></label>
            <label className="ds-field">سطر «آخر تحديث» (عربي)<input className="ds-input" value={draft.updatedAr} onChange={(event) => set({ updatedAr: event.target.value })} maxLength={100} placeholder="آخر تحديث: 6 أكتوبر 2026" /></label>
            <div className="ds-field">
              <label htmlFor="legal-body-ar">النص (عربي)</label>
              <BodyTools textareaId="legal-body-ar" lang="ar" value={draft.bodyAr} onChange={(value) => set({ bodyAr: value })} links={siteLinks.ar} images={false} />
              <textarea id="legal-body-ar" className="ds-textarea" rows={16} value={draft.bodyAr} onChange={(event) => set({ bodyAr: event.target.value })} maxLength={60000} required />
              <small>الصيغة: <code>## </code> عنوان، <code>### </code> عنوان فرعي، <code>- </code> نقطة، <code>1. </code> خطوة مرقّمة، <code>&gt; </code> سطر في مربع التواصل. افصل الفقرات بسطر فارغ. الرابط: <code>[النص](/المسار)</code> أو <code>[نص](mailto:بريد)</code>.</small>
            </div>
            <label className="ds-field">Title (English)<input className="ds-input" dir="ltr" value={draft.titleEn} onChange={(event) => set({ titleEn: event.target.value })} maxLength={200} required /></label>
            <label className="ds-field">&quot;Last updated&quot; line (English)<input className="ds-input" dir="ltr" value={draft.updatedEn} onChange={(event) => set({ updatedEn: event.target.value })} maxLength={100} placeholder="Last updated: October 6, 2026" /></label>
            <div className="ds-field">
              <label htmlFor="legal-body-en">Text (English)</label>
              <BodyTools textareaId="legal-body-en" lang="en" value={draft.bodyEn} onChange={(value) => set({ bodyEn: value })} links={siteLinks.en} images={false} />
              <textarea id="legal-body-en" className="ds-textarea" dir="ltr" rows={16} value={draft.bodyEn} onChange={(event) => set({ bodyEn: event.target.value })} maxLength={60000} required />
            </div>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
