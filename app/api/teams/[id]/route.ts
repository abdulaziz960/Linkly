import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    lead?: string;
    routing?: string;
    memberIds?: string[];
  };
  const name = body.name?.trim();

  if (!name) return jsonError("اسم الفريق مطلوب");

  const existing = await prisma.team.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر تحديث الفريق", 404);

  try {
    const team = await prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: id } });

      return tx.team.update({
        where: { id },
        data: {
          name,
          lead: body.lead?.trim() || "",
          routing: body.routing || "يدوي",
          members: {
            create: (body.memberIds || []).map((employeeId) => ({ employeeId }))
          }
        },
        include: { members: true }
      });
    });

    return jsonOk(team);
  } catch {
    return jsonError("تعذر تحديث الفريق", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const { id } = await context.params;
  const existing = await prisma.team.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر حذف الفريق", 404);

  try {
    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { teamId: id } }),
      prisma.team.delete({ where: { id } })
    ]);

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الفريق", 404);
  }
}
