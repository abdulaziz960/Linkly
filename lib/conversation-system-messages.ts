import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { formatMessageTime } from "./time";

/**
 * Records a visible, in-thread note whenever a conversation's assignee
 * changes to a real employee/team - so an agent opening the chat sees who
 * (or what) put it in their queue, not just the admin log a customer-facing
 * agent never looks at. Stored as a "note" message (internal-only, never
 * sent to the customer's channel) with sourceType "system_assignment" so
 * the UI can render it as a system line instead of a private-note bubble.
 */
export async function logAssignmentMessage(params: {
  conversationId: string;
  tenantId: string;
  assignee: string;
  assignedBy: string;
}) {
  const assignee = params.assignee.trim();
  if (!assignee || assignee === "بدون موظف") return;

  const text = params.assignedBy.trim()
    ? `تم إسناد هذه المحادثة إلى ${assignee} بواسطة ${params.assignedBy.trim()}.`
    : `تم إسناد هذه المحادثة إلى ${assignee} تلقائيًا بواسطة النظام.`;

  const now = new Date();
  await prisma.message.create({
    data: {
      id: `sys-assign-${randomUUID()}`,
      conversationId: params.conversationId,
      direction: "note",
      text,
      time: formatMessageTime(now),
      createdAt: now.toISOString(),
      author: "",
      sourceType: "system_assignment"
    }
  }).catch((error) => {
    // A failed audit note must never break the assignment itself.
    console.error("Failed to log assignment system message", error);
  });
}

/**
 * Records a visible, in-thread note when a conversation is auto-escalated
 * for going unanswered too long (see lib/response-sla.ts). Same "note" +
 * sourceType pattern as logAssignmentMessage, rendered as a system line.
 */
export async function logEscalationMessage(params: { conversationId: string; notifiedNames: string[]; minutes: number }) {
  const text = params.notifiedNames.length
    ? `تم تصعيد هذه المحادثة تلقائيًا لعدم الرد خلال ${params.minutes} دقيقة، وتم إشعار ${params.notifiedNames.join(" و")}.`
    : `تم تصعيد هذه المحادثة تلقائيًا لعدم الرد خلال ${params.minutes} دقيقة.`;

  const now = new Date();
  await prisma.message.create({
    data: {
      id: `sys-escalate-${randomUUID()}`,
      conversationId: params.conversationId,
      direction: "note",
      text,
      time: formatMessageTime(now),
      createdAt: now.toISOString(),
      author: "",
      sourceType: "system_escalation"
    }
  }).catch((error) => {
    console.error("Failed to log escalation system message", error);
  });
}
