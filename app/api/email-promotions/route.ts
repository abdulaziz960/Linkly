import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { createEmailCampaign, getEmailCampaignBalance, listEmailCampaigns, listEmailCampaignTransactions, MAX_EMAIL_CAMPAIGN_FILE_BYTES, parseEmailRecipientFile, processEmailCampaignBatch } from "../../../lib/email-promotions";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  processEmailCampaignBatch(user.tenantId).catch((error) => console.error("Email campaign batch failed", error));
  return jsonOk({ campaigns: await listEmailCampaigns(user.tenantId), balance: await getEmailCampaignBalance(user.tenantId), transactions: await listEmailCampaignTransactions(user.tenantId) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  const body = isMultipart ? null : await request.json().catch(() => null);
  const formData = isMultipart ? await request.formData().catch(() => null) : null;
  if (!body && !formData) return jsonError("بيانات الطلب غير صحيحة");
  try {
    const file = formData?.get("file");
    let fileRecipients;
    let fileName = "";
    if (file instanceof File && file.size > 0) {
      fileName = file.name;
      const extension = file.name.toLowerCase().split(".").pop();
      if (!extension || !["csv", "xlsx"].includes(extension)) return jsonError("صيغة ملف الإيميلات غير مدعومة. استخدم CSV أو XLSX");
      if (file.size > MAX_EMAIL_CAMPAIGN_FILE_BYTES) return jsonError("حجم ملف الإيميلات يجب ألا يتجاوز 5 ميجابايت");
      fileRecipients = await parseEmailRecipientFile(Buffer.from(await file.arrayBuffer()), file.name);
    }
    const audience = formData
      ? JSON.parse(String(formData.get("audience") || "{}"))
      : body.audience || { mode: "all" };
    if (audience.mode === "file") audience.fileName = fileName;
    const id = await createEmailCampaign(user.tenantId, {
      name: String(formData?.get("name") ?? body?.name ?? ""),
      subject: String(formData?.get("subject") ?? body?.subject ?? ""),
      senderName: String(formData?.get("senderName") ?? body?.senderName ?? ""),
      senderEmail: String(formData?.get("senderEmail") ?? body?.senderEmail ?? ""),
      bodyHtml: String(formData?.get("bodyHtml") ?? body?.bodyHtml ?? ""),
      ctaText: String(formData?.get("ctaText") ?? body?.ctaText ?? ""),
      ctaUrl: String(formData?.get("ctaUrl") ?? body?.ctaUrl ?? ""),
      audience,
      scheduledAt: String(formData?.get("scheduledAt") ?? body?.scheduledAt ?? ""),
      sendNow: (formData?.get("action") ?? body?.action) === "send",
      saveDraft: (formData?.get("action") ?? body?.action) === "draft",
      fileRecipients
    });
    return jsonOk({ id, campaigns: await listEmailCampaigns(user.tenantId), balance: await getEmailCampaignBalance(user.tenantId), transactions: await listEmailCampaignTransactions(user.tenantId) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء الحملة");
  }
}
