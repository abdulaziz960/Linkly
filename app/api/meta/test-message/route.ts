import { NextRequest } from "next/server";
import { getIntegrationSettings, getTemplates } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { normalizeWhatsAppPhone, storeWhatsAppMessage } from "../../../../lib/whatsapp-inbox";
import { SECRET_MASK } from "../../../../lib/secret-storage";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("يلزم تسجيل الدخول", 401);

    const settings = await getIntegrationSettings("whatsapp", user.tenantId);
    const body = (await request.json()) as {
      phoneNumberId?: string;
      accessToken?: string;
      to?: string;
      templateName?: string;
      message?: string;
    };
    const phoneNumberId = body.phoneNumberId?.trim() || settings.phoneNumberId;
    const bodyAccessToken = body.accessToken?.trim();
    const accessToken = (bodyAccessToken && bodyAccessToken !== SECRET_MASK ? bodyAccessToken : "") || settings.accessToken;
    const to = normalizeWhatsAppPhone(body.to || "");
    const templateName = body.templateName?.trim() || "";
    const freeTextMessage = body.message?.trim() || "";

    if (!phoneNumberId) return jsonError("Phone Number ID مطلوب قبل إرسال رسالة اختبار");
    if (!accessToken) return jsonError("Access Token مطلوب قبل إرسال رسالة اختبار");
    if (!to) return jsonError("رقم المستلم مطلوب");
    if (!templateName && !freeTextMessage) return jsonError("اختر قالبًا أو اكتب نص رسالة للإرسال");

    // A tenant with no approved templates yet (brand-new WABA, none synced)
    // falls back to a free-form text send - subject to WhatsApp's 24h
    // customer-service window - since a template send isn't possible until
    // one gets approved.
    let template: { name: string; language?: string; message: string } | null = null;
    if (templateName) {
      const templates = await getTemplates(user.tenantId);
      template = templates.find((item) => item.name === templateName && item.status === "معتمد") || null;
      if (!template) return jsonError("القالب المختار غير معتمد أو غير موجود");
    }

    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        template
          ? {
              messaging_product: "whatsapp",
              to,
              type: "template",
              template: {
                name: template.name,
                language: { code: template.language || "ar" }
              }
            }
          : {
              messaging_product: "whatsapp",
              to,
              type: "text",
              text: { preview_url: false, body: freeTextMessage }
            }
      )
    });

    const metaResponse = await response.json().catch(() => null);

    if (!response.ok) {
      return jsonError(metaResponse?.error?.message || "تعذر إرسال رسالة الاختبار من Meta", response.status);
    }

    try {
      await storeWhatsAppMessage({
        tenantId: user.tenantId,
        phone: to,
        name: `رقم اختبار ${to.slice(-4)}`,
        text: template ? (template.message || `[قالب] ${template.name}`) : freeTextMessage,
        direction: "out",
        messageId: metaResponse?.messages?.[0]?.id,
        author: "Linkly"
      });
    } catch (error) {
      console.error("storeWhatsAppMessage failed after a successful Meta send", error);
    }

    return jsonOk({
      message: "تم إرسال رسالة الاختبار",
      meta: metaResponse
    });
  } catch (error) {
    console.error("test-message route failed", error);
    return jsonError(error instanceof Error ? error.message : "تعذر إرسال رسالة الاختبار", 500);
  }
}
