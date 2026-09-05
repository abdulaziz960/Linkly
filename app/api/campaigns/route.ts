import { NextRequest } from "next/server";
import { getCampaigns } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import {
  parseRecipientFile,
  activateDueScheduledCampaigns,
  activateDueRecurringCampaigns,
  processCampaignBatch,
  getCampaignBalance,
  parseRiyadhDateTime,
  spawnCampaignOccurrence,
  createRecurringCampaign,
  MAX_CAMPAIGN_FILE_BYTES,
  MAX_CAMPAIGN_MEDIA_BYTES
} from "../../../lib/campaign-engine";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { getSegmentById, resolveSegmentRecipients } from "../../../lib/segments";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

const ALLOWED_RECURRENCE_INTERVAL_DAYS = new Set([1, 7, 14, 30]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  await activateDueScheduledCampaigns(user.tenantId).catch((error) => console.error("Campaign scheduling check failed", error));
  await activateDueRecurringCampaigns(user.tenantId).catch((error) => console.error("Recurring campaign check failed", error));
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
  const recurring = formData.get("recurring") === "true";
  const recurrenceIntervalDays = Number(formData.get("recurrenceIntervalDays") || 0);
  const recurrenceEndAt = String(formData.get("recurrenceEndAt") || "").trim();
  const audienceMode = formData.get("audienceMode") === "segment" ? "segment" : "file";
  const segmentId = String(formData.get("segmentId") || "").trim();
  const file = formData.get("file");
  const headerMediaFile = formData.get("headerMedia");

  if (recurring && !ALLOWED_RECURRENCE_INTERVAL_DAYS.has(recurrenceIntervalDays)) {
    return jsonError("اختر فترة تكرار صحيحة");
  }

  if (!name) return jsonError("اسم الحملة مطلوب");
  if (name.length > 120) return jsonError("اسم الحملة طويل جداً");
  if (!templateName) return jsonError("اختر قالب معتمد قبل إنشاء الحملة");

  if (audienceMode === "file") {
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
  } else if (!segmentId) {
    return jsonError("اختر تقسيم جمهور لاستخدامه كجمهور الحملة");
  }

  const template = await prisma.template.findFirst({ where: { name: templateName, tenantId: user.tenantId } });
  if (!template) return jsonError("القالب المختار غير موجود");
  if (template.status !== "معتمد") return jsonError("لازم يكون القالب معتمد من Meta قبل استخدامه بحملة");

  // The UI's own "connected" indicator is client-side cached state - a
  // campaign must never actually start unless the channel is connected
  // right now, verified against the same table that indicator reads from.
  const whatsappIntegration = await prisma.integrationSetting.findFirst({ where: { tenantId: user.tenantId, provider: "whatsapp_cloud" } });
  if (!whatsappIntegration || whatsappIntegration.status !== "connected") {
    return jsonError("واتساب غير مربوط بحسابك حاليًا. اربط القناة من الإعدادات قبل إنشاء حملة", 409);
  }

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

  let recipients: Awaited<ReturnType<typeof resolveSegmentRecipients>>;
  if (audienceMode === "segment") {
    const segment = await getSegmentById(user.tenantId, segmentId);
    if (!segment) return jsonError("التقسيم غير موجود", 404);
    recipients = await resolveSegmentRecipients(user.tenantId, segment);
    if (!recipients.length) return jsonError("ما فيه عملاء يطابقون هذا التقسيم حالياً.");
  } else {
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    recipients = await parseRecipientFile(buffer, (file as File).name).catch(() => []);
    if (!recipients.length) return jsonError("ما لقينا أي أرقام صالحة في الملف. تأكد إن الأرقام بالعمود الأول.");
  }

  const scheduledDate = scheduled ? parseRiyadhDateTime(scheduledAt) : null;
  const isScheduledFuture = Boolean(scheduledDate && scheduledDate.getTime() > Date.now());

  let campaignId: string;
  if (recurring) {
    const created = await createRecurringCampaign(user.tenantId, {
      name,
      templateName,
      language: template.language || "ar",
      headerMediaDataUrl,
      recipients,
      intervalDays: recurrenceIntervalDays,
      startAt: scheduledDate,
      endAt: recurrenceEndAt
    });
    campaignId = created.campaignId;
  } else {
    campaignId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
      tenantId: user.tenantId,
      name,
      templateName,
      language: template.language || "ar",
      headerMediaDataUrl,
      recipients,
      status: isScheduledFuture ? "مجدولة" : "قيد الإرسال",
      scheduledAt: isScheduledFuture && scheduledDate ? scheduledDate.toISOString() : ""
    }));
  }

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
