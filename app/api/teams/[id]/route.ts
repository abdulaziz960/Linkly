import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
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
  if (!(await userHasViewPermission(user, "teams"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

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
      const requestedMemberIds = Array.isArray(body.memberIds) ? Array.from(new Set(body.memberIds)) : [];
      const tenantEmployees = requestedMemberIds.length
        ? await tx.employee.findMany({
          where: { id: { in: requestedMemberIds }, tenantId: user.tenantId },
          select: { id: true }
        })
        : [];
      await tx.teamMember.deleteMany({ where: { teamId: id, team: { tenantId: user.tenantId } } });

      await tx.team.updateMany({
        where: { id, tenantId: user.tenantId },
        data: {
          name,
          lead: body.lead?.trim() || "",
          routing: body.routing || "يدوي"
        }
      });
      if (tenantEmployees.length) {
        await tx.teamMember.createMany({
          data: tenantEmployees.map((employee) => ({ teamId: id, employeeId: employee.id }))
        });
      }
      return tx.team.findFirstOrThrow({
        where: { id, tenantId: user.tenantId },
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
  if (!(await userHasViewPermission(user, "teams"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const existing = await prisma.team.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر حذف الفريق", 404);

  try {
    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { teamId: id, team: { tenantId: user.tenantId } } }),
      prisma.team.deleteMany({ where: { id, tenantId: user.tenantId } })
    ]);

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الفريق", 404);
  }
}
