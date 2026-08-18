import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  if (!(await userHasViewPermission(user, "quickReplies"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json()) as { shortcut?: string; text?: string; team?: string; usage?: number };
  if (!body.shortcut?.trim()) return jsonError("الاختصار مطلوب");
  if (!body.text?.trim()) return jsonError("نص الرد مطلوب");

  const existing = await prisma.quickReply.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر تحديث الرد", 404);

  try {
    return jsonOk(await prisma.quickReply.update({
      where: { id },
      data: {
        shortcut: body.shortcut.trim(),
        text: body.text.trim(),
        team: body.team?.trim() || "",
        usage: body.usage ?? existing.usage
      }
    }));
  } catch {
    return jsonError("تعذر تحديث الرد", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "quickReplies"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const existing = await prisma.quickReply.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر حذف الرد", 404);

  try {
    await prisma.quickReply.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الرد", 404);
  }
}
