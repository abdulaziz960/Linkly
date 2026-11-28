import { riyadhDayKey } from "./time";

/** Pure rules of the chat screen: whose draft is whose, and which messages read as one group. */

export type DraftMode = "reply" | "note";
export type ConversationDraft = { text: string; mode: DraftMode; replyToId?: string };
export type ConversationDrafts = Record<string, ConversationDraft>;

const EMPTY_DRAFT: ConversationDraft = { text: "", mode: "reply" };

export function draftFor(drafts: ConversationDrafts, conversationId: string): ConversationDraft {
  return drafts[conversationId] ?? EMPTY_DRAFT;
}

export function setDraft(drafts: ConversationDrafts, conversationId: string, change: Partial<ConversationDraft>): ConversationDrafts {
  if (!conversationId) return drafts;
  return { ...drafts, [conversationId]: { ...draftFor(drafts, conversationId), ...change } };
}

/** Empties a draft once it has been sent. Text typed, or a quote chosen, while the request was on its way is kept. */
export function clearSentDraft(drafts: ConversationDrafts, conversationId: string, sentText: string, sentReplyToId?: string): ConversationDrafts {
  const draft = draftFor(drafts, conversationId);
  const change: Partial<ConversationDraft> = {};
  if (draft.text.trim() === sentText.trim()) change.text = "";
  if (sentReplyToId && draft.replyToId === sentReplyToId) change.replyToId = undefined;
  return Object.keys(change).length ? setDraft(drafts, conversationId, change) : drafts;
}

/** A picked file or a recording waiting for review, and whether it is on its way. One per conversation. */
export type HeldAttachment<A> = { attachment: A; sending: boolean };
export type HeldAttachments<A> = Record<string, HeldAttachment<A>>;

export function holdAttachment<A>(held: HeldAttachments<A>, conversationId: string, attachment: A): HeldAttachments<A> {
  if (!conversationId) return held;
  return { ...held, [conversationId]: { attachment, sending: false } };
}

/** Changes nothing when `attachment` is no longer the one waiting there. */
export function setAttachmentSending<A>(held: HeldAttachments<A>, conversationId: string, attachment: A, sending: boolean): HeldAttachments<A> {
  if (held[conversationId]?.attachment !== attachment) return held;
  return { ...held, [conversationId]: { attachment, sending } };
}

/** Removes `attachment` once it is sent or cancelled. A newer one, or another conversation's, stays. */
export function releaseAttachment<A>(held: HeldAttachments<A>, conversationId: string, attachment: A): HeldAttachments<A> {
  if (held[conversationId]?.attachment !== attachment) return held;
  const rest = { ...held };
  delete rest[conversationId];
  return rest;
}

/** A file that went out is let go; one that did not stays, ready for another try. */
export function settleAttachment<A>(held: HeldAttachments<A>, conversationId: string, attachment: A, sent: boolean): HeldAttachments<A> {
  return sent ? releaseAttachment(held, conversationId, attachment) : setAttachmentSending(held, conversationId, attachment, false);
}

/** Opening a conversation, following it, or sending goes to the newest message. Anyone reading older ones is only told. */
export function scrollAfterChange({ switched, following, added, lastIsMine }: { switched: boolean; following: boolean; added: number; lastIsMine: boolean }): "latest" | "count" | "stay" {
  if (switched || following || (added > 0 && lastIsMine)) return "latest";
  return added > 0 ? "count" : "stay";
}

/**
 * The reply box after a failed message is put back in it. What is already typed stays. Returns null while a private
 * note is being written: both modes share the box, and the note must not turn into a reply.
 */
export function restoreFailedText(draft: ConversationDraft, failedText: string): string | null {
  const typed = draft.text.trimEnd();
  if (!typed.trim()) return failedText;
  if (draft.mode === "note") return null;
  if (typed === failedText || typed.endsWith(`\n${failedText}`)) return typed;
  return `${typed}\n${failedText}`;
}

type ScrollBox = { scrollTop: number; scrollHeight: number };
type SizeObserver<T> = new (callback: () => void) => { observe(target: T): void; disconnect(): void };

/** The thread gets shorter when the composer grows or a review bar opens. Returns the function that stops watching. */
export function keepNewestOnResize<T extends ScrollBox>(box: T, isFollowing: () => boolean, Observer: SizeObserver<T>): () => void {
  const observer = new Observer(() => { if (isFollowing()) box.scrollTop = box.scrollHeight; });
  observer.observe(box);
  return () => observer.disconnect();
}

type Waitable = { status: string; lastActivityAt?: string; messages: { direction: string; createdAt?: string }[] };

/** When the customer started waiting: their first message nobody has answered, in milliseconds. 0 when nobody waits. */
export function waitingSince(conversation: Waitable): number {
  if (conversation.status === "closed") return 0;
  let since = "";
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const { direction, createdAt } = conversation.messages[i];
    if (direction === "out") break;
    if (direction === "in") since = createdAt || conversation.lastActivityAt || since;
  }
  return (since && new Date(since).getTime()) || 0;
}

/** Whoever has waited longest comes first; conversations nobody waits in follow, in the order `otherwise` gives them. */
export function byLongestWaiting<T extends Waitable>(a: T, b: T, otherwise: (a: T, b: T) => number): number {
  const first = waitingSince(a), second = waitingSince(b);
  if (first && second) return first - second;
  if (first || second) return first ? -1 : 1;
  return otherwise(a, b);
}

const GROUP_WINDOW_MS = 5 * 60_000;

type GroupableMessage = { direction: string; author?: string; createdAt?: string; source?: { type?: string } };

/** True when `message` continues the previous one: same side, same author, within five minutes of it, same day. */
export function isGroupedMessage(previous: GroupableMessage | undefined, message: GroupableMessage): boolean {
  if (!previous?.createdAt || !message.createdAt) return false;
  if (previous.source?.type?.startsWith("system_") || message.source?.type?.startsWith("system_")) return false;
  if (previous.direction !== message.direction || (previous.author || "") !== (message.author || "")) return false;
  const before = new Date(previous.createdAt);
  const after = new Date(message.createdAt);
  const gap = after.getTime() - before.getTime();
  if (!Number.isFinite(gap) || gap < 0 || gap > GROUP_WINDOW_MS) return false;
  return riyadhDayKey(before) === riyadhDayKey(after);
}
