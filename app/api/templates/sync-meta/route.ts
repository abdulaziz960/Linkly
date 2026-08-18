import { NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const statusMap: Record<string, string> = {
  APPROVED: "معتمد",
  PENDING: "قيد المراجعة",
  REJECTED: "مرفوض",
  PAUSED: "مرفوض",
  DISABLED: "مرفوض"
};

function mapCategory(category: string) {
  if (category === "UTILITY") return "خدمة";
  if (category === "MARKETING") return "تسويق";
  return "خدمة";
}

function componentText(components: Array<{ type?: string; text?: string }> | undefined, type: string) {
  return components?.find((component) => component.type === type)?.text || "";
}

function mapButtonType(type?: string) {
  if (type === "PHONE_NUMBER") return "PHONE";
  if (type === "URL") return "URL";
  if (type === "QUICK_REPLY") return "QUICK_REPLY";
  return "NONE";
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });
  }
  if (!(await userHasViewPermission(user, "templates"))) {
    return NextResponse.json({ ok: false, error: "لا تملك صلاحية الوصول لهذه الميزة" }, { status: 403 });
  }

  const integration = await getIntegrationSettings("whatsapp", user.tenantId);

  if (!integration.wabaId || !integration.accessToken) {
    return NextResponse.json({
      ok: false,
      error: "أدخل WABA ID و Access Token في بيانات الربط قبل المزامنة مع Meta."
    }, { status: 400 });
  }

  const url = new URL(`https://graph.facebook.com/v22.0/${integration.wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,status,category,language,components");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${integration.accessToken}`
    }
  });

  if (!response.ok) {
    return NextResponse.json({
      ok: false,
      error: "تعذر جلب القوالب من Meta. تأكد من صلاحية التوكن والصلاحيات."
    }, { status: response.status });
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name: string;
      status?: string;
      category?: string;
      language?: string;
      components?: Array<{ type?: string; text?: string; format?: string; buttons?: Array<{ text?: string; type?: string; phone_number?: string; url?: string }> }>;
    }>;
  };
  const syncedAt = new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh"
  }).format(new Date());

  for (const template of payload.data || []) {
    const body = componentText(template.components, "BODY") || "تمت المزامنة من Meta";
    const footer = componentText(template.components, "FOOTER");
    const header = template.components?.find((component) => component.type === "HEADER");
    const buttons = template.components?.find((component) => component.type === "BUTTONS")?.buttons || [];
    const firstButton = buttons[0];
    const category = template.category || "MARKETING";
    const buttonType = mapButtonType(firstButton?.type);

    await prisma.template.upsert({
      where: { name_tenantId: { name: template.name, tenantId: user.tenantId } },
      update: {
        message: body,
        type: mapCategory(category),
        category,
        language: template.language || "ar",
        status: statusMap[template.status || "PENDING"] || "قيد المراجعة",
        headerType: header?.format || "NONE",
        headerText: header?.text || "",
        footer,
        buttonType,
        buttonText: firstButton?.text || "",
        buttonPhone: firstButton?.phone_number || "",
        buttonUrl: firstButton?.url || "",
        metaId: template.id || "",
        syncedAt
      },
      create: {
        id: `tmpl-${user.tenantId}-${template.name}`,
        tenantId: user.tenantId,
        name: template.name,
        message: body,
        type: mapCategory(category),
        category,
        language: template.language || "ar",
        status: statusMap[template.status || "PENDING"] || "قيد المراجعة",
        headerType: header?.format || "NONE",
        headerText: header?.text || "",
        headerMedia: "",
        footer,
        buttonType,
        buttonText: firstButton?.text || "",
        buttonPhone: firstButton?.phone_number || "",
        buttonUrl: firstButton?.url || "",
        metaId: template.id || "",
        syncedAt,
        lastUsed: "-"
      }
    });
  }

  return NextResponse.json({ ok: true, synced: payload.data?.length || 0, syncedAt });
}
