import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { createWaLink, listWaLinks, normalizeWaLinkInput, workspaceWhatsappDigits } from "../../../lib/wa-links";
import { getAppOrigin } from "../../../lib/app-url";
import { jsonError, jsonOk } from "../_utils/json";
import { isTrustedOrigin } from "../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const [links, digits] = await Promise.all([listWaLinks(user.tenantId), workspaceWhatsappDigits(user.tenantId)]);
  return jsonOk({ links, origin: getAppOrigin(request), whatsappReady: Boolean(digits) });
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const parsed = normalizeWaLinkInput(((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  return jsonOk({ link: await createWaLink(user.tenantId, parsed.data) });
}
