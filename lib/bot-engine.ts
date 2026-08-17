import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { sendTelegramTextMessage } from "./telegram-send";
import { sendInstagramTextMessage } from "./instagram-send";
import { sendFacebookTextMessage } from "./facebook-send";
import { sendXTextMessage } from "./x-send";
import { sendWebsiteTextMessage } from "./website-send";

export type BotChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

export const botChannels: BotChannel[] = ["whatsapp", "telegram", "instagram", "facebook", "x", "website"];

export type BotNodeInput = {
  type: string;
  title: string;
  content: string;
};

export type BotNode = BotNodeInput & {
  id: string;
};

const BOT_AUTHOR = "الرد الآلي";
const LIST_NODE_TYPES = new Set(["إرسال قائمة قصيرة", "إرسال قائمة طويلة"]);

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

// List-node option lines look like "نص الخيار" or "نص الخيار => اسم الخطوة الهدف".
// The arrow part is optional - options without one are just displayed text with
// no branch (the flow does nothing further until an agent steps in).
function parseListOptions(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, target] = line.split("=>").map((part) => part.trim());
      return { label: label || line, target: target || "" };
    });
}

function formatListMessage(title: string, content: string) {
  const options = parseListOptions(content);
  const numbered = options.map((option, index) => `${index + 1}. ${option.label}`).join("\n");
  return numbered ? `${title}\n${numbered}` : title;
}

function matchListReply(node: BotNode, incomingText: string): string | null {
  const options = parseListOptions(node.content);
  const trimmed = incomingText.trim();

  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (numeric && options[numeric - 1]?.target) return options[numeric - 1].target;

  const byLabel = options.find((option) =>
    option.target && (trimmed.includes(option.label) || option.label.includes(trimmed))
  );
  return byLabel?.target || null;
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

  if (channel === "telegram") {
    return sendTelegramTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      chatId: args.recipientId,
      text: args.text,
      author: BOT_AUTHOR
    });
  }

  if (channel === "instagram") {
    return sendInstagramTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      recipientId: args.recipientId,
      text: args.text,
      author: BOT_AUTHOR
    });
  }

  if (channel === "facebook") {
    return sendFacebookTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      recipientId: args.recipientId,
      text: args.text,
      author: BOT_AUTHOR
    });
  }

  if (channel === "x") {
    return sendXTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      recipientId: args.recipientId,
      text: args.text,
      author: BOT_AUTHOR
    });
  }

  return sendWebsiteTextMessage({
    conversationId: args.conversationId,
    text: args.text,
    author: BOT_AUTHOR
  });
}

// Runs nodes in order starting at startIndex. Stops (and saves a "waiting"
// cursor) when it hits a list node, since that needs a customer reply before
// the flow can continue. Team-transfer/close nodes end the flow entirely.
async function executeFrom(
  channel: BotChannel,
  nodes: BotNode[],
  startIndex: number,
  ctx: { tenantId: string; conversationId: string; recipientId: string }
) {
  for (let i = startIndex; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.type === "إرسال رسالة") {
      await sendBotText(channel, { ...ctx, text: node.content });
      continue;
    }

    if (LIST_NODE_TYPES.has(node.type)) {
      await sendBotText(channel, { ...ctx, text: formatListMessage(node.title, node.content) });
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { botWaitingNodeTitle: node.title }
      });
      return;
    }

    if (node.type === "تحويل لفريق") {
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "unassigned", assignee: node.content.trim() || "بدون موظف", botWaitingNodeTitle: "" }
      });
      return;
    }

    if (node.type === "إغلاق المحادثة") {
      if (node.content.trim()) {
        await sendBotText(channel, { ...ctx, text: node.content });
      }
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "closed", botWaitingNodeTitle: "" }
      });
      return;
    }
  }

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { botWaitingNodeTitle: "" }
  });
}

export async function runChannelBot(
  channel: BotChannel,
  input: { tenantId: string; conversationId: string; recipientId: string; incomingText?: string }
) {
  const tenantId = input.tenantId || "tenant-demo";
  const settings = await getBotSettings(tenantId, channel);
  if (!settings.enabled) return;

  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
  if (!conversation) return;

  const nodes = await getBotNodes(tenantId, channel);
  if (!nodes.length) return;

  const ctx = { tenantId, conversationId: input.conversationId, recipientId: input.recipientId };

  if (!conversation.botRanAt) {
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { botRanAt: new Date().toISOString() }
    });
    await executeFrom(channel, nodes, 0, ctx);
    return;
  }

  if (conversation.botWaitingNodeTitle) {
    const waitingNode = nodes.find((node) => node.title === conversation.botWaitingNodeTitle);
    if (!waitingNode) {
      await prisma.conversation.update({ where: { id: input.conversationId }, data: { botWaitingNodeTitle: "" } });
      return;
    }

    const targetTitle = matchListReply(waitingNode, input.incomingText || "");
    if (!targetTitle) return;

    const targetIndex = nodes.findIndex((node) => node.title === targetTitle);
    if (targetIndex === -1) return;

    await executeFrom(channel, nodes, targetIndex, ctx);
  }
}

export async function runWhatsAppBot(input: { tenantId: string; conversationId: string; phone: string; incomingText?: string }) {
  return runChannelBot("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, incomingText: input.incomingText });
}

export async function runTelegramBot(input: { tenantId: string; conversationId: string; chatId: string; incomingText?: string }) {
  return runChannelBot("telegram", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.chatId, incomingText: input.incomingText });
}
