"use client";

import { FormEvent, useState } from "react";
import type { BlogAdminRow } from "../../../lib/blog-store";
import { callAdminApi, jsonInit } from "../content-api";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";

type Draft = { id: string; slug: string; date: string; titleAr: string; descriptionAr: string; bodyAr: string; titleEn: string; descriptionEn: string; bodyEn: string; published: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({ id: "", slug: "", date: today(), titleAr: "", descriptionAr: "", bodyAr: "", titleEn: "", descriptionEn: "", bodyEn: "", published: true });
const SAVED = "تظهر التغييرات للزوار خلال نحو نصف دقيقة.";

export default function BlogAdminView({ initialPosts }: { initialPosts: BlogAdminRow[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [posts, setPosts] = useState<BlogAdminRow[]>(initialPosts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const result = await callAdminApi<BlogAdminRow[]>("/api/admin/blog");
    if (result.ok && result.data) setPosts(result.data);
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
    const result = await callAdminApi<BlogAdminRow>(id ? `/api/admin/blog/${id}` : "/api/admin/blog", jsonInit(id ? "PATCH" : "POST", fields));
    setSaving(false);
    if (!result.ok) return setError(result.error || "تعذر الحفظ");
    setDraft(null);
    toast("success", "تم الحفظ", SAVED);
    await reload();
  }

  async function togglePublished(post: BlogAdminRow) {
    const result = await callAdminApi(`/api/admin/blog/${post.id}`, jsonInit("PATCH", { ...post, published: !post.published }));
    if (!result.ok) return toast("error", "تعذر التحديث", result.error);
    toast("success", post.published ? "تم إخفاء المقال" : "تم نشر المقال", SAVED);
    await reload();
  }

  async function remove(post: BlogAdminRow) {
    const ok = await confirm({ title: `حذف المقال «${post.titleAr}»؟`, description: "سيُحذف نهائيًا ويختفي رابطه من الموقع.", confirmLabel: "حذف", tone: "danger" });
    if (!ok) return;
    const result = await callAdminApi(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    if (!result.ok) return toast("error", "تعذر الحذف", result.error);
    toast("success", "تم حذف المقال");
    await reload();
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <>
      <Section
        title={`المقالات (${formatNumber(posts.length)})`}
        description="الأحدث تاريخًا يظهر أولًا. المقال غير المنشور لا يظهر للزوار."
        actions={<Button variant="primary" icon="plus" onClick={() => open(emptyDraft())}>مقال جديد</Button>}
      >
        {posts.length === 0 ? (
          <EmptyState icon="scroll" title="لا توجد مقالات" description="اكتب أول مقال ليظهر في المدونة." action={<Button variant="primary" icon="plus" onClick={() => open(emptyDraft())}>مقال جديد</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">المقال</th>
                  <th scope="col">التاريخ</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">الإنجليزية</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td data-cell="main">
                      <div className="ds-cell-stack"><strong>{post.titleAr}</strong><small><bdi dir="ltr">/blog/{post.slug}</bdi></small></div>
                    </td>
                    <td data-label="التاريخ"><bdi dir="ltr">{post.date}</bdi></td>
                    <td data-label="الحالة"><Badge tone={post.published ? "success" : "neutral"} dot>{post.published ? "منشور" : "مخفي"}</Badge></td>
                    <td data-label="الإنجليزية">{post.titleEn ? <Badge tone="info">متوفرة</Badge> : <small>غير متوفرة</small>}</td>
                    <td>
                      <div className="ds-cell-actions">
                        <Button variant="outline" onClick={() => open({ id: post.id, slug: post.slug, date: post.date, titleAr: post.titleAr, descriptionAr: post.descriptionAr, bodyAr: post.bodyAr, titleEn: post.titleEn, descriptionEn: post.descriptionEn, bodyEn: post.bodyEn, published: post.published })}>تعديل</Button>
                        <ActionMenu
                          label={`المزيد للمقال ${post.titleAr}`}
                          items={[
                            { key: "view", label: "عرض في الموقع", icon: "external", href: `/blog/${post.slug}` },
                            { key: "toggle", label: post.published ? "إخفاء" : "نشر", icon: post.published ? "x" : "check", onSelect: () => void togglePublished(post) },
                            { key: "delete", label: "حذف", icon: "trash", tone: "danger", onSelect: () => void remove(post) }
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
        title={draft?.id ? "تعديل مقال" : "مقال جديد"}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="blog-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="blog-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label className="ds-field">الرابط المختصر (slug)<input data-autofocus className="ds-input" dir="ltr" value={draft.slug} onChange={(event) => set({ slug: event.target.value })} placeholder="shared-inbox-guide" maxLength={80} required /></label>
              <label className="ds-field">التاريخ<input className="ds-input" type="date" value={draft.date} onChange={(event) => set({ date: event.target.value })} required /></label>
            </div>
            <label className="ds-field">العنوان (عربي)<input className="ds-input" value={draft.titleAr} onChange={(event) => set({ titleAr: event.target.value })} maxLength={200} required /></label>
            <label className="ds-field">وصف مختصر (عربي) — يظهر في القائمة ونتائج البحث<textarea className="ds-textarea" rows={2} value={draft.descriptionAr} onChange={(event) => set({ descriptionAr: event.target.value })} maxLength={400} /></label>
            <label className="ds-field">المحتوى (عربي)
              <textarea className="ds-textarea" rows={12} value={draft.bodyAr} onChange={(event) => set({ bodyAr: event.target.value })} maxLength={30000} required />
              <small>للعنوان الفرعي ابدأ السطر بـ <code>## </code> ثم النص. افصل الفقرات بسطر فارغ.</small>
            </label>
            <label className="ds-field">Title (English) — اختياري<input className="ds-input" dir="ltr" value={draft.titleEn} onChange={(event) => set({ titleEn: event.target.value })} maxLength={200} /></label>
            <label className="ds-field">Description (English)<textarea className="ds-textarea" dir="ltr" rows={2} value={draft.descriptionEn} onChange={(event) => set({ descriptionEn: event.target.value })} maxLength={400} /></label>
            <label className="ds-field">Body (English) — ## for headings, blank line between paragraphs<textarea className="ds-textarea" dir="ltr" rows={10} value={draft.bodyEn} onChange={(event) => set({ bodyEn: event.target.value })} maxLength={30000} /></label>
            <label className="ds-check"><input type="checkbox" checked={draft.published} onChange={(event) => set({ published: event.target.checked })} />منشور (ظاهر للزوار)</label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
