import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { fetchVerificationStatus, fetchWabaVerification, securityCenterUrl } from "../../../../lib/business-verification";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Meta business verification status (read-only; documents are submitted by the owner in Meta's Security Center). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  // businessName holds the Meta business id captured when the number was connected.
  const savedBusinessId = /^\d+$/.test(settings.businessName?.trim() || "") ? settings.businessName.trim() : "";
  const token = settings.accessToken?.trim() || "";
  if (!token) return jsonOk({ state: "unknown", url: securityCenterUrl(savedBusinessId), error: "اربط واتساب أولًا" });

  // The account itself reports its verification state (and which business owns it) with the permission we already have.
  const wabaId = settings.wabaId?.trim() || "";
  let lastError = "";
  if (wabaId) {
    const viaWaba = await fetchWabaVerification(wabaId, token);
    if (viaWaba.ok) return jsonOk({ state: viaWaba.state, url: securityCenterUrl(viaWaba.businessId || savedBusinessId) });
    lastError = viaWaba.error;
  }
  // The saved business id, read from the Business node (needs a business-management permission).
  if (savedBusinessId) {
    const viaBusiness = await fetchVerificationStatus(savedBusinessId, token);
    if (viaBusiness.ok) return jsonOk({ state: viaBusiness.state, url: securityCenterUrl(savedBusinessId) });
    lastError = lastError || viaBusiness.error;
  }
  return jsonOk({ state: "unknown", url: securityCenterUrl(savedBusinessId), error: lastError || "لم نستطع تحديد حساب النشاط التجاري في Meta. أعد ربط واتساب." });
}
