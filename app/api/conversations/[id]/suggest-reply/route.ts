import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { runWorkspaceAi } from "../../../../../lib/workspace-ai";
import { aiOperations, type AiOperation } from "../../../../../lib/ai-types";
import { getEmployeeForUser } from "../../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const conversation = await prisma.conversation.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { customer: true }
  });
  if (!conversation) return jsonError("المحادثة غير موجودة", 404);
  if (user.role !== "مالك الحساب") {
    const employee = await getEmployeeForUser(user);
    if (!employee || employee.name !== conversation.assignee) return jsonError("المحادثة غير موجودة", 404);
  }

  const body = (await request.json().catch(() => null)) as { language?: "ar" | "en"; operation?: AiOperation; draft?: string } | null;
  if (body?.operation !== undefined && !aiOperations.includes(body.operation)) return jsonError("عملية غير معروفة", 400);
  if (body?.draft !== undefined && (typeof body.draft !== "string" || body.draft.length > 8000)) return jsonError("المسودة طويلة أو غير صالحة", 400);
  if (["rewrite", "correct", "translate"].includes(body?.operation || "") && !body?.draft?.trim()) return jsonError("اكتب مسودة أولاً", 400);

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { direction: true, text: true },
    take: 50
  });

  const result = await runWorkspaceAi(user.tenantId, user.id, conversation.id, {
    messages: messages.reverse().map((message) => ({ direction: message.direction as "in" | "out" | "note", text: message.text })),
    customerName: conversation.customer.name,
    language: body?.language === "en" ? "en" : "ar",
    operation: body?.operation || "reply", draft: body?.draft
  });

  return jsonOk(result);
}
