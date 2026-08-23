"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Conversation, Tag } from "../types";
import { statusLabel } from "../utils/conversation";
import { useLanguage } from "../i18n";

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
  const { t, language } = useLanguage();
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
      setError(payload.error || t("تعذر حفظ الوسم", "Could not save the tag"));
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteTag(tag: Tag) {
    if (!window.confirm(t(`حذف وسم ${tag.name}؟`, `Delete tag ${tag.name}?`))) return;
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("إدارة الوسوم", "Manage Tags")}</h2>
          <span />
          <button className="btn soft" type="button" onClick={() => setFilterOpen((current) => !current)}>{t("تصفية", "Filter")}</button>
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة وسم", "Add Tag")}</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("الوسم يستخدم لتصنيف المحادثة حسب الحالة مثل شحن، شكوى، دفع، أو متابعة لاحقة.", "Tags are used to categorize conversations by status, such as shipping, complaint, payment, or follow-up.")}</p>
          {filterOpen ? (
            <div className="inline-filter">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث باسم الوسم أو الوصف...", "Search by tag name or description...")} />
              <button className="btn soft" type="button" onClick={() => setSearch("")}>{t("مسح", "Clear")}</button>
            </div>
          ) : null}
          <table>
            <thead><tr><th>{t("الوسم", "Tag")}</th><th>{t("اللون", "Color")}</th><th>{t("الوصف", "Description")}</th><th>{t("الاستخدام", "Usage")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {filteredTags.map((tag) => (
                <tr key={tag.id}>
                  <td><b>{tag.name}</b></td>
                  <td>
                    <span
                      className="tag-color-swatch"
                      role="img"
                      aria-label={t(`لون وسم ${tag.name}`, `Color of tag ${tag.name}`)}
                      style={{ background: tag.color }}
                    />
                  </td>
                  <td>{tag.description}</td>
                  <td>{getTagUsage(tag.name)} {t("محادثة", "conversation(s)")}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => setSelectedTag(tag)}>{t("عرض", "View")}</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(tag)}>{t("تعديل", "Edit")}</button>
                    <button className="btn danger" type="button" onClick={() => deleteTag(tag)}>{t("حذف", "Delete")}</button>
                  </td>
                </tr>
              ))}
              {!filteredTags.length ? (
                <tr><td colSpan={5}>{tags.length ? t("لا توجد وسوم مطابقة للبحث.", "No tags match your search.") : t("لا توجد وسوم بعد، اضغط \"إضافة وسم\" لإنشاء أول وسم.", "No tags yet — click \"Add Tag\" to create your first one.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ وسم", "Save Tag")} onSubmit={submitTag} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل وسم", "Edit Tag") : t("إضافة وسم", "Add Tag")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("اسم الوسم", "Tag Name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("لون الوسم", "Tag Color")}</span>
                <input type="color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
              </label>
              <label>
                <span>{t("نبذة عن الوسم", "Tag Description")}</span>
                <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {selectedTag ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedTag(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t(`محادثات وسم ${selectedTag.name}`, `Conversations for tag ${selectedTag.name}`)} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setSelectedTag(null)}>×</button>
              <h2>{t(`محادثات وسم ${selectedTag.name}`, `Conversations for tag ${selectedTag.name}`)}</h2>
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
                      <em>{statusLabel(conversation.status, language)}</em>
                    </div>
                  </button>
                ))}
                {!selectedTagConversations.length ? <p className="muted-copy">{t("لا توجد محادثات مرتبطة بهذا الوسم.", "No conversations are linked to this tag.")}</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setSelectedTag(null)}>{t("إغلاق", "Close")}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
