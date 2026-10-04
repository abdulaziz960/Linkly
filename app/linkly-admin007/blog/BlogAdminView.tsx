"use client";

import { FormEvent, useState } from "react";
import type { BlogAdminRow } from "../../../lib/blog-store";

type Draft = { id: string; slug: string; date: string; titleAr: string; descriptionAr: string; bodyAr: string; titleEn: string; descriptionEn: string; bodyEn: string; published: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({ id: "", slug: "", date: today(), titleAr: "", descriptionAr: "", bodyAr: "", titleEn: "", descriptionEn: "", bodyEn: "", published: true });

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, error: payload?.error || "حدث خطأ" };
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }
}

export default function BlogAdminView({ initialPosts }: { initialPosts: BlogAdminRow[] }) {
  const [posts, setPosts] = useState<BlogAdminRow[]>(initialPosts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function reload() {
    const result = await call<BlogAdminRow[]>("/api/admin/blog");
    if (result.ok && result.data) setPosts(result.data);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const { id, ...fields } = draft;
    const result = await call<BlogAdminRow>(id ? `/api/admin/blog/${id}` : "/api/admin/blog", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || "تعذر الحفظ");
      return;
    }
    setDraft(null);
    setNotice("تم الحفظ. تظهر التغييرات للزوار خلال نحو نصف دقيقة.");
    await reload();
  }

  async function togglePublished(post: BlogAdminRow) {
    await call(`/api/admin/blog/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...post, published: !post.published }) });
    await reload();
  }

  async function remove(post: BlogAdminRow) {
    if (!window.confirm(`حذف المقال «${post.titleAr}» نهائيًا؟`)) return;
    await call(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div><h2>المقالات ({posts.length})</h2><p>الأحدث تاريخًا يظهر أولًا. المقال غير المنشور لا يظهر للزوار.</p></div>
        <button className="admin-primary-button" type="button" onClick={() => { setDraft(emptyDraft()); setError(""); }}>+ مقال جديد</button>
      </div>
      {notice ? <p className="admin-faq-notice" role="status">{notice}</p> : null}

      <ol className="admin-faq-list">
        {posts.map((post) => (
          <li key={post.id} className={post.published ? "" : "hidden"}>
            <div className="admin-faq-text">
              <b>{post.titleAr}</b>
              <p>{post.descriptionAr}</p>
              <small dir="ltr">/blog/{post.slug} · {post.date} · {post.titleEn ? "EN ✓" : "no English"} · {post.published ? "منشور" : "مخفي"}</small>
            </div>
            <div className="admin-faq-actions">
              <button className="admin-secondary-button" type="button" onClick={() => { setDraft({ id: post.id, slug: post.slug, date: post.date, titleAr: post.titleAr, descriptionAr: post.descriptionAr, bodyAr: post.bodyAr, titleEn: post.titleEn, descriptionEn: post.descriptionEn, bodyEn: post.bodyEn, published: post.published }); setError(""); }}>تعديل</button>
              <a className="admin-secondary-button" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">عرض</a>
              <button className="admin-secondary-button" type="button" onClick={() => void togglePublished(post)}>{post.published ? "إخفاء" : "نشر"}</button>
              <button className="admin-secondary-button danger" type="button" onClick={() => void remove(post)}>حذف</button>
            </div>
          </li>
        ))}
        {posts.length === 0 ? <li className="admin-empty-state">لا توجد مقالات. اكتب أول مقال.</li> : null}
      </ol>

      {draft ? (
        <div className="admin-modal" role="presentation" onClick={() => setDraft(null)}>
          <form className="admin-modal-card" role="dialog" aria-modal="true" aria-label="مقال" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-head">
              <div><h2>{draft.id ? "تعديل مقال" : "مقال جديد"}</h2></div>
              <button type="button" aria-label="إغلاق" onClick={() => setDraft(null)}>×</button>
            </div>
            <div className="admin-faq-form">
              <div className="admin-blog-row">
                <label><span>الرابط المختصر (slug)</span><input dir="ltr" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} placeholder="shared-inbox-guide" maxLength={80} required /></label>
                <label><span>التاريخ</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label>
              </div>
              <label><span>العنوان (عربي)</span><input value={draft.titleAr} onChange={(event) => setDraft({ ...draft, titleAr: event.target.value })} maxLength={200} required /></label>
              <label><span>وصف مختصر (عربي) - يظهر في القائمة وفي نتائج البحث</span><textarea rows={2} value={draft.descriptionAr} onChange={(event) => setDraft({ ...draft, descriptionAr: event.target.value })} maxLength={400} /></label>
              <label>
                <span>المحتوى (عربي)</span>
                <textarea rows={12} value={draft.bodyAr} onChange={(event) => setDraft({ ...draft, bodyAr: event.target.value })} maxLength={30000} required />
                <small className="admin-blog-hint">للعنوان الفرعي ابدأ السطر بـ <code>## </code> ثم النص. افصل الفقرات بسطر فارغ.</small>
              </label>
              <label><span>Title (English) - اختياري</span><input dir="ltr" value={draft.titleEn} onChange={(event) => setDraft({ ...draft, titleEn: event.target.value })} maxLength={200} /></label>
              <label><span>Description (English)</span><textarea dir="ltr" rows={2} value={draft.descriptionEn} onChange={(event) => setDraft({ ...draft, descriptionEn: event.target.value })} maxLength={400} /></label>
              <label><span>Body (English) - ## for headings, blank line between paragraphs</span><textarea dir="ltr" rows={10} value={draft.bodyEn} onChange={(event) => setDraft({ ...draft, bodyEn: event.target.value })} maxLength={30000} /></label>
              <label className="admin-faq-check"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /><span>منشور (ظاهر للزوار)</span></label>
              {error ? <p className="admin-faq-error" role="alert">{error}</p> : null}
            </div>
            <div className="admin-faq-foot">
              <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button>
              <button className="admin-secondary-button" type="button" onClick={() => setDraft(null)}>إلغاء</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
