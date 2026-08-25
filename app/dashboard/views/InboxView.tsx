"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import FilterButton from "../components/FilterButton";
import CustomSelect from "../../components/CustomSelect";
import type {
  ChatPanel,
  ComposerMode,
  Conversation,
  ConversationChannel,
  ConversationChannelFilter,
  ConversationFilter,
  MessageAttachment,
  MessageTemplate,
  QuickReply,
  Tag
} from "../types";
import { statusLabel } from "../utils/conversation";
import { ChannelIcon } from "./SettingsView";
import { isDeletedMessageText, useLanguage } from "../i18n";

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
  selectedChannel: ConversationChannelFilter;
  tags: Tag[];
  visibleConversations: Conversation[];
  onChangeAssignee: (assignee: string) => void;
  onChangeChatPanel: (panel: ChatPanel) => void;
  onChangeComposerMode: (mode: ComposerMode) => void;
  onChangeFilter: (filter: ConversationFilter) => void;
  onChangeMessage: (message: string) => void;
  onChangeSearch: (search: string) => void;
  onChangeChannel: (channel: ConversationChannelFilter) => void;
  onChangeSelectedConversation: (conversationId: string) => void;
  onChangeSelectedTemplate: (templateName: string) => void;
  onChangeTags: (tags: string[]) => void | Promise<void>;
  onAssignConversation: (conversationId: string, assignee: string) => void | Promise<void>;
  onCloseConversation: () => void;
  onDeleteConversationById: (conversationId: string) => void | Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onMarkConversationUnread: (conversationId: string) => void | Promise<void>;
  onToggleConversationStatus: (conversationId: string) => void | Promise<void>;
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

const channelLabelsAr: Record<ConversationChannel, string> = {
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

const channelLabelsEn: Record<ConversationChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  google_maps: "Google Maps",
  website: "Website",
  telegram: "Telegram",
  email: "Email",
  tiktok: "TikTok",
  sms: "SMS"
};

function getChannelLabel(conversation: Conversation, language: "ar" | "en") {
  const labels = language === "en" ? channelLabelsEn : channelLabelsAr;
  return labels[conversation.channel || "whatsapp"];
}

function getWaitBadge(conversation: Conversation, language: "ar" | "en") {
  if (conversation.status === "closed") return null;

  const lastMessage = conversation.messages.at(-1);
  if (!lastMessage || lastMessage.direction !== "in") return null;

  const referenceTime = lastMessage.createdAt || conversation.lastActivityAt;
  if (!referenceTime) return null;

  const elapsedTime = new Date(referenceTime).getTime();
  if (Number.isNaN(elapsedTime)) return null;

  const diffMinutes = Math.max(0, Math.floor((Date.now() - elapsedTime) / 60000));
  const tier = diffMinutes >= 120 ? "overdue" : diffMinutes >= 15 ? "warning" : "fresh";
  const label = language === "en"
    ? (diffMinutes < 60 ? `${diffMinutes}m` : diffMinutes < 1440 ? `${Math.floor(diffMinutes / 60)}h` : `${Math.floor(diffMinutes / 1440)}d`)
    : (diffMinutes < 60 ? `${diffMinutes} د` : diffMinutes < 1440 ? `${Math.floor(diffMinutes / 60)} س` : `${Math.floor(diffMinutes / 1440)} يوم`);

  return { tier, label };
}

function getConversationStartTime(conversation: Conversation) {
  return conversation.firstMessageTime || conversation.messages[0]?.time || "";
}

function getConversationLastTime(conversation: Conversation) {
  return conversation.lastMessageTime || conversation.messages.at(-1)?.time || "";
}

function getRelativeConversationTime(isoDate: string | undefined, language: "ar" | "en") {
  if (!isoDate) return "";

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - targetDay) / 86400000);
  const locale = language === "en" ? "en-US" : "ar-SA";

  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Riyadh",
      numberingSystem: "latn",
      calendar: "gregory"
    }).format(date);
  }
  if (language === "en") {
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month ago`;
  } else {
    if (diffDays === 1) return "قبل يوم";
    if (diffDays < 7) return `قبل ${diffDays} أيام`;
    if (diffDays < 30) return `قبل ${Math.floor(diffDays / 7)} أسبوع`;
    if (diffDays < 365) return `قبل ${Math.floor(diffDays / 30)} شهر`;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(date);
}

function getConversationTimeLabel(isoDate: string | undefined, fallbackTime: string, language: "ar" | "en") {
  const time = isoDate ? getRelativeConversationTime(isoDate, language) : fallbackTime;

  if (!time) return "";
  return time;
}

function isInstagramCommentMessage(channel: ConversationChannel, text: string, direction: string) {
  return channel === "instagram" && direction === "in" && text.startsWith("تعليق:");
}

function getMessagePreview(text: string, t: (ar: string, en: string) => string) {
  const value = text.trim() || t("رسالة", "message");
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

function getSafeConversationPreview(text: string, t: (ar: string, en: string) => string) {
  const cleaned = formatEmailContent(text)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, t("[رابط]", "[link]"))
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, (email) => {
      const domain = email.split("@")[1] || "";
      return domain ? `•••@${domain}` : "•••";
    })
    .replace(/(?:\+?\d[\d\s()-]{7,}\d)/g, (phone) => `${phone.slice(0, 2)}••••${phone.slice(-2)}`)
    .replace(/\s+/g, " ")
    .trim();

  const value = cleaned || t("رسالة بدون معاينة", "Message preview unavailable");
  return value.length > 150 ? `${value.slice(0, 150).trim()}…` : value;
}

type InboxPriority = "urgent" | "high" | "normal";
type SavedInboxView = {
  channel: ConversationChannelFilter;
  assignee: string;
  tag: string;
  priority: "all" | InboxPriority;
  date: "all" | "today" | "week" | "month";
  sort: "newest" | "oldest" | "waiting" | "priority";
};

function getConversationPriority(conversation: Conversation): InboxPriority {
  const wait = getWaitBadge(conversation, "en");
  if (wait?.tier === "overdue") return "urgent";
  if (wait?.tier === "warning" || (conversation.unread || 0) >= 3) return "high";
  return "normal";
}

function getActivityTimestamp(conversation: Conversation) {
  const value = conversation.lastMessageAt || conversation.lastActivityAt || conversation.firstMessageAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
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
  selectedChannel,
  tags,
  visibleConversations,
  onChangeAssignee,
  onChangeChatPanel,
  onChangeComposerMode,
  onChangeFilter,
  onChangeMessage,
  onChangeSearch,
  onChangeChannel,
  onChangeSelectedConversation,
  onChangeSelectedTemplate,
  onChangeTags,
  onAssignConversation,
  onCloseConversation,
  onDeleteConversationById,
  onDeleteMessage,
  onMarkConversationUnread,
  onToggleConversationStatus,
  onSend,
  onSendAttachment,
  onSendCommentReply,
  onSendTemplate,
  onSetMobileChatOpen
}: InboxViewProps) {
  const { t, language } = useLanguage();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [conversationMenu, setConversationMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [replyTargetId, setReplyTargetId] = useState("");
  const [commentReplyTarget, setCommentReplyTarget] = useState<string>("");
  const [commentReplyText, setCommentReplyText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreTabsOpen, setMoreTabsOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | InboxPriority>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "waiting" | "priority">("newest");
  const [listLimit, setListLimit] = useState(60);
  const [savedView, setSavedView] = useState<SavedInboxView | null>(null);
  const [filterReferenceTime] = useState(() => Date.now());
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
  const activeAdvancedFilterCount = [selectedChannel !== "all", assigneeFilter !== "all", tagFilter !== "all", priorityFilter !== "all", dateFilter !== "all"].filter(Boolean).length;
  const displayedConversations = useMemo(() => {
    const priorityRank: Record<InboxPriority, number> = { urgent: 3, high: 2, normal: 1 };
    const filtered = visibleConversations.filter((conversation) => {
      if (assigneeFilter !== "all" && conversation.assignee !== assigneeFilter) return false;
      if (tagFilter !== "all" && !conversation.tags.includes(tagFilter)) return false;
      if (priorityFilter !== "all" && getConversationPriority(conversation) !== priorityFilter) return false;
      if (dateFilter !== "all") {
        const timestamp = getActivityTimestamp(conversation);
        const maxAge = dateFilter === "today" ? 86400000 : dateFilter === "week" ? 7 * 86400000 : 30 * 86400000;
        if (!timestamp || filterReferenceTime - timestamp > maxAge) return false;
      }
      return true;
    });

    return filtered.sort((first, second) => {
      if (sortMode === "oldest") return getActivityTimestamp(first) - getActivityTimestamp(second);
      if (sortMode === "priority") return priorityRank[getConversationPriority(second)] - priorityRank[getConversationPriority(first)] || getActivityTimestamp(second) - getActivityTimestamp(first);
      if (sortMode === "waiting") {
        const firstIncoming = first.messages.at(-1)?.direction === "in" ? getActivityTimestamp(first) : Number.MAX_SAFE_INTEGER;
        const secondIncoming = second.messages.at(-1)?.direction === "in" ? getActivityTimestamp(second) : Number.MAX_SAFE_INTEGER;
        return firstIncoming - secondIncoming;
      }
      return getActivityTimestamp(second) - getActivityTimestamp(first);
    });
  }, [assigneeFilter, dateFilter, filterReferenceTime, priorityFilter, sortMode, tagFilter, visibleConversations]);
  const pagedConversations = displayedConversations.slice(0, listLimit);

  useEffect(() => {
    setListLimit(60);
  }, [assigneeFilter, dateFilter, filter, priorityFilter, search, selectedChannel, sortMode, tagFilter]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("linkly:inbox-saved-view");
      if (stored) setSavedView(JSON.parse(stored) as SavedInboxView);
    } catch {
      // A blocked or malformed local preference should never block the inbox.
    }
  }, []);

  useEffect(() => {
    const handleInboxShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      const currentIndex = pagedConversations.findIndex((conversation) => conversation.id === activeConversation.id);
      if ((event.key.toLowerCase() === "j" || event.key === "ArrowDown") && pagedConversations.length) {
        event.preventDefault();
        const next = pagedConversations[Math.min(pagedConversations.length - 1, Math.max(0, currentIndex + 1))];
        if (next) onChangeSelectedConversation(next.id);
      } else if ((event.key.toLowerCase() === "k" || event.key === "ArrowUp") && pagedConversations.length) {
        event.preventDefault();
        const previous = pagedConversations[Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)];
        if (previous) onChangeSelectedConversation(previous.id);
      } else if (event.key.toLowerCase() === "u" && activeConversation.id) {
        event.preventDefault();
        void onMarkConversationUnread(activeConversation.id);
      } else if (event.key.toLowerCase() === "e" && activeConversation.id) {
        event.preventDefault();
        void onToggleConversationStatus(activeConversation.id);
      }
    };

    window.addEventListener("keydown", handleInboxShortcut);
    return () => window.removeEventListener("keydown", handleInboxShortcut);
  }, [activeConversation.id, onChangeSelectedConversation, onMarkConversationUnread, onToggleConversationStatus, pagedConversations]);

  function resetAdvancedFilters() {
    setAssigneeFilter("all");
    setTagFilter("all");
    setPriorityFilter("all");
    setDateFilter("all");
    setSortMode("newest");
    onChangeChannel("all");
  }

  function saveCurrentView() {
    const nextView: SavedInboxView = { channel: selectedChannel, assignee: assigneeFilter, tag: tagFilter, priority: priorityFilter, date: dateFilter, sort: sortMode };
    setSavedView(nextView);
    try {
      window.localStorage.setItem("linkly:inbox-saved-view", JSON.stringify(nextView));
    } catch {
      // Keep the current session useful even if browser storage is unavailable.
    }
  }

  function applySavedView() {
    if (!savedView) return;
    onChangeChannel(savedView.channel);
    setAssigneeFilter(savedView.assignee);
    setTagFilter(savedView.tag);
    setPriorityFilter(savedView.priority);
    setDateFilter(savedView.date);
    setSortMode(savedView.sort);
  }

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };
    scrollToBottom();
    // Attachments (images, etc.) load asynchronously and grow the container
    // after the initial scroll, so scroll again once they're likely in.
    const timeout = window.setTimeout(scrollToBottom, 300);
    return () => window.clearTimeout(timeout);
  }, [activeConversation.id, activeConversation.messages.length]);

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
      window.alert(t("تعذر قراءة الصورة.", "Could not read the image."));
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
      window.alert(t("تعذر قراءة المستند.", "Could not read the document."));
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
      window.alert(t("تسجيل الصوت غير مدعوم في هذا المتصفح.", "Audio recording is not supported in this browser."));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        window.alert(t("المتصفح يسجل بصيغة غير مدعومة. جرّب تحديث المتصفح.", "Your browser recorded an unsupported format. Try updating your browser."));
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
          window.alert(t("تعذر تجهيز التسجيل الصوتي.", "Could not prepare the audio recording."));
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
      window.alert(t("تعذر تشغيل الميكروفون. تأكد من السماح للمتصفح باستخدام الميكروفون.", "Could not access the microphone. Make sure the browser has microphone permission."));
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
          <div className="inbox-title">
            <span>{t("صندوق الوارد", "Inbox")}</span>
            <small>{t(`${displayedConversations.length} محادثة ضمن العرض الحالي`, `${displayedConversations.length} conversations in this view`)}</small>
          </div>
        </div>
        <div className="conversation-tabs" role="tablist" aria-label={t("حالات المحادثات", "Conversation states")}>
          {!assignedOnly ? (
            <FilterButton active={filter === "all"} count={counts.all} label={t("الكل", "All")} onClick={() => onChangeFilter("all")} />
          ) : null}
          {!assignedOnly ? (
            <FilterButton
              active={filter === "mine"}
              count={counts.mine}
              label={t("محادثاتي", "Mine")}
              onClick={() => onChangeFilter("mine")}
            />
          ) : null}
          {!assignedOnly ? (
            <FilterButton
              active={filter === "unassigned"}
              count={counts.unassigned}
              label={t("غير مسندة", "Unassigned")}
              onClick={() => onChangeFilter("unassigned")}
            />
          ) : null}
          {!assignedOnly ? (
            <button
              type="button"
              className={`conversation-tabs-toggle ${moreTabsOpen ? "open" : ""}`}
              aria-expanded={moreTabsOpen}
              aria-label={t("عرض بقية الحالات", "Show more states")}
              onClick={() => setMoreTabsOpen((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
            </button>
          ) : null}
          {assignedOnly || moreTabsOpen || filter === "assigned" ? (
            <FilterButton
              active={filter === "assigned"}
              count={counts.assigned}
              label={t("مسندة", "Assigned")}
              onClick={() => onChangeFilter("assigned")}
            />
          ) : null}
          {assignedOnly || moreTabsOpen || filter === "unread" ? (
            <FilterButton
              active={filter === "unread"}
              count={counts.unread}
              label={t("غير مقروء", "Unread")}
              onClick={() => onChangeFilter("unread")}
            />
          ) : null}
          {assignedOnly || moreTabsOpen || filter === "closed" ? (
            <FilterButton
              active={filter === "closed"}
              count={counts.closed}
              label={t("مغلقة", "Closed")}
              onClick={() => onChangeFilter("closed")}
            />
          ) : null}
        </div>
        <div className="inbox-search-tools">
          <label className="search-box">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => onChangeSearch(event.target.value)}
              placeholder={t("ابحث بالاسم، الجوال، البريد أو نص الرسالة", "Search name, phone, email, or message")}
              aria-label={t("البحث في المحادثات", "Search conversations")}
            />
            {search ? <button type="button" aria-label={t("مسح البحث", "Clear search")} onClick={() => onChangeSearch("")}>×</button> : null}
          </label>
          <div className="inbox-tool-row">
            <button className={`inbox-filter-toggle ${filtersOpen ? "active" : ""}`} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
              <span aria-hidden="true">☷</span>{t("الفلاتر", "Filters")}{activeAdvancedFilterCount ? <b>{activeAdvancedFilterCount}</b> : null}
            </button>
            <label className="inbox-sort">
              <span className="sr-only">{t("ترتيب المحادثات", "Sort conversations")}</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option value="newest">{t("الأحدث أولًا", "Newest first")}</option>
                <option value="oldest">{t("الأقدم أولًا", "Oldest first")}</option>
                <option value="waiting">{t("الأطول انتظارًا", "Longest waiting")}</option>
                <option value="priority">{t("حسب الأولوية", "By priority")}</option>
              </select>
            </label>
            {(activeAdvancedFilterCount || sortMode !== "newest") ? <button className="inbox-reset" type="button" onClick={resetAdvancedFilters}>{t("إعادة تعيين", "Reset")}</button> : null}
          </div>
          {filtersOpen ? (
            <div className="inbox-advanced-filters">
              <label><span>{t("القناة", "Channel")}</span><select value={selectedChannel} onChange={(event) => onChangeChannel(event.target.value as ConversationChannelFilter)}><option value="all">{t("كل القنوات", "All channels")}</option>{Object.keys(channelLabelsAr).map((channel) => <option key={channel} value={channel}>{language === "en" ? channelLabelsEn[channel as ConversationChannel] : channelLabelsAr[channel as ConversationChannel]}</option>)}</select></label>
              <label><span>{t("الموظف", "Assignee")}</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">{t("كل الموظفين", "All assignees")}</option>{assigneeOptions.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}</select></label>
              <label><span>{t("الوسم", "Tag")}</span><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">{t("كل الوسوم", "All tags")}</option>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label>
              <label><span>{t("الأولوية", "Priority")}</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}><option value="all">{t("كل الأولويات", "All priorities")}</option><option value="urgent">{t("عاجلة", "Urgent")}</option><option value="high">{t("مرتفعة", "High")}</option><option value="normal">{t("عادية", "Normal")}</option></select></label>
              <label><span>{t("آخر نشاط", "Last activity")}</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}><option value="all">{t("كل التواريخ", "Any time")}</option><option value="today">{t("آخر 24 ساعة", "Last 24 hours")}</option><option value="week">{t("آخر 7 أيام", "Last 7 days")}</option><option value="month">{t("آخر 30 يومًا", "Last 30 days")}</option></select></label>
              <div className="inbox-saved-view-actions">
                <button type="button" onClick={saveCurrentView}>{t("☆ حفظ الفلاتر كعرض", "☆ Save filters as view")}</button>
                {savedView ? <button className="saved" type="button" onClick={applySavedView}>{t("تطبيق العرض المحفوظ", "Apply saved view")}</button> : null}
              </div>
            </div>
          ) : null}
          <small className="inbox-count-note">{t("العدادات لحظية وتتأثر بالقناة المختارة، بينما القائمة تتأثر بجميع الفلاتر.", "Counts are live and channel-aware; the list reflects all filters.")}</small>
          <small className="inbox-shortcuts" aria-label={t("اختصارات لوحة المفاتيح", "Keyboard shortcuts")}>{t("/ بحث · J/K تنقّل · U غير مقروء · E إغلاق أو فتح", "/ search · J/K navigate · U unread · E close or reopen")}</small>
        </div>
        <div className="conversation-list" aria-live="polite">
          {pagedConversations.map((conversation) => {
            const priority = getConversationPriority(conversation);
            const safePreview = isDeletedMessageText(conversation.lastMessage) ? t("تم حذف هذه الرسالة", "This message was deleted") : getSafeConversationPreview(conversation.lastMessage, t);
            const timeSource = conversation.lastMessageAt || conversation.lastActivityAt;
            const exactDate = timeSource ? new Date(timeSource) : null;
            const exactTime = exactDate && !Number.isNaN(exactDate.getTime()) ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(exactDate) : "";
            return (
            <button
              className={`conversation-card channel-${conversation.channel || "whatsapp"} priority-${priority} ${conversation.unread ? "unread" : "read"} ${activeConversation.id === conversation.id ? "active" : ""}`}
              key={conversation.id}
              type="button"
              aria-current={activeConversation.id === conversation.id ? "true" : undefined}
              aria-label={`${conversation.customer}، ${getChannelLabel(conversation, language)}، ${statusLabel(conversation.status, language)}${conversation.unread ? `، ${conversation.unread} ${t("غير مقروء", "unread")}` : ""}`}
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
                <span className="conversation-card-title"><b>{conversation.customer}</b><em className={`channel-badge ${conversation.channel || "whatsapp"}`} title={getChannelLabel(conversation, language)}><ChannelIcon id={conversation.channel || "whatsapp"} /><span>{getChannelLabel(conversation, language)}</span></em></span>
                <small title={safePreview}>{safePreview}</small>
                <span className="conversation-card-foot"><em className={`priority-pill ${priority}`}>{priority === "urgent" ? t("عاجلة", "Urgent") : priority === "high" ? t("مرتفعة", "High") : t("عادية", "Normal")}</em><span>{conversation.assignee || t("غير مسندة", "Unassigned")}</span><em className={`status-pill ${conversation.status}`}>{statusLabel(conversation.status, language)}</em></span>
              </span>
              <span className="conversation-meta">
                {conversation.unread ? <strong>{conversation.unread}</strong> : null}
                {(() => {
                  const waitBadge = getWaitBadge(conversation, language);
                  return waitBadge ? (
                    <span className={`wait-badge tier-${waitBadge.tier}`}>
                      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      {waitBadge.label}
                    </span>
                  ) : null;
                })()}
                <span className="conversation-times">
                  {getConversationTimeLabel(conversation.lastMessageAt || conversation.lastActivityAt, getConversationLastTime(conversation), language) ? (
                    <small title={exactTime}>{getConversationTimeLabel(conversation.lastMessageAt || conversation.lastActivityAt, getConversationLastTime(conversation), language)}</small>
                  ) : null}
                  {getConversationTimeLabel(conversation.firstMessageAt, getConversationStartTime(conversation), language) ? (
                    <small>{getConversationTimeLabel(conversation.firstMessageAt, getConversationStartTime(conversation), language)}</small>
                  ) : null}
                </span>
              </span>
            </button>
            );
          })}
          {!displayedConversations.length ? (
            <div className="conversation-list-empty"><span aria-hidden="true">⌕</span><b>{t("لا توجد نتائج مطابقة", "No matching conversations")}</b><small>{t("غيّر كلمات البحث أو أعد تعيين الفلاتر.", "Change the search or reset filters.")}</small><button type="button" onClick={resetAdvancedFilters}>{t("إعادة تعيين الفلاتر", "Reset filters")}</button></div>
          ) : null}
          {displayedConversations.length > listLimit ? <button className="conversation-load-more" type="button" onClick={() => setListLimit((current) => current + 60)}>{t(`عرض 60 محادثة إضافية (${displayedConversations.length - listLimit} متبقية)`, `Load 60 more (${displayedConversations.length - listLimit} remaining)`)}</button> : null}
          {contextConversation ? (
            <div
              className="conversation-context-menu"
              style={{ left: conversationMenu?.x, top: conversationMenu?.y }}
              role="menu"
              aria-label={t("خيارات المحادثة", "Conversation options")}
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
                {t("تعيين كغير مقروء", "Mark as unread")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConversationMenu(null);
                  void onToggleConversationStatus(contextConversation.id);
                }}
              >
                {contextConversation.status === "closed" ? t("إعادة فتح المحادثة", "Reopen conversation") : t("إغلاق المحادثة", "Close conversation")}
              </button>
              {canChangeAssignee ? (
                <div className="context-menu-section">
                  <span>{t("إسناد إلى", "Assign to")}</span>
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
                  {t("حذف المحادثة", "Delete conversation")}
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
            <h2>{t("اختر محادثة للبدء", "Choose a conversation")}</h2>
            <p>{t("اختر محادثة من القائمة لعرض الرسائل وبيانات العميل وإجراءات الإسناد.", "Select a conversation to view messages, customer details, and assignment actions.")}</p>
            <div className="conversation-empty-actions">
              <button type="button" onClick={() => searchInputRef.current?.focus()}>{t("البحث عن عميل", "Find a customer")}</button>
              {!assignedOnly ? <button type="button" onClick={() => onChangeFilter("unassigned")}>{t("عرض غير المسندة", "View unassigned")}</button> : null}
              <button type="button" onClick={() => onChangeFilter("unread")}>{t("عرض غير المقروءة", "View unread")}</button>
            </div>
          </div>
        ) : (
          <>
        <div className="chat-head">
          <button className="mobile-back" type="button" onClick={() => onSetMobileChatOpen(false)}>
            {t("رجوع", "Back")}
          </button>
          <span className="avatar">{activeConversation.initial}</span>
           <button className="chat-customer" type="button" onClick={() => onChangeChatPanel("profile")}>
            <small className={`channel-badge ${activeConversation.channel || "whatsapp"}`}>
              <ChannelIcon id={activeConversation.channel || "whatsapp"} />
              {getChannelLabel(activeConversation, language)}
            </small>
             <b>{activeConversation.customer}</b>
             <span className={`chat-status-label ${activeConversation.status}`}>{statusLabel(activeConversation.status, language)}</span>
           </button>
          <label>
            {t("مسند إلى", "Assigned to")}
            {canChangeAssignee ? (
              <CustomSelect
                value={activeConversation.assignee}
                onChange={onChangeAssignee}
                options={assigneeOptions.map((member) => ({ value: member, label: member }))}
              />
            ) : (
              <span className="readonly-assignee">{activeConversation.assignee}</span>
            )}
          </label>
          <button
            className={isClosed ? "btn soft" : "btn danger"}
            disabled={!canToggleConversation}
            title={!canToggleConversation ? t("فتح المحادثة متاح للمالك أو المشرف فقط", "Only the owner or a supervisor can reopen a conversation") : undefined}
            type="button"
            onClick={onCloseConversation}
          >
            {isClosed ? (canReopenConversation ? t("فتح المحادثة", "Reopen conversation") : t("مغلقة", "Closed")) : t("إغلاق", "Close")}
          </button>
        </div>

        <div className="chat-tabs">
          <button className={chatPanel === "chat" ? "active" : ""} type="button" onClick={() => onChangeChatPanel("chat")}>
            {t("المحادثة", "Conversation")}
          </button>
          <button className={chatPanel === "profile" ? "active" : ""} type="button" onClick={() => onChangeChatPanel("profile")}>
            {t("ملف العميل", "Customer profile")}
          </button>
        </div>

        {chatPanel === "chat" ? (
          <div className="chat-panel">
            <div className="messages" ref={messagesContainerRef}>
              {activeConversation.messages.map((item) => (
                <div
                  className={`message-bubble ${item.direction} channel-${activeConversation.channel || "whatsapp"}`}
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
                  {item.direction !== "note" ? (
                    <span
                      className={`message-channel-mark ${activeConversation.channel || "whatsapp"}`}
                      aria-label={`${getChannelLabel(activeConversation, language)} — ${item.direction === "in" ? activeConversation.customer : item.author || currentUserName}`}
                    >
                      <ChannelIcon id={activeConversation.channel || "whatsapp"} />
                      <span>{item.direction === "in" ? activeConversation.customer : item.author || currentUserName}</span>
                    </span>
                  ) : null}
                  {!isDeletedMessageText(item.text) ? (
                    <button
                      className="message-reply-action"
                      type="button"
                      aria-label={t("رد على الرسالة", "Reply to message")}
                      title={t("رد على الرسالة", "Reply to message")}
                      onClick={() => startMessageReply(item.id)}
                    >
                      ↩
                    </button>
                  ) : null}
                  {item.direction === "out" &&
                  !isDeletedMessageText(item.text) &&
                  (canDeleteAnyMessage || item.author === currentUserName) ? (
                    <button className="message-delete" type="button" aria-label={t("حذف الرسالة", "Delete message")} title={t("حذف الرسالة", "Delete message")} onClick={() => onDeleteMessage(item.id)} />
                  ) : null}
                  {item.direction === "note" ? <b>{t("ملاحظة خاصة، ", "Private note, ")}{item.author || currentUserName}</b> : null}
                  {item.replyTo ? (
                    <span className="message-reply-preview">
                      <b>{t("رد على ", "Reply to ")}{item.replyTo.author || t("رسالة مرتبطة", "linked message")}</b>
                      <span>{getMessagePreview(item.replyTo.text || "", t)}</span>
                    </span>
                  ) : null}
                  {item.attachment && !isDeletedMessageText(item.text) ? (
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
                        <small>{t("فتح المستند", "Open document")}</small>
                      </a>
                    ) : (
                      <>
                        <audio className="message-attachment-audio" controls>
                          <source src={item.attachment.url} type={item.attachment.mimeType || "audio/ogg"} />
                          <track kind="captions" />
                        </audio>
                        <a className="message-attachment-link" href={item.attachment.url} download={item.attachment.name}>
                          {t("فتح الصوت", "Open audio")}
                        </a>
                      </>
                    )
                  ) : null}
                  {item.attachment?.type === "audio" && !isDeletedMessageText(item.text) ? (
                    <span>{`${item.text}: ${item.attachment.name}`}</span>
                  ) : item.attachment && (item.text === "صورة" || item.text === "ملصق وارد" || item.text === "مستند" || item.text === item.attachment.name) ? null : (
                    <span>{isDeletedMessageText(item.text) ? t("تم حذف هذه الرسالة", "This message was deleted") : formatEmailContent(item.text)}</span>
                  )}
                  {item.source && activeConversation.channel !== "email" ? (
                    item.source.url ? (
                      <a className="message-source-card" href={item.source.url} target="_blank" rel="noreferrer">
                        <b>{item.source.label || t("البوست المرتبط بالتعليق", "Post linked to the comment")}</b>
                        <small>{t("فتح البوست", "Open post")}</small>
                      </a>
                    ) : (
                      <span className="message-source-card">
                        <b>{item.source.label || t("البوست المرتبط بالتعليق", "Post linked to the comment")}</b>
                        {item.source.id ? <small>{item.source.id}</small> : null}
                      </span>
                    )
                  ) : null}
                  {isInstagramCommentMessage(activeConversation.channel, item.text, item.direction) ? (
                    commentReplyTarget === item.id ? (
                      <div className="comment-reply-box">
                        <textarea
                          autoFocus
                          placeholder={t("اكتب ردك على التعليق", "Write your reply to the comment")}
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
                            {t("إرسال الرد", "Send reply")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCommentReplyTarget("");
                              setCommentReplyText("");
                            }}
                          >
                            {t("إلغاء", "Cancel")}
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
                        {t("رد على التعليق", "Reply to comment")}
                      </button>
                    )
                  ) : null}
                  <small>{item.time}</small>
                  {item.direction === "out" && activeConversation.channel === "whatsapp" && item.deliveryStatus === "failed" ? (
                    <small className="message-delivery-status failed" title={item.deliveryError || undefined}>
                      {t(`✗ فشل التسليم${item.deliveryError ? `: ${item.deliveryError}` : ""}`, `✗ Delivery failed${item.deliveryError ? `: ${item.deliveryError}` : ""}`)}
                    </small>
                  ) : null}
                </div>
              ))}
            </div>
            {contextMessage ? (
              <div
                className="message-context-menu"
                style={{ left: messageMenu?.x, top: messageMenu?.y }}
                role="menu"
                aria-label={t("خيارات الرسالة", "Message options")}
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" onClick={() => startMessageReply(contextMessage.id)}>
                  {t("رد على الرسالة", "Reply to message")}
                </button>
              </div>
            ) : null}
            {activeConversation.windowExpired ? (
              <div className="window-notice">
                <b>{t("انتهت نافذة الرد خلال 24 ساعة", "The 24-hour reply window has expired")}</b>
                <span>
                  {t(
                    "مر أكثر من 24 ساعة على آخر رسالة من العميل. لا يمكن إرسال رد عادي الآن، اختر قالب WhatsApp معتمد لإعادة فتح المحادثة.",
                    "More than 24 hours have passed since the customer's last message. You can't send a regular reply now — choose an approved WhatsApp template to reopen the conversation."
                  )}
                </span>
                <div>
                  <CustomSelect
                    value={reopenTemplates.some((template) => template.name === selectedTemplate) ? selectedTemplate : reopenTemplates[0]?.name || ""}
                    disabled={!reopenTemplates.length}
                    onChange={onChangeSelectedTemplate}
                    options={
                      reopenTemplates.length
                        ? reopenTemplates.map((template) => ({ value: template.name, label: template.name }))
                        : [{ value: "", label: t("لا توجد قوالب تسويقية معتمدة", "No approved marketing templates") }]
                    }
                  />
                  <button className="btn primary" type="button" disabled={!reopenTemplates.length} onClick={onSendTemplate}>
                    {t("إرسال قالب", "Send template")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="composer-modes">
                  <button className={composerMode === "reply" ? "active" : ""} type="button" onClick={() => onChangeComposerMode("reply")}>
                    {t("إضافة رد", "Add reply")}
                  </button>
                  <button
                    className={composerMode === "note" ? "active note" : "note"}
                    type="button"
                    onClick={() => onChangeComposerMode("note")}
                  >
                    {t("كتابة ملاحظة خاصة", "Write a private note")}
                  </button>
                </div>
                {replyTarget ? (
                  <div className="composer-reply-preview">
                    <div>
                      <b>{t("رد على ", "Reply to ")}{replyTarget.direction === "out" ? replyTarget.author || t("أنت", "You") : activeConversation.customer}</b>
                      <span>{getMessagePreview(replyTarget.text, t)}</span>
                    </div>
                    <button type="button" aria-label={t("إلغاء الرد", "Cancel reply")} title={t("إلغاء الرد", "Cancel reply")} onClick={() => setReplyTargetId("")}>
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
                      aria-label={t("إضافة إيموجي", "Add emoji")}
                      title={t("إضافة إيموجي", "Add emoji")}
                      type="button"
                      onClick={() => setIsEmojiPickerOpen((isOpen) => !isOpen)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2" /></svg>
                    </button>
                    {isEmojiPickerOpen && !isComposerDisabled ? (
                      <div className="emoji-picker" role="menu" aria-label={t("الإيموجيز", "Emojis")}>
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
                    aria-label={t("إرفاق صورة", "Attach image")}
                    title={t("إرفاق صورة", "Attach image")}
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3" /></svg>
                  </button>
                  <button
                    className="attachment-button"
                    disabled={isComposerDisabled}
                    aria-label={t("إرفاق مستند", "Attach document")}
                    title={t("إرفاق مستند", "Attach document")}
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 12 5.5-5.5a3 3 0 0 1 4.2 4.2L11 18.4a5 5 0 0 1-7.1-7.1l8-8" /></svg>
                  </button>
                  <button
                    className={`attachment-button ${isRecording ? "recording" : ""}`}
                    disabled={isComposerDisabled}
                    aria-label={isRecording ? t("إيقاف التسجيل", "Stop recording") : t("تسجيل صوت", "Record audio")}
                    title={isRecording ? t("إيقاف التسجيل", "Stop recording") : t("تسجيل صوت", "Record audio")}
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
                      <div className="quick-reply-picker" role="menu" aria-label={t("الردود السريعة", "Quick replies")}>
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
                      placeholder={isClosed ? t("المحادثة مغلقة", "This conversation is closed") : t("اكتب رسالتك هنا", "Type your message here")}
                      value={message}
                    />
                  </div>
                  <button className="btn primary" disabled={isComposerDisabled} type="submit">
                    {t("إرسال", "Send")}
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div className="profile-panel">
            <div className="profile-card">
              <h2>{t("بيانات العميل", "Customer details")}</h2>
              <dl>
                <div>
                  <dt>{t("الاسم", "Name")}</dt>
                  <dd>{activeConversation.customer}</dd>
                </div>
                <div>
                  <dt>{t("القناة", "Channel")}</dt>
                  <dd>{getChannelLabel(activeConversation, language)}</dd>
                </div>
                <div>
                  <dt>{t("رقم الجوال", "Phone number")}</dt>
                  <dd dir="ltr">{activeConversation.phone}</dd>
                </div>
                <div>
                  <dt>{t("الوسوم", "Tags")}</dt>
                  <dd className="profile-tags-field">
                    <CustomSelect
                      placeholder={availableTags.length ? t("اختر وسم", "Choose a tag") : t("لا توجد وسوم متاحة", "No tags available")}
                      disabled={!hasActiveConversation || !availableTags.length}
                      value=""
                      onChange={(value) => {
                        void handleAddTag(value);
                      }}
                      options={availableTags.map((tag) => ({ value: tag.name, label: tag.name }))}
                    />
                    <div className="profile-tag-list">
                      {activeConversation.tags.length ? (
                        activeConversation.tags.map((tagName) => (
                          <button key={tagName} type="button" onClick={() => void handleRemoveTag(tagName)}>
                            {tagName}
                            <span aria-hidden="true">×</span>
                          </button>
                        ))
                      ) : (
                        <span>{t("لا توجد وسوم", "No tags")}</span>
                      )}
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="profile-card">
              <h2>{t("سجل العميل", "Customer history")}</h2>
              <p>{t("آخر محادثة: ", "Last conversation: ")}{isDeletedMessageText(activeConversation.lastMessage) ? t("تم حذف هذه الرسالة", "This message was deleted") : activeConversation.lastMessage}</p>
              <p>{t("الموظف المسؤول: ", "Assigned employee: ")}{activeConversation.assignee}</p>
            </div>
          </div>
        )}
          </>
        )}
      </section>
    </section>
  );
}
