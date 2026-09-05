import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { isWhatsAppReplyWindowExpired, sendWhatsAppTextMessage, sendWhatsAppInteractiveMessage } from "./whatsapp-send";
import { sendTelegramTextMessage } from "./telegram-send";
import { sendInstagramTextMessage } from "./instagram-send";
import { sendFacebookTextMessage } from "./facebook-send";
import { sendXTextMessage } from "./x-send";
import { sendWebsiteTextMessage } from "./website-send";
import { pickTeamAssignee } from "./automation-engine";
import { findBestKbMatch } from "./knowledge-base";

export type BotChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

export const botChannels: BotChannel[] = ["whatsapp", "telegram", "instagram", "facebook", "x", "website"];

export type BotListOption = { id: string; label: string; next: string | null };

// Every step type has its own content shape, stored as JSON in the DB. Steps
// link to each other by id (set by dragging a connector on the canvas), not
// by typing another step's name - that removes an entire class of typo bugs
// where a branch silently went nowhere because the target name didn't match.
export type BotNodeContent =
  | { kind: "message"; text: string; next: string | null }
  | { kind: "list"; text: string; options: BotListOption[] }
  | { kind: "team"; teamName: string }
  | { kind: "employee"; employeeName: string }
  | { kind: "close"; text: string }
  | { kind: "knowledgeBase"; noMatchText: string; next: string | null };

export type BotNodeInput = {
  id?: string;
  type: string;
  title: string;
  content: BotNodeContent;
  x?: number;
  y?: number;
};

export type BotNode = {
  id: string;
  type: string;
  title: string;
  content: BotNodeContent;
  x: number;
  y: number;
};

const BOT_AUTHOR = "الرد الآلي";
const LIST_NODE_TYPES = new Set(["إرسال قائمة قصيرة", "إرسال قائمة طويلة"]);
const MESSAGE_NODE_TYPE = "إرسال رسالة";
const TEAM_NODE_TYPE = "تحويل لفريق";
const EMPLOYEE_NODE_TYPE = "تحويل لموظف";
const CLOSE_NODE_TYPE = "إغلاق المحادثة";
const KNOWLEDGE_BASE_NODE_TYPE = "رد من قاعدة المعرفة";

function settingsId(tenantId: string, channel: BotChannel) {
  return `bot-settings-${tenantId}-${channel}`;
}

export async function getBotSettings(tenantId = "tenant-demo", channel: BotChannel = "whatsapp") {
  await ensureSchema();
  const row = await prisma.botSettings.findUnique({ where: { id: settingsId(tenantId, channel) } });
  return { enabled: row ? row.enabled === 1 : false };
}

export function isBotChannel(channel: string): channel is BotChannel {
  return (botChannels as string[]).includes(channel);
}

// A brand-new conversation should start closed (handled by the bot, not
// waiting on an agent) only when the channel actually has a bot enabled
// with a real flow attached - otherwise it would open as "closed" with
// nothing ever running to reopen it, hiding the conversation from every
// agent for no reason.
export async function shouldStartConversationClosed(tenantId: string, channel: string) {
  if (!isBotChannel(channel)) return false;
  const settings = await getBotSettings(tenantId, channel);
  if (!settings.enabled) return false;
  const nodes = await getBotNodes(tenantId, channel);
  return nodes.length > 0;
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

// Reads content saved before the id-based redesign, where a list's options
// carried a target *title* ("label => step name") and message/close nodes
// were just the raw text. Old data degrades gracefully: unresolved targets
// just come back as next: null (the step stops there) instead of crashing.
function parseLegacyContent(type: string, raw: string, allNodes: Array<{ id: string; title: string }>): BotNodeContent {
  const findIdByTitle = (title: string) => allNodes.find((node) => node.title === title)?.id || null;

  if (LIST_NODE_TYPES.has(type)) {
    const options = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, targetTitle] = line.split("=>").map((part) => part.trim());
        return { id: randomUUID(), label: label || line, next: targetTitle ? findIdByTitle(targetTitle) : null };
      });
    return { kind: "list", text: "", options };
  }

  if (type === TEAM_NODE_TYPE) {
    return { kind: "team", teamName: raw.trim() };
  }

  if (type === CLOSE_NODE_TYPE) {
    return { kind: "close", text: raw };
  }

  return { kind: "message", text: raw, next: null };
}

function parseNodeContent(type: string, raw: string, allNodes: Array<{ id: string; title: string }>): BotNodeContent {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.kind === "string") {
      return parsed as BotNodeContent;
    }
  } catch {
    // Not JSON - this is pre-redesign data, fall through to the legacy parser.
  }
  return parseLegacyContent(type, raw, allNodes);
}

export async function getBotNodes(tenantId = "tenant-demo", channel: BotChannel = "whatsapp"): Promise<BotNode[]> {
  await ensureSchema();
  const rows = await prisma.botNode.findMany({ where: { tenantId, channel }, orderBy: { position: "asc" } });
  const titleLookup = rows.map((row) => ({ id: row.id, title: row.title }));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    content: parseNodeContent(row.type, row.content, titleLookup),
    x: row.canvasX,
    y: row.canvasY
  }));
}

function remapNodeLinks(content: BotNodeContent, idMap: Map<string, string>): BotNodeContent {
  if (content.kind === "message" || content.kind === "knowledgeBase") {
    return { ...content, next: content.next ? idMap.get(content.next) || content.next : null };
  }
  if (content.kind === "list") {
    return {
      ...content,
      options: content.options.map((option) => ({
        ...option,
        next: option.next ? idMap.get(option.next) || option.next : null
      }))
    };
  }
  return content;
}

// Upserts by id so a step's id survives every save (dragging it, editing a
// sibling, adding a new step) - the canvas's connector lines reference these
// ids directly, so an id that changed on every save would silently break
// every connection pointing at that step.
export async function saveBotNodes(tenantId: string, channel: BotChannel, nodes: BotNodeInput[]) {
  await ensureSchema();
  await prisma.$transaction(async (tx) => {
    const existingIds = new Set((await tx.botNode.findMany({ where: { tenantId, channel }, select: { id: true } })).map((row) => row.id));
    const idMap = new Map<string, string>();
    for (const node of nodes) {
      const requestedId = node.id || `local-${randomUUID()}`;
      idMap.set(requestedId, existingIds.has(requestedId) ? requestedId : `bot-node-${tenantId}-${channel}-${randomUUID()}`);
    }
    const keepIds: string[] = [];
    let position = 0;

    for (const node of nodes) {
      const title = node.title.trim() || node.type;
      const requestedId = node.id || "";
      const id = idMap.get(requestedId) || `bot-node-${tenantId}-${channel}-${randomUUID()}`;
      const content = remapNodeLinks(node.content, idMap);
      keepIds.push(id);

      await tx.botNode.upsert({
        where: { id },
        update: {
          position,
          type: node.type,
          title,
          content: JSON.stringify(content),
          canvasX: node.x ?? 0,
          canvasY: node.y ?? 0
        },
        create: {
          id,
          tenantId,
          channel,
          position,
          type: node.type,
          title,
          content: JSON.stringify(content),
          canvasX: node.x ?? 0,
          canvasY: node.y ?? 0,
          createdAt: new Date().toISOString()
        }
      });
      position += 1;
    }

    await tx.botNode.deleteMany({ where: { tenantId, channel, id: { notIn: keepIds.length ? keepIds : ["__none__"] } } });
  });
}

function matchListReply(node: BotNode, incomingText: string): string | null {
  if (node.content.kind !== "list") return null;
  const trimmed = incomingText.trim();

  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (numeric && node.content.options[numeric - 1]?.next) return node.content.options[numeric - 1].next;

  const byLabel = node.content.options.find((option) =>
    option.next && (trimmed.includes(option.label) || option.label.includes(trimmed))
  );
  return byLabel?.next || null;
}

function formatListMessage(node: BotNode): string {
  if (node.content.kind !== "list") return "";
  const numbered = node.content.options.map((option, index) => `${index + 1}. ${option.label}`).join("\n");
  return numbered ? `${node.content.text}\n${numbered}` : node.content.text;
}

// WhatsApp gets real tappable reply buttons (up to 3 options) or a native
// list picker (up to 10 options) instead of a plain-text "1. option"
// message. A "قائمة قصيرة" step still renders as buttons at 3 options or
// fewer, but upgrades to the list picker instead of silently degrading to
// plain text the moment it grows past 3 - only WhatsApp lists past 10
// options, and other channels, fall back to the plain-text rendering.
async function sendBotList(channel: BotChannel, node: BotNode, args: { tenantId: string; conversationId: string; recipientId: string }) {
  if (node.content.kind !== "list") return { ok: false };
  const displayText = formatListMessage(node);

  if (channel === "whatsapp" && node.content.options.length >= 1) {
    const isExplicitLongList = node.type === "إرسال قائمة طويلة";
    const useButtons = !isExplicitLongList && node.content.options.length <= 3;
    const fitsNative = node.content.options.length <= 10;
    if (fitsNative) {
      const result = await sendWhatsAppInteractiveMessage({
        tenantId: args.tenantId,
        conversationId: args.conversationId,
        to: args.recipientId,
        bodyText: node.content.text,
        options: node.content.options.map((option) => option.label),
        kind: useButtons ? "button" : "list",
        listButtonLabel: "اختر",
        displayText,
        author: BOT_AUTHOR
      });
      if (result.ok) return result;
    }
  }

  return sendBotText(channel, { ...args, text: displayText });
}

export async function sendBotText(channel: BotChannel, args: { tenantId: string; conversationId: string; recipientId: string; text: string; author?: string }) {
  const author = args.author ?? BOT_AUTHOR;
  if (channel === "whatsapp") {
    // A free-text send outside WhatsApp's 24h customer-service window is
    // guaranteed to be rejected by Meta (error 131047, "Re-engagement
    // message") - unlike a manual reply, there's no user watching to notice
    // and switch to a template, so skip the doomed call instead of leaving
    // a confusing "failed" message in the thread.
    if (await isWhatsAppReplyWindowExpired(args.conversationId, false)) {
      return { ok: false as const, skipped: true, error: "WHATSAPP_WINDOW_EXPIRED" };
    }
    return sendWhatsAppTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      to: args.recipientId,
      text: args.text,
      author
    });
  }

  if (channel === "telegram") {
    return sendTelegramTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      chatId: args.recipientId,
      text: args.text,
      author
    });
  }

  if (channel === "instagram") {
    return sendInstagramTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      recipientId: args.recipientId,
      text: args.text,
      author
    });
  }

  if (channel === "facebook") {
    return sendFacebookTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      recipientId: args.recipientId,
      text: args.text,
      author
    });
  }

  if (channel === "x") {
    return sendXTextMessage({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      recipientId: args.recipientId,
      text: args.text,
      author
    });
  }

  return sendWebsiteTextMessage({
    conversationId: args.conversationId,
    text: args.text,
    author
  });
}

// Runs a single step, then follows its explicit "next" connection (drawn on
// the canvas) rather than falling through array order - a step with no
// outgoing connection simply stops there instead of guessing.
async function executeFrom(
  channel: BotChannel,
  nodes: BotNode[],
  startId: string,
  ctx: { tenantId: string; conversationId: string; recipientId: string; incomingText?: string }
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let currentId: string | null = startId;
  let guard = 0;

  while (currentId && guard < nodes.length + 1) {
    guard += 1;
    const node: BotNode | undefined = byId.get(currentId);
    if (!node) break;

    if (node.type === MESSAGE_NODE_TYPE && node.content.kind === "message") {
      await sendBotText(channel, { ...ctx, text: node.content.text });
      currentId = node.content.next;
      continue;
    }

    if (LIST_NODE_TYPES.has(node.type) && node.content.kind === "list") {
      await sendBotList(channel, node, ctx);
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { botWaitingNodeId: node.id }
      });
      return;
    }

    if (node.type === TEAM_NODE_TYPE && node.content.kind === "team") {
      const teamName = node.content.teamName.trim();
      const team = teamName
        ? await prisma.team.findFirst({
            where: { name: teamName, tenantId: ctx.tenantId },
            include: { members: { include: { employee: true } } }
          })
        : null;
      const assignee = await pickTeamAssignee(team, ctx.tenantId);
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: assignee ? "assigned" : "unassigned", assignee: assignee || teamName || "بدون موظف", botWaitingNodeId: "" }
      });
      return;
    }

    if (node.type === EMPLOYEE_NODE_TYPE && node.content.kind === "employee") {
      const employeeName = node.content.employeeName.trim();
      const employee = employeeName
        ? await prisma.employee.findFirst({ where: { name: employeeName, tenantId: ctx.tenantId } })
        : null;
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: employee ? "assigned" : "unassigned", assignee: employee?.name || "بدون موظف", botWaitingNodeId: "" }
      });
      return;
    }

    if (node.type === KNOWLEDGE_BASE_NODE_TYPE && node.content.kind === "knowledgeBase") {
      const match = await findBestKbMatch(ctx.tenantId, ctx.incomingText || "");
      await sendBotText(channel, { ...ctx, text: match ? match.answer : node.content.noMatchText });
      currentId = node.content.next;
      continue;
    }

    if (node.type === CLOSE_NODE_TYPE && node.content.kind === "close") {
      if (node.content.text.trim()) {
        await sendBotText(channel, { ...ctx, text: node.content.text });
      }
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "closed", botWaitingNodeId: "" }
      });
      return;
    }

    // Unrecognized/mismatched content shape - stop rather than loop forever.
    break;
  }

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { botWaitingNodeId: "" }
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

  const ctx = { tenantId, conversationId: input.conversationId, recipientId: input.recipientId, incomingText: input.incomingText };

  if (!conversation.botRanAt) {
    // Claim the "start the flow" step atomically: only the invocation whose
    // UPDATE actually flips botRanAt from empty gets to run executeFrom.
    // Two webhook deliveries landing close enough together that both read
    // botRanAt as empty before either write commits would otherwise both
    // send the welcome step.
    const claimed = await prisma.conversation.updateMany({
      where: { id: input.conversationId, botRanAt: "" },
      data: { botRanAt: new Date().toISOString() }
    });
    if (claimed.count === 0) return;
    await executeFrom(channel, nodes, nodes[0].id, ctx);
    return;
  }

  if (conversation.botWaitingNodeId) {
    const waitingId = conversation.botWaitingNodeId;
    const waitingNode = nodes.find((node) => node.id === waitingId);
    if (!waitingNode) {
      await prisma.conversation.updateMany({ where: { id: input.conversationId, botWaitingNodeId: waitingId }, data: { botWaitingNodeId: "" } });
      return;
    }

    const targetId = matchListReply(waitingNode, input.incomingText || "");
    if (!targetId) return;

    // Same atomicity concern as above: only advance past this waiting step
    // once, even if the customer's reply is delivered to the webhook twice.
    const claimed = await prisma.conversation.updateMany({
      where: { id: input.conversationId, botWaitingNodeId: waitingId },
      data: { botWaitingNodeId: "" }
    });
    if (claimed.count === 0) return;
    await executeFrom(channel, nodes, targetId, ctx);
  }
}

export async function runWhatsAppBot(input: { tenantId: string; conversationId: string; phone: string; incomingText?: string }) {
  return runChannelBot("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, incomingText: input.incomingText });
}

export async function runTelegramBot(input: { tenantId: string; conversationId: string; chatId: string; incomingText?: string }) {
  return runChannelBot("telegram", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.chatId, incomingText: input.incomingText });
}
