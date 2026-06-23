"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Conversation, Tag } from "../types";
import { statusLabel } from "../utils/conversation";

type TagFormState = {
  id?: string;
  name: string;
  color: string;
  description: string;
};

export default function TagsView({
  conversations,
  onOpenConversation,
  onRefreshData,
  tags
}: {
  conversations: Conversation[];
  onOpenConversation: (conversationId: string) => void;
  onRefreshData: () => Promise<void>;
  tags: Tag[];
}) {
  const emptyForm: TagFormState = { name: "", color: "#111827", description: "" };
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TagFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  const filteredTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tags;
    return tags.filter((tag) => (
      tag.name.toLowerCase().includes(query) ||
      tag.description.toLowerCase().includes(query)
    ));
  }, [search, tags]);

  const selectedTagConversations = selectedTag
    ? conversations.filter((conversation) => conversation.tags.includes(selectedTag.name))
    : [];

  const getTagUsage = (tagName: string) =>
    conversations.filter((conversation) => conversation.tags.includes(tagName)).length;

  function openCreateForm() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(tag: Tag) {
    setError("");
    setForm(tag);
    setFormOpen(true);
  }

  async function submitTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.id ? `/api/tags/${form.id}` : "/api/tags", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!payload.ok) {
      setError(payload.error || "تعذر حفظ الوسم");
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteTag(tag: Tag) {
    if (!window.confirm(`حذف وسم ${tag.name}؟`)) return;
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>إدارة الوسوم</h2>
          <span />
          <button className="btn soft" type="button" onClick={() => setFilterOpen((current) => !current)}>تصفية</button>
          <button className="btn primary" type="button" onClick={openCreateForm}>إضافة وسم</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">الوسم يستخدم لتصنيف المحادثة حسب الحالة مثل شحن، شكوى، دفع، أو متابعة لاحقة.</p>
          {filterOpen ? (
            <div className="inline-filter">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الوسم أو الوصف..." />
              <button className="btn soft" type="button" onClick={() => setSearch("")}>مسح</button>
            </div>
          ) : null}
          <table>
            <thead><tr><th>الوسم</th><th>اللون</th><th>الوصف</th><th>الاستخدام</th><th>إجراء</th></tr></thead>
            <tbody>
              {filteredTags.map((tag) => (
                <tr key={tag.id}>
                  <td><b>{tag.name}</b></td>
                  <td><input aria-label={`لون وسم ${tag.name}`} type="color" defaultValue={tag.color} /></td>
                  <td>{tag.description}</td>
                  <td>{getTagUsage(tag.name)} محادثة</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => setSelectedTag(tag)}>عرض</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(tag)}>تعديل</button>
                    <button className="btn danger" type="button" onClick={() => deleteTag(tag)}>حذف</button>
                  </td>
                </tr>
              ))}
              {!filteredTags.length ? (
                <tr><td colSpan={5}>لا توجد وسوم مطابقة للبحث.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ وسم" onSubmit={submitTag} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? "تعديل وسم" : "إضافة وسم"}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>اسم الوسم</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>لون الوسم</span>
                <input type="color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
              </label>
              <label>
                <span>نبذة عن الوسم</span>
                <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {selectedTag ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedTag(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={`محادثات وسم ${selectedTag.name}`} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setSelectedTag(null)}>×</button>
              <h2>محادثات وسم {selectedTag.name}</h2>
            </header>
            <div className="account-modal-body">
              <div className="member-list">
                {selectedTagConversations.map((conversation) => (
                  <button
                    className="member-card tag-conversation-card"
                    type="button"
                    key={conversation.id}
                    onClick={() => {
                      setSelectedTag(null);
                      onOpenConversation(conversation.id);
                    }}
                  >
                    <span className="avatar">{conversation.initial}</span>
                    <div>
                      <b>{conversation.customer}</b>
                      <span>{conversation.lastMessage}</span>
                    </div>
                    <div className="tag-conversation-meta">
                      <span>{conversation.assignee}</span>
                      <em>{statusLabel(conversation.status)}</em>
                    </div>
                  </button>
                ))}
                {!selectedTagConversations.length ? <p className="muted-copy">لا توجد محادثات مرتبطة بهذا الوسم.</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setSelectedTag(null)}>إغلاق</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
