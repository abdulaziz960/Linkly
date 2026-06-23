import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { customer?: string; interest?: string; budget?: string; stage?: string; employee?: string; lastContact?: string };
  try {
    return jsonOk(await prisma.lead.update({
      where: { id },
      data: {
        customer: body.customer,
        interest: body.interest,
        budget: body.budget,
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
  const { id } = await context.params;
  try {
    await prisma.lead.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف العميل المحتمل", 404);
  }
}
