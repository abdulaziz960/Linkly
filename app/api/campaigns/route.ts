import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCampaigns } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { parseRecipientFile, activateDueScheduledCampaigns, processCampaignBatch, getCampaignBalance, parseRiyadhDateTime, MAX_CAMPAIGN_FILE_BYTES, MAX_CAMPAIGN_MEDIA_BYTES } from "../../../lib/campaign-engine";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  await activateDueScheduledCampaigns(user.tenantId).catch((error) => console.error("Campaign scheduling check failed", error));
  processCampaignBatch(user.tenantId).catch((error) => console.error("Campaign batch send failed", error));

  return jsonOk(await getCampaigns(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const formData = await request.formData().catch(() => null);
  if (!formData) return jsonError("بيانات الطلب غير صحيحة");

  const name = String(formData.get("name") || "").trim();
  const templateName = String(formData.get("templateName") || "").trim();
  const scheduled = formData.get("scheduled") === "true";
  const scheduledAt = String(formData.get("scheduledAt") || "").trim();
  const file = formData.get("file");
  const headerMediaFile = formData.get("headerMedia");

  if (!name) return jsonError("اسم الحملة مطلوب");
  if (name.length > 120) return jsonError("اسم الحملة طويل جداً");
  if (!templateName) return jsonError("اختر قالب معتمد قبل إنشاء الحملة");
  if (!(file instanceof File)) return jsonError("ارفع ملف Excel أو CSV يحتوي على أرقام العملاء");
  const extension = file.name.toLowerCase().split(".").pop();
  if (!extension || !["csv", "xlsx"].includes(extension)) return jsonError("صيغة الملف غير مدعومة. استخدم CSV أو XLSX فقط");
  if (file.size <= 0 || file.size > MAX_CAMPAIGN_FILE_BYTES) return jsonError("حجم الملف يجب ألا يتجاوز 5 ميجابايت");
  const allowedMimeTypes = new Set([
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream"
  ]);
  if (file.type && !allowedMimeTypes.has(file.type)) return jsonError("نوع الملف غير مدعوم");

  const template = await prisma.template.findFirst({ where: { name: templateName, tenantId: user.tenantId } });
  if (!template) return jsonError("القالب المختار غير موجود");
  if (template.status !== "معتمد") return jsonError("لازم يكون القالب معتمد من Meta قبل استخدامه بحملة");

  // A template's header *format* (image/video/document) is fixed at Meta
  // approval time, but WhatsApp expects fresh media on every send - the
  // campaign can supply its own, otherwise fall back to whatever was saved
  // on the template. If neither exists, fail before spending any send
  // budget instead of hitting Meta's opaque #132012 error per recipient.
  const needsHeaderMedia = ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType);
  let headerMediaDataUrl = "";
  if (headerMediaFile instanceof File && headerMediaFile.size > 0) {
    if (headerMediaFile.size > MAX_CAMPAIGN_MEDIA_BYTES) return jsonError("حجم صورة/فيديو الرأس يجب ألا يتجاوز 16 ميجابايت");
    const allowedMediaMimeTypes = new Set([
      "image/jpeg",
      "image/png",
      "video/mp4",
      "video/3gpp",
      "application/pdf"
    ]);
    if (!allowedMediaMimeTypes.has(headerMediaFile.type)) return jsonError("صيغة الملف غير مدعومة لرأس القالب");
    const mediaBuffer = Buffer.from(await headerMediaFile.arrayBuffer());
    headerMediaDataUrl = `data:${headerMediaFile.type};base64,${mediaBuffer.toString("base64")}`;
  } else if (needsHeaderMedia && !template.headerMediaDataUrl) {
    return jsonError("هذا القالب يحتاج صورة أو فيديو بالرأس - ارفعها مع الحملة أو من إعدادات القالب أولاً");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const recipients = await parseRecipientFile(buffer, file.name).catch(() => []);
  if (!recipients.length) return jsonError("ما لقينا أي أرقام صالحة في الملف. تأكد إن الأرقام بالعمود الأول.");

  const scheduledDate = scheduled ? parseRiyadhDateTime(scheduledAt) : null;
  const isScheduledFuture = Boolean(scheduledDate && scheduledDate.getTime() > Date.now());
  const campaignId = `camp-${randomUUID()}`;

  await prisma.$transaction(async (tx) => {
    await tx.campaign.create({
      data: {
        id: campaignId,
        tenantId: user.tenantId,
        name,
        channel: "whatsapp",
        templateName,
        language: template.language || "ar",
        scheduledAt: isScheduledFuture && scheduledDate ? scheduledDate.toISOString() : "",
        headerMediaDataUrl,
        sent: 0,
        total: recipients.length,
        progress: "0%",
        status: isScheduledFuture ? "مجدولة" : "قيد الإرسال",
        updatedAt: new Date().toLocaleString("en-US")
      }
    });

    await tx.campaignRecipient.createMany({
      data: recipients.map((recipient) => ({
          id: `cr-${campaignId}-${recipient.phone}`,
          campaignId,
          tenantId: user.tenantId,
          phone: recipient.phone,
          name: recipient.name,
          status: "قيد الإرسال",
          createdAt: new Date().toISOString()
      }))
    });
  });

  if (!isScheduledFuture) {
    processCampaignBatch(user.tenantId).catch((error) => console.error("Campaign batch send failed", error));
  }

  const campaigns = await getCampaigns(user.tenantId);
  const campaign = campaigns.find((item) => item.id === campaignId);
  const balance = await getCampaignBalance(user.tenantId);
  const balanceWarning = !isScheduledFuture && balance < recipients.length
    ? `تنبيه: رصيدك الحالي (${balance.toLocaleString("en-US")} رسالة) أقل من عدد المستلمين (${recipients.length.toLocaleString("en-US")}). بيتم الإرسال حسب الرصيد المتاح فقط وتتوقف الحملة بعده.`
    : undefined;

  return jsonOk({ ...campaign, balanceWarning });
}
