import type { IntegrationSettings } from "../app/dashboard/types";
import { prisma } from "./prisma";

type TemplateComponentData = {
  category: string;
  language: string;
  headerType: string;
  headerText: string;
  headerMediaHandle: string;
  message: string;
  footer: string;
  buttonType: string;
  buttonText: string;
  buttonPhone: string;
  buttonUrl: string;
};

export type MetaTemplateResult =
  | { ok: true; id: string; status: string }
  | { ok: false; error: string };

const statusMap: Record<string, string> = {
  APPROVED: "معتمد",
  PENDING: "قيد المراجعة",
  REJECTED: "مرفوض",
  PAUSED: "مرفوض",
  DISABLED: "مرفوض"
};

export function mapMetaStatus(status?: string) {
  return statusMap[status || "PENDING"] || "قيد المراجعة";
}

export function buildTemplateComponents(data: TemplateComponentData) {
  const components: Array<Record<string, unknown>> = [];

  if (data.headerType === "TEXT" && data.headerText.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: data.headerText.trim() });
  }

  if (data.headerType === "IMAGE" && data.headerMediaHandle.trim()) {
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [data.headerMediaHandle.trim()] } });
  }

  if (data.headerType === "VIDEO" && data.headerMediaHandle.trim()) {
    components.push({ type: "HEADER", format: "VIDEO", example: { header_handle: [data.headerMediaHandle.trim()] } });
  }

  components.push({ type: "BODY", text: data.message.trim() });

  if (data.footer.trim()) {
    components.push({ type: "FOOTER", text: data.footer.trim() });
  }

  if (data.buttonType !== "NONE" && data.buttonText.trim()) {
    const button: Record<string, unknown> = { text: data.buttonText.trim() };
    if (data.buttonType === "PHONE") {
      button.type = "PHONE_NUMBER";
      button.phone_number = data.buttonPhone.trim();
    } else if (data.buttonType === "URL") {
      button.type = "URL";
      button.url = data.buttonUrl.trim();
    } else {
      button.type = "QUICK_REPLY";
    }
    components.push({ type: "BUTTONS", buttons: [button] });
  }

  return components;
}

export function isMetaWhatsAppConfigured(integration: IntegrationSettings) {
  return Boolean(integration.wabaId?.trim() && integration.accessToken?.trim());
}

export async function createMetaTemplate(
  integration: IntegrationSettings,
  input: { name: string } & TemplateComponentData
): Promise<MetaTemplateResult> {
  if (input.headerType === "DOCUMENT") {
    return { ok: false, error: "رفع عنوان مستند للقالب غير مدعوم حاليًا. اختر عنوان نصي أو صورة أو فيديو أو بدون عنوان." };
  }
  if (input.headerType === "IMAGE" && !input.headerMediaHandle.trim()) {
    return { ok: false, error: "ارفع صورة العنوان أولًا." };
  }
  if (input.headerType === "VIDEO" && !input.headerMediaHandle.trim()) {
    return { ok: false, error: "ارفع فيديو العنوان أولًا." };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${integration.wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: buildTemplateComponents(input)
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    return { ok: false, error: payload.error?.message || "تعذر إرسال القالب إلى Meta." };
  }

  return { ok: true, id: payload.id || "", status: mapMetaStatus(payload.status) };
}

export async function editMetaTemplate(
  integration: IntegrationSettings,
  metaId: string,
  input: TemplateComponentData
): Promise<MetaTemplateResult> {
  if (input.headerType === "DOCUMENT") {
    return { ok: false, error: "رفع عنوان مستند للقالب غير مدعوم حاليًا. اختر عنوان نصي أو صورة أو فيديو أو بدون عنوان." };
  }
  if (input.headerType === "IMAGE" && !input.headerMediaHandle.trim()) {
    return { ok: false, error: "ارفع صورة العنوان أولًا." };
  }
  if (input.headerType === "VIDEO" && !input.headerMediaHandle.trim()) {
    return { ok: false, error: "ارفع فيديو العنوان أولًا." };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${metaId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      category: input.category,
      components: buildTemplateComponents(input)
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };

  if (!response.ok || payload.success === false) {
    return { ok: false, error: payload.error?.message || "تعذر تحديث القالب في Meta." };
  }

  return { ok: true, id: metaId, status: "قيد المراجعة" };
}

export async function deleteMetaTemplate(integration: IntegrationSettings, name: string): Promise<{ ok: boolean; error?: string }> {
  const url = new URL(`https://graph.facebook.com/v22.0/${integration.wabaId}/message_templates`);
  url.searchParams.set("name", name);

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`
    }
  });

  const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };

  if (!response.ok || payload.success === false) {
    return { ok: false, error: payload.error?.message || "تعذر حذف القالب من Meta." };
  }

  return { ok: true };
}

const templateStatusMap: Record<string, string> = {
  APPROVED: "معتمد",
  PENDING: "قيد المراجعة",
  REJECTED: "مرفوض",
  PAUSED: "مرفوض",
  DISABLED: "مرفوض"
};

function mapTemplateCategory(category: string) {
  return category === "UTILITY" ? "خدمة" : "تسويق";
}

function templateComponentText(components: Array<{ type?: string; text?: string }> | undefined, type: string) {
  return components?.find((component) => component.type === type)?.text || "";
}

function mapTemplateButtonType(type?: string) {
  if (type === "PHONE_NUMBER") return "PHONE";
  if (type === "URL") return "URL";
  if (type === "QUICK_REPLY") return "QUICK_REPLY";
  return "NONE";
}

// Pulls every template already approved on the WABA (including Meta's
// built-in "hello_world" sample, which every WhatsApp Business Account has
// pre-approved by default) into the local Template table, so a freshly
// connected account has at least one usable template immediately instead of
// waiting on a manual sync or a new template's review.
export async function syncMetaTemplates(tenantId: string, wabaId: string, accessToken: string): Promise<{ ok: boolean; synced: number; error?: string }> {
  if (!wabaId || !accessToken) return { ok: false, synced: 0, error: "بيانات ربط واتساب غير مكتملة" };

  const url = new URL(`https://graph.facebook.com/v22.0/${wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,status,category,language,components");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return { ok: false, synced: 0, error: "تعذر جلب القوالب من Meta." };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{
      id?: string;
      name: string;
      status?: string;
      category?: string;
      language?: string;
      components?: Array<{ type?: string; text?: string; format?: string; buttons?: Array<{ text?: string; type?: string; phone_number?: string; url?: string }> }>;
    }>;
  };
  const syncedAt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
    calendar: "gregory",
    timeZone: "Asia/Riyadh"
  }).format(new Date());

  for (const template of payload.data || []) {
    const body = templateComponentText(template.components, "BODY") || "تمت المزامنة من Meta";
    const footer = templateComponentText(template.components, "FOOTER");
    const header = template.components?.find((component) => component.type === "HEADER");
    const buttons = template.components?.find((component) => component.type === "BUTTONS")?.buttons || [];
    const firstButton = buttons[0];
    const category = template.category || "MARKETING";
    const buttonType = mapTemplateButtonType(firstButton?.type);

    await prisma.template.upsert({
      where: { name_tenantId: { name: template.name, tenantId } },
      update: {
        message: body,
        type: mapTemplateCategory(category),
        category,
        language: template.language || "ar",
        status: templateStatusMap[template.status || "PENDING"] || "قيد المراجعة",
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
        id: `tmpl-${tenantId}-${template.name}`,
        tenantId,
        name: template.name,
        message: body,
        type: mapTemplateCategory(category),
        category,
        language: template.language || "ar",
        status: templateStatusMap[template.status || "PENDING"] || "قيد المراجعة",
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

  return { ok: true, synced: payload.data?.length || 0 };
}
