import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getTemplates, getIntegrationSettings } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { prisma } from "../../../lib/prisma";
import { createMetaTemplate, isMetaWhatsAppConfigured } from "../../../lib/meta-templates";
import { uploadMetaMedia } from "../../../lib/meta-media-upload";
import { cleanCarouselInput, getCarouselCounts, saveCarouselCards } from "../../../lib/template-carousel";
import { logAdminAction, getTenantCompanyName } from "../../../lib/subscriptions";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";
const templateNameRegex = /^[a-z0-9_]+$/;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const [templates, carouselCounts] = await Promise.all([getTemplates(user.tenantId), getCarouselCounts(user.tenantId).catch(() => new Map<string, number>())]);
  return jsonOk(templates.map((template) => (carouselCounts.has(template.name) ? { ...template, carouselCards: carouselCounts.get(template.name) } : template)));
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
    bodyExamples?: Record<string, string>;
    buttonUrlExample?: string;
    carousel?: unknown;
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

  // A carousel (multi-card) template: marketing only, no template-level header/footer/buttons; each card's image is
  // uploaded to Meta for review and a copy is kept for sends.
  let carousel: { cards: Array<import("../../../lib/template-carousel").CarouselCardInput>; handles: string[] } | undefined;
  if (body.carousel !== undefined) {
    const cleaned = cleanCarouselInput(body.carousel);
    if (!cleaned.ok) return jsonError(cleaned.error);
    const handles: string[] = [];
    for (const [position, card] of cleaned.cards.entries()) {
      const upload = await uploadMetaMedia(integration.accessToken, card.imageDataUrl);
      if (!upload.ok) return jsonError(`البطاقة ${position + 1}: ${upload.error}`);
      handles.push(upload.handle);
    }
    carousel = { cards: cleaned.cards, handles };
  }

  const category = carousel ? "MARKETING" : body.category || "MARKETING";
  const language = body.language || "ar";
  const headerType = carousel ? "NONE" : body.headerType || "NONE";
  const headerText = body.headerText || "";
  const footer = body.footer || "";
  const buttonType = body.buttonType || "NONE";
  const buttonText = body.buttonText || "";
  const buttonPhone = body.buttonPhone || "";
  const buttonUrl = body.buttonUrl || "";

  let headerMediaHandle = "";
  let headerMediaDataUrl = "";
  if ((headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") && body.headerMediaDataUrl) {
    const uploadResult = await uploadMetaMedia(integration.accessToken, body.headerMediaDataUrl);
    if (!uploadResult.ok) return jsonError(uploadResult.error);
    headerMediaHandle = uploadResult.handle;
    // Meta's upload handle is only valid for registering the template - it
    // can't be reused to send messages later. Keep the actual image/video
    // data too, so campaign sends have a stable link (our own domain) to
    // hand Meta on every send instead of just at creation time.
    headerMediaDataUrl = body.headerMediaDataUrl;
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
    buttonUrl,
    bodyExamples: body.bodyExamples,
    buttonUrlExample: body.buttonUrlExample,
    ...(carousel ? { carousel } : {})
  });

  if (!metaResult.ok) return jsonError(metaResult.error);
  if (carousel) await saveCarouselCards(user.tenantId, name, carousel.cards);

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
        headerMediaDataUrl,
        mediaToken: headerMediaDataUrl ? randomUUID() : "",
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

    await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم إنشاء قالب واتساب "${name}" بواسطة ${user.name}.`, "معلومة", "القوالب");

    return jsonOk(template);
  } catch {
    return jsonError("تم إرساله لـ Meta لكن تعذر حفظه محليًا. تأكد أن الاسم غير مكرر.");
  }
}
