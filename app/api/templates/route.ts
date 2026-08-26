import { NextRequest } from "next/server";
import { getTemplates, getIntegrationSettings } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { prisma } from "../../../lib/prisma";
import { createMetaTemplate, isMetaWhatsAppConfigured } from "../../../lib/meta-templates";
import { uploadMetaMedia } from "../../../lib/meta-media-upload";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";
const templateNameRegex = /^[a-z0-9_]+$/;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  return jsonOk(await getTemplates(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "templates"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as {
    name?: string;
    message?: string;
    type?: string;
    category?: string;
    language?: string;
    headerType?: string;
    headerText?: string;
    headerMediaDataUrl?: string;
    footer?: string;
    buttonType?: string;
    buttonText?: string;
    buttonPhone?: string;
    buttonUrl?: string;
  };
  const name = body.name?.trim();
  const message = body.message?.trim();

  if (!name) return jsonError("اسم القالب مطلوب");
  if (!templateNameRegex.test(name)) return jsonError("اسم القالب يجب أن يكون بالإنجليزية فقط: حروف صغيرة، أرقام، وشرطة سفلية مثل welcome_message");
  if (!message) return jsonError("نص القالب مطلوب");

  const integration = await getIntegrationSettings("whatsapp", user.tenantId);
  if (!isMetaWhatsAppConfigured(integration)) {
    return jsonError("أدخل WABA ID و Access Token في بيانات الربط قبل إنشاء قوالب واتساب.");
  }

  const category = body.category || "MARKETING";
  const language = body.language || "ar";
  const headerType = body.headerType || "NONE";
  const headerText = body.headerText || "";
  const footer = body.footer || "";
  const buttonType = body.buttonType || "NONE";
  const buttonText = body.buttonText || "";
  const buttonPhone = body.buttonPhone || "";
  const buttonUrl = body.buttonUrl || "";

  let headerMediaHandle = "";
  if (headerType === "IMAGE" && body.headerMediaDataUrl) {
    const uploadResult = await uploadMetaMedia(integration.accessToken, body.headerMediaDataUrl);
    if (!uploadResult.ok) return jsonError(uploadResult.error);
    headerMediaHandle = uploadResult.handle;
  }

  const metaResult = await createMetaTemplate(integration, {
    name,
    category,
    language,
    headerType,
    headerText,
    headerMediaHandle,
    message,
    footer,
    buttonType,
    buttonText,
    buttonPhone,
    buttonUrl
  });

  if (!metaResult.ok) return jsonError(metaResult.error);

  try {
    const template = await prisma.template.create({
      data: {
        id: `tmpl-${user.tenantId}-${name}`,
        tenantId: user.tenantId,
        name,
        message,
        type: body.type || "خدمة",
        category,
        language,
        status: metaResult.status,
        headerType,
        headerText,
        headerMedia: headerMediaHandle,
        footer,
        buttonType,
        buttonText,
        buttonPhone,
        buttonUrl,
        metaId: metaResult.id,
        syncedAt: "-",
        lastUsed: "-"
      }
    });

    return jsonOk(template);
  } catch {
    return jsonError("تم إرساله لـ Meta لكن تعذر حفظه محليًا. تأكد أن الاسم غير مكرر.");
  }
}
