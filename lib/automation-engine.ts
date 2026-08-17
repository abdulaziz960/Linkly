import { prisma } from "./prisma";
import { ensureSchema, getIntegrationSettings } from "./database";
import { formatMessageTime } from "./time";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { sendTelegramTextMessage } from "./telegram-send";
import { sendInstagramTextMessage } from "./instagram-send";
import { sendFacebookTextMessage } from "./facebook-send";
import { sendXTextMessage } from "./x-send";
import { sendWebsiteTextMessage } from "./website-send";
import { sendEmailMessage } from "./email-channel";
import { sendUnifonicSms } from "./sms-send";
import { checkOffHoursAutoReply } from "./work-hours";

export type AutomationTrigger =
  | "تم إنشاء رسالة"
  | "تم فتح محادثة"
  | "رد العميل"
  | "تم إغلاق الرسالة";

type RunContext = {
  conversationId: string;
  tenantId: string;
  messageText?: string;
};

type StoredCondition = { field: string; operator: string; value: string };
type StoredAction = { type: string; target: string };

const AUTOMATION_AUTHOR = "الأتمتة";

const statusLabelToValue: Record<string, string | null> = {
  "غير مسندة": "unassigned",
  "مسندة": "assigned",
  "مغلقة": "closed",
  "مفتوحة": null // "open" means anything but closed; handled specially below
};

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isUnsetPlaceholder(value: string) {
  return !value || value.startsWith("اختر ") || value === "لا يحتاج اختيار";
}

async function loadConversationContext(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true, tags: true }
  });
  return conversation;
}

function evaluateCondition(
  condition: StoredCondition,
  ctx: { messageText: string; status: string; tagNames: string[]; channel: string; messageAuthor: string }
): boolean {
  if (isUnsetPlaceholder(condition.value)) return true;

  if (condition.field === "الرسالة تحتوي على") {
    const haystack = ctx.messageText.trim();
    const needle = condition.value.trim();
    if (condition.operator === "يحتوي") return haystack.includes(needle);
    if (condition.operator === "لا يساوي") return haystack !== needle;
    return haystack === needle;
  }

  if (condition.field === "العميل لديه وسم") {
    const hasTag = ctx.tagNames.includes(condition.value);
    return condition.operator === "لا يساوي" ? !hasTag : hasTag;
  }

  if (condition.field === "حالة المحادثة") {
    const mapped = statusLabelToValue[condition.value];
    const matches = mapped === null ? ctx.status !== "closed" : ctx.status === mapped;
    return condition.operator === "لا يساوي" ? !matches : matches;
  }

  if (condition.field === "مصدر الرسالة") {
    let matches: boolean;
    if (condition.value === "رد آلي") matches = ctx.messageAuthor === "الرد الآلي";
    else if (condition.value === "WhatsApp") matches = ctx.channel === "whatsapp";
    else matches = ctx.messageAuthor === "" && ctx.channel !== "";
    return condition.operator === "لا يساوي" ? !matches : matches;
  }

  return true;
}

/**
 * "تلقائي بالتساوي" means assignments should spread across the team, so we
 * pick whichever member currently has the fewest open conversations rather
 * than always handing everything to the team lead.
 */
async function pickTeamAssignee(
  team: { lead: string; routing: string; members: Array<{ employee: { name: string } }> } | null,
  tenantId: string
): Promise<string> {
  if (!team) return "";

  const memberNames = Array.from(new Set(team.members.map((member) => member.employee.name).filter(Boolean)));
  if (team.routing !== "تلقائي بالتساوي" || !memberNames.length) {
    return team.lead?.trim() || "";
  }

  const counts = await prisma.conversation.groupBy({
    by: ["assignee"],
    where: { tenantId, assignee: { in: memberNames }, status: { not: "closed" } },
    _count: { assignee: true }
  });
  const countByName = new Map(memberNames.map((name) => [name, 0]));
  for (const row of counts) countByName.set(row.assignee, row._count.assignee);

  let picked = memberNames[0];
  let lowest = Infinity;
  for (const name of memberNames) {
    const count = countByName.get(name) ?? 0;
    if (count < lowest) {
      lowest = count;
      picked = name;
    }
  }

  return picked;
}

async function sendChannelText(channel: string, args: { tenantId: string; conversationId: string; recipientId: string; text: string }) {
  const base = { tenantId: args.tenantId, conversationId: args.conversationId, text: args.text, author: AUTOMATION_AUTHOR };

  if (channel === "whatsapp") return sendWhatsAppTextMessage({ ...base, to: args.recipientId });
  if (channel === "telegram") return sendTelegramTextMessage({ ...base, chatId: args.recipientId });
  if (channel === "instagram") return sendInstagramTextMessage({ ...base, recipientId: args.recipientId });
  if (channel === "facebook") return sendFacebookTextMessage({ ...base, recipientId: args.recipientId });
  if (channel === "x") return sendXTextMessage({ ...base, recipientId: args.recipientId });
  if (channel === "website") return sendWebsiteTextMessage({ conversationId: args.conversationId, text: args.text, author: AUTOMATION_AUTHOR });

  if (channel === "email") {
    try {
      await sendEmailMessage(args.recipientId, args.text, "رسالة أتمتة من AudienceW", args.tenantId);
    } catch (error) {
      console.error("Automation email send failed", error);
      return { ok: false, error: error instanceof Error ? error.message : "EMAIL_SEND_FAILED" };
    }
    await prisma.message.create({
      data: {
        id: `auto-out-${Date.now()}`,
        conversationId: args.conversationId,
        direction: "out",
        text: args.text,
        time: formatMessageTime(),
        createdAt: new Date().toISOString(),
        author: AUTOMATION_AUTHOR
      }
    });
    return { ok: true };
  }

  if (channel === "sms") {
    const settings = await getIntegrationSettings("sms", args.tenantId);
    const appSid = settings.appId?.trim();
    const senderId = settings.phoneNumber?.trim();
    if (!appSid || !senderId || !args.recipientId) return { ok: false, skipped: true };
    try {
      await sendUnifonicSms({ appSid, senderId, to: args.recipientId, text: args.text });
    } catch (error) {
      console.error("Automation SMS send failed", error);
      return { ok: false, error: error instanceof Error ? error.message : "SMS_SEND_FAILED" };
    }
    await prisma.message.create({
      data: {
        id: `auto-out-${Date.now()}`,
        conversationId: args.conversationId,
        direction: "out",
        text: args.text,
        time: formatMessageTime(),
        createdAt: new Date().toISOString(),
        author: AUTOMATION_AUTHOR
      }
    });
    return { ok: true };
  }

  // Google Maps replies and TikTok messaging need review/thread context this
  // generic action doesn't have, so there's nothing safe to send there.
  return { ok: false, skipped: true };
}

async function executeAction(action: StoredAction, tenantId: string, conversationId: string) {
  if (action.type === "فتح المحادثة") {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "unassigned" } });
    return;
  }

  if (action.type === "إضافة وسم") {
    if (isUnsetPlaceholder(action.target)) return;
    await prisma.conversationTag.upsert({
      where: { conversationId_tagName: { conversationId, tagName: action.target } },
      update: {},
      create: { conversationId, tagName: action.target }
    });
    return;
  }

  if (action.type === "إسناد إلى موظف") {
    if (isUnsetPlaceholder(action.target)) return;
    await prisma.conversation.update({ where: { id: conversationId }, data: { assignee: action.target, status: "assigned" } });
    return;
  }

  if (action.type === "إسناد إلى فريق") {
    if (isUnsetPlaceholder(action.target)) return;
    const team = await prisma.team.findFirst({
      where: { name: action.target, tenantId },
      include: { members: { include: { employee: true } } }
    });
    const assignee = await pickTeamAssignee(team, tenantId);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { assignee: assignee || action.target, status: "assigned" }
    });
    return;
  }

  if (action.type === "إغلاق المحادثة") {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "closed" } });
    return;
  }

  if (action.type === "إرسال قالب") {
    if (isUnsetPlaceholder(action.target)) return;
    const template = await prisma.template.findFirst({ where: { name: action.target, tenantId } });
    if (!template) return;

    const conversation = await loadConversationContext(conversationId);
    if (!conversation) return;

    const text = template.message.replace(/\{\{\s*name\s*\}\}/gi, conversation.customer.name);
    await sendChannelText(conversation.channel, {
      tenantId,
      conversationId,
      recipientId: conversation.customer.phone,
      text
    });
  }
}

async function executeRule(rule: { id: string; actionsJson: string }, tenantId: string, conversationId: string) {
  const actions = parseJsonArray<StoredAction>(rule.actionsJson);
  for (const action of actions) {
    try {
      await executeAction(action, tenantId, conversationId);
    } catch (error) {
      console.error(`Automation rule ${rule.id} action ${action.type} failed`, error);
    }
  }
}

/**
 * Called right after a message is stored (any channel) or a conversation's
 * status changes. Matches enabled rules for this trigger against the
 * conversation's current state, then either runs their actions immediately
 * or queues them for later if the rule has a delay.
 */
export async function runAutomations(trigger: AutomationTrigger, ctx: RunContext) {
  await ensureSchema();

  const conversation = await loadConversationContext(ctx.conversationId);
  if (!conversation) return;

  const rules = await prisma.automationRule.findMany({
    where: { tenantId: ctx.tenantId, trigger, enabled: 1 }
  });
  if (!rules.length) return;

  const lastMessage = ctx.messageText !== undefined
    ? { text: ctx.messageText, author: "" }
    : await prisma.message.findFirst({ where: { conversationId: ctx.conversationId }, orderBy: { createdAt: "desc" } });

  const evalCtx = {
    messageText: ctx.messageText ?? lastMessage?.text ?? "",
    status: conversation.status,
    tagNames: conversation.tags.map((tag) => tag.tagName),
    channel: conversation.channel,
    messageAuthor: (lastMessage && "author" in lastMessage ? lastMessage.author : "") || ""
  };

  for (const rule of rules) {
    const conditions = parseJsonArray<StoredCondition>(rule.conditionsJson);
    const matches = conditions.every((condition) => evaluateCondition(condition, evalCtx));
    if (!matches) continue;

    if (rule.delayMinutes > 0) {
      const runAt = new Date(Date.now() + rule.delayMinutes * 60_000).toISOString();
      await prisma.automationQueueItem.create({
        data: {
          id: `aq-${rule.id}-${Date.now()}`,
          ruleId: rule.id,
          conversationId: ctx.conversationId,
          tenantId: ctx.tenantId,
          runAt,
          createdAt: new Date().toISOString()
        }
      });
    } else {
      await executeRule(rule, ctx.tenantId, ctx.conversationId);
    }
  }
}

/**
 * Convenience wrapper for the inbound side of every channel's inbox module:
 * fires "تم إنشاء رسالة" for every incoming message, plus either
 * "تم فتح محادثة" (first-ever message on this conversation) or "رد العميل"
 * (conversation already had messages) depending on whether this is a brand
 * new conversation.
 */
export async function runInboundMessageAutomations(conversationId: string, tenantId: string, messageText: string) {
  try {
    await runAutomations("تم إنشاء رسالة", { conversationId, tenantId, messageText });
    const messageCount = await prisma.message.count({ where: { conversationId } });
    await runAutomations(messageCount <= 1 ? "تم فتح محادثة" : "رد العميل", { conversationId, tenantId, messageText });
  } catch (error) {
    console.error(`Automations failed for conversation ${conversationId}`, error);
  }

  await checkOffHoursAutoReply(conversationId, tenantId);
}

/**
 * Runs any queued (delayed) automation actions whose time has come. Has no
 * dedicated scheduler behind it - it's invoked opportunistically from the
 * conversations list endpoint, which the dashboard already polls every few
 * seconds while a session is open.
 */
export async function processDueAutomations(tenantId = "tenant-demo") {
  await ensureSchema();

  const now = new Date().toISOString();
  const due = await prisma.automationQueueItem.findMany({
    where: { tenantId, runAt: { lte: now } },
    take: 20
  });
  if (!due.length) return;

  for (const item of due) {
    const rule = await prisma.automationRule.findUnique({ where: { id: item.ruleId } });
    if (rule?.enabled) {
      await executeRule(rule, item.tenantId, item.conversationId);
    }
    await prisma.automationQueueItem.delete({ where: { id: item.id } }).catch(() => undefined);
  }
}
