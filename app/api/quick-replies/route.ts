import { NextRequest } from "next/server";
import { getQuickReplies } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  return jsonOk(await getQuickReplies(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "quickReplies"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as { shortcut?: string; text?: string; team?: string; usage?: number };
  if (!body.shortcut?.trim()) return jsonError("الاختصار مطلوب");
  if (!body.text?.trim()) return jsonError("نص الرد مطلوب");

  const reply = await prisma.quickReply.create({
    data: {
      id: `qr-${Date.now()}`,
      tenantId: user.tenantId,
      shortcut: body.shortcut.trim(),
      text: body.text.trim(),
      team: body.team?.trim() || "",
      usage: body.usage ?? 0
    }
  });

  return jsonOk(reply);
}
