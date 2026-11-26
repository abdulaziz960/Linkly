"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { clearSentDraft, draftFor, keepNewestOnResize, setDraft, type ConversationDrafts, type DraftMode } from "../../../lib/chat-ui";
import type { MessageAttachment } from "../types";

type Translate = (ar: string, en: string) => string;

/**
 * What is typed in the composer, kept per conversation: switching to another customer never carries the text (or the
 * private-note mode) along. The setters are bound to the conversation that was open when they were created, so a late
 * result (an AI suggestion) lands in the conversation it was asked for.
 */
export function useConversationDrafts(conversationId: string) {
  const [drafts, setDrafts] = useState<ConversationDrafts>({});
  const current = draftFor(drafts, conversationId);
  const setMessage = useCallback((text: string) => setDrafts((all) => setDraft(all, conversationId, { text })), [conversationId]);
  const setComposerMode = useCallback((mode: DraftMode) => setDrafts((all) => setDraft(all, conversationId, { mode })), [conversationId]);
  const clearSent = useCallback((id: string, text: string) => setDrafts((all) => clearSentDraft(all, id, text)), []);
  return { drafts, message: current.text, composerMode: current.mode, setMessage, setComposerMode, clearSent };
}

const NEAR_BOTTOM_PX = 96;

/**
 * Keeps the thread at its newest message while the reader is there. Someone reading older messages is left where they
 * are, and told how many new ones arrived. Opening a conversation, or sending, goes to the newest message.
 */
export function useChatScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  { conversationId, count, lastIsMine, view }: { conversationId: string; count: number; lastIsMine: boolean; view: string }
) {
  const stick = useRef(true);
  const seen = useRef({ conversationId: "", count: 0 });
  const [away, setAway] = useState(false);
  const [unseen, setUnseen] = useState(0);

  const jumpToLatest = useCallback(() => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    stick.current = true;
    setAway(false);
    setUnseen(0);
  }, [containerRef]);

  useLayoutEffect(() => {
    const switched = seen.current.conversationId !== conversationId;
    const added = switched ? 0 : count - seen.current.count;
    seen.current = { conversationId, count };
    if (switched || stick.current || (added > 0 && lastIsMine)) {
      jumpToLatest();
      // Pictures load after the first paint and make the thread taller.
      const timer = window.setTimeout(() => { if (stick.current) jumpToLatest(); }, 300);
      return () => window.clearTimeout(timer);
    }
    if (added > 0) setUnseen((current) => current + added);
  }, [conversationId, count, lastIsMine, view, jumpToLatest]);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const near = container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX;
    stick.current = near;
    setAway(!near);
    if (near) setUnseen(0);
  }, [containerRef]);

  /** Something changed height (a picture arrived, the composer grew): a reader at the newest message stays there. */
  const followLatest = useCallback(() => { if (stick.current) jumpToLatest(); }, [jumpToLatest]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    return keepNewestOnResize(container, () => stick.current, ResizeObserver);
  }, [containerRef, conversationId, view]);

  return { away, unseen, onScroll, followLatest, jumpToLatest };
}

export function JumpToLatest({ away, unseen, onJump, t }: { away: boolean; unseen: number; onJump: () => void; t: Translate }) {
  return (
    <div className="chat-jump-anchor">
      {away ? (
        <button type="button" className={`chat-jump${unseen ? " has-new" : ""}`} onClick={onJump}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
          {unseen ? t(`رسائل جديدة (${unseen})`, `New messages (${unseen})`) : t("أحدث الرسائل", "Latest messages")}
        </button>
      ) : null}
    </div>
  );
}

/** One tick: sent. Two: delivered. Two on a filled blue badge: read. */
export function MessageTicks({ status, t }: { status?: string; t: Translate }) {
  if (status !== "sent" && status !== "delivered" && status !== "read") return null;
  const label = status === "sent" ? t("أُرسلت", "Sent") : status === "delivered" ? t("وصلت", "Delivered") : t("قُرئت", "Read");
  return (
    <span className={`message-ticks ${status}`} role="img" aria-label={label} title={label}>
      <svg aria-hidden="true" viewBox="0 0 20 12">
        <path d={status === "sent" ? "m5 6.5 3.5 3.5L15 2.5" : "m1.5 6.5 3.5 3.5L11.5 2.5"} />
        {status === "sent" ? null : <path d="M9.5 9.2 10.3 10 17 2.5" />}
      </svg>
    </span>
  );
}

/** A picked file or a finished recording, shown for review before it goes to the customer. */
export function PendingAttachmentBar({ attachment, customer, busy, focusRequest, onSend, onCancel, t }: {
  attachment: MessageAttachment;
  customer: string;
  busy: boolean;
  /** Holds the attachment that was just added here. Coming back to a waiting one must not move the focus. */
  focusRequest: RefObject<MessageAttachment | null>;
  onSend: () => void;
  onCancel: () => void;
  t: Translate;
}) {
  const sendRef = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (focusRequest.current !== attachment) return;
    focusRequest.current = null;
    sendRef.current?.focus();
  }, [attachment, focusRequest]);
  // A send that failed hands the focus back to the button that was disabled while it was on its way.
  useEffect(() => {
    if (wasBusy.current && !busy && document.activeElement === document.body) sendRef.current?.focus();
    wasBusy.current = busy;
  }, [busy]);
  return (
    <div className="composer-attachment" role="group" aria-label={t("مرفق جاهز للإرسال", "Attachment ready to send")} onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onCancel(); } }}>
      <div className="composer-attachment-preview">
        {attachment.type === "image" ? (
          // A local data URL that next/image does not handle.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.url} alt={attachment.name} />
        ) : attachment.type === "audio" ? (
          <audio controls src={attachment.url} aria-label={t("مراجعة التسجيل", "Review the recording")} />
        ) : (
          <b dir="auto">{attachment.name}</b>
        )}
        <small>{t(`سيُرسل إلى ${customer}`, `Will be sent to ${customer}`)}</small>
      </div>
      <div className="composer-attachment-actions">
        <button ref={sendRef} type="button" className="btn primary" disabled={busy} aria-busy={busy} onClick={onSend}>
          {busy ? t("جارٍ الإرسال...", "Sending...") : t("إرسال المرفق", "Send attachment")}
        </button>
        <button type="button" className="btn soft" disabled={busy} onClick={onCancel}>{t("إلغاء", "Cancel")}</button>
      </div>
    </div>
  );
}

export type ActiveRecording = { conversationId: string; customer: string; startedAt: number };

/** Names whose recording is running. Only that sentence is announced; the clock and the buttons are not. */
export function RecordingBar({ recording, onStop, onCancel, t }: { recording: ActiveRecording | null; onStop: () => void; onCancel: () => void; t: Translate }) {
  const label = recording ? t(`جارٍ التسجيل لـ ${recording.customer}`, `Recording for ${recording.customer}`) : "";
  const stopRef = useRef<HTMLButtonElement>(null);
  // Starting a recording closes the menu it was started from; the focus moves here rather than to the page.
  useEffect(() => {
    if (recording && document.activeElement === document.body) stopRef.current?.focus();
  }, [recording]);
  return (
    <>
      <span className="sr-only" role="status">{label}</span>
      {recording ? (
        <div className="composer-recording" role="group" aria-label={label}>
          <span className="composer-recording-dot" aria-hidden="true" />
          <b>{label}</b>
          <RecordingClock startedAt={recording.startedAt} />
          <button ref={stopRef} type="button" className="btn primary" onClick={onStop}>{t("إيقاف ومراجعة", "Stop and review")}</button>
          <button type="button" className="btn soft" onClick={onCancel}>{t("حذف التسجيل", "Discard")}</button>
        </div>
      ) : null}
    </>
  );
}

function RecordingClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 500);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [startedAt]);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <time dir="ltr">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</time>;
}

/** The message box grows with what is typed, up to a few lines. `onResized` runs after each new height. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, key: string, onResized: () => void) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const limit = 140;
    box.style.height = "";
    box.style.maxHeight = `${limit}px`;
    // An empty box keeps the height the layout gives it.
    if (value) box.style.height = `${Math.min(box.scrollHeight + 2, limit)}px`;
    box.style.overflowY = box.scrollHeight > limit ? "auto" : "hidden";
    // Measuring collapses the box for a moment, which can nudge the thread above it off its newest message.
    onResized();
  }, [ref, value, key, onResized]);
}
