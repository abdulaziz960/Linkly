import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { canAccessConversation } from "../../../../../lib/permissions-server";
import { getDealValue, getLeadStatus, LEAD_STATUSES, setLeadStatus } from "../../../../../lib/tiktok-events";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  if (!(await canAccessConversation(user, id))) return jsonError("المحادثة غير موجودة", 404);
  return jsonOk({ status: await getLeadStatus(user.tenantId, id), statuses: LEAD_STATUSES, dealValue: await getDealValue(user.tenantId, id) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  if (!(await canAccessConversation(user, id))) return jsonError("المحادثة غير موجودة", 404);
  const body = (await request.json().catch(() => null)) as { status?: unknown; dealValue?: unknown } | null;
  const result = await setLeadStatus({ tenantId: user.tenantId, conversationId: id, status: body?.status, dealValue: body?.dealValue, actor: user.name || user.email || user.id });
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ status: result.status, event: result.event });
}
