import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import {
  isSupportCategory,
  isSupportPriority,
  validateSupportAttachment,
  type SupportAttachmentInput
} from "../../../../lib/support";
import { nextTicketNumber, recordSupportAuditLog } from "../../../../lib/support-server";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const priority = searchParams.get("priority") || undefined;
  const search = searchParams.get("search")?.trim();

  const tickets = await prisma.supportTicket.findMany({
    where: {
      tenantId: user.tenantId,
      status: status || undefined,
      priority: priority || undefined,
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: search } },
              { subject: { contains: search } }
            ]
          }
        : {})
    },
    orderBy: { createdAt: "desc" }
  });

  return jsonOk(tickets);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as {
    subject?: string;
    category?: string;
    priority?: string;
    description?: string;
    relatedUrl?: string;
    attachments?: SupportAttachmentInput[];
  };

  const subject = body.subject?.trim();
  const description = body.description?.trim();
  if (!subject) return jsonError("عنوان المشكلة مطلوب");
  if (subject.length > 200) return jsonError("عنوان المشكلة أطول من الحد المسموح");
  if (!description) return jsonError("وصف المشكلة مطلوب");
  if (description.length > 8000) return jsonError("وصف المشكلة أطول من الحد المسموح");

  const category = isSupportCategory(body.category) ? body.category : "other";
  const priority = isSupportPriority(body.priority) ? body.priority : "normal";
  const relatedUrl = body.relatedUrl?.trim().slice(0, 500) || "";

  const attachments = (body.attachments || []).slice(0, 5);
  for (const attachment of attachments) {
    const result = validateSupportAttachment(attachment);
    if ("error" in result) return jsonError(result.error);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
    select: { companyName: true }
  });

  const now = new Date().toISOString();
  const ticket = await prisma.$transaction(async (tx) => {
    const ticketNumber = await nextTicketNumber(tx);
    const created = await tx.supportTicket.create({
      data: {
        id: `st-${randomUUID()}`,
        ticketNumber,
        tenantId: user.tenantId,
        createdByUserId: user.id,
        createdByName: user.name,
        createdByEmail: user.email,
        companyName: subscription?.companyName || "",
        subject,
        category,
        priority,
        status: "new",
        relatedUrl,
        createdAt: now,
        updatedAt: now,
        lastCustomerReplyAt: now
      }
    });

    await tx.supportTicketMessage.create({
      data: {
        id: `stm-${randomUUID()}`,
        ticketId: created.id,
        senderType: "customer",
        senderUserId: user.id,
        senderName: user.name,
        text: description,
        attachmentType: attachments[0]?.type || "",
        attachmentUrl: attachments[0]?.dataUrl || "",
        attachmentName: attachments[0]?.name || "",
        attachmentMime: attachments[0]?.mimeType || "",
        createdAt: now
      }
    });

    for (const attachment of attachments.slice(1)) {
      await tx.supportTicketMessage.create({
        data: {
          id: `stm-${randomUUID()}`,
          ticketId: created.id,
          senderType: "customer",
          senderUserId: user.id,
          senderName: user.name,
          text: "",
          attachmentType: attachment.type || "",
          attachmentUrl: attachment.dataUrl || "",
          attachmentName: attachment.name || "",
          attachmentMime: attachment.mimeType || "",
          createdAt: now
        }
      });
    }

    return created;
  });

  await recordSupportAuditLog({
    actorName: user.name,
    action: "تذكرة دعم جديدة",
    ticketId: ticket.id,
    ticketLabel: `${ticket.ticketNumber} — ${subject}`,
    level: priority === "urgent" ? "خطأ" : "معلومة"
  }).catch(() => {});

  return jsonOk(ticket);
}
