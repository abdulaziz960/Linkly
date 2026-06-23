import { NextRequest } from "next/server";
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

  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== id) return jsonError("الرسالة غير موجودة", 404);
    if (message.direction !== "out") return jsonError("يمكن حذف رسائلك فقط");

    const deletedText = "تم حذف هذه الرسالة";
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.message.update({
        where: { id: messageId },
        data: {
          text: deletedText
        }
      });

      await tx.conversation.update({
        where: { id },
        data: {
          lastMessage: deletedText
        }
      });

      return result;
    });

    return jsonOk(updated);
  } catch {
    return jsonError("تعذر حذف الرسالة", 500);
  }
}
