import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

/**
 * Merges the duplicate customer (sourceId) into the target customer (id):
 * every conversation the duplicate owns moves to the target, then the now-
 * empty duplicate record is deleted. The target keeps its own name/phone -
 * this is a merge, not a swap, so whichever profile the user opened the
 * merge from is the one that survives.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "contacts"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { sourceId?: string };
  const sourceId = body.sourceId?.trim();

  if (!sourceId) return jsonError("اختر العميل المكرر المراد دمجه");
  if (sourceId === id) return jsonError("لا يمكن دمج العميل مع نفسه");

  try {
    const merged = await prisma.$transaction(async (tx) => {
      const [target, source] = await Promise.all([
        tx.customer.findFirst({ where: { id, tenantId: user.tenantId } }),
        tx.customer.findFirst({ where: { id: sourceId, tenantId: user.tenantId } })
      ]);
      if (!target || !source) throw new Error("not-found");

      await tx.conversation.updateMany({
        where: { customerId: sourceId, tenantId: user.tenantId },
        data: { customerId: id }
      });
      await tx.customer.deleteMany({ where: { id: sourceId, tenantId: user.tenantId } });

      return target;
    });

    return jsonOk(merged);
  } catch {
    return jsonError("تعذر دمج العميلين", 404);
  }
}
