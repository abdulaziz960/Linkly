import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getIntegrationSettings } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { normalizeWhatsAppPhone } from "../../../../../lib/whatsapp-inbox";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

function normalizeTemplateLanguage(language?: string) {
  const value = language?.trim();
  if (!value || value === "Arabic" || value === "العربية") return "ar";
  if (value === "English" || value === "الإنجليزية") return "en_US";
  return value;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  const body = (await request.json()) as {
    direction?: string;
    text?: string;
    forceWindowExpired?: boolean;
    messageType?: "text" | "template";
    templateName?: string;
    templateLanguage?: string;
  };
  const text = body.text?.trim();
  const direction = body.direction || "out";

  if (!text) return jsonError("نص الرسالة مطلوب");

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { customer: true }
  });

  if (!conversation) return jsonError("المحادثة غير موجودة", 404);

  try {
    if (direction === "note") {
      const message = await prisma.message.create({
        data: {
          id: `m-${Date.now()}`,
          conversationId: id,
          direction,
          text,
          time: "الآن",
          author: user?.name ?? ""
        }
      });

      return jsonOk(message);
    }

    const settings = await getIntegrationSettings();
    const phoneNumberId = settings.phoneNumberId?.trim();
    const accessToken = settings.accessToken?.trim();
    const to = normalizeWhatsAppPhone(conversation.customer.phone);
    const isTemplateMessage = body.messageType === "template" || Boolean(body.templateName);

    if (!phoneNumberId) return jsonError("Phone Number ID مطلوب قبل إرسال الرسالة");
    if (!accessToken) return jsonError("Access Token مطلوب قبل إرسال الرسالة");
    if (!to) return jsonError("رقم العميل غير موجود في ملف المحادثة");
    if (conversation.windowExpired && !isTemplateMessage) {
      return jsonError("انتهت نافذة الرد خلال 24 ساعة. استخدم قالب WhatsApp معتمد لإعادة فتح المحادثة.");
    }

    const templateName = body.templateName?.trim();
    if (isTemplateMessage && !templateName) {
      return jsonError("اسم قالب WhatsApp مطلوب قبل الإرسال");
    }

    const payload = isTemplateMessage
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: {
              code: normalizeTemplateLanguage(body.templateLanguage)
            }
          }
        }
      : {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: text
          }
        };

    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const metaResponse = await response.json().catch(() => null);

    if (!response.ok) {
      return jsonError(metaResponse?.error?.message || "تعذر إرسال الرسالة عبر WhatsApp", response.status);
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          id: metaResponse?.messages?.[0]?.id ? `wa-${metaResponse.messages[0].id}` : `m-${Date.now()}`,
          conversationId: id,
          direction,
          text,
          time: "الآن",
          author: user?.name ?? ""
        }
      });

      await tx.conversation.update({
        where: { id },
        data: {
          lastMessage: text,
          windowExpired: body.forceWindowExpired ? 1 : undefined
        }
      });

      return created;
    });

    return jsonOk(message);
  } catch (error) {
    console.error("Conversation message send failed", error);
    return jsonError("تعذر إرسال الرسالة", 404);
  }
}
