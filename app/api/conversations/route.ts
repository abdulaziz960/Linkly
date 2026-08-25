import { NextRequest } from "next/server";
import { getConversations } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { getEmployeeForUser } from "../../../lib/permissions-server";
import { canSeeAllConversations } from "../../../lib/permissions";
import { prisma } from "../../../lib/prisma";
import { processDueAutomations } from "../../../lib/automation-engine";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

/** Anyone without full conversation visibility only ever sees conversations assigned to them - mirrors lib/permissions.ts canSeeAllConversations, used client-side for the same scoping. */
async function assigneeScopeFor(user: { role: string; email: string; tenantId: string }) {
  const employee = await getEmployeeForUser(user);
  if (canSeeAllConversations(user.role, employee ?? undefined)) return undefined;
  return employee?.name;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  processDueAutomations(user.tenantId).catch((error) => {
    console.error("Automation queue processing failed", error);
  });
  const assigneeName = await assigneeScopeFor(user);
  return jsonOk(await getConversations(user.tenantId, assigneeName));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { customerId?: string };
  const customerId = body.customerId?.trim();

  if (!customerId) return jsonError("العميل مطلوب");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { conversations: true }
  });

  if (!customer) return jsonError("لم يتم العثور على العميل", 404);
  if (customer.tenantId !== user.tenantId) return jsonError("لم يتم العثور على العميل", 404);

  const conversationId = customer.conversations[0]?.id || customer.id;

  if (!customer.conversations.length) {
    await prisma.conversation.create({
      data: {
        id: conversationId,
        customerId: customer.id,
        channel: "whatsapp",
        lastMessage: "لا توجد رسائل بعد",
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 1,
        tenantId: user.tenantId
      }
    });
  }

  const conversations = await getConversations(user.tenantId);
  const conversation = conversations.find((item) => item.id === conversationId);

  if (!conversation) return jsonError("تعذر فتح محادثة العميل");

  return jsonOk(conversation);
}
