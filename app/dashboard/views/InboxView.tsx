"use client";

import { FormEvent } from "react";
import FilterButton from "../components/FilterButton";
import type { ChatPanel, ComposerMode, Conversation, ConversationFilter, MessageTemplate } from "../types";
import { statusLabel } from "../utils/conversation";

type InboxViewProps = {
  activeConversation: Conversation;
  assigneeOptions: string[];
  chatPanel: ChatPanel;
  composerMode: ComposerMode;
  conversations: Conversation[];
  counts: Record<ConversationFilter, number>;
  filter: ConversationFilter;
  message: string;
  mobileChatOpen: boolean;
  search: string;
  selectedTemplate: string;
  templates: MessageTemplate[];
  visibleConversations: Conversation[];
  onChangeAssignee: (assignee: string) => void;
  onChangeChatPanel: (panel: ChatPanel) => void;
  onChangeComposerMode: (mode: ComposerMode) => void;
  onChangeFilter: (filter: ConversationFilter) => void;
  onChangeMessage: (message: string) => void;
  onChangeSearch: (search: string) => void;
  onChangeSelectedConversation: (conversationId: string) => void;
  onChangeSelectedTemplate: (templateName: string) => void;
  onCloseConversation: () => void;
  onDeleteMessage: (messageId: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onSendTemplate: () => void;
  onSetMobileChatOpen: (isOpen: boolean) => void;
};

export default function InboxView({
  activeConversation,
  assigneeOptions,
  chatPanel,
  composerMode,
  conversations,
  counts,
  filter,
  message,
  mobileChatOpen,
  search,
  selectedTemplate,
  templates,
  visibleConversations,
  onChangeAssignee,
  onChangeChatPanel,
  onChangeComposerMode,
  onChangeFilter,
  onChangeMessage,
  onChangeSearch,
  onChangeSelectedConversation,
  onChangeSelectedTemplate,
  onCloseConversation,
  onDeleteMessage,
  onSend,
  onSendTemplate,
  onSetMobileChatOpen
}: InboxViewProps) {
  return (
    <section className={`inbox-grid ${mobileChatOpen ? "chat-open" : ""}`}>
      <aside className="conversation-column">
        <div className="column-head">
          <h1>المحادثات</h1>
        </div>
        <div className="conversation-tabs">
          <FilterButton active={filter === "all"} count={counts.all} label="الكل" onClick={() => onChangeFilter("all")} />
          <FilterButton
            active={filter === "assigned"}
            count={counts.assigned}
            label="مسندة"
            onClick={() => onChangeFilter("assigned")}
          />
          <FilterButton
            active={filter === "unassigned"}
            count={counts.unassigned}
            label="غير مسندة"
            onClick={() => onChangeFilter("unassigned")}
          />
          <FilterButton
            active={filter === "closed"}
            count={counts.closed}
            label="مغلقة"
            onClick={() => onChangeFilter("closed")}
          />
        </div>
        <div className="search-box">
          <input value={search} onChange={(event) => onChangeSearch(event.target.value)} placeholder="بحث باسم العميل أو الرقم" />
        </div>
        <div className="conversation-list">
          {visibleConversations.map((conversation) => (
            <button
              className={`conversation-card ${activeConversation.id === conversation.id ? "active" : ""}`}
              key={conversation.id}
              type="button"
              onClick={() => {
                onChangeSelectedConversation(conversation.id);
                onChangeChatPanel("chat");
                onSetMobileChatOpen(true);
              }}
            >
              <span className="avatar">{conversation.initial}</span>
              <span className="conversation-copy">
                <b>{conversation.customer}</b>
                <small>{conversation.lastMessage}</small>
              </span>
              <span className="conversation-meta">
                {conversation.unread ? <strong>{conversation.unread}</strong> : null}
                <em className={conversation.status}>{statusLabel(conversation.status)}</em>
                <small>{conversation.assignee}</small>
              </span>
            </button>
          ))}
          {!visibleConversations.length ? (
            <p className="muted-copy">لا توجد محادثات مطابقة للبحث الحالي.</p>
          ) : null}
        </div>
      </aside>

      <section className="chat-column">
        <div className="chat-head">
          <button className="mobile-back" type="button" onClick={() => onSetMobileChatOpen(false)}>
            رجوع
          </button>
          <span className="avatar">{activeConversation.initial}</span>
          <button className="chat-customer" type="button" onClick={() => onChangeChatPanel("profile")}>
            {activeConversation.customer}
          </button>
          <label>
            مسند إلى
            <select value={activeConversation.assignee} onChange={(event) => onChangeAssignee(event.target.value)}>
              {assigneeOptions.map((member) => (
                <option key={member}>{member}</option>
              ))}
            </select>
          </label>
          <button className={activeConversation.status === "closed" ? "btn soft" : "btn danger"} type="button" onClick={onCloseConversation}>
            {activeConversation.status === "closed" ? "فتح المحادثة" : "إغلاق"}
          </button>
        </div>

        <div className="chat-tabs">
          <button className={chatPanel === "chat" ? "active" : ""} type="button" onClick={() => onChangeChatPanel("chat")}>
            المحادثة
          </button>
          <button className={chatPanel === "profile" ? "active" : ""} type="button" onClick={() => onChangeChatPanel("profile")}>
            ملف العميل
          </button>
        </div>

        {chatPanel === "chat" ? (
          <div className="chat-panel">
            <div className="messages">
              {activeConversation.messages.map((item) => (
                <div className={`message-bubble ${item.direction}`} key={item.id}>
                  {item.direction === "out" && item.text !== "تم حذف هذه الرسالة" ? (
                    <button className="message-delete" type="button" onClick={() => onDeleteMessage(item.id)}>
                      حذف
                    </button>
                  ) : null}
                  {item.direction === "note" ? <b>ملاحظة خاصة، عبدالعزيز الكيالي</b> : null}
                  <span>{item.text}</span>
                  <small>{item.time}</small>
                </div>
              ))}
            </div>
            {activeConversation.windowExpired ? (
              <div className="window-notice">
                <b>انتهت نافذة الرد خلال 24 ساعة</b>
                <span>
                  يمكنك فقط الرد على هذه المحادثة باستخدام رسالة قالب بسبب قيد نافذة الـ ٢٤ ساعة ،اختر قالب WhatsApp معتمد
                  لإعادة فتح المحادثة.
                </span>
                <div>
                  <select value={selectedTemplate} onChange={(event) => onChangeSelectedTemplate(event.target.value)}>
                    {templates.map((template) => (
                      <option key={template.name} value={template.name}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary" type="button" onClick={onSendTemplate}>
                    إرسال قالب
                  </button>
                </div>
              </div>
            ) : null}
            <div className="composer-modes">
              <button className={composerMode === "reply" ? "active" : ""} type="button" onClick={() => onChangeComposerMode("reply")}>
                إضافة رد
              </button>
              <button
                className={composerMode === "note" ? "active note" : "note"}
                type="button"
                onClick={() => onChangeComposerMode("note")}
              >
                كتابة ملاحظة خاصة
              </button>
            </div>
            <form className="composer" onSubmit={onSend}>
              <textarea
                disabled={activeConversation.windowExpired}
                onChange={(event) => onChangeMessage(event.target.value)}
                placeholder={activeConversation.windowExpired ? "أرسل قالب أولاً حتى يرد العميل" : "اكتب رسالتك هنا"}
                value={message}
              />
              <button className="btn primary" disabled={activeConversation.windowExpired} type="submit">
                إرسال
              </button>
            </form>
          </div>
        ) : (
          <div className="profile-panel">
            <div className="profile-card">
              <h2>بيانات العميل</h2>
              <dl>
                <div>
                  <dt>الاسم</dt>
                  <dd>{activeConversation.customer}</dd>
                </div>
                <div>
                  <dt>رقم الجوال</dt>
                  <dd>{activeConversation.phone}</dd>
                </div>
                <div>
                  <dt>الوسوم</dt>
                  <dd>{activeConversation.tags.join("، ")}</dd>
                </div>
              </dl>
            </div>
            <div className="profile-card">
              <h2>سجل العميل</h2>
              <p>آخر محادثة: {activeConversation.lastMessage}</p>
              <p>الموظف المسؤول: {activeConversation.assignee}</p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
