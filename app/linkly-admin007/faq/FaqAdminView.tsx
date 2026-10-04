"use client";

import { FormEvent, useState } from "react";
import type { FaqItemRow } from "../../../lib/faq-store";

type Draft = { id: string; questionAr: string; answerAr: string; questionEn: string; answerEn: string; active: boolean };
const emptyDraft: Draft = { id: "", questionAr: "", answerAr: "", questionEn: "", answerEn: "", active: true };

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

export default function FaqAdminView({ initialItems }: { initialItems: FaqItemRow[] }) {
  const [items, setItems] = useState<FaqItemRow[]>(initialItems);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function reload() {
    const result = await call<FaqItemRow[]>("/api/admin/faq");
    if (result.ok && result.data) setItems(result.data);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const body = JSON.stringify({ questionAr: draft.questionAr, answerAr: draft.answerAr, questionEn: draft.questionEn, answerEn: draft.answerEn, active: draft.active });
    const result = await call<FaqItemRow>(draft.id ? `/api/admin/faq/${draft.id}` : "/api/admin/faq", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || "تعذر الحفظ");
      return;
    }
    setDraft(null);
    setNotice("تم الحفظ. تظهر التغييرات للزوار خلال نحو نصف دقيقة.");
    await reload();
  }

  async function toggleActive(item: FaqItemRow) {
    await call(`/api/admin/faq/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, active: !item.active }) });
    await reload();
  }

  async function remove(item: FaqItemRow) {
    if (!window.confirm(`حذف السؤال «${item.questionAr}»؟`)) return;
    await call(`/api/admin/faq/${item.id}`, { method: "DELETE" });
    await reload();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await call("/api/admin/faq/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((item) => item.id) }) });
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div><h2>الأسئلة ({items.length})</h2><p>الترتيب هنا هو ترتيب ظهورها للزوار. المخفي لا يظهر في الموقع.</p></div>
        <button className="admin-primary-button" type="button" onClick={() => { setDraft({ ...emptyDraft }); setError(""); }}>+ إضافة سؤال</button>
      </div>
      {notice ? <p className="admin-faq-notice" role="status">{notice}</p> : null}

      <ol className="admin-faq-list">
        {items.map((item, index) => (
          <li key={item.id} className={item.active ? "" : "hidden"}>
            <div className="admin-faq-order">
              <button type="button" aria-label="أعلى" disabled={index === 0} onClick={() => void move(index, -1)}>▲</button>
              <button type="button" aria-label="أسفل" disabled={index === items.length - 1} onClick={() => void move(index, 1)}>▼</button>
            </div>
            <div className="admin-faq-text">
              <b>{item.questionAr}</b>
              <p>{item.answerAr}</p>
              <small dir="ltr">{item.questionEn ? `EN: ${item.questionEn}` : "لا توجد نسخة إنجليزية (تُعرض العربية)"}</small>
            </div>
            <div className="admin-faq-actions">
              <button className="admin-secondary-button" type="button" onClick={() => { setDraft({ id: item.id, questionAr: item.questionAr, answerAr: item.answerAr, questionEn: item.questionEn, answerEn: item.answerEn, active: item.active }); setError(""); }}>تعديل</button>
              <button className="admin-secondary-button" type="button" onClick={() => void toggleActive(item)}>{item.active ? "إخفاء" : "إظهار"}</button>
              <button className="admin-secondary-button danger" type="button" onClick={() => void remove(item)}>حذف</button>
            </div>
          </li>
        ))}
        {items.length === 0 ? <li className="admin-empty-state">لا توجد أسئلة. أضف أول سؤال.</li> : null}
      </ol>

      {draft ? (
        <div className="admin-modal" role="presentation" onClick={() => setDraft(null)}>
          <form className="admin-modal-card" role="dialog" aria-modal="true" aria-label="سؤال" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-head">
              <div><h2>{draft.id ? "تعديل سؤال" : "إضافة سؤال"}</h2></div>
              <button type="button" aria-label="إغلاق" onClick={() => setDraft(null)}>×</button>
            </div>
            <div className="admin-faq-form">
              <label><span>السؤال (عربي)</span><input value={draft.questionAr} onChange={(event) => setDraft({ ...draft, questionAr: event.target.value })} maxLength={300} required /></label>
              <label><span>الجواب (عربي)</span><textarea rows={4} value={draft.answerAr} onChange={(event) => setDraft({ ...draft, answerAr: event.target.value })} maxLength={2000} required /></label>
              <label><span>Question (English) - اختياري</span><input dir="ltr" value={draft.questionEn} onChange={(event) => setDraft({ ...draft, questionEn: event.target.value })} maxLength={300} /></label>
              <label><span>Answer (English) - اختياري</span><textarea dir="ltr" rows={4} value={draft.answerEn} onChange={(event) => setDraft({ ...draft, answerEn: event.target.value })} maxLength={2000} /></label>
              <label className="admin-faq-check"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>ظاهر للزوار</span></label>
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
