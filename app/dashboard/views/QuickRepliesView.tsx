"use client";

import { FormEvent, useMemo, useState } from "react";
import type { QuickReply, Team } from "../types";
import { useLanguage } from "../i18n";

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
  const { t } = useLanguage();
  const emptyForm = useMemo<ReplyForm>(() => ({ shortcut: "", text: "", team: teams[0]?.name || "", usage: 0 }), [teams]);
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
    if (!window.confirm(t(`حذف ${reply.shortcut}؟`, `Delete ${reply.shortcut}?`))) return;
    await fetch(`/api/quick-replies/${reply.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head"><h2>{t("الردود السريعة", "Quick Replies")}</h2><span /><button className="btn primary" type="button" onClick={() => openForm()}>{t("إضافة رد سريع", "Add quick reply")}</button></div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("الردود السريعة تساعد الفريق على إرسال إجابات جاهزة ومتكررة داخل المحادثات، مثل رابط التتبع أو طلب رقم الطلب أو تحويل العميل للموظف المختص.", "Quick replies help the team send ready-made, repeated answers inside conversations, such as a tracking link, requesting an order number, or transferring the customer to the right employee.")}</p>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("بحث بالاختصار، النص، أو الفريق...", "Search by shortcut, text, or team...")} />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>{t("مسح", "Clear")}</button>
          </div>
          <table>
            <thead><tr><th>{t("الاختصار", "Shortcut")}</th><th>{t("النص", "Text")}</th><th>{t("الفريق", "Team")}</th><th>{t("الاستخدام", "Usage")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {filteredQuickReplies.map((reply) => (
                <tr key={reply.id}>
                  <td>{reply.shortcut}</td><td>{reply.text}</td><td>{reply.team}</td><td>{reply.usage}</td>
                  <td className="row-actions"><button className="btn soft" type="button" onClick={() => openForm(reply)}>{t("تعديل", "Edit")}</button><button className="btn danger" type="button" onClick={() => deleteReply(reply)}>{t("حذف", "Delete")}</button></td>
                </tr>
              ))}
              {!filteredQuickReplies.length ? (
                <tr><td colSpan={5}>{t("لا توجد ردود سريعة مطابقة للبحث.", "No quick replies match your search.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ رد سريع", "Save quick reply")} onSubmit={submitReply} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل رد سريع", "Edit quick reply") : t("إضافة رد سريع", "Add quick reply")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="split-fields">
                <label><span>{t("الاختصار", "Shortcut")}</span><input value={form.shortcut} onChange={(event) => setForm((current) => ({ ...current, shortcut: event.target.value }))} required /></label>
                <label>
                  <span>{t("الفريق", "Team")}</span>
                  <select value={form.team} onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}>
                    {!teams.length ? <option value="">{t("لا توجد فرق بعد", "No teams yet")}</option> : null}
                    {teams.map((team) => <option key={team.id}>{team.name}</option>)}
                  </select>
                </label>
              </div>
              <label><span>{t("نص الرد", "Reply text")}</span><textarea rows={5} value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} required /></label>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
