import { NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getTags } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  return jsonOk(await getTags(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { name?: string; color?: string; description?: string };
  const name = body.name?.trim();

  if (!name) return jsonError("اسم الوسم مطلوب");

  const existing = await prisma.tag.findFirst({ where: { tenantId: user.tenantId, name } });
  if (existing) return jsonError("تعذر إضافة الوسم. تأكد أن الاسم غير مكرر.");

  try {
    const tag = await prisma.tag.create({
      data: {
        id: `tag-${Date.now()}`,
        tenantId: user.tenantId,
        name,
        color: body.color || "#111827",
        description: body.description?.trim() || ""
      }
    });

    return jsonOk(tag);
  } catch {
    return jsonError("تعذر إضافة الوسم. تأكد أن الاسم غير مكرر.");
  }
}
