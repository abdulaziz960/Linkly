import { NextRequest } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

const GRAPH_VERSION = "v22.0";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("يلزم تسجيل الدخول", 401);

    const settings = await getIntegrationSettings("whatsapp", user.tenantId);
    if (!settings.phoneNumberId || !settings.accessToken) {
      return jsonError("أكمل ربط واتساب أولاً قبل تعديل الملف التجاري");
    }

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${settings.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { headers: { Authorization: `Bearer ${settings.accessToken}` } }
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return jsonError(payload?.error?.message || "تعذر جلب الملف التجاري من Meta", response.status);
    }

    return jsonOk(payload?.data?.[0] || {});
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

    const body = (await request.json()) as {
      about?: string;
      address?: string;
      description?: string;
      email?: string;
      vertical?: string;
      websites?: string[];
      profilePictureDataUrl?: string;
    };

    let profilePictureHandle = "";
    if (body.profilePictureDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(body.profilePictureDataUrl);
      if (!match) return jsonError("صيغة الصورة غير صالحة");

      const mimeType = match[1];
      const buffer = Buffer.from(match[2], "base64");
      const appId = settings.appId || process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "";
      if (!appId) return jsonError("Meta App ID غير مهيأ، تعذر رفع الصورة");

      const sessionResponse = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(settings.accessToken)}`,
        { method: "POST" }
      );
      const sessionPayload = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || !sessionPayload?.id) {
        return jsonError(sessionPayload?.error?.message || "تعذر بدء رفع الصورة", sessionResponse.status);
      }

      const uploadResponse = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${sessionPayload.id}`, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${settings.accessToken}`,
          file_offset: "0"
        },
        body: buffer
      });
      const uploadPayload = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok || !uploadPayload?.h) {
        return jsonError(uploadPayload?.error?.message || "تعذر رفع الصورة إلى Meta", uploadResponse.status);
      }
      profilePictureHandle = uploadPayload.h;
    }

    const updatePayload: Record<string, unknown> = { messaging_product: "whatsapp" };
    if (body.about !== undefined) updatePayload.about = body.about;
    if (body.address !== undefined) updatePayload.address = body.address;
    if (body.description !== undefined) updatePayload.description = body.description;
    if (body.email !== undefined) updatePayload.email = body.email;
    if (body.vertical !== undefined) updatePayload.vertical = body.vertical;
    if (body.websites !== undefined) updatePayload.websites = body.websites.map((site) => site.trim()).filter(Boolean).slice(0, 2);
    if (profilePictureHandle) updatePayload.profile_picture_handle = profilePictureHandle;

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
      return jsonError(payload?.error?.message || "تعذر حفظ الملف التجاري في Meta", response.status);
    }

    return jsonOk({ message: "تم حفظ الملف التجاري بنجاح" });
  } catch (error) {
    console.error("business-profile POST failed", error);
    return jsonError(error instanceof Error ? error.message : "تعذر حفظ الملف التجاري", 500);
  }
}
