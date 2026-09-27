import type { Conversation } from "../app/dashboard/types";

export const SLA_MINUTES = 15;
export const ACTIVE_WAIT_MAX_DAYS = 30;

export type WaitingConversation = {
  conversation: Conversation;
  minutes: number;
};

export function messageTimestamp(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function getWaitingConversations(conversations: Conversation[], now: number): WaitingConversation[] {
  const maximumWaitMinutes = ACTIVE_WAIT_MAX_DAYS * 24 * 60;

  return conversations
    .flatMap((conversation) => {
      if (conversation.status === "closed") return [];
      const lastMessage = conversation.messages.at(-1);
      if (!lastMessage || lastMessage.direction !== "in") return [];

      const receivedAt = messageTimestamp(lastMessage.createdAt);
      if (!receivedAt) return [];
      const minutes = (now - receivedAt) / 60_000;
      if (minutes < 0 || minutes > maximumWaitMinutes) return [];

      return [{ conversation, minutes }];
    })
    .sort((left, right) => right.minutes - left.minutes);
}

export function countMessagesToday(conversations: Conversation[], now: number) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const startMs = dayStart.getTime();

  return conversations.reduce(
    (total, conversation) => total + conversation.messages.filter((message) =>
      message.direction !== "note" && messageTimestamp(message.createdAt) >= startMs && messageTimestamp(message.createdAt) <= now
    ).length,
    0
  );
}
