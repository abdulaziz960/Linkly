"use client";

import { FormEvent, useState } from "react";
import type { SolutionAdminRow } from "../../../lib/solution-store";
import type { SiteLink } from "../../../lib/blog-links";
import { callAdminApi, jsonInit } from "../content-api";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";
import BodyTools from "../blog/BodyTools";

type Draft = Omit<SolutionAdminRow, "sortOrder">;

const emptyDraft = (): Draft => ({ id: "", slug: "", published: true, titleAr: "", descriptionAr: "", bodyAr: "", checklistAr: "", titleEn: "", descriptionEn: "", bodyEn: "", checklistEn: "" });
const SAVED = "تظهر التغييرات للزوار خلال نحو نصف دقيقة.";
const toDraft = (page: SolutionAdminRow): Draft => ({ id: page.id, slug: page.slug, published: page.published, titleAr: page.titleAr, descriptionAr: page.descriptionAr, bodyAr: page.bodyAr, checklistAr: page.checklistAr, titleEn: page.titleEn, descriptionEn: page.descriptionEn, bodyEn: page.bodyEn, checklistEn: page.checklistEn });

export default function SolutionsAdminView({ initialPages, siteLinks }: { initialPages: SolutionAdminRow[]; siteLinks: { ar: SiteLink[]; en: SiteLink[] } }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [pages, setPages] = useState<SolutionAdminRow[]>(initialPages);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const result = await callAdminApi<SolutionAdminRow[]>("/api/admin/solutions");
    if (result.ok && result.data) setPages(result.data);
  }

  function open(next: Draft) {
    setDraft(next);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const { id, ...fields } = draft;
    const result = await callAdminApi<SolutionAdminRow>(id ? `/api/admin/solutions/${id}` : "/api/admin/solutions", jsonInit(id ? "PATCH" : "POST", fields));
    setSaving(false);
    if (!result.ok) return setError(result.error || "تعذر الحفظ");
    setDraft(null);
    toast("success", "تم الحفظ", SAVED);
    await reload();
  }

  async function togglePublished(page: SolutionAdminRow) {
    const result = await callAdminApi(`/api/admin/solutions/${page.id}`, jsonInit("PATCH", { ...toDraft(page), published: !page.published }));
    if (!result.ok) return toast("error", "تعذر التحديث", result.error);
    toast("success", page.published ? "تم إخفاء الصفحة" : "تم نشر الصفحة", SAVED);
    await reload();
  }

  async function remove(page: SolutionAdminRow) {
    const ok = await confirm({ title: `حذف صفحة «${page.titleAr}»؟`, description: "ستُحذف نهائيًا ويختفي رابطها من الموقع وخريطة الموقع.", confirmLabel: "حذف", tone: "danger" });
    if (!ok) return;
    const result = await callAdminApi(`/api/admin/solutions/${page.id}`, { method: "DELETE" });
    if (!result.ok) return toast("error", "تعذر الحذف", result.error);
    toast("success", "تم حذف الصفحة");
    await reload();
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <>
      <Section
        title={`صفحات الحلول (${formatNumber(pages.length)})`}
        description="الصفحة المخفية لا تظهر للزوار ولا في خريطة الموقع."
        actions={<Button variant="primary" icon="plus" onClick={() => open(emptyDraft())}>صفحة جديدة</Button>}
      >
        {pages.length === 0 ? (
          <EmptyState icon="scroll" title="لا توجد صفحات" description="أضف أول صفحة حل لتظهر في الموقع." action={<Button variant="primary" icon="plus" onClick={() => open(emptyDraft())}>صفحة جديدة</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">الصفحة</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">الإنجليزية</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td data-cell="main">
                      <div className="ds-cell-stack"><strong>{page.titleAr}</strong><small><bdi dir="ltr">/solutions/{page.slug}</bdi></small></div>
                    </td>
                    <td data-label="الحالة"><Badge tone={page.published ? "success" : "neutral"} dot>{page.published ? "منشورة" : "مخفية"}</Badge></td>
                    <td data-label="الإنجليزية">{page.titleEn ? <Badge tone="info">متوفرة</Badge> : <small>غير متوفرة</small>}</td>
                    <td>
                      <div className="ds-cell-actions">
                        <Button variant="outline" onClick={() => open(toDraft(page))}>تعديل</Button>
                        <ActionMenu
                          label={`المزيد للصفحة ${page.titleAr}`}
                          items={[
                            { key: "view", label: "عرض في الموقع", icon: "external", href: `/solutions/${page.slug}` },
                            { key: "toggle", label: page.published ? "إخفاء" : "نشر", icon: page.published ? "x" : "check", onSelect: () => void togglePublished(page) },
                            { key: "delete", label: "حذف", icon: "trash", tone: "danger", onSelect: () => void remove(page) }
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
        title={draft?.id ? "تعديل صفحة حل" : "صفحة حل جديدة"}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="solution-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="solution-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">الرابط المختصر (slug)<input data-autofocus className="ds-input" dir="ltr" value={draft.slug} onChange={(event) => set({ slug: event.target.value })} placeholder="whatsapp-for-pharmacies" maxLength={80} required /><small>يصير رابط الصفحة: <bdi dir="ltr">/solutions/{draft.slug || "..."}</bdi></small></label>
            <label className="ds-field">العنوان (عربي) — العنوان الرئيسي H1<input className="ds-input" value={draft.titleAr} onChange={(event) => set({ titleAr: event.target.value })} maxLength={200} required /></label>
            <label className="ds-field">وصف مختصر (عربي) — يظهر تحت العنوان وفي القوائم ونتائج البحث<textarea className="ds-textarea" rows={2} value={draft.descriptionAr} onChange={(event) => set({ descriptionAr: event.target.value })} maxLength={400} required /></label>
            <div className="ds-field">
              <label htmlFor="solution-body-ar">المحتوى (عربي)</label>
              <BodyTools textareaId="solution-body-ar" lang="ar" value={draft.bodyAr} onChange={(value) => set({ bodyAr: value })} links={siteLinks.ar} images />
              <textarea id="solution-body-ar" className="ds-textarea" rows={14} value={draft.bodyAr} onChange={(event) => set({ bodyAr: event.target.value })} maxLength={20000} required />
              <small>لبداية قسم جديد ابدأ السطر بـ <code>## </code> ثم عنوان القسم (H2)، ولعنوان فرعي (H3) ابدأ السطر بـ <code>### </code>. الفقرات مفصولة بسطر فارغ. الرابط الداخلي والصورة يكتبهما الزران فوق المربع.</small>
            </div>
            <label className="ds-field">قائمة «قبل أن تبدأ» (عربي) — بند في كل سطر، اختياري<textarea className="ds-textarea" rows={4} value={draft.checklistAr} onChange={(event) => set({ checklistAr: event.target.value })} maxLength={3000} /></label>
            <details className="admin-seo-box" open={Boolean(draft.titleEn || draft.bodyEn)}>
              <summary>النسخة الإنجليزية (اختيارية)</summary>
              <div className="admin-seo-grid">
                <label className="ds-field">Title (English)<input className="ds-input" dir="ltr" value={draft.titleEn} onChange={(event) => set({ titleEn: event.target.value })} maxLength={200} /></label>
                <label className="ds-field">Description (English)<textarea className="ds-textarea" dir="ltr" rows={2} value={draft.descriptionEn} onChange={(event) => set({ descriptionEn: event.target.value })} maxLength={400} /></label>
                <div className="ds-field">
                  <label htmlFor="solution-body-en">Body (English) — ## starts a section, blank line between paragraphs</label>
                  <BodyTools textareaId="solution-body-en" lang="en" value={draft.bodyEn} onChange={(value) => set({ bodyEn: value })} links={siteLinks.en} images />
                  <textarea id="solution-body-en" className="ds-textarea" dir="ltr" rows={10} value={draft.bodyEn} onChange={(event) => set({ bodyEn: event.target.value })} maxLength={20000} />
                </div>
                <label className="ds-field">Checklist (English) — one item per line<textarea className="ds-textarea" dir="ltr" rows={3} value={draft.checklistEn} onChange={(event) => set({ checklistEn: event.target.value })} maxLength={3000} /></label>
              </div>
            </details>
            <label className="ds-check"><input type="checkbox" checked={draft.published} onChange={(event) => set({ published: event.target.checked })} />منشورة (ظاهرة للزوار) — إلغاء التحديد يحفظها مخفية</label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
