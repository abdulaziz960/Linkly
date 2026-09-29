import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { isWithinWorkHours } from "./work-hours";
import { logEscalationMessage } from "./conversation-system-messages";
import { notifyUsers } from "./push-notifications";

const ESCALATION_MINUTES = 30;
const MAX_CONVERSATIONS_PER_TENANT = 100;

/**
 * Finds the team lead's UserAccount id for whoever a conversation is
 * assigned to (Conversation.assignee is a display name, matched against
 * Employee.name within the tenant), and separately the tenant owner's
 * UserAccount id - the "team's supervisor and the admin" this escalates to.
 * Either can come back null (no matching team/lead account, or no owner
 * account yet), which the caller simply skips.
 */
export async function findEscalationTargets(tenantId: string, assignee: string): Promise<string[]> {
  const targets = new Set<string>();

  const owner = await prisma.userAccount.findFirst({ where: { tenantId, role: "مالك الحساب" } });
  if (owner) targets.add(owner.id);

  if (assignee && assignee !== "بدون موظف") {
    const assigneeEmployee = await prisma.employee.findFirst({ where: { tenantId, name: assignee } });
    if (assigneeEmployee) {
      const membership = await prisma.teamMember.findFirst({
        where: { employeeId: assigneeEmployee.id },
        include: { team: true }
      });
      if (membership && membership.team.lead) {
        const leadEmployee = await prisma.employee.findFirst({ where: { tenantId, name: membership.team.lead } });
        if (leadEmployee?.userId) targets.add(leadEmployee.userId);
      }
    }
  }

  return [...targets];
}

async function escalateConversation(conversation: { id: string; tenantId: string; assignee: string; customer: { name: string; phone: string } }, lastMessageId: string) {
  const targetUserIds = await findEscalationTargets(conversation.tenantId, conversation.assignee);

  await notifyUsers(targetUserIds, {
    title: `تصعيد: ${conversation.customer.name}`,
    body: "لم يتم الرد على العميل خلال 30 دقيقة",
    url: conversation.customer.phone
      ? `/dashboard?view=inbox&phone=${encodeURIComponent(conversation.customer.phone)}&name=${encodeURIComponent(conversation.customer.name)}`
      : "/dashboard?view=inbox"
  }).catch((error) => console.error(`Escalation push notification failed for conversation ${conversation.id}`, error));

  const notifiedNames: string[] = [];
  if (targetUserIds.length) notifiedNames.push("المشرف والإدارة");

  await logEscalationMessage({ conversationId: conversation.id, notifiedNames });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { escalatedForMessageId: lastMessageId }
  });
}

/**
 * Escalates conversations that have gone ESCALATION_MINUTES without a reply
 * during the tenant's configured work hours (lib/work-hours.ts) - customer
 * service policy: "لو خدمة العملاء ما ردوا على العميل خلال 30 دقيقة تصعد
 * المحادثة للمشرف تبع الفريق والإدارة". Runs off the existing campaigns cron
 * tick, same batching pattern as sendReengagementReminders
 * (lib/reengagement.ts). Dedup is per unanswered message: escalatedForMessageId
 * only matches the customer's current last message, so once an agent replies
 * (last message becomes outbound) a later unanswered gap escalates again.
 */
export async function escalateUnansweredConversations() {
  await ensureSchema();

  const cutoff = new Date(Date.now() - ESCALATION_MINUTES * 60000).toISOString();

  const tenantRows = await prisma.conversation.findMany({
    distinct: ["tenantId"],
    where: { status: { not: "closed" }, lastActivityAt: { not: "", lte: cutoff } },
    select: { tenantId: true },
    take: 50
  });

  let escalated = 0;

  for (const { tenantId } of tenantRows) {
    if (!(await isWithinWorkHours(tenantId))) continue;

    // Whether a conversation was already escalated for its current last
    // message is decided per-row below (escalatedForMessageId vs the
    // message actually fetched), so this just pulls every not-closed,
    // overdue conversation for the tenant.
    const candidates = await prisma.conversation.findMany({
      where: { tenantId, status: { not: "closed" }, lastActivityAt: { not: "", lte: cutoff } },
      orderBy: { lastActivityAt: "asc" },
      take: MAX_CONVERSATIONS_PER_TENANT,
      include: { customer: true }
    });

    for (const conversation of candidates) {
      const lastMessage = await prisma.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" }
      });
      if (!lastMessage || lastMessage.direction !== "in") continue;
      if (conversation.escalatedForMessageId === lastMessage.id) continue;

      await escalateConversation(conversation, lastMessage.id);
      escalated += 1;
    }
  }

  return { escalated };
}
