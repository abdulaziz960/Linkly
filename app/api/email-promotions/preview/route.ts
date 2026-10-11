import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { MAX_EMAIL_CAMPAIGN_FILE_BYTES, parseEmailRecipientFile, resolveEmailRecipients } from "../../../../lib/email-promotions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File) || file.size <= 0) return jsonError("ارفع ملف الإيميلات أولًا");
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !["csv", "xlsx"].includes(extension)) return jsonError("صيغة ملف الإيميلات غير مدعومة. استخدم CSV أو XLSX");
    if (file.size > MAX_EMAIL_CAMPAIGN_FILE_BYTES) return jsonError("حجم ملف الإيميلات يجب ألا يتجاوز 5 ميجابايت");
    const recipients = await parseEmailRecipientFile(Buffer.from(await file.arrayBuffer()), file.name);
    return jsonOk({ count: recipients.length, sample: recipients.slice(0, 8) });
  }

  const body = await request.json().catch(() => null);
  if (!body?.audience) return jsonError("اختر الجمهور أولًا");
  const recipients = await resolveEmailRecipients(user.tenantId, body.audience);
  return jsonOk({ count: recipients.length, sample: recipients.slice(0, 8) });
}
