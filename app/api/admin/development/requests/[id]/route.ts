import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../lib/prisma";
import { isDevelopmentStatus } from "../../../../../../lib/development";
import { jsonError, jsonOk } from "../../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json()) as { status?: string; rejectionReason?: string };
  if (!isDevelopmentStatus(body.status)) return jsonError("حالة غير صالحة");

  const featureRequest = await prisma.featureRequest.findUnique({ where: { id } });
  if (!featureRequest) return jsonError("الطلب غير موجود", 404);

  const rejectionReason = body.rejectionReason?.trim() || "";
  if (body.status === "rejected" && !rejectionReason) {
    return jsonError("سبب الرفض مطلوب");
  }

  const now = new Date().toISOString();
  const updated = await prisma.featureRequest.update({
    where: { id },
    data: {
      status: body.status,
      rejectionReason: body.status === "rejected" ? rejectionReason : "",
      resolvedAt: body.status === "resolved" ? now : featureRequest.resolvedAt,
      updatedAt: now
    }
  });

  return jsonOk(updated);
}
