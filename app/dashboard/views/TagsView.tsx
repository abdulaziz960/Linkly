"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Conversation, Tag } from "../types";
import { statusLabel } from "../utils/conversation";
import { useLanguage } from "../i18n";
import { EditIcon, ListIcon } from "../components/ActionIcons";
import { BarList } from "../components/MiniCharts";

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

  const taggedConversations = conversations.filter((conversation) => conversation.tags.length).length;
  const usageCounts = tags.map((tag) => ({ tag, usage: getTagUsage(tag.name) }));
  const maxUsage = Math.max(0, ...usageCounts.map((item) => item.usage));
  const topTag = maxUsage > 0 ? usageCounts.find((item) => item.usage === maxUsage)?.tag : undefined;
  const usageBars = usageCounts.filter((item) => item.usage > 0).sort((a, b) => b.usage - a.usage).slice(0, 8).map((item) => ({ label: item.tag.name, value: item.usage }));

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

  return (
    <section className="page-stack">
      <div className="camp-hero">
        <div className="camp-hero-text">
          <small>{t("الوسوم", "TAGS")}</small>
          <h1>{t("إدارة الوسوم", "Manage Tags")}</h1>
          <p>{t("الوسم يستخدم لتصنيف المحادثة حسب الحالة مثل شحن، شكوى، دفع، أو متابعة لاحقة. اضغط على أي وسم لعرض محادثاته.", "Tags categorize conversations, e.g. shipping, complaint, payment or follow-up. Select a tag to see its conversations.")}</p>
          <div className="camp-hero-chips"><span>{tags.length.toLocaleString("en-US")} {t("وسم", "tags")}</span><span>{taggedConversations.toLocaleString("en-US")} {t("محادثة موسومة", "tagged conversations")}</span></div>
        </div>
        <label className="camp-hero-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث باسم الوسم أو الوصف...", "Search by tag name or description...")} aria-label={t("بحث في الوسوم", "Search tags")} /></label>
        <button className="camp-hero-new" type="button" aria-label={t("إضافة وسم", "Add Tag")} onClick={openCreateForm}>＋ {t("إضافة وسم", "Add Tag")}</button>
      </div>

      <div className="seg-kpis">
        <div className="seg-kpi seg-kpi-b"><span>{t("عدد الوسوم", "Tags")}</span><b>{tags.length.toLocaleString("en-US")}</b></div>
        <div className="seg-kpi seg-kpi-good"><span>{t("محادثات موسومة", "Tagged conversations")}</span><b>{taggedConversations.toLocaleString("en-US")}</b><small>{conversations.length ? Math.round((taggedConversations / conversations.length) * 100) : 0}%</small></div>
        <div className="seg-kpi seg-kpi-warn"><span>{t("وسوم غير مستخدمة", "Unused tags")}</span><b>{tags.filter((tag) => getTagUsage(tag.name) === 0).length.toLocaleString("en-US")}</b></div>
        <div className="seg-kpi seg-kpi-unsub"><span>{t("أكثر وسم استخدامًا", "Most used tag")}</span><b className="seg-kpi-text">{topTag ? topTag.name : "-"}</b>{topTag ? <small>{getTagUsage(topTag.name).toLocaleString("en-US")} {t("محادثة", "conversations")}</small> : null}</div>
      </div>

      {tags.length && usageBars.length ? (
        <div className="panel">
          <div className="panel-head"><h2>{t("استخدام الوسوم", "Tag usage")}</h2></div>
          <div className="panel-body"><BarList items={usageBars} /></div>
        </div>
      ) : null}

      <div className="tag-cards">
        {filteredTags.map((tag) => {
          const usage = getTagUsage(tag.name);
          return (
            <div key={tag.id} className="tag-card" style={{ ["--tag" as string]: tag.color }}>
              <button type="button" className="tag-card-main" onClick={() => setSelectedTag(tag)} aria-label={t(`عرض محادثات وسم ${tag.name}`, `View conversations of tag ${tag.name}`)}>
                <span className="tag-card-top"><b>{tag.name}</b><em className="contact-tag">{usage.toLocaleString("en-US")} {t("محادثة", "conv.")}</em></span>
                {tag.description ? <small>{tag.description}</small> : <small className="muted-copy">{t("بدون وصف", "No description")}</small>}
                <span className="tag-card-bar"><i style={{ width: `${maxUsage ? (usage / maxUsage) * 100 : 0}%` }} /></span>
              </button>
              <span className="tag-card-actions">
                <button className="campaign-icon-btn" type="button" title={t("عرض المحادثات", "View conversations")} aria-label={t("عرض المحادثات", "View conversations")} onClick={() => setSelectedTag(tag)}>{ListIcon}</button>
                <button className="campaign-icon-btn" type="button" title={t("تعديل", "Edit")} aria-label={t("تعديل", "Edit")} onClick={() => openEditForm(tag)}>{EditIcon}</button>
              </span>
            </div>
          );
        })}
        {!filteredTags.length ? <p className="muted-copy">{tags.length ? t("لا توجد وسوم مطابقة للبحث.", "No tags match your search.") : t("لا توجد وسوم بعد، اضغط \"إضافة وسم\" لإنشاء أول وسم.", "No tags yet. Press \"Add Tag\" to create your first one.")}</p> : null}
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ وسم", "Save Tag")} onSubmit={submitTag} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
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
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setSelectedTag(null)}>×</button>
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
              <button className="btn soft close-red" type="button" onClick={() => setSelectedTag(null)}>{t("إغلاق", "Close")}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
