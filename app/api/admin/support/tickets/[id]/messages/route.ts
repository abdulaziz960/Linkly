import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requirePlatformAdmin } from "../../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../../lib/prisma";
import { statusAfterAgentReply, validateSupportAttachment, type SupportAttachmentInput } from "../../../../../../../lib/support";
import { recordSupportAuditLog } from "../../../../../../../lib/support-server";
import { jsonError, jsonOk } from "../../../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json()) as { text?: string; isInternal?: boolean; attachment?: SupportAttachmentInput };
  const text = body.text?.trim() || "";
  if (!text && !body.attachment) return jsonError("نص الرسالة أو مرفق مطلوب");
  if (text.length > 8000) return jsonError("النص أطول من الحد المسموح");

  if (body.attachment) {
    const result = validateSupportAttachment(body.attachment);
    if ("error" in result) return jsonError(result.error);
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);

  const isInternal = body.isInternal === true;
  const now = new Date().toISOString();

  const messagePromise = prisma.supportTicketMessage.create({
    data: {
      id: `stm-${randomUUID()}`,
      ticketId: ticket.id,
      senderType: "agent",
      senderUserId: admin.id,
      senderName: admin.name,
      text,
      isInternal: isInternal ? 1 : 0,
      attachmentType: body.attachment?.type || "",
      attachmentUrl: body.attachment?.dataUrl || "",
      attachmentName: body.attachment?.name || "",
      attachmentMime: body.attachment?.mimeType || "",
      createdAt: now
    }
  });

  const [message, updated] = isInternal
    ? [await messagePromise, ticket]
    : await prisma.$transaction([
        messagePromise,
        prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { status: statusAfterAgentReply(ticket.status), updatedAt: now, lastAgentReplyAt: now }
        })
      ]);

  await recordSupportAuditLog({
    actorName: admin.name,
    action: isInternal ? "ملاحظة داخلية على تذكرة دعم" : "رد فريق الدعم على تذكرة",
    ticketId: ticket.id,
    ticketLabel: `${ticket.ticketNumber} — ${ticket.subject}`
  }).catch(() => {});

  return jsonOk({ message, ticket: updated });
}
