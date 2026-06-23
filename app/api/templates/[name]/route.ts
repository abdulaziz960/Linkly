import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    name: string;
  }>;
};

export const runtime = "nodejs";
const templateNameRegex = /^[a-z0-9_]+$/;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { name } = await context.params;
  const body = (await request.json()) as {
    message?: string;
    type?: string;
    category?: string;
    language?: string;
    status?: string;
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
  const templateName = decodeURIComponent(name);

  if (!templateNameRegex.test(templateName)) return jsonError("اسم القالب يجب أن يكون بالإنجليزية فقط: حروف صغيرة، أرقام، وشرطة سفلية مثل welcome_message");
  if (!message) return jsonError("نص القالب مطلوب");

  try {
    const template = await prisma.template.update({
      where: { name: templateName },
      data: {
        message,
        type: body.type || "خدمة",
        category: body.category || "MARKETING",
        language: body.language || "ar",
        status: body.status || "قيد المراجعة",
        headerType: body.headerType || "NONE",
        headerText: body.headerText || "",
        headerMedia: body.headerMedia || "",
        footer: body.footer || "",
        buttonType: body.buttonType || "NONE",
        buttonText: body.buttonText || "",
        buttonPhone: body.buttonPhone || "",
        buttonUrl: body.buttonUrl || "",
        lastUsed: body.lastUsed || "-"
      }
    });

    return jsonOk(template);
  } catch {
    return jsonError("تعذر تحديث القالب", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { name } = await context.params;

  try {
    await prisma.template.delete({ where: { name: decodeURIComponent(name) } });
    return jsonOk({ name: decodeURIComponent(name) });
  } catch {
    return jsonError("تعذر حذف القالب", 404);
  }
}
