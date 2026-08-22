"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import FilterButton from "../components/FilterButton";
import type {
  ChatPanel,
  ComposerMode,
  Conversation,
  ConversationChannel,
  ConversationFilter,
  MessageAttachment,
  MessageTemplate,
  QuickReply,
  Tag
} from "../types";
import { statusLabel } from "../utils/conversation";
import { ChannelIcon } from "./SettingsView";

type InboxViewProps = {
  activeConversation: Conversation;
  assignedOnly: boolean;
  assigneeOptions: string[];
  canChangeAssignee: boolean;
  canDeleteConversation: boolean;
  canDeleteAnyMessage: boolean;
  canReopenConversation: boolean;
  chatPanel: ChatPanel;
  composerMode: ComposerMode;
  counts: Record<ConversationFilter, number>;
  filter: ConversationFilter;
  message: string;
  mobileChatOpen: boolean;
  search: string;
  selectedTemplate: string;
  templates: MessageTemplate[];
  quickReplies: QuickReply[];
  currentUserName: string;
  tags: Tag[];
  visibleConversations: Conversation[];
  onChangeAssignee: (assignee: string) => void;
  onChangeChatPanel: (panel: ChatPanel) => void;
  onChangeComposerMode: (mode: ComposerMode) => void;
  onChangeFilter: (filter: ConversationFilter) => void;
  onChangeMessage: (message: string) => void;
  onChangeSearch: (search: string) => void;
  onChangeSelectedConversation: (conversationId: string) => void;
  onChangeSelectedTemplate: (templateName: string) => void;
  onChangeTags: (tags: string[]) => void | Promise<void>;
  onAssignConversation: (conversationId: string, assignee: string) => void | Promise<void>;
  onCloseConversation: () => void;
  onDeleteConversationById: (conversationId: string) => void | Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onMarkConversationUnread: (conversationId: string) => void | Promise<void>;
  onSend: (event: FormEvent<HTMLFormElement>, replyToMessageId?: string) => void | Promise<void>;
  onSendAttachment: (attachment: MessageAttachment) => void | Promise<void>;
  onSendCommentReply: (messageId: string, text: string) => void | Promise<void>;
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
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getAudioFileName(mimeType: string) {
  if (mimeType.includes("mp4")) return `voice-${Date.now()}.m4a`;
  if (mimeType.includes("webm")) return `voice-${Date.now()}.webm`;
  if (mimeType.includes("ogg")) return `voice-${Date.now()}.ogg`;
  return `voice-${Date.now()}`;
}

const quickEmojis = [
  "😀", "😄", "😂", "😊", "😍", "🥰", "👍", "👏",
  "🙏", "👌", "💪", "❤️", "🔥", "🎉", "✅", "⭐",
  "📌", "📞", "💬", "🕐", "🚚", "💳", "🧾", "✨"
];

const channelLabels: Record<ConversationChannel, string> = {
  whatsapp: "واتساب",
  instagram: "Instagram",
  x: "X",
  facebook: "فيسبوك",
  google_maps: "خرائط Google",
  website: "الموقع الإلكتروني",
  telegram: "تيليجرام",
  email: "البريد الإلكتروني",
  tiktok: "TikTok",
  sms: "رسائل SMS"
};

function getChannelLabel(conversation: Conversation) {
  return channelLabels[conversation.channel || "whatsapp"];
}

function getWaitBadge(conversation: Conversation) {
  if (conversation.status === "closed") return null;

  const lastMessage = conversation.messages.at(-1);
  if (!lastMessage || lastMessage.direction !== "in") return null;

  const referenceTime = lastMessage.createdAt || conversation.lastActivityAt;
  if (!referenceTime) return null;

  const elapsedTime = new Date(referenceTime).getTime();
  if (Number.isNaN(elapsedTime)) return null;

  const diffMinutes = Math.max(0, Math.floor((Date.now() - elapsedTime) / 60000));
  const tier = diffMinutes >= 120 ? "overdue" : diffMinutes >= 15 ? "warning" : "fresh";
  const label = diffMinutes < 60
    ? `${diffMinutes} د`
    : diffMinutes < 1440
      ? `${Math.floor(diffMinutes / 60)} س`
      : `${Math.floor(diffMinutes / 1440)} يوم`;

  return { tier, label };
}

function getConversationStartTime(conversation: Conversation) {
  return conversation.firstMessageTime || conversation.messages[0]?.time || "";
}

function getConversationLastTime(conversation: Conversation) {
  return conversation.lastMessageTime || conversation.messages.at(-1)?.time || "";
}

function getRelativeConversationTime(isoDate?: string) {
  if (!isoDate) return "";

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - targetDay) / 86400000);

  if (diffDays === 0) {
    return new Intl.DateTimeFormat("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Riyadh"
    }).format(date);
  }
  if (diffDays === 1) return "قبل يوم";
  if (diffDays < 7) return `قبل ${diffDays} أيام`;
  if (diffDays < 30) return `قبل ${Math.floor(diffDays / 7)} أسبوع`;
  if (diffDays < 365) return `قبل ${Math.floor(diffDays / 30)} شهر`;

  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Riyadh"
  }).format(date);
}

function getConversationTimeLabel(isoDate: string | undefined, fallbackTime: string) {
  const time = isoDate ? getRelativeConversationTime(isoDate) : fallbackTime;

  if (!time) return "";
  return time;
}

function isInstagramCommentMessage(channel: ConversationChannel, text: string, direction: string) {
  return channel === "instagram" && direction === "in" && text.startsWith("تعليق:");
}

function getMessagePreview(text: string) {
  const value = text.trim() || "رسالة";
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

// Email providers occasionally include transport metadata in the plain-text body.
// Keep the inbox focused on the actual message, including for records received
// before the email integration formatting was corrected.
function formatEmailContent(text: string) {
  return text
    .replace(/^-{2,}\s*Forwarded message\s*-{2,}[\s\S]*?^To:.*(?:\r?\n|$)/gim, "")
    .replace(/^[a-f0-9]{16,}$/gim, "")
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/gim, "")
    .replace(/\bOn .{0,300}?\bwrote:[\s\S]*$/i, "")
    // Gmail's Arabic-locale quoted-reply header, e.g. "في أحد، ١٦ أغسطس،
    // ٢٠٢٦ في ١٠:٠٦ م، كتب Name <email>:" followed by the quoted text.
    // \b doesn't work around Arabic letters in JS regex (they aren't \w),
    // so this omits it rather than silently failing to match.
    .replace(/في\s.{0,300}?كتب\s.{0,200}?<[^<>]+>\s*:[\s\S]*$/, "")
    .replace(/^>.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function InboxView({
  activeConversation,
  assignedOnly,
  assigneeOptions,
  canChangeAssignee,
  canDeleteConversation,
  canDeleteAnyMessage,
  canReopenConversation,
  chatPanel,
  composerMode,
  counts,
  filter,
  message,
  mobileChatOpen,
  search,
  selectedTemplate,
  templates,
  quickReplies,
  currentUserName,
  tags,
  visibleConversations,
  onChangeAssignee,
  onChangeChatPanel,
  onChangeComposerMode,
  onChangeFilter,
  onChangeMessage,
  onChangeSearch,
  onChangeSelectedConversation,
  onChangeSelectedTemplate,
  onChangeTags,
  onAssignConversation,
  onCloseConversation,
  onDeleteConversationById,
  onDeleteMessage,
  onMarkConversationUnread,
  onSend,
  onSendAttachment,
  onSendCommentReply,
  onSendTemplate,
  onSetMobileChatOpen
}: InboxViewProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [conversationMenu, setConversationMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [replyTargetId, setReplyTargetId] = useState("");
  const [commentReplyTarget, setCommentReplyTarget] = useState<string>("");
  const [commentReplyText, setCommentReplyText] = useState("");
  const reopenTemplates = templates.filter(
    (template) => template.status === "معتمد"
  );
  const isClosed = activeConversation.status === "closed";
  const hasActiveConversation = Boolean(activeConversation.id);
  const isComposerDisabled = !hasActiveConversation || activeConversation.windowExpired || isClosed;
  const quickReplyMatch = message.match(/(?:^|\s)(\/[^\s]*)$/);
  const quickReplyQuery = quickReplyMatch?.[1]?.toLowerCase() || "";
  const quickReplySuggestions = quickReplyQuery
    ? quickReplies
        .filter((reply) =>
          reply.shortcut.toLowerCase().startsWith(quickReplyQuery) ||
          reply.text.toLowerCase().includes(quickReplyQuery.slice(1))
        )
        .slice(0, 6)
    : [];
  const shouldShowQuickReplySuggestions = !isComposerDisabled && Boolean(quickReplyQuery) && quickReplySuggestions.length > 0;
  const canToggleConversation = hasActiveConversation && (!isClosed || canReopenConversation);
  const availableTags = tags.filter((tag) => !activeConversation.tags.includes(tag.name));
  const contextConversation = conversationMenu
    ? visibleConversations.find((conversation) => conversation.id === conversationMenu.conversationId)
    : null;
  const contextMessage = messageMenu
    ? activeConversation.messages.find((item) => item.id === messageMenu.messageId)
    : null;
  const replyTarget = replyTargetId
    ? activeConversation.messages.find((item) => item.id === replyTargetId)
    : null;

  useEffect(() => {
    if (!conversationMenu) return;

    const closeMenu = () => setConversationMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [conversationMenu]);

  useEffect(() => {
    if (!messageMenu) return;

    const closeMenu = () => setMessageMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [messageMenu]);

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

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await readFileAsDataUrl(file).catch(() => "");
    if (!dataUrl) {
      window.alert("تعذر قراءة المستند.");
      event.target.value = "";
      return;
    }

    await onSendAttachment({
      type: "document",
      url: dataUrl,
      name: file.name,
      mimeType: file.type || "application/octet-stream"
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
        window.alert("المتصفح يسجل بصيغة غير مدعومة. جرّب تحديث المتصفح.");
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

  function handleEmojiSelect(emoji: string) {
    onChangeMessage(`${message}${emoji}`);
    setIsEmojiPickerOpen(false);
  }

  function handleQuickReplySelect(reply: QuickReply) {
    if (quickReplyMatch) {
      onChangeMessage(`${message.slice(0, quickReplyMatch.index)}${quickReplyMatch[0].startsWith(" ") ? " " : ""}${reply.text}`);
    } else {
      onChangeMessage(reply.text);
    }
    fetch(`/api/quick-replies/${reply.id}/use`, { method: "POST" }).catch(() => {});
  }

  async function handleAddTag(tagName: string) {
    if (!tagName || activeConversation.tags.includes(tagName)) return;
    await onChangeTags([...activeConversation.tags, tagName]);
  }

  async function handleRemoveTag(tagName: string) {
    await onChangeTags(activeConversation.tags.filter((tag) => tag !== tagName));
  }

  function startMessageReply(messageId: string) {
    setMessageMenu(null);
    setReplyTargetId(messageId);
    onChangeComposerMode("reply");
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  }

  async function handleCommentReplySubmit(messageId: string) {
    const reply = commentReplyText.trim();
    if (!reply) return;

    await onSendCommentReply(messageId, reply);
    setCommentReplyTarget("");
    setCommentReplyText("");
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
            active={filter === "mine"}
            count={counts.mine}
            label="لي"
            onClick={() => onChangeFilter("mine")}
          />
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
            active={filter === "unread"}
            count={counts.unread}
            label="غير مقروء"
            onClick={() => onChangeFilter("unread")}
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
              onContextMenu={(event) => {
                event.preventDefault();
                setConversationMenu({
                  conversationId: conversation.id,
                  x: Math.max(12, Math.min(event.clientX, window.innerWidth - 252)),
                  y: Math.max(12, Math.min(event.clientY, window.innerHeight - 360))
                });
              }}
              onClick={() => {
                onChangeSelectedConversation(conversation.id);
                onChangeChatPanel("chat");
                onSetMobileChatOpen(true);
              }}
            >
              <span className="avatar">{conversation.initial}</span>
              <span className="conversation-copy">
                <em className={`channel-badge ${conversation.channel || "whatsapp"}`}>
                  <ChannelIcon id={conversation.channel || "whatsapp"} />
                  {getChannelLabel(conversation)}
                </em>
                <b>{conversation.customer}</b>
                <small>{formatEmailContent(conversation.lastMessage)}</small>
              </span>
              <span className="conversation-meta">
                {conversation.unread ? <strong>{conversation.unread}</strong> : null}
                {(() => {
                  const waitBadge = getWaitBadge(conversation);
                  return waitBadge ? (
                    <span className={`wait-badge tier-${waitBadge.tier}`}>
                      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      {waitBadge.label}
                    </span>
                  ) : null;
                })()}
                <span className="conversation-times">
                  {getConversationTimeLabel(conversation.lastMessageAt || conversation.lastActivityAt, getConversationLastTime(conversation)) ? (
                    <small>{getConversationTimeLabel(conversation.lastMessageAt || conversation.lastActivityAt, getConversationLastTime(conversation))}</small>
                  ) : null}
                  {getConversationTimeLabel(conversation.firstMessageAt, getConversationStartTime(conversation)) ? (
                    <small>{getConversationTimeLabel(conversation.firstMessageAt, getConversationStartTime(conversation))}</small>
                  ) : null}
                </span>
                <em className={conversation.status}>{statusLabel(conversation.status)}</em>
                <small>{conversation.assignee}</small>
              </span>
            </button>
          ))}
          {!visibleConversations.length ? (
            <p className="muted-copy">لا توجد محادثات مطابقة للبحث الحالي.</p>
          ) : null}
          {contextConversation ? (
            <div
              className="conversation-context-menu"
              style={{ left: conversationMenu?.x, top: conversationMenu?.y }}
              role="menu"
              aria-label="خيارات المحادثة"
              onClick={(event) => event.stopPropagation()}
            >
              <b>{contextConversation.customer}</b>
              <button
                type="button"
                onClick={() => {
                  setConversationMenu(null);
                  void onMarkConversationUnread(contextConversation.id);
                }}
              >
                تعيين كغير مقروء
              </button>
              {canChangeAssignee ? (
                <div className="context-menu-section">
                  <span>إسناد إلى</span>
                  {assigneeOptions.map((assignee) => (
                    <button
                      key={assignee}
                      type="button"
                      onClick={() => {
                        setConversationMenu(null);
                        void onAssignConversation(contextConversation.id, assignee);
                      }}
                    >
                      {assignee}
                    </button>
                  ))}
                </div>
              ) : null}
              {canDeleteConversation ? (
                <button
                  className="danger"
                  type="button"
                  onClick={() => {
                    setConversationMenu(null);
                    void onDeleteConversationById(contextConversation.id);
                  }}
                >
                  حذف المحادثة
                </button>
              ) : null}
            </div>
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
            <small className={`channel-badge ${activeConversation.channel || "whatsapp"}`}>
              <ChannelIcon id={activeConversation.channel || "whatsapp"} />
              {getChannelLabel(activeConversation)}
            </small>
            <b>{activeConversation.customer}</b>
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
                <div
                  className={`message-bubble ${item.direction}`}
                  key={item.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMessageMenu({
                      messageId: item.id,
                      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 230)),
                      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 150))
                    });
                  }}
                >
                  {item.text !== "تم حذف هذه الرسالة" ? (
                    <button
                      className="message-reply-action"
                      type="button"
                      aria-label="رد على الرسالة"
                      title="رد على الرسالة"
                      onClick={() => startMessageReply(item.id)}
                    >
                      ↩
                    </button>
                  ) : null}
                  {item.direction === "out" &&
                  item.text !== "تم حذف هذه الرسالة" &&
                  (canDeleteAnyMessage || item.author === currentUserName) ? (
                    <button className="message-delete" type="button" aria-label="حذف الرسالة" title="حذف الرسالة" onClick={() => onDeleteMessage(item.id)} />
                  ) : null}
                  {item.direction === "note" ? <b>ملاحظة خاصة، {item.author || currentUserName}</b> : null}
                  {item.replyTo ? (
                    <span className="message-reply-preview">
                      <b>رد على {item.replyTo.author || "رسالة مرتبطة"}</b>
                      <span>{getMessagePreview(item.replyTo.text || "رسالة")}</span>
                    </span>
                  ) : null}
                  {item.attachment && item.text !== "تم حذف هذه الرسالة" ? (
                    item.attachment.type === "image" || item.attachment.type === "sticker" ? (
                      <>
                        {/* Provider and user attachments can be data/blob URLs, which next/image does not support. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className={item.attachment.type === "sticker" ? "message-attachment-sticker" : "message-attachment-image"}
                          src={item.attachment.url}
                          alt={item.attachment.name}
                        />
                      </>
                    ) : item.attachment.type === "document" ? (
                      <a className="message-attachment-document" href={item.attachment.url} download={item.attachment.name}>
                        <span aria-hidden="true">📄</span>
                        <b>{item.attachment.name}</b>
                        <small>فتح المستند</small>
                      </a>
                    ) : (
                      <>
                        <audio className="message-attachment-audio" controls>
                          <source src={item.attachment.url} type={item.attachment.mimeType || "audio/ogg"} />
                          <track kind="captions" />
                        </audio>
                        <a className="message-attachment-link" href={item.attachment.url} download={item.attachment.name}>
                          فتح الصوت
                        </a>
                      </>
                    )
                  ) : null}
                  {item.attachment?.type === "audio" && item.text !== "تم حذف هذه الرسالة" ? (
                    <span>{`${item.text}: ${item.attachment.name}`}</span>
                  ) : item.attachment && (item.text === "صورة" || item.text === "ملصق وارد" || item.text === "مستند" || item.text === item.attachment.name) ? null : (
                    <span>{formatEmailContent(item.text)}</span>
                  )}
                  {item.source && activeConversation.channel !== "email" ? (
                    item.source.url ? (
                      <a className="message-source-card" href={item.source.url} target="_blank" rel="noreferrer">
                        <b>{item.source.label || "البوست المرتبط بالتعليق"}</b>
                        <small>فتح البوست</small>
                      </a>
                    ) : (
                      <span className="message-source-card">
                        <b>{item.source.label || "البوست المرتبط بالتعليق"}</b>
                        {item.source.id ? <small>{item.source.id}</small> : null}
                      </span>
                    )
                  ) : null}
                  {isInstagramCommentMessage(activeConversation.channel, item.text, item.direction) ? (
                    commentReplyTarget === item.id ? (
                      <div className="comment-reply-box">
                        <textarea
                          autoFocus
                          placeholder="اكتب ردك على التعليق"
                          value={commentReplyText}
                          onChange={(event) => setCommentReplyText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                            event.preventDefault();
                            void handleCommentReplySubmit(item.id);
                          }}
                        />
                        <div>
                          <button type="button" onClick={() => void handleCommentReplySubmit(item.id)}>
                            إرسال الرد
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCommentReplyTarget("");
                              setCommentReplyText("");
                            }}
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="comment-reply-trigger"
                        type="button"
                        onClick={() => {
                          setCommentReplyTarget(item.id);
                          setCommentReplyText("");
                        }}
                      >
                        رد على التعليق
                      </button>
                    )
                  ) : null}
                  <small>{item.time}</small>
                </div>
              ))}
            </div>
            {contextMessage ? (
              <div
                className="message-context-menu"
                style={{ left: messageMenu?.x, top: messageMenu?.y }}
                role="menu"
                aria-label="خيارات الرسالة"
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" onClick={() => startMessageReply(contextMessage.id)}>
                  رد على الرسالة
                </button>
              </div>
            ) : null}
            {activeConversation.windowExpired ? (
              <div className="window-notice">
                <b>انتهت نافذة الرد خلال 24 ساعة</b>
                <span>
                  مر أكثر من 24 ساعة على آخر رسالة من العميل. لا يمكن إرسال رد عادي الآن، اختر قالب WhatsApp معتمد لإعادة فتح المحادثة.
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
            ) : (
              <>
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
                {replyTarget ? (
                  <div className="composer-reply-preview">
                    <div>
                      <b>رد على {replyTarget.direction === "out" ? replyTarget.author || "أنت" : activeConversation.customer}</b>
                      <span>{getMessagePreview(replyTarget.text)}</span>
                    </div>
                    <button type="button" aria-label="إلغاء الرد" title="إلغاء الرد" onClick={() => setReplyTargetId("")}>
                      ×
                    </button>
                  </div>
                ) : null}
                <form
                  className="composer"
                  onSubmit={async (event) => {
                    await onSend(event, replyTarget?.id);
                    setReplyTargetId("");
                  }}
                >
                  <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageChange} />
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip"
                    hidden
                    onChange={handleDocumentChange}
                  />
                  <div className="emoji-picker-wrap">
                    <button
                      className="attachment-button"
                      disabled={isComposerDisabled}
                      aria-label="إضافة إيموجي"
                      title="إضافة إيموجي"
                      type="button"
                      onClick={() => setIsEmojiPickerOpen((isOpen) => !isOpen)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2" /></svg>
                    </button>
                    {isEmojiPickerOpen && !isComposerDisabled ? (
                      <div className="emoji-picker" role="menu" aria-label="الإيموجيز">
                        {quickEmojis.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => handleEmojiSelect(emoji)}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="attachment-button"
                    disabled={isComposerDisabled}
                    aria-label="إرفاق صورة"
                    title="إرفاق صورة"
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3" /></svg>
                  </button>
                  <button
                    className="attachment-button"
                    disabled={isComposerDisabled}
                    aria-label="إرفاق مستند"
                    title="إرفاق مستند"
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 12 5.5-5.5a3 3 0 0 1 4.2 4.2L11 18.4a5 5 0 0 1-7.1-7.1l8-8" /></svg>
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
                  <div className="quick-reply-picker-wrap composer-message-wrap">
                    {shouldShowQuickReplySuggestions ? (
                      <div className="quick-reply-picker" role="menu" aria-label="الردود السريعة">
                        {quickReplySuggestions.map((reply) => (
                          <button key={reply.id} type="button" onClick={() => handleQuickReplySelect(reply)}>
                            <b>{reply.shortcut}</b>
                            <span>{reply.text}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <textarea
                      ref={messageInputRef}
                      rows={1}
                      disabled={isComposerDisabled}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && shouldShowQuickReplySuggestions && quickReplySuggestions[0]) {
                          event.preventDefault();
                          handleQuickReplySelect(quickReplySuggestions[0]);
                          return;
                        }

                        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }}
                      onChange={(event) => onChangeMessage(event.target.value)}
                      placeholder={isClosed ? "المحادثة مغلقة" : "اكتب رسالتك هنا"}
                      value={message}
                    />
                  </div>
                  <button className="btn primary" disabled={isComposerDisabled} type="submit">
                    إرسال
                  </button>
                </form>
              </>
            )}
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
                  <dt>القناة</dt>
                  <dd>{getChannelLabel(activeConversation)}</dd>
                </div>
                <div>
                  <dt>رقم الجوال</dt>
                  <dd>{activeConversation.phone}</dd>
                </div>
                <div>
                  <dt>الوسوم</dt>
                  <dd className="profile-tags-field">
                    <select
                      aria-label="اختيار وسم"
                      disabled={!hasActiveConversation || !availableTags.length}
                      value=""
                      onChange={(event) => {
                        void handleAddTag(event.target.value);
                      }}
                    >
                      <option value="">{availableTags.length ? "اختر وسم" : "لا توجد وسوم متاحة"}</option>
                      {availableTags.map((tag) => (
                        <option key={tag.id} value={tag.name}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <div className="profile-tag-list">
                      {activeConversation.tags.length ? (
                        activeConversation.tags.map((tagName) => (
                          <button key={tagName} type="button" onClick={() => void handleRemoveTag(tagName)}>
                            {tagName}
                            <span aria-hidden="true">×</span>
                          </button>
                        ))
                      ) : (
                        <span>لا توجد وسوم</span>
                      )}
                    </div>
                  </dd>
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
