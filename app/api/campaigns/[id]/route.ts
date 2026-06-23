import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; sent?: number; total?: number; status?: string };
  const sent = body.sent;
  const total = body.total;
  const progress = typeof sent === "number" && typeof total === "number" && total > 0 ? `${Math.round((sent / total) * 100)}%` : undefined;
  try {
    return jsonOk(await prisma.campaign.update({
      where: { id },
      data: { name: body.name?.trim(), sent, total, status: body.status, progress, updatedAt: new Date().toLocaleString("en-US") }
    }));
  } catch {
    return jsonError("تعذر تحديث الحملة", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    await prisma.campaign.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الحملة", 404);
  }
}
