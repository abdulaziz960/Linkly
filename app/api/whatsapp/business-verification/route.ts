import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { fetchVerificationStatus, securityCenterUrl } from "../../../../lib/business-verification";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Meta business verification status (read-only; documents are submitted by the owner in Meta's Security Center). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  // businessName holds the Meta business id captured when the number was connected.
  const businessId = settings.businessName?.trim() || "";
  const url = securityCenterUrl(/^\d+$/.test(businessId) ? businessId : "");
  if (!/^\d+$/.test(businessId) || !settings.accessToken?.trim()) return jsonOk({ state: "unknown", url });

  const result = await fetchVerificationStatus(businessId, settings.accessToken.trim());
  if (!result.ok) return jsonOk({ state: "unknown", url, error: result.error });
  return jsonOk({ state: result.state, url });
}
