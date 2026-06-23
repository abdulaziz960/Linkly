"use client";

import { FormEvent, useMemo, useState } from "react";
import type { QuickReply, Team } from "../types";

type ReplyForm = {
  id?: string;
  shortcut: string;
  text: string;
  team: string;
  usage: number;
};

export default function QuickRepliesView({
  onRefreshData,
  quickReplies,
  teams
}: {
  onRefreshData: () => Promise<void>;
  quickReplies: QuickReply[];
  teams: Team[];
}) {
  const emptyForm = useMemo<ReplyForm>(() => ({ shortcut: "مثال: /", text: "", team: teams[0]?.name || "الدعم", usage: 0 }), [teams]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ReplyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredQuickReplies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return quickReplies;

    return quickReplies.filter((reply) => (
      reply.shortcut.toLowerCase().includes(query) ||
      reply.text.toLowerCase().includes(query) ||
      reply.team.toLowerCase().includes(query)
    ));
  }, [quickReplies, search]);

  function openForm(reply?: QuickReply) {
    setForm(reply ? { ...reply } : emptyForm);
    setFormOpen(true);
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await fetch(form.id ? `/api/quick-replies/${form.id}` : "/api/quick-replies", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteReply(reply: QuickReply) {
    if (!window.confirm(`حذف ${reply.shortcut}؟`)) return;
    await fetch(`/api/quick-replies/${reply.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head"><h2>الردود السريعة</h2><span /><button className="btn primary" type="button" onClick={() => openForm()}>إضافة رد سريع</button></div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">الردود السريعة تساعد الفريق على إرسال إجابات جاهزة ومتكررة داخل المحادثات، مثل رابط التتبع أو طلب رقم الطلب أو تحويل العميل للموظف المختص.</p>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاختصار، النص، أو الفريق..." />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>مسح</button>
          </div>
          <table>
            <thead><tr><th>الاختصار</th><th>النص</th><th>الفريق</th><th>الاستخدام</th><th>إجراء</th></tr></thead>
            <tbody>
              {filteredQuickReplies.map((reply) => (
                <tr key={reply.id}>
                  <td>{reply.shortcut}</td><td>{reply.text}</td><td>{reply.team}</td><td>{reply.usage}</td>
                  <td className="row-actions"><button className="btn soft" type="button" onClick={() => openForm(reply)}>تعديل</button><button className="btn danger" type="button" onClick={() => deleteReply(reply)}>حذف</button></td>
                </tr>
              ))}
              {!filteredQuickReplies.length ? (
                <tr><td colSpan={5}>لا توجد ردود سريعة مطابقة للبحث.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ رد سريع" onSubmit={submitReply} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? "تعديل رد سريع" : "إضافة رد سريع"}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="split-fields">
                <label><span>الاختصار</span><input value={form.shortcut} onChange={(event) => setForm((current) => ({ ...current, shortcut: event.target.value }))} required /></label>
                <label><span>الفريق</span><select value={form.team} onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}>{teams.map((team) => <option key={team.id}>{team.name}</option>)}</select></label>
              </div>
              <label><span>نص الرد</span><textarea rows={5} value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} required /></label>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
