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

/**
 * Authors of outbound messages that are not a person on the team: the bot, automations, system notes and
 * the platform itself. Such a message does not answer the customer. (Mirrors isHumanAuthor in lib/bot-engine.ts,
 * which the browser bundle cannot import.)
 */
const NON_HUMAN_AUTHORS = new Set(["", "الرد الآلي", "الأتمتة", "نظام", "Linkly", "Google Business"]);

function isHumanAuthor(author: string | undefined) {
  return !NON_HUMAN_AUTHORS.has((author ?? "").trim());
}

/**
 * When the customer started waiting: the time of their earliest message that no team member has answered yet,
 * or null when nobody is waiting. Walking back from the newest message:
 *  - an internal note or assignment line is not a reply and not a customer message, so it is skipped;
 *  - a bot / automation / system message (an off-hours auto-reply, a welcome) does not answer the customer either;
 *  - a message from a team member answers everything before it, so the walk stops there.
 */
export function unansweredSince(messages: Conversation["messages"]): number | null {
  let since: number | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction === "note") continue;
    if (message.direction === "out") {
      if (isHumanAuthor(message.author)) break;
      continue;
    }
    const at = messageTimestamp(message.createdAt);
    if (at) since = at;
  }
  return since;
}

export function getWaitingConversations(conversations: Conversation[], now: number): WaitingConversation[] {
  const maximumWaitMinutes = ACTIVE_WAIT_MAX_DAYS * 24 * 60;

  return conversations
    .flatMap((conversation) => {
      if (conversation.status === "closed") return [];
      const since = unansweredSince(conversation.messages);
      if (!since) return [];

      const minutes = (now - since) / 60_000;
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
