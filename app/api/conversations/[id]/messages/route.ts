import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    direction?: string;
    text?: string;
    forceWindowExpired?: boolean;
  };
  const text = body.text?.trim();

  if (!text) return jsonError("نص الرسالة مطلوب");

  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          id: `m-${Date.now()}`,
          conversationId: id,
          direction: body.direction || "out",
          text,
          time: "الآن"
        }
      });

      await tx.conversation.update({
        where: { id },
        data: {
          lastMessage: text,
          windowExpired: body.forceWindowExpired ? 1 : undefined
        }
      });

      return created;
    });

    return jsonOk(message);
  } catch {
    return jsonError("تعذر إرسال الرسالة", 404);
  }
}
