import { NextRequest } from "next/server";
import { getTemplates } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";
const templateNameRegex = /^[a-z0-9_]+$/;

export async function GET() {
  return jsonOk(await getTemplates());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name?: string;
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
  };
  const name = body.name?.trim();
  const message = body.message?.trim();

  if (!name) return jsonError("اسم القالب مطلوب");
  if (!templateNameRegex.test(name)) return jsonError("اسم القالب يجب أن يكون بالإنجليزية فقط: حروف صغيرة، أرقام، وشرطة سفلية مثل welcome_message");
  if (!message) return jsonError("نص القالب مطلوب");

  try {
    const template = await prisma.template.create({
      data: {
        name,
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
        metaId: "",
        syncedAt: "-",
        lastUsed: "-"
      }
    });

    return jsonOk(template);
  } catch {
    return jsonError("تعذر إضافة القالب. تأكد أن الاسم غير مكرر.");
  }
}
