import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; description?: string; enabled?: boolean };
  try {
    return jsonOk(await prisma.automationRule.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description: body.description?.trim(),
        enabled: typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : undefined
      }
    }));
  } catch {
    return jsonError("تعذر تحديث الأتمتة", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    await prisma.automationRule.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الأتمتة", 404);
  }
}
