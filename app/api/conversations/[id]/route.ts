import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { runAutomations } from "../../../../lib/automation-engine";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();

  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = (await request.json()) as {
    assignee?: string;
    status?: string;
    unread?: number;
    windowExpired?: boolean;
    tags?: string[];
  };

  try {
    const conversation = await prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true }
      });

      if (!existing) throw new Error("not-found");

      if (body.tags) {
        await tx.conversationTag.deleteMany({ where: { conversationId: id } });
        for (const tagName of body.tags) {
          await tx.conversationTag.create({
            data: {
              conversationId: id,
              tagName
            }
          });
        }
      }

      return tx.conversation.update({
        where: { id },
        data: {
          assignee: body.assignee,
          status: body.status,
          unread: typeof body.unread === "number" ? Math.max(0, body.unread) : undefined,
          windowExpired: typeof body.windowExpired === "boolean" ? (body.windowExpired ? 1 : 0) : undefined
        }
      });
    });

    if (body.status === "closed") {
      await runAutomations("تم إغلاق الرسالة", { conversationId: id, tenantId: user.tenantId }).catch((error) => {
        console.error(`Automations failed for conversation ${id}`, error);
      });
    }

    return jsonOk(conversation);
  } catch {
    return jsonError("تعذر تحديث المحادثة", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();

  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب" && user.role !== "مشرف") {
    return jsonError("حذف المحادثات متاح لمالك الحساب أو المشرف فقط", 403);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true }
      });

      if (!existing) throw new Error("not-found");

      await tx.conversationTag.deleteMany({ where: { conversationId: id } });
      await tx.message.deleteMany({ where: { conversationId: id } });
      await tx.conversation.delete({ where: { id } });
    });

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف المحادثة", 404);
  }
}
