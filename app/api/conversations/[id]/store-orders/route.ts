import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { canAccessConversation, userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { listSallaStatuses, sallaOrdersForCustomer } from "../../../../../lib/salla";
import { readStoreTokens } from "../../../../../lib/store-connections";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** The customer's orders in the connected store, for the conversation's side panel (WhatsApp conversations, Salla for now). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  if (!(await canAccessConversation(user, id))) return jsonError("المحادثة غير موجودة", 404);

  const conversation = await prisma.conversation.findFirst({ where: { id, tenantId: user.tenantId }, include: { customer: { select: { phone: true } } } });
  if (!conversation || conversation.channel !== "whatsapp") return jsonOk({ connected: false, orders: [], statuses: [], canManage: false });
  if (!(await readStoreTokens(user.tenantId, "salla"))) return jsonOk({ connected: false, orders: [], statuses: [], canManage: false });

  const result = await sallaOrdersForCustomer(user.tenantId, conversation.customer.phone);
  if (!result.ok) return jsonOk({ connected: true, error: result.status === 401 || result.status === 403 ? "صلاحيات الربط ناقصة: أعد ربط متجر سلة." : "تعذر جلب الطلبات من سلة", orders: [], statuses: [], canManage: false });

  const canManage = await userHasViewPermission(user, "integrations");
  return jsonOk({ connected: true, orders: result.orders, statuses: canManage && result.orders.length ? await listSallaStatuses(user.tenantId) : [], canManage });
}
