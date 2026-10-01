import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../../lib/auth";
import { prisma } from "../../../../../../../lib/prisma";
import { runWorkspaceTranscription } from "../../../../../../../lib/workspace-ai";
import { getEmployeeForUser } from "../../../../../../../lib/permissions-server";
import { consumeRateLimit, requestIdentifier } from "../../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../_utils/json";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export const runtime = "nodejs";

const transcriptionReasons: Record<string, string> = {
  disabled: "فعّل مساعد الذكاء الاصطناعي من الإعدادات أولاً",
  key_unavailable: "تعذر الوصول لمفتاح الذكاء الاصطناعي",
  plan_upgrade_required: "ترقية الباقة مطلوبة لاستخدام هذه الميزة",
  managed_not_ready: "خدمة الذكاء الاصطناعي غير متاحة حاليًا",
  usage_limit: "تم تجاوز الحد المسموح من طلبات الذكاء الاصطناعي لهذا الشهر/اليوم",
  budget_limit: "تم تجاوز الحد المسموح من طلبات الذكاء الاصطناعي",
  provider_unsupported: "تفريغ الصوت غير متاح مع مزود الذكاء الاصطناعي الحالي",
  provider_unavailable: "تعذر تفريغ الرسالة الصوتية، حاول مرة أخرى",
  no_speech: "لم يتم التعرف على أي كلام في هذه الرسالة الصوتية"
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id, messageId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  // Each call is an LLM request with real cost; without a cap an assigned
  // employee could hammer this in a tight loop (same reasoning as
  // suggest-reply/route.ts).
  const rateLimit = await consumeRateLimit("transcribe-audio", requestIdentifier(request, user.id), 20, 60 * 1000);
  if (!rateLimit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const conversation = await prisma.conversation.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!conversation) return jsonError("المحادثة غير موجودة", 404);
  if (user.role !== "مالك الحساب") {
    const employee = await getEmployeeForUser(user);
    if (!employee || employee.name !== conversation.assignee) return jsonError("المحادثة غير موجودة", 404);
  }

  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId: id } });
  if (!message) return jsonError("الرسالة غير موجودة", 404);
  if (message.attachmentType !== "audio" || !message.attachmentUrl) return jsonError("هذه الرسالة لا تحتوي على تسجيل صوتي", 400);

  if (message.transcript) return jsonOk({ transcript: message.transcript });

  const dataUrlMatch = message.attachmentUrl.match(/^data:([^,]+);base64,(.+)$/);
  if (!dataUrlMatch) return jsonError("تعذر قراءة الملف الصوتي", 400);
  const mimeType = dataUrlMatch[1].replace(/\s+/g, "").split(";")[0];
  const base64 = dataUrlMatch[2];

  const body = (await request.json().catch(() => null)) as { language?: "ar" | "en" } | null;

  const result = await runWorkspaceTranscription(user.tenantId, user.id, id, {
    base64,
    mimeType: mimeType || message.attachmentMime || "audio/mpeg",
    language: body?.language === "en" ? "en" : "ar"
  });

  if (!result.transcript) {
    return jsonError(transcriptionReasons[result.reason || ""] || "تعذر تفريغ الرسالة الصوتية", 422);
  }

  await prisma.message.update({ where: { id: messageId }, data: { transcript: result.transcript } });

  return jsonOk({ transcript: result.transcript });
}
