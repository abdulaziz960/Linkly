import { describe, expect, it } from "vitest";
import { countMessagesToday, getWaitingConversations, SLA_MINUTES } from "../lib/operations-metrics";
import type { Conversation, Message } from "../app/dashboard/types";

const now = new Date("2026-09-21T12:00:00+03:00").getTime();

function conversation(overrides: Partial<Conversation> & { messages?: Message[] } = {}): Conversation {
  return {
    id: "conversation-1",
    customerId: "customer-1",
    channel: "whatsapp",
    customer: "عميل",
    phone: "0500000000",
    initial: "ع",
    lastMessage: "مرحباً",
    status: "assigned",
    assignee: "موظف",
    tags: [],
    messages: [],
    ...overrides
  };
}

describe("operations metrics", () => {
  it("counts only inbound and outbound messages from the current local day", () => {
    const messages: Message[] = [
      { id: "in", direction: "in", text: "in", time: "09:00", createdAt: "2026-09-21T09:00:00+03:00" },
      { id: "out", direction: "out", text: "out", time: "10:00", createdAt: "2026-09-21T10:00:00+03:00" },
      { id: "note", direction: "note", text: "note", time: "11:00", createdAt: "2026-09-21T11:00:00+03:00" },
      { id: "old", direction: "in", text: "old", time: "23:00", createdAt: "2026-09-20T23:00:00+03:00" },
      { id: "future", direction: "out", text: "future", time: "13:00", createdAt: "2026-09-21T13:00:00+03:00" }
    ];

    expect(countMessagesToday([conversation({ messages })], now)).toBe(2);
  });

  it("uses the shared SLA and excludes closed, future, and stale waits", () => {
    const waitingAt = new Date(now - (SLA_MINUTES + 1) * 60_000).toISOString();
    const staleAt = new Date(now - 31 * 24 * 60 * 60_000).toISOString();
    const rows = getWaitingConversations([
      conversation({ id: "waiting", messages: [{ id: "1", direction: "in", text: "x", time: "", createdAt: waitingAt }] }),
      conversation({ id: "closed", status: "closed", messages: [{ id: "2", direction: "in", text: "x", time: "", createdAt: waitingAt }] }),
      conversation({ id: "stale", messages: [{ id: "3", direction: "in", text: "x", time: "", createdAt: staleAt }] }),
      conversation({ id: "answered", messages: [{ id: "4", direction: "out", text: "x", time: "", createdAt: waitingAt }] })
    ], now);

    expect(rows.map((row) => row.conversation.id)).toEqual(["waiting"]);
    expect(rows[0].minutes).toBeGreaterThan(SLA_MINUTES);
  });

  it("keeps a customer waiting when only a note, an assignment line or an automatic reply came after their message", () => {
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
    const rows = getWaitingConversations([
      conversation({
        id: "noted",
        messages: [
          { id: "a1", direction: "in", text: "x", time: "", createdAt: at(50) },
          { id: "a2", direction: "note", text: "تم إسناد المحادثة إلى موظف", time: "", createdAt: at(49) }
        ]
      }),
      conversation({
        id: "auto-replied",
        messages: [
          { id: "b1", direction: "in", text: "x", time: "", createdAt: at(120) },
          { id: "b2", direction: "in", text: "y", time: "", createdAt: at(100) },
          { id: "b3", direction: "out", text: "خارج الدوام", time: "", createdAt: at(99), author: "الرد الآلي" }
        ]
      }),
      conversation({
        id: "answered-by-person",
        messages: [
          { id: "c1", direction: "in", text: "x", time: "", createdAt: at(90) },
          { id: "c2", direction: "out", text: "أهلًا", time: "", createdAt: at(80), author: "ثواب" },
          { id: "c3", direction: "note", text: "ملاحظة", time: "", createdAt: at(70) }
        ]
      }),
      conversation({
        id: "asked-again",
        messages: [
          { id: "d1", direction: "in", text: "x", time: "", createdAt: at(200) },
          { id: "d2", direction: "out", text: "أهلًا", time: "", createdAt: at(190), author: "ثواب" },
          { id: "d3", direction: "in", text: "y", time: "", createdAt: at(30) }
        ]
      })
    ], now);

    expect(rows.map((row) => row.conversation.id)).toEqual(["auto-replied", "noted", "asked-again"]);
    // waiting is counted from the customer's first unanswered message, not the newest one
    expect(Math.round(rows[0].minutes)).toBe(120);
    expect(Math.round(rows[1].minutes)).toBe(50);
    expect(Math.round(rows[2].minutes)).toBe(30);
  });
});
