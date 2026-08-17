import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { sendWhatsAppTextMessage } from "./whatsapp-send";

export type BotNodeInput = {
  type: string;
  title: string;
  content: string;
};

export type BotNode = BotNodeInput & {
  id: string;
};

const BOT_AUTHOR = "الرد الآلي";

export async function getBotSettings(tenantId = "tenant-demo") {
  await ensureSchema();
  const row = await prisma.botSettings.findUnique({ where: { tenantId } });
  return { enabled: row ? row.enabled === 1 : false };
}

export async function setBotEnabled(tenantId: string, enabled: boolean) {
  await ensureSchema();
  await prisma.botSettings.upsert({
    where: { tenantId },
    update: { enabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() },
    create: {
      id: `bot-settings-${tenantId}`,
      tenantId,
      enabled: enabled ? 1 : 0,
      updatedAt: new Date().toISOString()
    }
  });
}

export async function getBotNodes(tenantId = "tenant-demo"): Promise<BotNode[]> {
  await ensureSchema();
  const rows = await prisma.botNode.findMany({ where: { tenantId }, orderBy: { position: "asc" } });
  return rows.map((row) => ({ id: row.id, type: row.type, title: row.title, content: row.content }));
}

export async function saveBotNodes(tenantId: string, nodes: BotNodeInput[]) {
  await ensureSchema();
  await prisma.$transaction(async (tx) => {
    await tx.botNode.deleteMany({ where: { tenantId } });
    let position = 0;
    for (const node of nodes) {
      const title = node.title.trim() || node.type;
      const content = node.content.trim();
      if (!content) continue;
      await tx.botNode.create({
        data: {
          id: `bot-node-${tenantId}-${Date.now()}-${position}`,
          tenantId,
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

export async function runWhatsAppBot(input: { tenantId: string; conversationId: string; phone: string }) {
  const tenantId = input.tenantId || "tenant-demo";
  const settings = await getBotSettings(tenantId);
  if (!settings.enabled) return;

  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
  if (!conversation || conversation.botRanAt) return;

  const nodes = await getBotNodes(tenantId);
  if (!nodes.length) return;

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { botRanAt: new Date().toISOString() }
  });

  for (const node of nodes) {
    if (node.type === "إرسال رسالة") {
      await sendWhatsAppTextMessage({
        tenantId,
        conversationId: input.conversationId,
        to: input.phone,
        text: node.content,
        author: BOT_AUTHOR
      });
    } else if (node.type === "إرسال قائمة قصيرة" || node.type === "إرسال قائمة طويلة") {
      await sendWhatsAppTextMessage({
        tenantId,
        conversationId: input.conversationId,
        to: input.phone,
        text: formatListMessage(node.title, node.content),
        author: BOT_AUTHOR
      });
    } else if (node.type === "تحويل لفريق") {
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: "unassigned", assignee: node.content.trim() || "بدون موظف" }
      });
      break;
    } else if (node.type === "إغلاق المحادثة") {
      if (node.content.trim()) {
        await sendWhatsAppTextMessage({
          tenantId,
          conversationId: input.conversationId,
          to: input.phone,
          text: node.content,
          author: BOT_AUTHOR
        });
      }
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: "closed" }
      });
      break;
    }
  }
}
