const GRAPH = "https://graph.facebook.com/v22.0";

export type DisplayNameStatus = "approved" | "pending" | "declined" | "expired" | "none";

export type DisplayNameInfo = {
  verifiedName: string;
  status: DisplayNameStatus;
  /** The requested name still waiting for (or rejected by) Meta's review. */
  requestedName: string;
  requestedStatus: DisplayNameStatus;
  rawStatus: string;
};

/** Maps Meta's name_status / new_name_status values to the few states the UI shows. */
export function mapNameStatus(value: string | undefined): DisplayNameStatus {
  switch ((value || "").toUpperCase()) {
    case "APPROVED":
    case "AVAILABLE_WITHOUT_REVIEW":
      return "approved";
    case "PENDING_REVIEW":
      return "pending";
    case "DECLINED":
      return "declined";
    case "EXPIRED":
      return "expired";
    default:
      return "none";
  }
}

/** Meta's display-name rules we can check up front; Meta still reviews everything else. Returns an Arabic problem or "". */
export function displayNameProblem(name: string): string {
  const text = name.trim();
  if (text.length < 3) return "اسم العرض قصير جدًا (3 أحرف على الأقل).";
  if (text.length > 75) return "اسم العرض طويل جدًا (الحد 75 حرفًا).";
  if (/https?:\/\/|www\.|\.(com|net|org|sa)\b/i.test(text)) return "لا يُسمح بروابط أو نطاقات في اسم العرض.";
  if (/\p{Extended_Pictographic}/u.test(text)) return "لا يُسمح بالرموز التعبيرية (الإيموجي) في اسم العرض.";
  if (/^[\d\s\p{P}]+$/u.test(text)) return "يجب أن يحتوي الاسم على حروف، لا أرقام أو رموز فقط.";
  if (/[<>@#$%^*=+{}[\]\\|~`]/.test(text)) return "الاسم يحتوي رموزًا غير مسموحة.";
  return "";
}

type GraphResult = {
  verified_name?: string;
  name_status?: string;
  new_display_name?: string;
  new_name_status?: string;
  success?: boolean;
  error?: { message?: string; error_user_msg?: string };
};

export async function fetchDisplayName(phoneNumberId: string, accessToken: string): Promise<{ ok: true; info: DisplayNameInfo } | { ok: false; error: string }> {
  const url = new URL(`${GRAPH}/${encodeURIComponent(phoneNumberId)}`);
  url.searchParams.set("fields", "verified_name,name_status,new_display_name,new_name_status");
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    const result = (await response.json().catch(() => null)) as GraphResult | null;
    if (!response.ok || !result) return { ok: false, error: result?.error?.error_user_msg || result?.error?.message || "تعذر جلب حالة الاسم من Meta" };
    return {
      ok: true,
      info: {
        verifiedName: result.verified_name || "",
        status: mapNameStatus(result.name_status),
        requestedName: result.new_display_name || "",
        requestedStatus: mapNameStatus(result.new_name_status),
        rawStatus: result.name_status || ""
      }
    };
  } catch {
    return { ok: false, error: "تعذر الوصول إلى Meta" };
  }
}

export async function requestDisplayName(phoneNumberId: string, accessToken: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ new_display_name: name.trim() }),
      signal: AbortSignal.timeout(15000)
    });
    const result = (await response.json().catch(() => null)) as GraphResult | null;
    if (!response.ok || result?.success === false) return { ok: false, error: result?.error?.error_user_msg || result?.error?.message || "رفضت Meta طلب تغيير الاسم" };
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذر الوصول إلى Meta" };
  }
}
