import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { IMAGE_LIMITS, saveUploadedImage } from "../../../../lib/cms-images";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

/** Uploads an image (multipart field "file"); it is converted to WebP and served from /media/<name>. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > IMAGE_LIMITS.maxBytes + 64 * 1024) return jsonError("حجم الصورة أكبر من 8 ميجابايت", 413);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("اختر صورة للرفع", 400);

  const saved = await saveUploadedImage({ data: Buffer.from(await file.arrayBuffer()), mime: file.type, filename: file.name });
  if (!saved.ok) return jsonError(saved.error, 400);
  await recordAdminAction(admin, "upload-image", { type: "image", id: saved.name }, JSON.stringify({ bytes: saved.bytes, width: saved.width, height: saved.height }));
  return jsonOk({ url: saved.url, width: saved.width, height: saved.height, bytes: saved.bytes });
}
