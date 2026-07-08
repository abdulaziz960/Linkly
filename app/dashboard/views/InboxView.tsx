"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import FilterButton from "../components/FilterButton";
import type { ChatPanel, ComposerMode, Conversation, ConversationFilter, MessageAttachment, MessageTemplate } from "../types";
import { statusLabel } from "../utils/conversation";

type InboxViewProps = {
  activeConversation: Conversation;
  assignedOnly: boolean;
  assigneeOptions: string[];
  canChangeAssignee: boolean;
  canDeleteAnyMessage: boolean;
  canReopenConversation: boolean;
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
  currentUserName: string;
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
  onSendAttachment: (attachment: MessageAttachment) => void | Promise<void>;
  onSendTemplate: () => void;
  onSetMobileChatOpen: (isOpen: boolean) => void;
};

function readFileAsDataUrl(file: File | Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getSupportedAudioMimeType() {
  const types = ["audio/ogg;codecs=opus", "audio/mp4", "audio/mpeg", "audio/ogg"];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getAudioFileName(mimeType: string) {
  if (mimeType.includes("mp4")) return `voice-${Date.now()}.m4a`;
  if (mimeType.includes("mpeg")) return `voice-${Date.now()}.mp3`;
  if (mimeType.includes("ogg")) return `voice-${Date.now()}.ogg`;
  return `voice-${Date.now()}`;
}

function formatConversationAge(conversation: Conversation) {
  if (!conversation.lastActivityAt) {
    return conversation.messages.at(-1)?.time || "";
  }

  const activityTime = new Date(conversation.lastActivityAt).getTime();
  if (Number.isNaN(activityTime)) return "";

  const diffMinutes = Math.max(0, Math.floor((Date.now() - activityTime) / 60000));
  if (diffMinutes < 1) return "الآن";
  if (diffMinutes < 60) return `منذ ${diffMinutes} د`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} س`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `منذ ${diffDays} يوم`;

  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Riyadh"
  }).format(new Date(activityTime));
}

export default function InboxView({
  activeConversation,
  assignedOnly,
  assigneeOptions,
  canChangeAssignee,
  canDeleteAnyMessage,
  canReopenConversation,
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
  currentUserName,
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
  onSendAttachment,
  onSendTemplate,
  onSetMobileChatOpen
}: InboxViewProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const reopenTemplates = templates.filter(
    (template) =>
      template.status === "معتمد" &&
      template.type !== "خدمة" &&
      (template.category === "MARKETING" || template.type === "تسويق")
  );
  const isClosed = activeConversation.status === "closed";
  const hasActiveConversation = Boolean(activeConversation.id);
  const isComposerDisabled = !hasActiveConversation || activeConversation.windowExpired || isClosed;
  const canToggleConversation = hasActiveConversation && (!isClosed || canReopenConversation);

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await readFileAsDataUrl(file).catch(() => "");
    if (!dataUrl) {
      window.alert("تعذر قراءة الصورة.");
      event.target.value = "";
      return;
    }

    await onSendAttachment({
      type: "image",
      url: dataUrl,
      name: file.name,
      mimeType: file.type
    });
    event.target.value = "";
  }

  async function handleAudioToggle() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert("تسجيل الصوت غير مدعوم في هذا المتصفح.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        window.alert("المتصفح يسجل بصيغة غير مدعومة في واتساب. جرّب Chrome أو Safari محدّث.");
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType });
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);

        if (!audioBlob.size) return;
        const dataUrl = await readFileAsDataUrl(audioBlob).catch(() => "");
        if (!dataUrl) {
          window.alert("تعذر تجهيز التسجيل الصوتي.");
          return;
        }

        await onSendAttachment({
          type: "audio",
          url: dataUrl,
          name: getAudioFileName(audioBlob.type),
          mimeType: audioBlob.type
        });
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
      window.alert("تعذر تشغيل الميكروفون. تأكد من السماح للمتصفح باستخدام الميكروفون.");
    }
  }

  return (
    <section className={`inbox-grid ${mobileChatOpen ? "chat-open" : ""}`}>
      <aside className="conversation-column">
        <div className="column-head">
          <h1>المحادثات</h1>
        </div>
        <div className="conversation-tabs">
          {!assignedOnly ? (
            <FilterButton active={filter === "all"} count={counts.all} label="الكل" onClick={() => onChangeFilter("all")} />
          ) : null}
          <FilterButton
            active={assignedOnly || filter === "assigned"}
            count={counts.assigned}
            label="مسندة"
            onClick={() => onChangeFilter("assigned")}
          />
          {!assignedOnly ? (
            <FilterButton
              active={filter === "unassigned"}
              count={counts.unassigned}
              label="غير مسندة"
              onClick={() => onChangeFilter("unassigned")}
            />
          ) : null}
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
                {formatConversationAge(conversation) ? <small className="conversation-age">{formatConversationAge(conversation)}</small> : null}
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
        {!hasActiveConversation ? (
          <div className="conversation-empty-state">
            <div className="conversation-empty-icon" aria-hidden="true">
              <span />
              <i />
            </div>
            <p>لا يوجد محادثة حاليا، الرجاء اختيار محادثة من قائمة المحادثات</p>
          </div>
        ) : (
          <>
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
            {canChangeAssignee ? (
              <select value={activeConversation.assignee} onChange={(event) => onChangeAssignee(event.target.value)}>
                {assigneeOptions.map((member) => (
                  <option key={member}>{member}</option>
                ))}
              </select>
            ) : (
              <span className="readonly-assignee">{activeConversation.assignee}</span>
            )}
          </label>
          <button
            className={isClosed ? "btn soft" : "btn danger"}
            disabled={!canToggleConversation}
            title={!canToggleConversation ? "فتح المحادثة متاح للمالك أو المشرف فقط" : undefined}
            type="button"
            onClick={onCloseConversation}
          >
            {isClosed ? (canReopenConversation ? "فتح المحادثة" : "مغلقة") : "إغلاق"}
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
                  {item.direction === "out" &&
                  item.text !== "تم حذف هذه الرسالة" &&
                  (canDeleteAnyMessage || item.author === currentUserName) ? (
                    <button className="message-delete" type="button" aria-label="حذف الرسالة" title="حذف الرسالة" onClick={() => onDeleteMessage(item.id)} />
                  ) : null}
                  {item.direction === "note" ? <b>ملاحظة خاصة، {item.author || currentUserName}</b> : null}
                  {item.attachment && item.text !== "تم حذف هذه الرسالة" ? (
                    item.attachment.type === "image" ? (
                      <img className="message-attachment-image" src={item.attachment.url} alt={item.attachment.name} />
                    ) : (
                      <audio className="message-attachment-audio" controls src={item.attachment.url}>
                        <track kind="captions" />
                      </audio>
                    )
                  ) : null}
                  {item.attachment && (item.text === "صورة" || item.text === "تسجيل صوتي") ? null : <span>{item.text}</span>}
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
                  <select
                    value={reopenTemplates.some((template) => template.name === selectedTemplate) ? selectedTemplate : reopenTemplates[0]?.name || ""}
                    disabled={!reopenTemplates.length}
                    onChange={(event) => onChangeSelectedTemplate(event.target.value)}
                  >
                    {reopenTemplates.length ? reopenTemplates.map((template) => (
                      <option key={template.name} value={template.name}>
                        {template.name}
                      </option>
                    )) : <option value="">لا توجد قوالب تسويقية معتمدة</option>}
                  </select>
                  <button className="btn primary" type="button" disabled={!reopenTemplates.length} onClick={onSendTemplate}>
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
              <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageChange} />
              <button
                className="attachment-button"
                disabled={isComposerDisabled}
                aria-label="إرفاق صورة"
                title="إرفاق صورة"
                type="button"
                onClick={() => imageInputRef.current?.click()}
              >
                +
              </button>
              <button
                className={`attachment-button ${isRecording ? "recording" : ""}`}
                disabled={isComposerDisabled}
                aria-label={isRecording ? "إيقاف التسجيل" : "تسجيل صوت"}
                title={isRecording ? "إيقاف التسجيل" : "تسجيل صوت"}
                type="button"
                onClick={handleAudioToggle}
              >
                {isRecording ? (
                  <span aria-hidden="true" className="stop-icon" />
                ) : (
                  <svg aria-hidden="true" className="mic-icon" viewBox="0 0 24 24">
                    <path d="M12 14c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5c0 1.7 1.3 3 3 3Z" />
                    <path d="M17 10v1a5 5 0 0 1-10 0v-1" />
                    <path d="M12 16v4" />
                    <path d="M8 20h8" />
                  </svg>
                )}
              </button>
              <textarea
                disabled={isComposerDisabled}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                onChange={(event) => onChangeMessage(event.target.value)}
                placeholder={
                  isClosed
                    ? "المحادثة مغلقة"
                    : activeConversation.windowExpired
                      ? "أرسل قالب أولاً حتى يرد العميل"
                      : "اكتب رسالتك هنا"
                }
                value={message}
              />
              <button className="btn primary" disabled={isComposerDisabled} type="submit">
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
          </>
        )}
      </section>
    </section>
  );
}
