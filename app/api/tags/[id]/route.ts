import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; color?: string; description?: string };
  const name = body.name?.trim();

  if (!name) return jsonError("اسم الوسم مطلوب");

  try {
    const tag = await prisma.tag.update({
      where: { id },
      data: {
        name,
        color: body.color || "#111827",
        description: body.description?.trim() || ""
      }
    });

    return jsonOk(tag);
  } catch {
    return jsonError("تعذر تحديث الوسم. تأكد أن الاسم غير مكرر.", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) return jsonError("الوسم غير موجود", 404);

    await prisma.$transaction([
      prisma.conversationTag.deleteMany({ where: { tagName: tag.name } }),
      prisma.tag.delete({ where: { id } })
    ]);

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الوسم", 500);
  }
}
