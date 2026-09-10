import { NextRequest } from "next/server";
import { createHash, randomBytes, randomUUID } from "crypto";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { isOwnerEquivalentGrant } from "../../../lib/permissions";
import { getEmployees } from "../../../lib/database";
import { sendActivationEmail } from "../../../lib/email";
import { employeeLimitReachedMessage, getEmployeeLimitForTenant } from "../../../lib/employee-limits";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";
import { isValidEmail } from "../../../lib/validation";
import { getAppOrigin } from "../../../lib/app-url";
import { logAdminAction, getTenantCompanyName } from "../../../lib/subscriptions";

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
  if (!isValidEmail(email)) return jsonError("أدخل بريداً إلكترونياً صحيحاً");
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

  const role = body.role || "موظف دعم";
  const permissions = body.permissions || "محادثات فقط";
  const activationToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(activationToken).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
  const origin = getAppOrigin(request);

  const existingAccount = await prisma.userAccount.findUnique({ where: { email } });
  if (existingAccount && existingAccount.tenantId === user.tenantId) {
    // A UserAccount already sits in THIS same tenant (e.g. left over from a
    // prior employee record) with no membership to attach a second time to -
    // that's a same-company conflict, not a cross-tenant invite.
    return jsonError("هذا البريد الإلكتروني مستخدم بالفعل لحساب آخر على المنصة", 409);
  }
  if (existingAccount) {
    // This email already has a login elsewhere on the platform - rather
    // than blocking outright, offer to attach a second membership to that
    // SAME account, but only once its owner actively confirms (a company
    // shouldn't be able to silently attach itself to someone else's
    // existing login just by knowing their email).
    await prisma.employeeInvite.deleteMany({ where: { email, purpose: "cross_tenant_membership" } });
    await prisma.employeeInvite.create({
      data: {
        id: `invite-${randomUUID()}`,
        email,
        tokenHash,
        expiresAt,
        createdAt: now.toISOString(),
        purpose: "cross_tenant_membership",
        inviteTenantId: user.tenantId,
        role,
        permissions
      }
    });

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId }, select: { companyName: true } });
    const joinUrl = `${origin}/join-workspace?token=${activationToken}`;
    const inviteDelivery = await sendActivationEmail({
      to: email,
      name: existingAccount.name,
      activationUrl: joinUrl,
      purpose: "workspace_invite",
      workspaceName: subscription?.companyName || ""
    });

    return jsonOk({ pendingCrossTenantInvite: true, email, inviteDelivery });
  }

  const employeeId = `emp-${randomUUID()}`;
  const userId = `user-${employeeId}`;

  const employee = await prisma.$transaction(async (tx) => {
    const createdEmployee = await tx.employee.create({
      data: {
        id: employeeId,
        name,
        email,
        role,
        status: body.status || "متصل",
        permissions,
        initial: name.slice(0, 1),
        tenantId: user.tenantId,
        userId
      }
    });

    await tx.userAccount.create({
      data: {
        id: userId,
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
        id: `invite-${randomUUID()}`,
        email,
        tokenHash,
        expiresAt,
        createdAt: now.toISOString(),
        purpose: "employee_activation"
      }
    });

    return createdEmployee;
  });

  const activationUrl = `${origin}/activate?token=${activationToken}`;
  const inviteDelivery = await sendActivationEmail({ to: email, name, activationUrl });

  await logAdminAction(
    user.tenantId,
    await getTenantCompanyName(user.tenantId),
    `تمت إضافة الموظف "${name}" (${email}) بواسطة ${user.name}.`,
    "معلومة",
    "الموظفون"
  );

  return jsonOk({ ...employee, inviteDelivery });
}
