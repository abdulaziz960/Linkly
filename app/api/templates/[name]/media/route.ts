import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { validateHeaderMediaDataUrl } from "../../../../../lib/meta-media-upload";
import { logAdminAction, getTenantCompanyName } from "../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ name: string }> };

/**
 * Saves the header image / video / PDF a template is SENT with, without touching Meta.
 *
 * WhatsApp only takes a one-time upload handle when a template is registered (that is what Meta reviews); every
 * send then needs a link to the file, which is the copy kept here and served at /api/whatsapp/template-media.
 * A template whose copy is missing (created in WhatsApp Manager, synced from Meta, or made before copies were
 * kept) cannot send its image at all. This attaches the copy to the existing, approved template - no
 * resubmission, so no new review.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "templates"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { name } = await context.params;
  const templateName = decodeURIComponent(name);
  const template = await prisma.template.findUnique({ where: { name_tenantId: { name: templateName, tenantId: user.tenantId } } });
  if (!template) return jsonError("القالب غير موجود", 404);
  if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType)) return jsonError("هذا القالب ليس له صورة أو ملف في الرأس", 400);

  const body = (await request.json().catch(() => ({}))) as { headerMediaDataUrl?: string };
  const dataUrl = body.headerMediaDataUrl || "";
  const checked = validateHeaderMediaDataUrl(dataUrl);
  if ("error" in checked) return jsonError(checked.error, 400);
  const expected = template.headerType === "IMAGE" ? "image/" : template.headerType === "VIDEO" ? "video/" : "application/pdf";
  if (!checked.mimeType.startsWith(expected)) return jsonError(template.headerType === "IMAGE" ? "هذا القالب رأسه صورة، ارفع صورة JPG أو PNG" : template.headerType === "VIDEO" ? "هذا القالب رأسه فيديو، ارفع ملف MP4" : "هذا القالب رأسه مستند، ارفع ملف PDF", 400);

  const updated = await prisma.template.update({
    where: { id: template.id },
    data: { headerMediaDataUrl: dataUrl, mediaToken: randomUUID() }
  });
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حفظ ${template.headerType === "IMAGE" ? "صورة" : template.headerType === "VIDEO" ? "فيديو" : "مستند"} الإرسال للقالب "${templateName}" بواسطة ${user.name}.`, "معلومة", "القوالب");
  return jsonOk({ name: updated.name, hasHeaderMediaSaved: true, headerMediaUrl: `/api/whatsapp/template-media/${updated.mediaToken}` });
}
