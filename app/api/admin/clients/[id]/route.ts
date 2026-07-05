import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const body = (await request.json()) as { employees?: number };
  const employees = Number(body.employees);

  if (!Number.isFinite(employees) || employees < 1) {
    return jsonError("حد المستخدمين غير صحيح");
  }

  const client = await prisma.providerClient.findUnique({ where: { id } });
  if (!client) return jsonError("العميل غير موجود", 404);

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.providerClient.update({
      where: { id },
      data: {
        employees,
        lastActivity: "تم تحديث حد المستخدمين"
      }
    });

    await tx.adminLog.create({
      data: {
        id: `log-${Date.now()}`,
        at: now.toLocaleString("ar-SA"),
        clientId: id,
        clientName: client.company,
        source: "Provider Admin",
        level: "معلومة",
        message: `تم تعديل حد المستخدمين من ${client.employees} إلى ${employees} بواسطة ${user.name}.`
      }
    });
  });

  return jsonOk({ id, employees });
}
