import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { deleteKbEntry, updateKbEntry } from "../../../../lib/knowledge-base";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "knowledgeBase"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { question?: string; answer?: string } | null;
  const answer = body?.answer?.trim();
  if (!answer) return jsonError("محتوى الإجابة مطلوب");

  const entry = await updateKbEntry(user.tenantId, id, { question: body?.question?.trim() || "", answer });
  if (!entry) return jsonError("العنصر غير موجود", 404);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تعديل مدخل قاعدة معرفة "${entry.question || answer.slice(0, 40)}" بواسطة ${user.name}.`, "معلومة", "قاعدة المعرفة");

  return jsonOk(entry);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "knowledgeBase"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const existing = await prisma.knowledgeBaseEntry.findFirst({ where: { id, tenantId: user.tenantId }, select: { question: true, answer: true } });
  const deleted = await deleteKbEntry(user.tenantId, id);
  if (!deleted) return jsonError("العنصر غير موجود", 404);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حذف مدخل قاعدة معرفة "${existing?.question || existing?.answer.slice(0, 40) || id}" بواسطة ${user.name}.`, "تنبيه", "قاعدة المعرفة");

  return jsonOk({ id });
}
