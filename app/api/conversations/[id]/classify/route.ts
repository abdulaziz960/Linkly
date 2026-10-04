import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { runWorkspaceAi } from "../../../../../lib/workspace-ai";
import { getEmployeeForUser } from "../../../../../lib/permissions-server";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../_utils/json";
import { matchTagLabel } from "../../../../../lib/ai-classify";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

/** Tags an untagged conversation with the workspace's own tag that best fits the customer's request. */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const rateLimit = await consumeRateLimit("classify", requestIdentifier(request, user.id), 20, 60 * 1000);
  if (!rateLimit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const conversation = await prisma.conversation.findFirst({ where: { id, tenantId: user.tenantId }, include: { customer: true, tags: true } });
  if (!conversation) return jsonError("المحادثة غير موجودة", 404);
  if (user.role !== "مالك الحساب") {
    const employee = await getEmployeeForUser(user);
    if (!employee || employee.name !== conversation.assignee) return jsonError("المحادثة غير موجودة", 404);
  }
  // Never override a person's tagging, and nothing to choose from means no model call.
  if (conversation.tags.length) return jsonOk({ tag: null, reason: "already_tagged" });
  const tags = await prisma.tag.findMany({ where: { tenantId: user.tenantId }, select: { name: true }, take: 40 });
  if (!tags.length) return jsonOk({ tag: null, reason: "no_tags" });

  const messages = await prisma.message.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { direction: true, text: true }, take: 10 });
  const result = await runWorkspaceAi(user.tenantId, user.id, id, {
    source: "copilot", operation: "classify", language: "ar", customerName: conversation.customer.name,
    messages: messages.reverse().map((message) => ({ direction: message.direction as "in" | "out" | "note", text: message.text })),
    draft: JSON.stringify(tags.map((tag) => tag.name))
  });
  const tag = matchTagLabel(result.suggestion, tags.map((item) => item.name));
  if (!tag) return jsonOk({ tag: null, reason: result.reason || "no_match" });
  await prisma.conversationTag.upsert({ where: { conversationId_tagName: { conversationId: id, tagName: tag } }, update: {}, create: { conversationId: id, tagName: tag } });
  return jsonOk({ tag });
}
