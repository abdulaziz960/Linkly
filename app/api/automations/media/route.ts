import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { saveAutomationMedia } from "../../../../lib/automation-media";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "automations"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const limit = await consumeRateLimit("automation-media", requestIdentifier(request, user.id), 30, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول لاحقًا", 429);

  const body = (await request.json().catch(() => null)) as { name?: unknown; dataUrl?: unknown } | null;
  const result = await saveAutomationMedia(user.tenantId, { name: body?.name, dataUrl: body?.dataUrl });
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ id: result.id, kind: result.kind, name: result.name });
}
