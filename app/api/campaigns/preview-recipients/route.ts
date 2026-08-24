import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { parseRecipientFile, MAX_CAMPAIGN_FILE_BYTES } from "../../../../lib/campaign-engine";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return jsonError("ارفع ملف Excel أو CSV يحتوي على أرقام العملاء");
  const extension = file.name.toLowerCase().split(".").pop();
  if (!extension || !["csv", "xlsx"].includes(extension)) return jsonError("صيغة الملف غير مدعومة. استخدم CSV أو XLSX فقط");
  if (file.size <= 0 || file.size > MAX_CAMPAIGN_FILE_BYTES) return jsonError("حجم الملف يجب ألا يتجاوز 5 ميجابايت");

  const buffer = Buffer.from(await file.arrayBuffer());
  const recipients = await parseRecipientFile(buffer, file.name).catch(() => []);

  return jsonOk({ count: recipients.length });
}
