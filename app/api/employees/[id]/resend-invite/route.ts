import { NextRequest } from "next/server";
import { createHash, randomBytes, randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { sendActivationEmail } from "../../../../../lib/email";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "employees"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!employee) return jsonError("تعذر إيجاد الموظف", 404);

  const account = await prisma.userAccount.findUnique({ where: { email: employee.email } });
  if (!account || account.passwordHash) {
    return jsonError("هذا الموظف فعّل حسابه بالفعل", 409);
  }

  const activationToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(activationToken).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();

  await prisma.$transaction([
    prisma.employeeInvite.deleteMany({ where: { email: employee.email } }),
    prisma.employeeInvite.create({
      data: {
        id: `invite-${randomUUID()}`,
        email: employee.email,
        tokenHash,
        expiresAt,
        createdAt: now.toISOString(),
        purpose: "employee_activation"
      }
    })
  ]);

  const origin = request.nextUrl.origin;
  const activationUrl = `${origin}/activate?token=${activationToken}`;
  const inviteDelivery = await sendActivationEmail({ to: employee.email, name: employee.name, activationUrl });

  return jsonOk({ inviteDelivery });
}
