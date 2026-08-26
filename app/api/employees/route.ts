import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { isOwnerEquivalentGrant } from "../../../lib/permissions";
import { getEmployees } from "../../../lib/database";
import { sendActivationEmail } from "../../../lib/email";
import { employeeLimitReachedMessage, getEmployeeLimitForTenant } from "../../../lib/employee-limits";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  // Every tenant member can read the roster (needed for assignee pickers
  // and to resolve their own permissions) - only managing employees is gated.
  return jsonOk(await getEmployees(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "employees"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    role?: string;
    status?: string;
    permissions?: string;
  };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!name) return jsonError("اسم الموظف مطلوب");
  if (!email) return jsonError("البريد الإلكتروني مطلوب");
  if (isOwnerEquivalentGrant(body.role || "", body.permissions || "") && user.role !== "مالك الحساب") {
    return jsonError("فقط مالك الحساب يقدر يمنح صلاحية بمستوى المالك", 403);
  }

  const [employeeCount, employeeLimit] = await Promise.all([
    prisma.employee.count({ where: { tenantId: user.tenantId } }),
    getEmployeeLimitForTenant(user.tenantId)
  ]);

  if (employeeCount >= employeeLimit) {
    return jsonError(employeeLimitReachedMessage, 403);
  }

  const existingEmployee = await prisma.employee.findFirst({ where: { email, tenantId: user.tenantId } });
  if (existingEmployee) return jsonError("يوجد موظف مسجل بهذا البريد الإلكتروني", 409);

  const existingAccount = await prisma.userAccount.findUnique({ where: { email } });
  if (existingAccount && existingAccount.tenantId !== user.tenantId) {
    return jsonError("هذا البريد الإلكتروني مستخدم بالفعل لحساب آخر على المنصة", 409);
  }

  const activationToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(activationToken).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
  const role = body.role || "موظف دعم";
  const employeeId = `emp-${Date.now()}`;

  const employee = await prisma.$transaction(async (tx) => {
    const createdEmployee = await tx.employee.create({
      data: {
        id: employeeId,
        name,
        email,
        role,
        status: body.status || "متصل",
        permissions: body.permissions || "محادثات فقط",
        initial: name.slice(0, 1),
        tenantId: user.tenantId
      }
    });

    await tx.userAccount.upsert({
      where: { email },
      update: {
        name,
        role,
        tenantId: user.tenantId
      },
      create: {
        id: `user-${employeeId}`,
        name,
        email,
        passwordHash: "",
        role,
        tenantId: user.tenantId,
        createdAt: "اليوم"
      }
    });

    await tx.employeeInvite.deleteMany({ where: { email } });
    await tx.employeeInvite.create({
      data: {
        id: `invite-${Date.now()}`,
        email,
        tokenHash,
        expiresAt,
        createdAt: now.toISOString()
      }
    });

    return createdEmployee;
  });

  const origin = request.nextUrl.origin;
  const activationUrl = `${origin}/activate?token=${activationToken}`;
  const inviteDelivery = await sendActivationEmail({ to: email, name, activationUrl });

  return jsonOk({ ...employee, inviteDelivery });
}
