import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { isWithinWorkHours } from "./work-hours";
import { logEscalationMessage } from "./conversation-system-messages";
import { notifyUsers } from "./push-notifications";
import { getTenantPlanName } from "./plan-access-server";
import { getTenantGrants } from "./plan-grants";
import { isEscalationAllowedForPlan } from "./plan-access";

const DEFAULT_ESCALATION_MINUTES = 30;
// The coarse, cheap "which tenants have anything overdue at all" filter
// below has to use the shortest possible per-tenant threshold a tenant
// could configure - otherwise a tenant with a shorter-than-default
// escalationMinutes could have overdue conversations that this filter
// silently never surfaces.
export const MIN_ESCALATION_MINUTES = 1;
export const MAX_ESCALATION_MINUTES = 1440;
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

async function escalateConversation(conversation: { id: string; tenantId: string; assignee: string; customer: { name: string; phone: string } }, lastMessageId: string, minutes: number) {
  const targetUserIds = await findEscalationTargets(conversation.tenantId, conversation.assignee);

  await notifyUsers(targetUserIds, {
    title: `تصعيد: ${conversation.customer.name}`,
    body: `لم يتم الرد على العميل خلال ${minutes} دقيقة`,
    url: conversation.customer.phone
      ? `/dashboard?view=inbox&phone=${encodeURIComponent(conversation.customer.phone)}&name=${encodeURIComponent(conversation.customer.name)}`
      : "/dashboard?view=inbox"
  }).catch((error) => console.error(`Escalation push notification failed for conversation ${conversation.id}`, error));

  const notifiedNames: string[] = [];
  if (targetUserIds.length) notifiedNames.push("المشرف والإدارة");

  await logEscalationMessage({ conversationId: conversation.id, notifiedNames, minutes });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { escalatedForMessageId: lastMessageId }
  });
}

/**
 * Escalates conversations that have gone the tenant's configured number of
 * minutes (TenantPreference.escalationMinutes, default 30 - settable from
 * the Automations view) without a reply during the tenant's configured work
 * hours (lib/work-hours.ts) - customer service policy: "لو خدمة العملاء ما
 * ردوا على العميل خلال X دقيقة تصعد المحادثة للمشرف تبع الفريق والإدارة".
 * Runs off the existing campaigns cron tick, same batching pattern as
 * sendReengagementReminders (lib/reengagement.ts). Dedup is per unanswered
 * message: escalatedForMessageId only matches the customer's current last
 * message, so once an agent replies (last message becomes outbound) a later
 * unanswered gap escalates again.
 */
export async function escalateUnansweredConversations() {
  await ensureSchema();

  // Coarse net using the shortest possible configured threshold (see
  // MIN_ESCALATION_MINUTES) - the per-tenant threshold actually enforced
  // below in the loop.
  const broadestCutoff = new Date(Date.now() - MIN_ESCALATION_MINUTES * 60000).toISOString();

  const tenantRows = await prisma.conversation.findMany({
    distinct: ["tenantId"],
    where: { status: { not: "closed" }, lastActivityAt: { not: "", lte: broadestCutoff } },
    select: { tenantId: true },
    take: 50
  });

  let escalated = 0;

  for (const { tenantId } of tenantRows) {
    // Plans without escalation (e.g. the single-user individuals plan) never raise SLA alerts.
    if (!isEscalationAllowedForPlan(await getTenantPlanName(tenantId), await getTenantGrants(tenantId))) continue;
    if (!(await isWithinWorkHours(tenantId))) continue;

    const preference = await prisma.tenantPreference.findUnique({ where: { tenantId }, select: { escalationMinutes: true } });
    const minutes = preference?.escalationMinutes && preference.escalationMinutes >= MIN_ESCALATION_MINUTES && preference.escalationMinutes <= MAX_ESCALATION_MINUTES
      ? preference.escalationMinutes
      : DEFAULT_ESCALATION_MINUTES;
    const cutoff = new Date(Date.now() - minutes * 60000).toISOString();

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
      // Excludes "note" rows (assignment/escalation system messages) - one
      // landing after the customer's message would otherwise become the
      // "last message" and permanently block escalation for a genuinely
      // still-unanswered conversation, since its direction is never "in".
      const lastMessage = await prisma.message.findFirst({
        where: { conversationId: conversation.id, direction: { in: ["in", "out"] } },
        orderBy: { createdAt: "desc" }
      });
      if (!lastMessage || lastMessage.direction !== "in") continue;
      if (conversation.escalatedForMessageId === lastMessage.id) continue;

      await escalateConversation(conversation, lastMessage.id, minutes);
      escalated += 1;
    }
  }

  return { escalated };
}
