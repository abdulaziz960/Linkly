import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { canReopen, excludeInternalMessages } from "../../../../../lib/support";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const ticket = await prisma.supportTicket.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);

  return jsonOk({ ...ticket, messages: excludeInternalMessages(ticket.messages) });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { action?: string };
  if (body.action !== "reopen") return jsonError("إجراء غير مدعوم");

  const ticket = await prisma.supportTicket.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);
  if (ticket.status !== "resolved" && ticket.status !== "closed") {
    return jsonError("التذكرة مفتوحة بالفعل");
  }
  const referenceDate = ticket.status === "resolved" ? ticket.resolvedAt : ticket.closedAt;
  if (!canReopen(referenceDate)) {
    return jsonError("انتهت مهلة إعادة فتح هذه التذكرة، يرجى إنشاء تذكرة جديدة");
  }

  const now = new Date().toISOString();
  const [updated] = await prisma.$transaction([
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "open", updatedAt: now, resolvedAt: "", closedAt: "" }
    }),
    prisma.supportTicketMessage.create({
      data: {
        id: `stm-${randomUUID()}`,
        ticketId: ticket.id,
        senderType: "system",
        senderName: user.name,
        text: "تم إعادة فتح التذكرة من قبل العميل",
        createdAt: now
      }
    })
  ]);

  return jsonOk(updated);
}
