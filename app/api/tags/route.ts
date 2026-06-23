import { NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getTags } from "../../../lib/database";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getTags());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; color?: string; description?: string };
  const name = body.name?.trim();

  if (!name) return jsonError("اسم الوسم مطلوب");

  try {
    const tag = await prisma.tag.create({
      data: {
        id: `tag-${Date.now()}`,
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
