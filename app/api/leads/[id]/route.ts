import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "leads"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json()) as { customer?: string; phone?: string; interest?: string; budget?: string; source?: string; notes?: string; stage?: string; employee?: string; lastContact?: string };
  try {
    const existingLead = await prisma.lead.findUnique({ where: { id } });
    if (!existingLead || existingLead.tenantId !== user.tenantId) return jsonError("تعذر تحديث العميل المحتمل", 404);

    return jsonOk(await prisma.lead.update({
      where: { id },
      data: {
        customer: body.customer,
        phone: body.phone,
        interest: body.interest,
        budget: body.budget,
        source: body.source,
        notes: body.notes,
        stage: body.stage,
        employee: body.employee,
        lastContact: body.lastContact
      }
    }));
  } catch {
    return jsonError("تعذر تحديث العميل المحتمل", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "leads"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  try {
    const existingLead = await prisma.lead.findUnique({ where: { id } });
    if (!existingLead || existingLead.tenantId !== user.tenantId) return jsonError("تعذر حذف العميل المحتمل", 404);

    await prisma.lead.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف العميل المحتمل", 404);
  }
}
