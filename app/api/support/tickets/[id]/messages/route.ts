import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";
import { canReopen, recordSupportAuditLog, statusAfterCustomerReply, validateSupportAttachment, type SupportAttachmentInput } from "../../../../../../lib/support";
import { jsonError, jsonOk } from "../../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { text?: string; attachment?: SupportAttachmentInput };
  const text = body.text?.trim() || "";
  if (!text && !body.attachment) return jsonError("نص الرد أو مرفق مطلوب");
  if (text.length > 8000) return jsonError("نص الرد أطول من الحد المسموح");

  if (body.attachment) {
    const result = validateSupportAttachment(body.attachment);
    if ("error" in result) return jsonError(result.error);
  }

  const ticket = await prisma.supportTicket.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);

  if (ticket.status === "closed") {
    const canReplyToClosed = canReopen(ticket.closedAt);
    if (!canReplyToClosed) return jsonError("انتهت مهلة إعادة فتح هذه التذكرة، يرجى إنشاء تذكرة جديدة");
  }

  const now = new Date().toISOString();
  const nextStatus = statusAfterCustomerReply(ticket.status);

  const [message, updated] = await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        id: `stm-${randomUUID()}`,
        ticketId: ticket.id,
        senderType: "customer",
        senderUserId: user.id,
        senderName: user.name,
        text,
        attachmentType: body.attachment?.type || "",
        attachmentUrl: body.attachment?.dataUrl || "",
        attachmentName: body.attachment?.name || "",
        attachmentMime: body.attachment?.mimeType || "",
        createdAt: now
      }
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        updatedAt: now,
        lastCustomerReplyAt: now,
        resolvedAt: nextStatus === "open" ? "" : undefined,
        closedAt: nextStatus === "open" ? "" : undefined
      }
    })
  ]);

  await recordSupportAuditLog({
    actorName: user.name,
    action: "رد العميل على تذكرة دعم",
    ticketId: ticket.id,
    ticketLabel: `${ticket.ticketNumber} — ${ticket.subject}`
  }).catch(() => {});

  return jsonOk({ message, ticket: updated });
}
