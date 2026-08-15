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
  if (!user) return jsonError("غير مصرح", 401);

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    role?: string;
    status?: string;
    permissions?: string;
  };
  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!name) return jsonError("اسم الموظف مطلوب");
  if (!email) return jsonError("البريد الإلكتروني مطلوب");

  try {
    const existingEmployee = await prisma.employee.findUnique({ where: { id } });
    if (!existingEmployee || existingEmployee.tenantId !== user.tenantId) {
      return jsonError("تعذر تحديث الموظف", 404);
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name,
        email,
        role: body.role || "موظف دعم",
        status: body.status || "متصل",
        permissions: body.permissions || "محادثات فقط",
        initial: name.slice(0, 1)
      }
    });

    return jsonOk(employee);
  } catch {
    return jsonError("تعذر تحديث الموظف", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const { id } = await context.params;

  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.tenantId !== user.tenantId) return jsonError("تعذر حذف الموظف", 404);

    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { employeeId: id } }),
      prisma.employeeInvite.deleteMany({ where: { email: employee.email } }),
      prisma.userAccount.deleteMany({ where: { email: employee.email } }),
      prisma.employee.delete({ where: { id } })
    ]);

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الموظف", 404);
  }
}
