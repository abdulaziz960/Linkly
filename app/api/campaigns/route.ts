import { NextRequest } from "next/server";
import { getCampaigns } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { parseRecipientFile, activateDueScheduledCampaigns, processCampaignBatch, getCampaignBalance } from "../../../lib/campaign-engine";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  await activateDueScheduledCampaigns(user.tenantId).catch((error) => console.error("Campaign scheduling check failed", error));
  processCampaignBatch(user.tenantId).catch((error) => console.error("Campaign batch send failed", error));

  return jsonOk(await getCampaigns(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const formData = await request.formData().catch(() => null);
  if (!formData) return jsonError("بيانات الطلب غير صحيحة");

  const name = String(formData.get("name") || "").trim();
  const templateName = String(formData.get("templateName") || "").trim();
  const scheduled = formData.get("scheduled") === "true";
  const scheduledAt = String(formData.get("scheduledAt") || "").trim();
  const file = formData.get("file");

  if (!name) return jsonError("اسم الحملة مطلوب");
  if (!templateName) return jsonError("اختر قالب معتمد قبل إنشاء الحملة");
  if (!(file instanceof File)) return jsonError("ارفع ملف Excel أو CSV يحتوي على أرقام العملاء");

  const template = await prisma.template.findUnique({ where: { name: templateName } });
  if (!template) return jsonError("القالب المختار غير موجود");
  if (template.status !== "معتمد") return jsonError("لازم يكون القالب معتمد من Meta قبل استخدامه بحملة");

  const buffer = Buffer.from(await file.arrayBuffer());
  const recipients = parseRecipientFile(buffer, file.name);
  if (!recipients.length) return jsonError("ما لقينا أي أرقام صالحة في الملف. تأكد إن الأرقام بالعمود الأول.");

  const isScheduledFuture = scheduled && scheduledAt && new Date(scheduledAt).getTime() > Date.now();
  const campaignId = `camp-${Date.now()}`;

  await prisma.$transaction(async (tx) => {
    await tx.campaign.create({
      data: {
        id: campaignId,
        tenantId: user.tenantId,
        name,
        channel: "whatsapp",
        templateName,
        scheduledAt: isScheduledFuture ? new Date(scheduledAt).toISOString() : "",
        sent: 0,
        total: recipients.length,
        progress: "0%",
        status: isScheduledFuture ? "مجدولة" : "قيد الإرسال",
        updatedAt: new Date().toLocaleString("en-US")
      }
    });

    for (const recipient of recipients) {
      await tx.campaignRecipient.create({
        data: {
          id: `cr-${campaignId}-${recipient.phone}`,
          campaignId,
          tenantId: user.tenantId,
          phone: recipient.phone,
          name: recipient.name,
          status: "قيد الإرسال",
          createdAt: new Date().toISOString()
        }
      });
    }
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
