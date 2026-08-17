import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { sendTelegramTextMessage } from "./telegram-send";

export type BotChannel = "whatsapp" | "telegram";

export const botChannels: BotChannel[] = ["whatsapp", "telegram"];

export type BotNodeInput = {
  type: string;
  title: string;
  content: string;
};

export type BotNode = BotNodeInput & {
  id: string;
};

const BOT_AUTHOR = "الرد الآلي";

function settingsId(tenantId: string, channel: BotChannel) {
  return `bot-settings-${tenantId}-${channel}`;
}

export async function getBotSettings(tenantId = "tenant-demo", channel: BotChannel = "whatsapp") {
  await ensureSchema();
  const row = await prisma.botSettings.findUnique({ where: { id: settingsId(tenantId, channel) } });
  return { enabled: row ? row.enabled === 1 : false };
}

export async function setBotEnabled(tenantId: string, channel: BotChannel, enabled: boolean) {
  await ensureSchema();
  const id = settingsId(tenantId, channel);
  await prisma.botSettings.upsert({
    where: { id },
    update: { enabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() },
    create: {
      id,
      tenantId,
      channel,
      enabled: enabled ? 1 : 0,
      updatedAt: new Date().toISOString()
    }
  });
}

export async function getBotNodes(tenantId = "tenant-demo", channel: BotChannel = "whatsapp"): Promise<BotNode[]> {
  await ensureSchema();
  const rows = await prisma.botNode.findMany({ where: { tenantId, channel }, orderBy: { position: "asc" } });
  return rows.map((row) => ({ id: row.id, type: row.type, title: row.title, content: row.content }));
}

export async function saveBotNodes(tenantId: string, channel: BotChannel, nodes: BotNodeInput[]) {
  await ensureSchema();
  await prisma.$transaction(async (tx) => {
    await tx.botNode.deleteMany({ where: { tenantId, channel } });
    let position = 0;
    for (const node of nodes) {
      const title = node.title.trim() || node.type;
      const content = node.content.trim();
      if (!content) continue;
      await tx.botNode.create({
        data: {
          id: `bot-node-${tenantId}-${channel}-${Date.now()}-${position}`,
          tenantId,
          channel,
          position,
          type: node.type,
          title,
          content,
          createdAt: new Date().toISOString()
        }
      });
      position += 1;
    }
  });
}

function formatListMessage(title: string, content: string) {
  const options = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const numbered = options.map((option, index) => `${index + 1}. ${option}`).join("\n");
  return numbered ? `${title}\n${numbered}` : title;
}

async function sendBotText(channel: BotChannel, args: { tenantId: string; conversationId: string; recipientId: string; text: string }) {
  if (channel === "whatsapp") {
    return sendWhatsAppTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      to: args.recipientId,
      text: args.text,
      author: BOT_AUTHOR
    });
  }

  return sendTelegramTextMessage({
    tenantId: args.tenantId,
    conversationId: args.conversationId,
    chatId: args.recipientId,
    text: args.text,
    author: BOT_AUTHOR
  });
}

export async function runChannelBot(channel: BotChannel, input: { tenantId: string; conversationId: string; recipientId: string }) {
  const tenantId = input.tenantId || "tenant-demo";
  const settings = await getBotSettings(tenantId, channel);
  if (!settings.enabled) return;

  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
  if (!conversation || conversation.botRanAt) return;

  const nodes = await getBotNodes(tenantId, channel);
  if (!nodes.length) return;

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { botRanAt: new Date().toISOString() }
  });

  for (const node of nodes) {
    if (node.type === "إرسال رسالة") {
      await sendBotText(channel, { tenantId, conversationId: input.conversationId, recipientId: input.recipientId, text: node.content });
    } else if (node.type === "إرسال قائمة قصيرة" || node.type === "إرسال قائمة طويلة") {
      await sendBotText(channel, { tenantId, conversationId: input.conversationId, recipientId: input.recipientId, text: formatListMessage(node.title, node.content) });
    } else if (node.type === "تحويل لفريق") {
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: "unassigned", assignee: node.content.trim() || "بدون موظف" }
      });
      break;
    } else if (node.type === "إغلاق المحادثة") {
      if (node.content.trim()) {
        await sendBotText(channel, { tenantId, conversationId: input.conversationId, recipientId: input.recipientId, text: node.content });
      }
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: "closed" }
      });
      break;
    }
  }
}

export async function runWhatsAppBot(input: { tenantId: string; conversationId: string; phone: string }) {
  return runChannelBot("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone });
}

export async function runTelegramBot(input: { tenantId: string; conversationId: string; chatId: string }) {
  return runChannelBot("telegram", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.chatId });
}
