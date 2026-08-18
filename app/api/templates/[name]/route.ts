import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { deleteMetaTemplate, editMetaTemplate, isMetaWhatsAppConfigured } from "../../../../lib/meta-templates";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    name: string;
  }>;
};

export const runtime = "nodejs";
const templateNameRegex = /^[a-z0-9_]+$/;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "templates"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { name } = await context.params;
  const templateName = decodeURIComponent(name);
  const body = (await request.json()) as {
    message?: string;
    type?: string;
    category?: string;
    language?: string;
    headerType?: string;
    headerText?: string;
    headerMedia?: string;
    footer?: string;
    buttonType?: string;
    buttonText?: string;
    buttonPhone?: string;
    buttonUrl?: string;
    lastUsed?: string;
  };
  const message = body.message?.trim();

  if (!templateNameRegex.test(templateName)) return jsonError("اسم القالب يجب أن يكون بالإنجليزية فقط: حروف صغيرة، أرقام، وشرطة سفلية مثل welcome_message");
  if (!message) return jsonError("نص القالب مطلوب");

  const existing = await prisma.template.findFirst({ where: { name: templateName, tenantId: user.tenantId } });
  if (!existing) return jsonError("القالب غير موجود", 404);

  const category = body.category || "MARKETING";
  const headerType = body.headerType || "NONE";
  const headerText = body.headerText || "";
  const footer = body.footer || "";
  const buttonType = body.buttonType || "NONE";
  const buttonText = body.buttonText || "";
  const buttonPhone = body.buttonPhone || "";
  const buttonUrl = body.buttonUrl || "";

  let status = existing.status;
  let metaId = existing.metaId;

  if (existing.metaId) {
    const integration = await getIntegrationSettings("whatsapp", user.tenantId);
    if (!isMetaWhatsAppConfigured(integration)) {
      return jsonError("أدخل WABA ID و Access Token في بيانات الربط قبل تعديل قوالب واتساب.");
    }

    const metaResult = await editMetaTemplate(integration, existing.metaId, {
      category,
      language: existing.language,
      headerType,
      headerText,
      message,
      footer,
      buttonType,
      buttonText,
      buttonPhone,
      buttonUrl
    });

    if (!metaResult.ok) return jsonError(metaResult.error);
    status = metaResult.status;
    metaId = metaResult.id;
  }

  try {
    const template = await prisma.template.update({
      where: { name_tenantId: { name: templateName, tenantId: user.tenantId } },
      data: {
        message,
        type: body.type || "خدمة",
        category,
        language: body.language || existing.language,
        status,
        metaId,
        headerType,
        headerText,
        headerMedia: body.headerMedia || "",
        footer,
        buttonType,
        buttonText,
        buttonPhone,
        buttonUrl,
        lastUsed: body.lastUsed || "-"
      }
    });

    return jsonOk(template);
  } catch {
    return jsonError("تعذر تحديث القالب", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "templates"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { name } = await context.params;
  const templateName = decodeURIComponent(name);

  const existing = await prisma.template.findFirst({ where: { name: templateName, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر حذف القالب", 404);

  if (existing.metaId) {
    const integration = await getIntegrationSettings("whatsapp", user.tenantId);
    if (isMetaWhatsAppConfigured(integration)) {
      const metaResult = await deleteMetaTemplate(integration, templateName);
      if (!metaResult.ok) return jsonError(metaResult.error || "تعذر حذف القالب من Meta");
    }
  }

  try {
    await prisma.template.delete({ where: { name_tenantId: { name: templateName, tenantId: user.tenantId } } });
    return jsonOk({ name: templateName });
  } catch {
    return jsonError("تعذر حذف القالب", 404);
  }
}
