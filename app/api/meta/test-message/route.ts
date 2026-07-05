import { NextRequest } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { normalizeWhatsAppPhone, storeWhatsAppMessage } from "../../../../lib/whatsapp-inbox";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const settings = await getIntegrationSettings();
  const body = (await request.json()) as {
    phoneNumberId?: string;
    accessToken?: string;
    to?: string;
    message?: string;
  };
  const phoneNumberId = body.phoneNumberId?.trim() || settings.phoneNumberId;
  const accessToken = body.accessToken?.trim() || settings.accessToken;
  const to = normalizeWhatsAppPhone(body.to || "");
  const message = body.message?.trim() || "";

  if (!phoneNumberId) return jsonError("Phone Number ID مطلوب قبل إرسال رسالة اختبار");
  if (!accessToken) return jsonError("Access Token مطلوب قبل إرسال رسالة اختبار");
  if (!to) return jsonError("رقم المستلم مطلوب");
  if (!message) return jsonError("نص رسالة الاختبار مطلوب");

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: message
      }
    })
  });

  const metaResponse = await response.json().catch(() => null);

  if (!response.ok) {
    return jsonError(metaResponse?.error?.message || "تعذر إرسال رسالة الاختبار من Meta", response.status);
  }

  await storeWhatsAppMessage({
    phone: to,
    name: `رقم اختبار ${to.slice(-4)}`,
    text: message,
    direction: "out",
    messageId: metaResponse?.messages?.[0]?.id,
    author: "AudienceW"
  });

  return jsonOk({
    message: "تم إرسال رسالة الاختبار",
    meta: metaResponse
  });
}
