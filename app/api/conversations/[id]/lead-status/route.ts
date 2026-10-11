import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getLeadStatus, LEAD_STATUSES, setLeadStatus } from "../../../../../lib/tiktok-events";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  const owned = await prisma.conversation.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
  if (!owned) return jsonError("المحادثة غير موجودة", 404);
  return jsonOk({ status: await getLeadStatus(user.tenantId, id), statuses: LEAD_STATUSES });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const result = await setLeadStatus({ tenantId: user.tenantId, conversationId: id, status: body?.status, actor: user.name || user.email || user.id });
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ status: result.status, event: result.event });
}
