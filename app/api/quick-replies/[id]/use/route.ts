import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const { id } = await context.params;
  const existing = await prisma.quickReply.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("الرد غير موجود", 404);

  // Re-scope the mutation itself to tenantId (not just the existence check
  // above) so a future refactor that drops/reorders the check can't turn
  // this into a cross-tenant write.
  await prisma.quickReply.updateMany({
    where: { id, tenantId: user.tenantId },
    data: { usage: existing.usage + 1 }
  });
  const reply = await prisma.quickReply.findFirst({ where: { id, tenantId: user.tenantId } });

  return jsonOk(reply);
}
