import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { analyzeTable, importLeads, MAX_IMPORT_BYTES, readTable, suggestStage } from "../../../../lib/leads-import";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getTenantStages } from "../../../../lib/pipeline-stages";
import { getTenantCompanyName, logAdminAction } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Two steps over the same file: mode=preview reads it and says what would happen (valid, duplicate and invalid rows,
 * the statuses found and the stage each one maps to); mode=commit saves the leads with the stage mapping the person
 * confirmed. Nothing is ever sent to the customers.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "contacts"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  if (user.role !== "مالك الحساب" && user.role !== "مشرف") return jsonError("استيراد العملاء متاح لمالك الحساب والمشرف فقط", 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return jsonError("اختر ملف CSV أو Excel");
  if (file.size > MAX_IMPORT_BYTES) return jsonError("حجم الملف أكبر من 5 ميجابايت");
  if (!/\.(csv|txt|xlsx)$/i.test(file.name)) return jsonError("الملف يجب أن يكون CSV أو Excel (xlsx)");

  let analysis;
  try {
    analysis = analyzeTable(await readTable(Buffer.from(await file.arrayBuffer()), file.name));
  } catch {
    return jsonError("تعذر قراءة الملف، تأكد أنه CSV أو Excel سليم");
  }
  if (!analysis.columns.phone) return jsonError("لم أجد عمود رقم الجوال في الملف (مثل: الهاتف المحمول، الجوال، phone)");

  const stages = await getTenantStages(user.tenantId);
  const statuses = analysis.statuses.map((item) => ({ ...item, stage: suggestStage(item.value, stages) }));

  if (form.get("mode") !== "commit") {
    return jsonOk({
      total: analysis.total,
      valid: analysis.valid.length,
      duplicates: analysis.duplicates,
      invalid: analysis.invalid.slice(0, 30),
      invalidCount: analysis.invalid.length,
      statuses,
      stages,
      columns: analysis.columns,
      sample: analysis.valid.slice(0, 5)
    });
  }

  let chosen: Record<string, unknown> = {};
  try { chosen = JSON.parse(String(form.get("stageMap") || "{}")) as Record<string, unknown>; } catch { return jsonError("خريطة المراحل غير صالحة"); }
  const stageMap: Record<string, string> = {};
  for (const item of statuses) {
    const value = chosen[item.value];
    stageMap[item.value] = typeof value === "string" && stages.includes(value) ? value : item.stage;
  }

  const outcome = await importLeads({ tenantId: user.tenantId, rows: analysis.valid, stageMap, stages });
  await logAdminAction(
    user.tenantId,
    await getTenantCompanyName(user.tenantId),
    `استيراد عملاء من ملف "${file.name.slice(0, 80)}" بواسطة ${user.name}: أُضيف ${outcome.created}، موجود مسبقًا ${outcome.existing}، فشل ${outcome.failed}.`,
    "معلومة",
    "العملاء"
  );
  return jsonOk({ ...outcome, invalid: analysis.invalid.length, duplicates: analysis.duplicates });
}
