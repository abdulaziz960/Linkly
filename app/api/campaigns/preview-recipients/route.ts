import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { analyzeRecipientFile, MAX_CAMPAIGN_FILE_BYTES } from "../../../../lib/campaign-engine";
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
  const analysis = await analyzeRecipientFile(buffer, file.name).catch(() => null);
  if (!analysis) return jsonError("تعذر قراءة الملف. تأكد أنه CSV أو XLSX سليم");

  return jsonOk({
    count: analysis.valid.length,
    totalRows: analysis.totalRows,
    duplicates: analysis.duplicates,
    rejectedCount: analysis.rejected.length,
    // The first rows only: a file full of bad numbers would otherwise send thousands of lines back.
    rejected: analysis.rejected.slice(0, 300),
    sample: analysis.valid.slice(0, 5).map((recipient) => ({ phone: recipient.phone, name: recipient.name }))
  });
}
