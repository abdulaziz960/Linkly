const GRAPH = "https://graph.facebook.com/v22.0";

export type VerificationState = "verified" | "pending" | "rejected" | "not_verified" | "unknown";

/** Maps Meta's business verification_status to the few states the UI shows. */
export function mapVerificationStatus(value: string | undefined): VerificationState {
  switch ((value || "").toLowerCase()) {
    case "verified":
      return "verified";
    case "pending":
    case "pending_submission":
    case "pending_need_more_info":
    case "in_review":
      return "pending";
    case "rejected":
    case "failed":
      return "rejected";
    case "not_verified":
    case "unverified":
    case "expired":
      return "not_verified";
    default:
      return "unknown";
  }
}

export function securityCenterUrl(businessId: string): string {
  const id = businessId.trim();
  return id ? `https://business.facebook.com/settings/security?business_id=${encodeURIComponent(id)}` : "https://business.facebook.com/settings/security";
}

/**
 * The verification status as the WhatsApp Business Account itself reports it (its business_verification_status field and the
 * business that owns it). Readable with the WhatsApp management permission the connection already has - unlike reading the
 * Business node, which needs a business-management permission the connection does not ask for.
 */
export async function fetchWabaVerification(wabaId: string, accessToken: string): Promise<{ ok: true; state: VerificationState; raw: string; businessId: string } | { ok: false; error: string }> {
  const url = new URL(`${GRAPH}/${encodeURIComponent(wabaId)}`);
  url.searchParams.set("fields", "business_verification_status,owner_business_info");
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    const result = (await response.json().catch(() => null)) as { business_verification_status?: string; owner_business_info?: { id?: string }; error?: { message?: string; error_user_msg?: string } } | null;
    if (!response.ok || !result) return { ok: false, error: result?.error?.error_user_msg || result?.error?.message || "تعذر جلب حالة التوثيق من Meta" };
    return { ok: true, state: mapVerificationStatus(result.business_verification_status), raw: result.business_verification_status || "", businessId: /^\d+$/.test(result.owner_business_info?.id ?? "") ? String(result.owner_business_info?.id) : "" };
  } catch {
    return { ok: false, error: "تعذر الوصول إلى Meta" };
  }
}

export async function fetchVerificationStatus(businessId: string, accessToken: string): Promise<{ ok: true; state: VerificationState; raw: string } | { ok: false; error: string }> {
  const url = new URL(`${GRAPH}/${encodeURIComponent(businessId)}`);
  url.searchParams.set("fields", "verification_status");
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    const result = (await response.json().catch(() => null)) as { verification_status?: string; error?: { message?: string; error_user_msg?: string } } | null;
    if (!response.ok || !result) return { ok: false, error: result?.error?.error_user_msg || result?.error?.message || "تعذر جلب حالة التوثيق من Meta" };
    return { ok: true, state: mapVerificationStatus(result.verification_status), raw: result.verification_status || "" };
  } catch {
    return { ok: false, error: "تعذر الوصول إلى Meta" };
  }
}
