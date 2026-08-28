import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import { formatMessageTime } from "./time";

type SendWhatsAppTextInput = {
  tenantId?: string;
  conversationId: string;
  to: string;
  text: string;
  author?: string;
};

type SendWhatsAppTemplateInput = {
  tenantId?: string;
  conversationId: string;
  to: string;
  templateName: string;
  language?: string;
  templateText: string;
  customerName?: string;
  author?: string;
  contextMessageId?: string;
  keepWindowExpired?: boolean;
};

function normalizeTemplateLanguage(language?: string) {
  const value = language?.trim();
  if (!value || value === "Arabic" || value === "العربية") return "ar";
  if (value === "English" || value === "الإنجليزية") return "en_US";
  return value;
}

function templateParameterCount(templateText: string) {
  const indexes = [...templateText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return indexes.length ? Math.max(...indexes) : 0;
}

function renderTemplateText(templateText: string, customerName: string) {
  const fallback = customerName.trim() || "عميلنا";
  return templateText
    .replace(/\{\{\s*name\s*\}\}/gi, fallback)
    .replace(/\{\{\s*\d+\s*\}\}/g, fallback);
}

async function persistWhatsAppTemplateResult(input: SendWhatsAppTemplateInput, result: {
  messageId?: string;
  deliveryStatus: "sent" | "failed";
  deliveryError?: string;
}) {
  const now = new Date();
  const renderedText = renderTemplateText(input.templateText, input.customerName || "");
  const id = result.messageId
    ? `wa-out-${result.messageId}`
    : `wa-template-${result.deliveryStatus}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({ where: { id: input.conversationId } });
    const message = await tx.message.create({
      data: {
        id,
        conversationId: input.conversationId,
        direction: "out",
        text: renderedText,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "Linkly",
        deliveryStatus: result.deliveryStatus,
        deliveryError: result.deliveryError || "",
        sourceType: "whatsapp_template",
        sourceLabel: input.templateName
      }
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessage: renderedText,
        lastActivityAt: now.toISOString(),
        windowExpired: input.keepWindowExpired ? 1 : undefined,
        status: result.deliveryStatus === "sent" && conversation?.status === "closed"
          ? conversation.assignee && conversation.assignee !== "بدون موظف" ? "assigned" : "unassigned"
          : undefined
      }
    });

    return message;
  });
}

/** Sends an approved WhatsApp template and records both provider acceptance and rejection. */
export async function sendWhatsAppTemplateMessage(input: SendWhatsAppTemplateInput) {
  const settings = await getIntegrationSettings("whatsapp", input.tenantId);
  const phoneNumberId = settings.phoneNumberId?.trim();
  const accessToken = settings.accessToken?.trim();
  const to = normalizeWhatsAppPhone(input.to);
  const templateName = input.templateName.trim();
  const templateText = input.templateText.trim();

  if (!phoneNumberId || !accessToken || !to || !templateName || !templateText) {
    return { ok: false as const, skipped: true, error: "WHATSAPP_TEMPLATE_CONFIGURATION_MISSING" };
  }

  const parameterCount = templateParameterCount(templateText);
  const parameterText = input.customerName?.trim() || "عميلنا";
  const components = parameterCount
    ? [{
        type: "body",
        parameters: Array.from({ length: parameterCount }, () => ({ type: "text", text: parameterText }))
      }]
    : undefined;

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
      template: {
        name: templateName,
        language: { code: normalizeTemplateLanguage(input.language) },
        ...(components ? { components } : {})
      }
    })
  });
  const payload = await response.json().catch(() => null) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; error_user_msg?: string };
  } | null;

  if (!response.ok || !payload?.messages?.[0]?.id) {
    const error = payload?.error?.error_user_msg || payload?.error?.message || "تعذر إرسال قالب WhatsApp";
    console.error("WhatsApp template send failed", { status: response.status, error, templateName });
    await persistWhatsAppTemplateResult(input, { deliveryStatus: "failed", deliveryError: error });
    return { ok: false as const, error, status: response.status || 502 };
  }

  const message = await persistWhatsAppTemplateResult(input, {
    messageId: payload.messages[0].id,
    deliveryStatus: "sent"
  });
  return { ok: true as const, messageId: payload.messages[0].id, message };
}

export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput) {
  const settings = await getIntegrationSettings("whatsapp", input.tenantId);
  const phoneNumberId = settings.phoneNumberId?.trim();
  const accessToken = settings.accessToken?.trim();
  const to = normalizeWhatsAppPhone(input.to);
  const text = input.text.trim();

  if (!phoneNumberId || !accessToken || !to || !text) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text
      }
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error?.error_user_msg || payload?.error?.message || "WHATSAPP_SEND_FAILED";
    console.error("WhatsApp text send failed", payload?.error || payload);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          id: `wa-text-failed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conversationId: input.conversationId,
          direction: "out",
          text,
          time: formatMessageTime(now),
          createdAt: now.toISOString(),
          author: input.author || "Linkly",
          deliveryStatus: "failed",
          deliveryError: error
        }
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessage: text, lastActivityAt: now.toISOString() }
      });
    });
    return { ok: false, error };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: payload?.messages?.[0]?.id ? `wa-out-${payload.messages[0].id}` : `wa-out-local-${Date.now()}`,
        conversationId: input.conversationId,
        direction: "out",
        text,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "Linkly",
        deliveryStatus: "sent"
      }
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessage: text,
        lastActivityAt: now.toISOString()
      }
    });
  });

  return { ok: true };
}

type SendWhatsAppInteractiveInput = {
  tenantId?: string;
  conversationId: string;
  to: string;
  bodyText: string;
  options: string[];
  kind: "button" | "list";
  listButtonLabel: string;
  displayText: string;
  author?: string;
};

// WhatsApp's interactive types have hard limits: up to 3 reply buttons
// (title <=20 chars) or up to 10 list rows (title <=24 chars) with a
// separate <=20-char label for the button that opens the row picker.
export async function sendWhatsAppInteractiveMessage(input: SendWhatsAppInteractiveInput) {
  const settings = await getIntegrationSettings("whatsapp", input.tenantId);
  const phoneNumberId = settings.phoneNumberId?.trim();
  const accessToken = settings.accessToken?.trim();
  const to = normalizeWhatsAppPhone(input.to);
  const bodyText = input.bodyText.trim();

  if (!phoneNumberId || !accessToken || !to || !bodyText || !input.options.length) {
    return { ok: false, skipped: true };
  }

  const interactive = input.kind === "button"
    ? {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: input.options.slice(0, 3).map((label, index) => ({
            type: "reply",
            reply: { id: `opt_${index}`, title: label.slice(0, 20) }
          }))
        }
      }
    : {
        type: "list",
        body: { text: bodyText },
        action: {
          button: input.listButtonLabel.slice(0, 20),
          sections: [{
            rows: input.options.slice(0, 10).map((label, index) => ({
              id: `opt_${index}`,
              title: label.slice(0, 24)
            }))
          }]
        }
      };

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("WhatsApp interactive send failed", payload?.error || payload);
    return { ok: false, error: payload?.error?.message || "WHATSAPP_SEND_FAILED" };
  }

  const now = new Date();
  const text = input.displayText.trim() || bodyText;
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: payload?.messages?.[0]?.id ? `wa-out-${payload.messages[0].id}` : `wa-out-local-${Date.now()}`,
        conversationId: input.conversationId,
        direction: "out",
        text,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "Linkly"
      }
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessage: text,
        lastActivityAt: now.toISOString()
      }
    });
  });

  return { ok: true };
}
