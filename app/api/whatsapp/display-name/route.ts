import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { displayNameProblem, fetchDisplayName, requestDisplayName } from "../../../../lib/whatsapp-display-name";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function connectedWhatsApp(tenantId: string) {
  const settings = await getIntegrationSettings("whatsapp", tenantId);
  if (!settings.phoneNumberId?.trim() || !settings.accessToken?.trim()) return null;
  return { phoneNumberId: settings.phoneNumberId.trim(), accessToken: settings.accessToken.trim() };
}

/** Current display name and Meta's review state. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const connection = await connectedWhatsApp(user.tenantId);
  if (!connection) return jsonError("اربط واتساب أولًا", 400);
  const result = await fetchDisplayName(connection.phoneNumberId, connection.accessToken);
  if (!result.ok) return jsonError(result.error, 502);
  return jsonOk(result.info);
}

/** Submits a new display name to Meta for review. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const limit = await consumeRateLimit("whatsapp-display-name", requestIdentifier(request, user.id), 5, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى لاحقًا", 429);

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim() || "";
  const problem = displayNameProblem(name);
  if (problem) return jsonError(problem);

  const connection = await connectedWhatsApp(user.tenantId);
  if (!connection) return jsonError("اربط واتساب أولًا", 400);

  const result = await requestDisplayName(connection.phoneNumberId, connection.accessToken, name);
  if (!result.ok) return jsonError(result.error);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم إرسال طلب تغيير اسم عرض واتساب إلى "${name}" بواسطة ${user.name}.`, "معلومة", "القنوات");
  const info = await fetchDisplayName(connection.phoneNumberId, connection.accessToken);
  return jsonOk(info.ok ? info.info : { requestedName: name, requestedStatus: "pending" });
}
