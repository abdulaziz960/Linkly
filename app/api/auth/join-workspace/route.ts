import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { verifyPassword } from "../../../../lib/passwords";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { employeeLimitReachedMessage, getEmployeeLimitForTenant } from "../../../../lib/employee-limits";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const token = body.token?.trim() || "";
  const password = body.password || "";

  if (!token || !password) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit("join-workspace", requestIdentifier(request, token), 10, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const invite = await prisma.employeeInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.purpose !== "cross_tenant_membership" || new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ message: "رابط الدعوة منتهي أو غير صالح" }, { status: 400 });
  }

  const account = await prisma.userAccount.findUnique({ where: { email: invite.email } });
  if (!account || !account.passwordHash) {
    return NextResponse.json({ message: "رابط الدعوة منتهي أو غير صالح" }, { status: 400 });
  }

  const verification = verifyPassword(password, account.passwordHash);
  if (!verification.valid) {
    return NextResponse.json({ message: "كلمة السر غير صحيحة" }, { status: 401 });
  }

  const alreadyMember = await prisma.employee.findFirst({ where: { tenantId: invite.inviteTenantId, userId: account.id } });
  if (alreadyMember) {
    await prisma.employeeInvite.deleteMany({ where: { email: invite.email, purpose: "cross_tenant_membership" } });
    return NextResponse.json({ message: "أنت عضو بهذه الشركة بالفعل" }, { status: 409 });
  }

  const [employeeCount, employeeLimit] = await Promise.all([
    prisma.employee.count({ where: { tenantId: invite.inviteTenantId } }),
    getEmployeeLimitForTenant(invite.inviteTenantId)
  ]);
  if (employeeCount >= employeeLimit) {
    return NextResponse.json({ message: employeeLimitReachedMessage }, { status: 403 });
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: invite.inviteTenantId }, select: { companyName: true } });

  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        id: `emp-${randomUUID()}`,
        name: account.name,
        email: invite.email,
        role: invite.role || "موظف دعم",
        status: "متصل",
        permissions: invite.permissions || "محادثات فقط",
        initial: account.name.slice(0, 1),
        tenantId: invite.inviteTenantId,
        userId: account.id
      }
    });
    await tx.employeeInvite.deleteMany({ where: { email: invite.email, purpose: "cross_tenant_membership" } });
    return created;
  });

  return NextResponse.json({ employee, companyName: subscription?.companyName || "" });
}
