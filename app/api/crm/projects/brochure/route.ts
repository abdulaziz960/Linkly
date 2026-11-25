import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { saveAutomationMedia } from "../../../../../lib/automation-media";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { parseDataUrl } from "../../../../../lib/message-attachments";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/**
 * Uploads a project's brochure / profile file. The owner picks it while creating or editing a project; the
 * returned id is then saved with the project, and the AI sends that document to customers who ask for it.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إدارة المشاريع متاحة لمالك الحساب فقط", 403);

  const limit = await consumeRateLimit("project-brochure", requestIdentifier(request, user.id), 20, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول لاحقًا", 429);

  const body = (await request.json().catch(() => null)) as { name?: unknown; dataUrl?: unknown } | null;
  const parsed = parseDataUrl(typeof body?.dataUrl === "string" ? body.dataUrl : "");
  // Only documents (PDF, Word, PowerPoint...) - a picture or video is not a brochure the customer can open and keep.
  if (!parsed || (!parsed.mimeType.startsWith("application/") && parsed.mimeType !== "text/plain")) return jsonError("ارفع البروشور بصيغة PDF أو Word أو PowerPoint", 400);

  const result = await saveAutomationMedia(user.tenantId, { name: body?.name, dataUrl: body?.dataUrl });
  if (!result.ok) return jsonError(result.error, 400);
  if (result.kind !== "document") return jsonError("ارفع البروشور بصيغة PDF أو Word أو PowerPoint", 400);
  return jsonOk({ id: result.id, name: result.name });
}
