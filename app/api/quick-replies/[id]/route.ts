import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { shortcut?: string; text?: string; team?: string; usage?: number };
  if (!body.shortcut?.trim()) return jsonError("الاختصار مطلوب");
  if (!body.text?.trim()) return jsonError("نص الرد مطلوب");

  try {
    return jsonOk(await prisma.quickReply.update({
      where: { id },
      data: {
        shortcut: body.shortcut.trim(),
        text: body.text.trim(),
        team: body.team?.trim() || "الدعم",
        usage: body.usage ?? 0
      }
    }));
  } catch {
    return jsonError("تعذر تحديث الرد", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    await prisma.quickReply.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الرد", 404);
  }
}
