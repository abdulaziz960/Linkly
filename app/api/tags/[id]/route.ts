import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "tags"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; color?: string; description?: string };
  const name = body.name?.trim();

  if (!name) return jsonError("اسم الوسم مطلوب");

  const existingTag = await prisma.tag.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existingTag) return jsonError("الوسم غير موجود", 404);

  const duplicate = await prisma.tag.findFirst({ where: { tenantId: user.tenantId, name, NOT: { id } } });
  if (duplicate) return jsonError("تعذر تحديث الوسم. تأكد أن الاسم غير مكرر.");

  try {
    await prisma.tag.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        name,
        color: body.color || "#111827",
        description: body.description?.trim() || ""
      }
    });
    const tag = await prisma.tag.findFirst({ where: { id, tenantId: user.tenantId } });

    return jsonOk(tag);
  } catch {
    return jsonError("تعذر تحديث الوسم. تأكد أن الاسم غير مكرر.", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "tags"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;

  try {
    const tag = await prisma.tag.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!tag) return jsonError("الوسم غير موجود", 404);

    await prisma.$transaction([
      prisma.conversationTag.deleteMany({ where: { tagName: tag.name, conversation: { tenantId: user.tenantId } } }),
      prisma.tag.deleteMany({ where: { id, tenantId: user.tenantId } })
    ]);

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الوسم", 500);
  }
}
