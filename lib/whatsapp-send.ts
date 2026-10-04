import { outboundSignal } from "./outbound-timeout";
import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import { formatMessageTime } from "./time";
import { friendlyWhatsAppError, recordWhatsAppSendOutcome, whatsappSendErrorCode } from "./whatsapp-billing";

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
  // A template with an IMAGE/VIDEO/DOCUMENT or TEXT header needs a matching
  // header component on every send (see the comment above buildHeaderComponent).
  templateId?: string;
  headerType?: string;
  headerText?: string;
  headerMediaDataUrl?: string;
};

/**
 * WhatsApp only allows free-form text within 24h of the customer's last
 * inbound message; outside that window Meta rejects the send with error
 * subcode 131047 ("Re-engagement message"). Callers that send free text
 * automatically (bot flows, off-hours auto-replies) must check this first
 * instead of attempting a guaranteed-to-fail send - unlike a manual reply,
 * there's no user watching to notice and switch to a template.
 */
export async function isWhatsAppReplyWindowExpired(conversationId: string, fallbackExpired: boolean) {
  const lastCustomerMessage = await prisma.message.findFirst({
    where: {
      conversationId,
      direction: "in",
      createdAt: {
        not: ""
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!lastCustomerMessage?.createdAt) return fallbackExpired;

  const lastCustomerMessageAt = new Date(lastCustomerMessage.createdAt).getTime();
  if (Number.isNaN(lastCustomerMessageAt)) return fallbackExpired;

  return Date.now() - lastCustomerMessageAt >= 24 * 60 * 60 * 1000;
}

function normalizeTemplateLanguage(language?: string) {
  const value = language?.trim();
  if (!value || value === "Arabic" || value === "العربية") return "ar";
  if (value === "English" || value === "الإنجليزية") return "en_US";
  return value;
}

// WhatsApp templates use one of two variable formats, fixed at creation:
// positional ({{1}}, {{2}}, ...) or named ({{customer_name}}, ...) - Meta
// rejects a send whose parameters don't match the format the template was
// actually created with (error #132012 "Parameter format does not match
// format in the created template"). Detect the format from the template's
// own placeholders instead of assuming positional.
export function templateParameters(templateText: string, value: string) {
  const placeholders = [...templateText.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
  if (!placeholders.length) return undefined;
  const isNamedFormat = placeholders.some((placeholder) => !/^\d+$/.test(placeholder));
  return isNamedFormat
    ? placeholders.map((name) => ({ type: "text", parameter_name: name, text: value }))
    : Array.from({ length: Math.max(...placeholders.map(Number)) }, () => ({ type: "text", text: value }));
}

// A template with an IMAGE/VIDEO/DOCUMENT or TEXT header is a required
// component on every send, not just at creation - omitting it is a second,
// distinct cause of the same #132012 mismatch error (the first being a body
// parameter-format mismatch, handled by templateParameters above). Meta
// doesn't accept the one-time upload handle used to register the template
// here; it needs a plain URL it can re-fetch, so media headers use the
// template's own saved media via /api/whatsapp/template-media/[id].
function buildHeaderComponent(input: {
  headerType?: string;
  headerText?: string;
  headerMediaDataUrl?: string;
  templateId?: string;
  value: string;
}): Record<string, unknown> | undefined {
  const headerType = input.headerType?.trim();
  if (!headerType || headerType === "NONE") return undefined;

  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
    if (!input.headerMediaDataUrl || !input.templateId) return undefined;
    const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://linklysa.io").replace(/\/$/, "");
    // input.templateId is passed as mediaToken||id by every caller - see
    // pre-launch audit F-01 (the template's real id is predictable, so it
    // isn't a safe bearer secret for this unauthenticated endpoint).
    const mediaUrl = `${baseUrl}/api/whatsapp/template-media/${input.templateId}`;
    const mediaKey = headerType.toLowerCase();
    return { type: "header", parameters: [{ type: mediaKey, [mediaKey]: { link: mediaUrl } }] };
  }

  if (headerType === "TEXT") {
    const headerPlaceholders = [...(input.headerText || "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
    if (!headerPlaceholders.length) return undefined;
    const headerIsNamed = headerPlaceholders.some((placeholder) => !/^\d+$/.test(placeholder));
    return {
      type: "header",
      parameters: headerIsNamed
        ? headerPlaceholders.map((name) => ({ type: "text", parameter_name: name, text: input.value }))
        : headerPlaceholders.map(() => ({ type: "text", text: input.value }))
    };
  }

  return undefined;
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

  const parameterText = input.customerName?.trim() || "عميلنا";
  const parameters = templateParameters(templateText, parameterText);
  const headerComponent = buildHeaderComponent({
    headerType: input.headerType,
    headerText: input.headerText,
    headerMediaDataUrl: input.headerMediaDataUrl,
    templateId: input.templateId,
    value: parameterText
  });
  const components = [
    ...(headerComponent ? [headerComponent] : []),
    ...(parameters ? [{ type: "body", parameters }] : [])
  ];

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      signal: outboundSignal(),
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
          ...(components.length ? { components } : {})
        }
      })
    });
  } catch (error) {
    // A network-level failure (DNS, connection reset, timeout) throws
    // before there's any response to check - without this catch, the
    // exception propagates all the way to the route's generic error
    // handler and no message ever gets persisted, so the thread and
    // inbox ordering never reflect that a send was attempted.
    const message = error instanceof Error ? error.message : "تعذر الاتصال بواتساب";
    console.error("WhatsApp template send network failure", { templateName, error });
    await persistWhatsAppTemplateResult(input, { deliveryStatus: "failed", deliveryError: message });
    return { ok: false as const, error: message, status: 502 };
  }
  const payload = await response.json().catch(() => null) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; error_user_msg?: string; code?: number };
  } | null;

  if (!response.ok || !payload?.messages?.[0]?.id) {
    const error = friendlyWhatsAppError(payload, "تعذر إرسال قالب WhatsApp");
    console.error("WhatsApp template send failed", { status: response.status, error, templateName });
    await persistWhatsAppTemplateResult(input, { deliveryStatus: "failed", deliveryError: error });
    await recordWhatsAppSendOutcome({
      tenantId: settings.tenantId,
      ok: false,
      hadIssueFlag: Boolean(settings.whatsappPaymentIssueAt),
      errorCode: whatsappSendErrorCode(payload)
    });
    return { ok: false as const, error, status: response.status || 502 };
  }
  if (settings.whatsappPaymentIssueAt) {
    await recordWhatsAppSendOutcome({ tenantId: settings.tenantId, ok: true, hadIssueFlag: true });
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

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      signal: outboundSignal(),
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
  } catch (error) {
    // Same network-level-failure gap as sendWhatsAppTemplateMessage above -
    // persist the attempt as failed instead of leaving no trace of it.
    const message = error instanceof Error ? error.message : "WHATSAPP_NETWORK_FAILURE";
    console.error("WhatsApp text send network failure", error);
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
          deliveryError: message
        }
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessage: text, lastActivityAt: now.toISOString() }
      });
    });
    return { ok: false, error: message };
  }
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = friendlyWhatsAppError(payload, "WHATSAPP_SEND_FAILED");
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
    await recordWhatsAppSendOutcome({
      tenantId: settings.tenantId,
      ok: false,
      hadIssueFlag: Boolean(settings.whatsappPaymentIssueAt),
      errorCode: whatsappSendErrorCode(payload)
    });
    return { ok: false, error };
  }

  if (settings.whatsappPaymentIssueAt) {
    await recordWhatsAppSendOutcome({ tenantId: settings.tenantId, ok: true, hadIssueFlag: true });
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
    signal: outboundSignal(),
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
    await recordWhatsAppSendOutcome({
      tenantId: settings.tenantId,
      ok: false,
      hadIssueFlag: Boolean(settings.whatsappPaymentIssueAt),
      errorCode: whatsappSendErrorCode(payload)
    });
    return { ok: false, error: friendlyWhatsAppError(payload, "WHATSAPP_SEND_FAILED") };
  }
  if (settings.whatsappPaymentIssueAt) {
    await recordWhatsAppSendOutcome({ tenantId: settings.tenantId, ok: true, hadIssueFlag: true });
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

type SendWhatsAppCustomInput = {
  tenantId?: string;
  conversationId: string;
  to: string;
  /** Everything after `to` in the Graph API body, e.g. { type: "interactive", interactive: {...} }. */
  message: Record<string, unknown>;
  /** What the thread shows for this outbound message. */
  displayText: string;
  author?: string;
  attachment?: { type: "image"; url: string; name: string; mimeType: string };
};

/**
 * Generic outbound send for message shapes the plain helpers above don't
 * cover (product list rows with ids/descriptions, reply buttons with ids,
 * an image by public URL). Same send/outcome-tracking/persist behaviour as
 * sendWhatsAppInteractiveMessage, and like it never throws.
 */
async function sendWhatsAppCustomMessage(input: SendWhatsAppCustomInput) {
  const settings = await getIntegrationSettings("whatsapp", input.tenantId);
  const phoneNumberId = settings.phoneNumberId?.trim();
  const accessToken = settings.accessToken?.trim();
  const to = normalizeWhatsAppPhone(input.to);
  if (!phoneNumberId || !accessToken || !to) return { ok: false, skipped: true };

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      signal: outboundSignal(),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...input.message })
    });
  } catch (error) {
    console.error("WhatsApp custom send network failure", error);
    return { ok: false, error: error instanceof Error ? error.message : "WHATSAPP_NETWORK_FAILURE" };
  }
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("WhatsApp custom send failed", payload?.error || payload);
    await recordWhatsAppSendOutcome({
      tenantId: settings.tenantId,
      ok: false,
      hadIssueFlag: Boolean(settings.whatsappPaymentIssueAt),
      errorCode: whatsappSendErrorCode(payload)
    });
    return { ok: false, error: friendlyWhatsAppError(payload, "WHATSAPP_SEND_FAILED") };
  }
  if (settings.whatsappPaymentIssueAt) {
    await recordWhatsAppSendOutcome({ tenantId: settings.tenantId, ok: true, hadIssueFlag: true });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: payload?.messages?.[0]?.id ? `wa-out-${payload.messages[0].id}` : `wa-out-local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        conversationId: input.conversationId,
        direction: "out",
        text: input.displayText,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "Linkly",
        deliveryStatus: "sent",
        ...(input.attachment
          ? { attachmentType: input.attachment.type, attachmentUrl: input.attachment.url, attachmentName: input.attachment.name, attachmentMime: input.attachment.mimeType }
          : {})
      }
    });
    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessage: input.displayText, lastActivityAt: now.toISOString() }
    });
  });

  return { ok: true };
}

export type WhatsAppListRow = { id: string; title: string; description?: string };

/** A native WhatsApp list picker whose rows carry OUR ids (so a tap comes back as a product, not just a title). */
export function sendWhatsAppRowList(input: {
  tenantId?: string;
  conversationId: string;
  to: string;
  bodyText: string;
  buttonLabel: string;
  rows: WhatsAppListRow[];
  displayText: string;
  author?: string;
}) {
  return sendWhatsAppCustomMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    displayText: input.displayText,
    author: input.author,
    message: {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: input.bodyText.slice(0, 1024) },
        action: {
          button: input.buttonLabel.slice(0, 20),
          sections: [{
            rows: input.rows.slice(0, 10).map((row) => ({
              id: row.id.slice(0, 200),
              title: row.title.slice(0, 24),
              ...(row.description ? { description: row.description.slice(0, 72) } : {})
            }))
          }]
        }
      }
    }
  });
}

function imageHeader(url?: string) {
  return url ? { header: { type: "image", image: { link: url } } } : {};
}

/** Up to 3 tappable reply buttons with our own ids; optional image header (a product "card"). */
export function sendWhatsAppIdButtons(input: {
  tenantId?: string;
  conversationId: string;
  to: string;
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
  displayText: string;
  headerImageUrl?: string;
  author?: string;
}) {
  return sendWhatsAppCustomMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    displayText: input.displayText,
    author: input.author,
    ...(input.headerImageUrl ? { attachment: { type: "image" as const, url: input.headerImageUrl, name: "product.jpg", mimeType: "image/jpeg" } } : {}),
    message: {
      type: "interactive",
      interactive: {
        type: "button",
        ...imageHeader(input.headerImageUrl),
        body: { text: input.bodyText.slice(0, 1024) },
        action: {
          buttons: input.buttons.slice(0, 3).map((button) => ({ type: "reply", reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) } }))
        }
      }
    }
  });
}

/** One button that opens a URL (WhatsApp allows a single URL button per message); optional image header. */
export function sendWhatsAppCtaUrl(input: {
  tenantId?: string;
  conversationId: string;
  to: string;
  bodyText: string;
  buttonLabel: string;
  url: string;
  displayText: string;
  headerImageUrl?: string;
  author?: string;
}) {
  return sendWhatsAppCustomMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    displayText: input.displayText,
    author: input.author,
    ...(input.headerImageUrl ? { attachment: { type: "image" as const, url: input.headerImageUrl, name: "product.jpg", mimeType: "image/jpeg" } } : {}),
    message: {
      type: "interactive",
      interactive: {
        type: "cta_url",
        ...imageHeader(input.headerImageUrl),
        body: { text: input.bodyText.slice(0, 1024) },
        action: { name: "cta_url", parameters: { display_text: input.buttonLabel.slice(0, 20), url: input.url } }
      }
    }
  });
}

/** An image by public https URL (Meta fetches it), with a caption. */
export function sendWhatsAppImageByUrl(input: {
  tenantId?: string;
  conversationId: string;
  to: string;
  imageUrl: string;
  caption: string;
  author?: string;
}) {
  return sendWhatsAppCustomMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    displayText: input.caption,
    author: input.author,
    attachment: { type: "image", url: input.imageUrl, name: "product.jpg", mimeType: "image/jpeg" },
    message: { type: "image", image: { link: input.imageUrl, caption: input.caption.slice(0, 1024) } }
  });
}

/** A native "Send location" prompt - one tap and the customer shares where they are. */
export function sendWhatsAppLocationRequest(input: {
  tenantId?: string;
  conversationId: string;
  to: string;
  bodyText: string;
  author?: string;
}) {
  return sendWhatsAppCustomMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    displayText: input.bodyText,
    author: input.author,
    message: {
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text: input.bodyText.slice(0, 1024) },
        action: { name: "send_location" }
      }
    }
  });
}

/** A map pin the customer can tap to open directions. */
export function sendWhatsAppLocation(input: {
  tenantId?: string;
  conversationId: string;
  to: string;
  latitude: number;
  longitude: number;
  name: string;
  address: string;
  author?: string;
}) {
  return sendWhatsAppCustomMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    displayText: `📍 ${input.name}`,
    author: input.author,
    message: {
      type: "location",
      location: { latitude: input.latitude, longitude: input.longitude, name: input.name.slice(0, 100), address: input.address.slice(0, 200) }
    }
  });
}
