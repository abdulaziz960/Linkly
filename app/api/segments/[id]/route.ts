import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { deleteSegment, resolveSegmentRecipients, updateSegment } from "../../../../lib/segments";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { name?: string; tagNames?: string[]; inactiveDays?: number } | null;
  const name = body?.name?.trim();
  if (!name) return jsonError("اسم التقسيم مطلوب");

  const tagNames = Array.isArray(body?.tagNames) ? body.tagNames.filter((tagName) => typeof tagName === "string") : [];
  const inactiveDays = Number(body?.inactiveDays) || 0;
  if (inactiveDays < 0) return jsonError("عدد أيام عدم التفاعل غير صالح");

  if (tagNames.length) {
    const validTags = await prisma.tag.findMany({ where: { tenantId: user.tenantId, name: { in: tagNames } }, select: { name: true } });
    const validTagNames = new Set(validTags.map((tag) => tag.name));
    if (tagNames.some((tagName) => !validTagNames.has(tagName))) return jsonError("أحد الوسوم المختارة غير موجود");
  }

  const segment = await updateSegment(user.tenantId, id, { name, tagNames, inactiveDays });
  if (!segment) return jsonError("التقسيم غير موجود", 404);

  const recipientCount = (await resolveSegmentRecipients(user.tenantId, segment)).length;
  return jsonOk({ ...segment, recipientCount });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const deleted = await deleteSegment(user.tenantId, id);
  if (!deleted) return jsonError("التقسيم غير موجود", 404);

  return jsonOk({ id });
}
