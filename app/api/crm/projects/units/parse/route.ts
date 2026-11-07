import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { MAX_PDF_BYTES, readUnitsFromPdf } from "../../../../../../lib/units-pdf";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Reads a price sheet PDF into units for review. Saves nothing. Owner only: it spends the workspace's AI key. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("استيراد الوحدات متاح لمالك الحساب فقط", 403);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("اختر ملف PDF", 400);
  if (file.size > MAX_PDF_BYTES) return jsonError("حجم الملف يجب أن يكون أقل من 10 ميجا.", 400);
  const result = await readUnitsFromPdf(user.tenantId, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return jsonError(result.error, 422);
  return jsonOk({ units: result.units });
}
