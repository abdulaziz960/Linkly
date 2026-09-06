import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
  const tenantId = body.tenantId?.trim() || "";
  if (!tenantId) return jsonError("الشركة غير محددة");

  // Proves this identity actually holds a membership in the target tenant -
  // switching can never move someone into a company they weren't invited
  // into and confirmed.
  const membership = await prisma.employee.findFirst({ where: { tenantId, userId: user.id } });
  if (!membership) return jsonError("لا تملك عضوية في هذه الشركة", 403);

  // The session cookie only ever carries userId + sessionVersion - it never
  // encodes tenant. Every request re-reads tenantId/role fresh off this one
  // row, so updating it here is the entire "switch": nothing else caches
  // tenant context anywhere in the app.
  await prisma.userAccount.update({
    where: { id: user.id },
    data: { tenantId: membership.tenantId, role: membership.role }
  });

  return jsonOk({ tenantId: membership.tenantId, role: membership.role });
}
