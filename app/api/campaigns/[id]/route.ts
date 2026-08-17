import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = (await request.json()) as { name?: string; status?: string };

  try {
    const existing = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر تحديث الحملة", 404);

    return jsonOk(await prisma.campaign.update({
      where: { id },
      data: { name: body.name?.trim(), status: body.status, updatedAt: new Date().toLocaleString("en-US") }
    }));
  } catch {
    return jsonError("تعذر تحديث الحملة", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  try {
    const existing = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر حذف الحملة", 404);

    await prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الحملة", 404);
  }
}
