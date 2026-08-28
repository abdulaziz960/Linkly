import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  await ensureSchema();
  const preference = await prisma.tenantPreference.findUnique({ where: { tenantId: user.tenantId } });
  return jsonOk({ leadsPipelineEnabled: preference?.leadsPipelineEnabled !== 0 });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = await request.json().catch(() => null) as { leadsPipelineEnabled?: unknown } | null;
  if (typeof body?.leadsPipelineEnabled !== "boolean") return jsonError("قيمة مسار العملاء غير صالحة", 400);

  await ensureSchema();
  const preference = await prisma.tenantPreference.upsert({
    where: { tenantId: user.tenantId },
    update: {
      leadsPipelineEnabled: body.leadsPipelineEnabled ? 1 : 0,
      updatedAt: new Date().toISOString()
    },
    create: {
      tenantId: user.tenantId,
      leadsPipelineEnabled: body.leadsPipelineEnabled ? 1 : 0,
      updatedAt: new Date().toISOString()
    }
  });

  return jsonOk({ leadsPipelineEnabled: preference.leadsPipelineEnabled !== 0 });
}
