import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
    messageId: string;
  }>;
};

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, messageId } = await context.params;
  const user = await getCurrentUser();

  try {
    if (!user) return jsonError("يلزم تسجيل الدخول", 401);
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId: id,
        conversation: { tenantId: user.tenantId }
      }
    });
    if (!message) return jsonError("الرسالة غير موجودة", 404);
    if (message.direction !== "out") return jsonError("يمكن حذف رسائلك فقط");
    if (user.role !== "مالك الحساب" && message.author !== user.name) return jsonError("يمكن حذف رسائلك فقط", 403);

    const deletedText = "تم حذف هذه الرسالة";
    const updated = await prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { id: messageId, conversationId: id, conversation: { tenantId: user.tenantId } },
        data: {
          text: deletedText
        }
      });

      await tx.conversation.update({
        where: { id, tenantId: user.tenantId },
        data: {
          lastMessage: deletedText
        }
      });

      return tx.message.findFirstOrThrow({
        where: { id: messageId, conversationId: id, conversation: { tenantId: user.tenantId } }
      });
    });

    return jsonOk(updated);
  } catch {
    return jsonError("تعذر حذف الرسالة", 500);
  }
}
