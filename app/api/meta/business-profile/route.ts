import { NextRequest } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { uploadMetaMedia } from "../../../../lib/meta-media-upload";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

const GRAPH_VERSION = "v22.0";

type MetaError = { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
type BusinessProfileBody = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
  profilePictureDataUrl?: string;
};

type BusinessProfile = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
};

function formatMetaError(error: MetaError | undefined, fallback: string) {
  if (!error?.message) return fallback;
  if (error.code === 133010) {
    return "رقم واتساب غير مسجل لدى Meta (133010). أكمل تسجيل الرقم برمز التحقق بخطوتين من هذه الصفحة قبل حفظ الملف التجاري أو إرسال الرسائل.";
  }
  if (error.code === 133015) {
    return "Meta طلبت الانتظار بضع دقائق قبل إعادة تسجيل الرقم (133015). لا تكرر المحاولة الآن.";
  }
  if (error.code === 131000) {
    return "Meta رجعت خطأ مؤقت أثناء تحديث الملف التجاري. إذا كانت البيانات ظهرت بعد التحديث فهي محفوظة، وإلا جرّب بعد دقائق أو غيّر حقل واحد في كل مرة لمعرفة الحقل المرفوض.";
  }
  const codePart = error.code !== undefined ? ` (code ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ""})` : "";
  return `${error.message}${codePart}`;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanWebsites(websites: unknown) {
  if (!Array.isArray(websites)) return [];
  return websites
    .map((site) => cleanText(site))
    .filter(Boolean)
    .filter((site) => /^https?:\/\/\S+\.\S+/.test(site))
    .slice(0, 2);
}

function buildBusinessProfilePayload(body: BusinessProfileBody, profilePictureHandle = "") {
  const updatePayload: Record<string, unknown> = { messaging_product: "whatsapp" };
  if (body.about !== undefined) updatePayload.about = cleanText(body.about);
  if (body.address !== undefined) updatePayload.address = cleanText(body.address);
  if (body.description !== undefined) updatePayload.description = cleanText(body.description);
  if (body.email !== undefined) updatePayload.email = cleanText(body.email);
  if (body.vertical !== undefined) updatePayload.vertical = cleanText(body.vertical);
  if (body.websites !== undefined) updatePayload.websites = cleanWebsites(body.websites);
  if (profilePictureHandle) updatePayload.profile_picture_handle = profilePictureHandle;
  return updatePayload;
}

function sameText(a: unknown, b: unknown) {
  return cleanText(a) === cleanText(b);
}

function sameWebsites(a: unknown, b: unknown) {
  return cleanWebsites(a).join("|") === cleanWebsites(b).join("|");
}

async function fetchBusinessProfile(settings: { phoneNumberId?: string; accessToken?: string }) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${settings.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
    { headers: { Authorization: `Bearer ${settings.accessToken}` } }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { ok: false as const, error: payload?.error as MetaError | undefined, status: response.status };
  return { ok: true as const, data: (payload?.data?.[0] || {}) as BusinessProfile };
}

function profileMatchesRequest(profile: BusinessProfile, body: BusinessProfileBody) {
  if (body.about !== undefined && !sameText(profile.about, body.about)) return false;
  if (body.address !== undefined && !sameText(profile.address, body.address)) return false;
  if (body.description !== undefined && !sameText(profile.description, body.description)) return false;
  if (body.email !== undefined && !sameText(profile.email, body.email)) return false;
  if (body.vertical !== undefined && !sameText(profile.vertical, body.vertical)) return false;
  if (body.websites !== undefined && !sameWebsites(profile.websites, body.websites)) return false;
  return true;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("يلزم تسجيل الدخول", 401);

    const settings = await getIntegrationSettings("whatsapp", user.tenantId);
    if (!settings.phoneNumberId || !settings.accessToken) {
      return jsonError("أكمل ربط واتساب أولاً قبل تعديل الملف التجاري");
    }

    const result = await fetchBusinessProfile(settings);
    if (!result.ok) return jsonError(formatMetaError(result.error, "تعذر جلب الملف التجاري من Meta"), result.status);

    return jsonOk(result.data);
  } catch (error) {
    console.error("business-profile GET failed", error);
    return jsonError(error instanceof Error ? error.message : "تعذر جلب الملف التجاري", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("يلزم تسجيل الدخول", 401);

    const settings = await getIntegrationSettings("whatsapp", user.tenantId);
    if (!settings.phoneNumberId || !settings.accessToken) {
      return jsonError("أكمل ربط واتساب أولاً قبل تعديل الملف التجاري");
    }

    const body = (await request.json()) as BusinessProfileBody;

    let profilePictureHandle = "";
    if (body.profilePictureDataUrl) {
      const uploadResult = await uploadMetaMedia(settings.accessToken, body.profilePictureDataUrl);
      if (!uploadResult.ok) return jsonError(uploadResult.error);
      profilePictureHandle = uploadResult.handle;
    }

    const updatePayload = buildBusinessProfilePayload(body, profilePictureHandle);

    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${settings.phoneNumberId}/whatsapp_business_profile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatePayload)
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const refreshed = await fetchBusinessProfile(settings).catch(() => null);
      if (refreshed?.ok && profileMatchesRequest(refreshed.data, body) && !body.profilePictureDataUrl) {
        await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تعديل الملف التجاري لواتساب بواسطة ${user.name}.`, "معلومة", "التكاملات");
        return jsonOk({ message: "تم حفظ بيانات الملف التجاري. Meta أعادت تنبيهًا عامًا بعد الحفظ، لكن البيانات الحالية مطابقة للتعديل." });
      }
      return jsonError(formatMetaError(payload?.error, "تعذر حفظ الملف التجاري في Meta"), response.status);
    }

    await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تعديل الملف التجاري لواتساب بواسطة ${user.name}.`, "معلومة", "التكاملات");

    return jsonOk({ message: "تم حفظ الملف التجاري بنجاح" });
  } catch (error) {
    console.error("business-profile POST failed", error);
    return jsonError(error instanceof Error ? error.message : "تعذر حفظ الملف التجاري", 500);
  }
}
