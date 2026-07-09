import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getCurrentUser } from "../../../lib/auth";
import { getEmployees } from "../../../lib/database";
import { sendActivationEmail } from "../../../lib/email";
import { employeeLimitReachedMessage, getEmployeeLimitForTenant } from "../../../lib/employee-limits";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getEmployees());
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

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

  const [employeeCount, employeeLimit] = await Promise.all([
    prisma.employee.count(),
    getEmployeeLimitForTenant(user.tenantId)
  ]);

  if (employeeCount >= employeeLimit) {
    return jsonError(employeeLimitReachedMessage, 403);
  }

  const existingEmployee = await prisma.employee.findFirst({ where: { email } });
  if (existingEmployee) return jsonError("يوجد موظف مسجل بهذا البريد الإلكتروني", 409);

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
        initial: name.slice(0, 1)
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
