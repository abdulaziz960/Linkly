import type { IntegrationSettings } from "../app/dashboard/types";

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
