import { formatMessageTime } from "./time";
import { prisma } from "./prisma";

export type ConversationMessageDirection = "out" | "note";

export type ConversationMessageInput = {
  id: string;
  conversationId: string;
  direction: ConversationMessageDirection;
  text: string;
  time: string;
  createdAt: string;
  author: string;
  replyToMessageId: string;
  replyToText: string;
  replyToAuthor: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  sourceLabel: string;
};

export type ConversationMessagePersistence = {
  record(input: ConversationMessageInput): Promise<{
    message: unknown;
    conversation: unknown;
  }>;
};

export type ConversationMessageChannelAdapter = {
  deliver(input: {
    conversationId: string;
    channel: string;
    text: string;
  }): Promise<{
    externalMessageId?: string;
    sourceType?: string;
    sourceId?: string;
    sourceUrl?: string;
    sourceLabel?: string;
  }>;
};

type DeliveryDependencies = {
  persistence: ConversationMessagePersistence;
  channelAdapters: Record<string, ConversationMessageChannelAdapter>;
  now?: () => Date;
};

type DeliverMessageCommand = {
  conversationId: string;
  channel: string;
  direction: ConversationMessageDirection;
  text: string;
  author: string;
  replyToMessageId?: string;
  replyToText?: string;
  replyToAuthor?: string;
};

export function createConversationMessageDelivery({
  persistence,
  channelAdapters,
  now = () => new Date()
}: DeliveryDependencies) {
  return {
    async deliver(command: DeliverMessageCommand) {
      const createdAt = now();
      const channelAdapter = channelAdapters[command.channel];
      if (command.direction === "out" && !channelAdapter) {
        throw new Error("UNSUPPORTED_CONVERSATION_CHANNEL");
      }

      const channelResult = command.direction === "out" && channelAdapter
        ? await channelAdapter.deliver({
            conversationId: command.conversationId,
            channel: command.channel,
            text: command.text
          })
        : {};

      return persistence.record({
        id: channelResult.externalMessageId ?? `m-${createdAt.getTime()}`,
        conversationId: command.conversationId,
        direction: command.direction,
        text: command.text,
        time: formatMessageTime(createdAt),
        createdAt: createdAt.toISOString(),
        author: command.author,
        replyToMessageId: command.replyToMessageId ?? "",
        replyToText: command.replyToText ?? "",
        replyToAuthor: command.replyToAuthor ?? "",
        sourceType: channelResult.sourceType ?? "",
        sourceId: channelResult.sourceId ?? "",
        sourceUrl: channelResult.sourceUrl ?? "",
        sourceLabel: channelResult.sourceLabel ?? ""
      });
    }
  };
}

const prismaConversationMessagePersistence: ConversationMessagePersistence = {
  async record(input) {
    return prisma.$transaction(async (tx) => {
      const message = await tx.message.create({ data: input });
      const conversation = await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastMessage: input.text,
          lastActivityAt: input.createdAt
        }
      });

      return { message, conversation };
    });
  }
};

export const conversationMessageDelivery = createConversationMessageDelivery({
  persistence: prismaConversationMessagePersistence,
  channelAdapters: {
    website: {
      async deliver() {
        return {};
      }
    }
  }
});
