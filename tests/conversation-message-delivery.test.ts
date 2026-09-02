import { describe, expect, it } from "vitest";
import {
  createConversationMessageDelivery,
  type ConversationMessagePersistence
} from "../lib/conversation-message-delivery";

function createInMemoryPersistence(): ConversationMessagePersistence {
  return {
    async record(input) {
      return {
        message: {
          id: input.id,
          conversationId: input.conversationId,
          direction: input.direction,
          text: input.text,
          time: input.time,
          createdAt: input.createdAt,
          author: input.author,
          replyToMessageId: input.replyToMessageId,
          replyToText: input.replyToText,
          replyToAuthor: input.replyToAuthor,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceUrl: input.sourceUrl,
          sourceLabel: input.sourceLabel
        },
        conversation: {
          id: input.conversationId,
          lastMessage: input.text,
          lastActivityAt: input.createdAt
        }
      };
    }
  };
}

describe("conversation message delivery", () => {
  it("records an internal note without delivering it to a customer channel", async () => {
    const delivery = createConversationMessageDelivery({
      persistence: createInMemoryPersistence(),
      channelAdapters: {},
      now: () => new Date("2026-09-02T06:30:00.000Z")
    });

    const result = await delivery.deliver({
      conversationId: "conv-1",
      channel: "whatsapp",
      direction: "note",
      text: "تابع مع العميل غدًا",
      author: "عبدالعزيز"
    });

    expect(result).toMatchObject({
      message: {
        conversationId: "conv-1",
        direction: "note",
        text: "تابع مع العميل غدًا",
        author: "عبدالعزيز",
        createdAt: "2026-09-02T06:30:00.000Z"
      },
      conversation: {
        id: "conv-1",
        lastMessage: "تابع مع العميل غدًا",
        lastActivityAt: "2026-09-02T06:30:00.000Z"
      }
    });
  });

  it("delivers a website reply before recording it", async () => {
    const delivery = createConversationMessageDelivery({
      persistence: createInMemoryPersistence(),
      channelAdapters: {
        website: {
          async deliver() {
            return { externalMessageId: "website-message-1" };
          }
        }
      },
      now: () => new Date("2026-09-02T06:45:00.000Z")
    });

    const result = await delivery.deliver({
      conversationId: "conv-website",
      channel: "website",
      direction: "out",
      text: "أهلًا بك",
      author: "عبدالعزيز"
    });

    expect(result).toMatchObject({
      message: {
        conversationId: "conv-website",
        id: "website-message-1",
        direction: "out",
        text: "أهلًا بك",
        sourceType: ""
      },
      conversation: {
        lastMessage: "أهلًا بك",
        lastActivityAt: "2026-09-02T06:45:00.000Z"
      }
    });
  });

  it("rejects a customer reply when its channel has no adapter", async () => {
    const delivery = createConversationMessageDelivery({
      persistence: createInMemoryPersistence(),
      channelAdapters: {}
    });

    await expect(delivery.deliver({
      conversationId: "conv-unknown",
      channel: "unknown",
      direction: "out",
      text: "لن تُحفظ",
      author: "عبدالعزيز"
    })).rejects.toThrow("UNSUPPORTED_CONVERSATION_CHANNEL");
  });
});
