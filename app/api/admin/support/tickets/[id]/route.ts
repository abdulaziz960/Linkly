import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../lib/prisma";
import { isSupportPriority, isSupportStatus, recordSupportAuditLog } from "../../../../../../lib/support";
import { jsonError, jsonOk } from "../../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);

  return jsonOk(ticket);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json()) as {
    status?: string;
    priority?: string;
    assignedAgentId?: string;
    assignedAgentName?: string;
  };

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);

  const now = new Date().toISOString();
  const data: Record<string, unknown> = { updatedAt: now };
  const systemMessages: string[] = [];

  if (body.status !== undefined) {
    if (!isSupportStatus(body.status)) return jsonError("حالة غير صالحة");
    data.status = body.status;
    if (body.status === "resolved") data.resolvedAt = now;
    if (body.status === "closed") data.closedAt = now;
    if (body.status !== "resolved" && body.status !== "closed") {
      data.resolvedAt = "";
      data.closedAt = "";
    }
    systemMessages.push(`تم تغيير الحالة إلى: ${body.status}`);
  }

  if (body.priority !== undefined) {
    if (!isSupportPriority(body.priority)) return jsonError("أولوية غير صالحة");
    data.priority = body.priority;
    systemMessages.push(`تم تغيير الأولوية إلى: ${body.priority}`);
  }

  if (body.assignedAgentId !== undefined) {
    data.assignedAgentId = body.assignedAgentId;
    data.assignedAgentName = body.assignedAgentName || "";
    systemMessages.push(
      body.assignedAgentId ? `تم إسناد التذكرة إلى: ${body.assignedAgentName || body.assignedAgentId}` : "تم إلغاء إسناد التذكرة"
    );
  }

  if (Object.keys(data).length === 1) return jsonError("لا يوجد تغيير لتطبيقه");

  const [updated] = await prisma.$transaction([
    prisma.supportTicket.update({ where: { id: ticket.id }, data }),
    ...systemMessages.map((text) =>
      prisma.supportTicketMessage.create({
        data: {
          id: `stm-${randomUUID()}`,
          ticketId: ticket.id,
          senderType: "system",
          senderName: admin.name,
          text,
          createdAt: now
        }
      })
    )
  ]);

  await recordSupportAuditLog({
    actorName: admin.name,
    action: `تحديث تذكرة دعم: ${systemMessages.join("، ")}`,
    ticketId: ticket.id,
    ticketLabel: `${ticket.ticketNumber} — ${ticket.subject}`
  }).catch(() => {});

  return jsonOk(updated);
}
