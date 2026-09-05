"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { KnowledgeBaseEntry } from "../types";
import { useLanguage } from "../i18n";

type EntryMode = "qa" | "text";

type FormState = {
  id?: string;
  mode: EntryMode;
  question: string;
  answer: string;
};

const emptyForm: FormState = { mode: "qa", question: "", answer: "" };

export default function KnowledgeBaseView() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadEntries() {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge-base");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setEntries(body.data ?? []);
    } catch {
      // Non-critical - the list simply stays as-is on a transient failure.
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEntries();
  }, []);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => entry.question.toLowerCase().includes(query) || entry.answer.toLowerCase().includes(query));
  }, [search, entries]);

  function openCreateForm() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(entry: KnowledgeBaseEntry) {
    setError("");
    setForm({ id: entry.id, mode: entry.question ? "qa" : "text", question: entry.question, answer: entry.answer });
    setFormOpen(true);
  }

  function handleTextFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, answer: String(reader.result || "") }));
    reader.readAsText(file);
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.id ? `/api/knowledge-base/${form.id}` : "/api/knowledge-base", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: form.mode === "qa" ? form.question : "",
        answer: form.answer
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || t("تعذر حفظ العنصر", "Could not save the entry"));
      setSaving(false);
      return;
    }

    await loadEntries();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteEntry(entry: KnowledgeBaseEntry) {
    if (!window.confirm(t("حذف هذا العنصر من قاعدة المعرفة؟", "Delete this Knowledge Base entry?"))) return;
    await fetch(`/api/knowledge-base/${entry.id}`, { method: "DELETE" });
    await loadEntries();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("قاعدة المعرفة", "Knowledge Base")}</h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة عنصر", "Add entry")}</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("أضف أسئلة شائعة وأجوبتها، أو الصق نصاً/ارفع ملف .txt - أضف خطوة \"رد من قاعدة المعرفة\" في الرد الآلي لتفعيلها. لا يدعم رفع ملفات PDF أو Word حالياً.", "Add FAQ questions and answers, or paste text / upload a .txt file - add a \"Knowledge Base reply\" step in the auto-reply builder to activate it. PDF and Word uploads aren't supported yet.")}</p>
          <div className="inline-filter">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث في الأسئلة والأجوبة...", "Search questions and answers...")} />
            <button className="btn soft" type="button" onClick={() => setSearch("")}>{t("مسح", "Clear")}</button>
          </div>
          <table>
            <thead><tr><th>{t("السؤال", "Question")}</th><th>{t("الإجابة", "Answer")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.question || <em className="muted-copy">{t("[نص/مستند]", "[Text/document]")}</em>}</td>
                  <td className="truncate-cell">{entry.answer}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => openEditForm(entry)}>{t("تعديل", "Edit")}</button>
                    <button className="btn danger" type="button" onClick={() => deleteEntry(entry)}>{t("حذف", "Delete")}</button>
                  </td>
                </tr>
              ))}
              {!filteredEntries.length ? (
                <tr><td colSpan={3}>{loading ? t("جاري التحميل...", "Loading...") : entries.length ? t("لا توجد عناصر مطابقة للبحث.", "No entries match your search.") : t("لا توجد عناصر بعد، اضغط \"إضافة عنصر\" لإنشاء أول واحد.", "No entries yet — click \"Add entry\" to create your first one.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ عنصر قاعدة المعرفة", "Save Knowledge Base entry")} onSubmit={submitEntry} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل عنصر", "Edit entry") : t("إضافة عنصر", "Add entry")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="report-periods">
                <button type="button" className={form.mode === "qa" ? "active" : ""} onClick={() => setForm((current) => ({ ...current, mode: "qa" }))}>{t("سؤال وجواب", "Question & answer")}</button>
                <button type="button" className={form.mode === "text" ? "active" : ""} onClick={() => setForm((current) => ({ ...current, mode: "text" }))}>{t("نص أو مستند", "Text or document")}</button>
              </div>

              {form.mode === "qa" ? (
                <label>
                  <span>{t("السؤال", "Question")}</span>
                  <input value={form.question} onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))} placeholder={t("مثال: كم سعر الاشتراك الشهري؟", "Example: How much is the monthly subscription?")} required />
                </label>
              ) : null}

              <label>
                <span>{form.mode === "qa" ? t("الإجابة", "Answer") : t("النص", "Text")}</span>
                <textarea
                  value={form.answer}
                  onChange={(event) => setForm((current) => ({ ...current, answer: event.target.value }))}
                  placeholder={form.mode === "qa" ? t("اكتب الإجابة التي سيرسلها البوت", "Write the answer the bot should send") : t("الصق نصاً هنا، أو ارفع ملف .txt أدناه", "Paste text here, or upload a .txt file below")}
                  rows={6}
                  required
                />
              </label>

              {form.mode === "text" ? (
                <label>
                  <span>{t("رفع ملف .txt (اختياري)", "Upload a .txt file (optional)")}</span>
                  <input type="file" accept=".txt,text/plain" onChange={handleTextFile} />
                  <small className="field-hint">{t("PDF و Word غير مدعومين حالياً.", "PDF and Word are not supported yet.")}</small>
                </label>
              ) : null}

              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving || !form.answer.trim() || (form.mode === "qa" && !form.question.trim())}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
