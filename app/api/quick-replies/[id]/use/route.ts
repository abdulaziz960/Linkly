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

  const reply = await prisma.quickReply.update({
    where: { id },
    data: { usage: existing.usage + 1 }
  });

  return jsonOk(reply);
}
